"""Render the private MMT guide to HTML for upload to private R2 storage."""

from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/user/Hope-Sojourns-MMT-User-Guide.md"
OUTPUT = ROOT / ".tmp/mmt-user-guide.html"
LINK = re.compile(r"\[([^]]+)\]\(([^)]+)\)")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9 -]", "", text.lower()).strip().replace(" ", "-")


def inline(text: str) -> str:
    escaped = html.escape(text.strip())

    def replace_link(match: re.Match[str]) -> str:
        label, href = match.groups()
        if href.startswith("#") or href.startswith("https://") or href.startswith("http://"):
            return f'<a href="{html.escape(href, quote=True)}">{label}</a>'
        return label  # Never expose a relative source-document path in the portal.

    escaped = LINK.sub(replace_link, escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    return escaped


def render_body(lines: list[str]) -> str:
    rendered: list[str] = []
    current_list: str | None = None

    def close_list() -> None:
        nonlocal current_list
        if current_list:
            rendered.append(f"</{current_list}>")
            current_list = None

    for source_line in lines:
        line = source_line.strip()
        if not line:
            close_list()
            continue
        heading = re.match(r"^(#{2,3})\s+(.+)$", line)
        if heading:
            close_list()
            level = len(heading.group(1))
            title = heading.group(2)
            rendered.append(f'<h{level} id="{slug(title)}">{inline(title)}</h{level}>')
            continue
        ordered = re.match(r"^\d+\.\s+(.+)$", line)
        bullet = re.match(r"^-\s+(.+)$", line)
        if ordered or bullet:
            kind = "ol" if ordered else "ul"
            if kind != current_list:
                close_list()
                rendered.append(f"<{kind}>")
                current_list = kind
            rendered.append(f"<li>{inline((ordered or bullet).group(1))}</li>")
            continue
        close_list()
        index_class = ' class="mmt-guide-index-entry"' if re.match(r"^[A-Z]:\s", line) else ""
        rendered.append(f"<p{index_class}>{inline(line)}</p>")
    close_list()
    return "\n".join(rendered)


def build() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    version = re.search(r"^Version\s+(.+?)\s*$", "\n".join(lines), re.MULTILINE)
    reviewed = re.search(r"^Last reviewed:\s+(.+?)\s*$", "\n".join(lines), re.MULTILINE)
    if not version or not reviewed:
        raise ValueError("The user guide needs a version and last-reviewed date.")
    start = lines.index("## Table of contents")
    end = lines.index("## Revision history")
    body = render_body(lines[start:end])
    document = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <meta name="referrer" content="no-referrer">
  <title>MMT user guide | Hope Sojourns</title>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/admin/mmt-user-guide.css?v=2026-09-24.1">
</head>
<body class="mmt-guide-page">
  <a class="skip-link" href="#guide-content">Skip to guide</a>
  <header class="mmt-guide-header">
    <a class="mmt-guide-brand" href="/admin/ministry/"><img src="/assets/hope-sojourns-logo.png" alt="Hope Sojourns"></a>
    <a class="mmt-guide-return" href="/admin/ministry/">Return to portal</a>
  </header>
  <main id="guide-content" class="mmt-guide-main">
    <p class="mmt-guide-eyebrow">Ministry Management</p>
    <h1>Hope Sojourns MMT user guide</h1>
    <p class="mmt-guide-meta">Version {html.escape(version.group(1))} · Last reviewed {html.escape(reviewed.group(1))}</p>
    <p class="mmt-guide-intro">Step-by-step instructions for authorized Hope Sojourns and Christian Steps Ministries staff. This online edition is read-only and requires your MMT sign-in.</p>
    {body}
  </main>
  <footer class="mmt-guide-page-footer"><a href="/admin/ministry/">Return to portal</a> · Hope Sojourns MMT</footer>
</body>
</html>"""
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    build()
