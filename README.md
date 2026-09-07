# Safety Lab Aero — desktop

The desktop app is the **same web bundle** in an Electron shell. Rebuilt 6 Sep 2026 so that the desktop and the web "work exactly like Microsoft Office works in both mediums": one account, one signed license, the same files in both, offline on the desktop with sync on reconnect, and open-in links both ways.

## What the shell does (and only this)

1. **Gate.** The app window opens only after a signed license file (`.lic`) verifies and the EULA + License Agreement are accepted. The verifier is the web bundle's own `app/slab_license.js`, loaded in Node — same keys, same rules, same plain-language reasons. Trials use a temporary license with an end date. An optional passcode is a *screen lock*, not an identity.
2. **Config.** The shell hands the bundle its addresses through the one config surface (`window.__SLAB_*`, read by `app/slab_config.js`): where the data lives (Safety Lab trial cloud / your organization's server / files only), the AI endpoint (or off), the web address for "Open on the web", and the license. It never seeds a tier, a token, or a name — the license decides the tier and the real sign-in (the same gate as the web) decides who you are.
3. **Egress.** A network-layer allowlist derived from the configuration: the app window can only reach the hosts its settings name. A customer install cannot contact Safety Lab even if a script tried.
4. **Links.** `safetylab://open?project=<id>&backend=<host>` opens a cloud project from the web's "Open in desktop"; `safetylab://auth-callback` is the SSO return address; File ▸ "Open This Project on the Web" goes the other way.

Rules that the shell enforces live in `shell_rules.js` (pure, no Electron) so `tests/regression_desktop_shell.test.js` executes them.

## Release

```
bash pull-web.sh        # web tree must be clean; runs the WEB wall (ship.sh --dry), build.sh, the smoke gate; copies dist/ (stripped) → app/; writes app/BUILD_INFO.json
npm test                # desktop wall — the shell rules AND the pulled bundle (checksums, no remote scripts, one verifier)
./release.sh            # pull → desktop wall → electron-builder (dist/)
./release.sh --publish  # …and publish installers to updates.safetylabaero.com/desktop/
```

`release.sh` refuses `SKIP_WALL=1`. `npm run dev` (`SKIP_WALL=1 bash pull-web.sh && electron .`) is for local development only.

## Code signing — honest state

No Apple Developer ID and no Windows certificate yet. Builds are ad-hoc signed (`afterPack.js`); **updates are manual** (`AUTO_UPDATE_SIGNED = false` in `main.js`: the app tells the user a newer version exists and opens the download page; nothing is downloaded or installed silently). When certificates exist: set `CSC_LINK` / `CSC_KEY_PASSWORD` (+ `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization), flip `AUTO_UPDATE_SIGNED`, release.

## Gone (deleted, not disabled) in the 6 Sep 2026 rebuild

`license.js` (a second license format with its own key), `sync-app.sh` (copied the readable source, every prompt included, into the installer), `signin.html` (local sign-in), `preload-onboarding.js`, `wrangler.jsonc`, the seeded `Desktop User` / `desktop@local` identity, the seeded `pro-plus` tier and `desktop-local` token, DevTools in packaged builds. Moved to `_to_delete/2026-09-06-shell-rebuild/` with the stale `app/` from 29 Aug.
