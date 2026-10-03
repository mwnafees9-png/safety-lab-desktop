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

# 3 Oct 2026 (security review of 2 Oct, batch 2): the desktop app window had no content security
# policy at all; the web serves one from worker.js. This is the same policy with three desktop
# differences: the bundle loads from file: (named explicitly next to 'self'), network addresses are
# left to the shell's egress guard (which already refuses every host the configuration does not
# name, so connect-src stays broad here rather than duplicating a per-install list in a static
# file), and form-action is 'none' (the desktop posts no forms anywhere). What it adds over today:
# no plugins, no <base> rewriting, no form posts, no frames or workers from anywhere but the
# bundle. Proven 3 Oct 2026 on the pulled bundle in Chromium: zero violations through boot and the
# sample project, while a policy without 'unsafe-inline' shows 15, so the check sees breakage.
DESKTOP_CSP = ("default-src 'self' file:; "
               "script-src 'self' 'unsafe-inline' file:; "
               "style-src 'self' 'unsafe-inline' file:; "
               "img-src 'self' file: data: blob: https:; "
               "font-src 'self' file: data:; "
               "connect-src 'self' file: data: blob: https: wss:; "
               "worker-src 'self' file: blob:; "
               "frame-src 'self' file: blob:; "
               "object-src 'none'; "
               "base-uri 'self'; "
               "form-action 'none'")

def add_csp(html):
    tag = '<meta http-equiv="Content-Security-Policy" content="' + DESKTOP_CSP + '">'
    html = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', '', html, flags=re.I)
    m = re.search(r'<head[^>]*>', html, flags=re.I)
    if not m:
        raise SystemExit("ERROR — index.html has no <head>; cannot place the content security policy")
    return html[:m.end()] + "\n" + tag + html[m.end():]

def main():
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    changed = []
    html = add_csp(html)
    changed.append("content security policy")
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
