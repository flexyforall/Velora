#!/usr/bin/env python3
"""Stamp one cache-busting version on every local file the site loads.

Browsers and CDNs (raw.githack, GitHub Pages) keep files by URL, so a file that changes under the
same URL can stay stale for a while. This adds ?v=<version> to every asset, stylesheet, script
and video URL in index.html and to the image url()s in css/styles.css; a new version means new
URLs, so everyone gets the fresh files as soon as they load a fresh index.html.

Fonts are left alone: they never change, and their <link rel="preload"> must match the CSS URL.

Usage: python3 tools/bump-version.py [version]   (default: today's date and time, e.g. 20261019-1530)
"""
import datetime
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
version = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime('%Y%m%d-%H%M')

# src / href / srcset / data-src="assets|css|js/...", with or without an old ?v=, fonts excluded.
html_ref = re.compile(r'((?:src|href|srcset|data-src)=")((?:assets|css|js)/(?!fonts/)[^"?]+)(?:\?v=[^"]*)?(")')
css_ref = re.compile(r'(url\(")(\.\./assets/(?!fonts/)[^"?]+)(?:\?v=[^"]*)?("\))')

for name, pattern in (('index.html', html_ref), ('css/styles.css', css_ref)):
    path = root / name
    text, count = pattern.subn(lambda m: f'{m[1]}{m[2]}?v={version}{m[3]}', path.read_text())
    path.write_text(text)
    print(f'{name}: {count} URLs → ?v={version}')
