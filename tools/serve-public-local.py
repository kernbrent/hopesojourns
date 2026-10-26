"""Loopback-only public site preview with read-only public destination data.

Never proxies authenticated requests, submits forms, or serves private source files.
"""
import argparse
import json
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
config = (ROOT / 'cloudflare/build-test-site.mjs').read_text(encoding='utf-8')
entries = set(re.findall(r'"([^"\n]+)"', config.split('const publicEntries = [', 1)[1].split('];', 1)[0]))
entries -= {'admin', 'journey', 'trip-account', 'application', 'letters', 'outputs/contact-import-template'}

# Preview the reviewed replacement without changing the live destination record.
LOCAL_DESTINATION_OVERRIDES = {
    'england': {
        'image_url': '/assets/halifax-england-beacon-hill.jpg',
        'image_alt': 'Halifax, West Yorkshire, England viewed from Beacon Hill',
        'image_credit': 'Photo by Tim Green from Bradford via Wikimedia Commons, CC BY 2.0. View from Beacon Hill, Halifax, England.',
    }
}


def apply_local_destination_images(data):
    destinations = data.get('destinations', [])
    if isinstance(data.get('destination'), dict):
        destinations = [*destinations, data['destination']]
    for destination in destinations:
        destination.update(LOCAL_DESTINATION_OVERRIDES.get(destination.get('slug'), {}))
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        route = unquote(urlsplit(self.path).path)
        if re.fullmatch(r'/api/interest/public/destinations(?:/[a-z0-9-]+)?', route):
            try:
                request = Request('https://hopesojourns.com' + route, headers={'Accept': 'application/json', 'User-Agent': 'HopeSojournsLocalReview/1.0'})
                with urlopen(request, timeout=15) as response:
                    payload = json.dumps(apply_local_destination_images(json.load(response))).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(payload)
            except Exception:
                self.send_error(502, 'Public destination data is unavailable')
            return
        target = (ROOT / route.lstrip('/')).resolve()
        relative = target.relative_to(ROOT) if target.is_relative_to(ROOT) else None
        if relative is None or '..' in Path(route).parts:
            self.send_error(404)
            return
        if route != '/' and not any(relative.as_posix() == e or relative.as_posix().startswith(e + '/') for e in entries):
            self.send_error(404)
            return
        if target.is_dir() and not (target / 'index.html').is_file():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        self.send_error(405, 'Use GET for this local preview')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4186)
    args = parser.parse_args()
    print(f'LOCAL_REVIEW=http://127.0.0.1:{args.port}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
