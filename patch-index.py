#!/usr/bin/env python3
"""Rewrite the bundled index.html so every external CDN <script> points at a local
vendored copy under vendor/. This is what makes the desktop build run with no internet
(true air-gap). Idempotent: running twice is harmless.
"""
import sys, re

REPLACEMENTS = [
    ("https://d3js.org/d3.v7.min.js", "vendor/d3.v7.min.js"),
    ("https://cdn.jsdelivr.net/npm/vis-network@9.1.9/dist/vis-network.min.js", "vendor/vis-network.min.js"),
    ("https://cdn.jsdelivr.net/npm/chart.js", "vendor/chart.umd.min.js"),
    ("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2", "vendor/supabase.min.js"),
]

def main():
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    changed = []
    for src, dst in REPLACEMENTS:
        if src in html:
            html = html.replace(src, dst)
            changed.append(dst)
    # Sanity check: no jsdelivr/d3js/unpkg CDN script srcs should remain.
    leftover = re.findall(r'src="(https?://[^"]+)"', html)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("Patched:", ", ".join(changed) if changed else "(nothing — already local?)")
    if leftover:
        print("WARNING — remaining remote script srcs (will fail offline):")
        for u in leftover:
            print("   ", u)

if __name__ == "__main__":
    main()
