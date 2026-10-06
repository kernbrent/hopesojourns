"""Serve the local prototype with a read-only gateway to public MMT destination data."""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]/'outputs/story-preview-site'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  if self.path.split('?')[0]!='/api/destinations':return super().do_GET()
  try:
   with urlopen(Request('https://hopesojourns.com/api/interest/public/destinations',headers={'User-Agent':'HopeSojournsPreview/1.0','Accept':'application/json'}),timeout=15) as r:data=json.dumps(json.load(r)).encode()
   self.send_response(200)
  except Exception:data=b'{"error":"Destinations unavailable"}';self.send_response(502)
  self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8099),Handler).serve_forever()
