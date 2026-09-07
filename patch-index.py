#!/usr/bin/env python3
"""Rewrite the bundled index.html so every CDN <script> points at a local vendored copy under
vendor/, so the desktop runs with no internet (air-gap) and so the shell's egress allowlist —
which names only the configured backend/AI hosts — never has to admit a CDN. Idempotent.
Fails loudly if a remote script remains: a remote script in a customer install is a leak."""
import sys, re

REPLACEMENTS = [
    ("https://d3js.org/d3.v7.min.js", "vendor/d3.v7.min.js"),
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
    leftover = re.findall(r'<script[^>]+src="(https?://[^"]+)"', html)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print("   Patched:", ", ".join(changed) if changed else "(nothing — already local?)")
    if leftover:
        print("ERROR — remote <script> sources remain (add them to vendor-libs + REPLACEMENTS):")
        for u in leftover:
            print("   ", u)
        sys.exit(1)

if __name__ == "__main__":
    main()
