# Desktop code-signing — what to procure, and how it activates (S24)

Two independent locks protect desktop updates. Lock 1 (the manifest signature) is **built** and needs only your own key. Lock 2 (native OS code-signing) needs certificates you buy. This is the checklist for both. Claude cannot handle any of these credentials — they are yours to create and hold.

## Lock 1 — the manifest-signing key (built; ~10 minutes, no cost)

This is the one that closes "whoever controls the update host can push code," and it needs no certificate.

1. On your Mac, in the desktop repo:
   ```
   cd ~/dev/safety-lab-desktop
   node tools/update-signing/sign-manifest.mjs keygen
   ```
   This writes the private key to `~/.safetylab/update_signing_key.pem` (stays on your Mac, never in git, never shared) and prints a one-line PUBLIC key record.
2. Paste that public key record to me, or into `update_verify.js` yourself: replace the `slab-upd-UNPROVISIONED` placeholder in `PUBLIC_KEYS` with it. (If you paste it to me, I'll make the edit, rerun the wall, and hand it back.)
3. From then on, `release.sh --publish` signs each update manifest automatically and refuses to publish an unsigned feed.

Until step 2 is done the app is fail-closed: it simply reports "could not verify the update" rather than trusting an unsigned manifest. Nothing bad happens; updates just aren't offered.

## Lock 2 — native code-signing certificates (you procure; enables silent auto-install)

This is what lets the app **download and install** an update on its own, with the operating system itself verifying the installer. It is also what removes the "unidentified developer" warning users see today when they open the app.

### macOS — Apple Developer ID
- Enroll in the **Apple Developer Program** (about $99/year) at developer.apple.com, as **Safety Lab Aero** (an Organization enrollment needs a D-U-N-S number for the company; a sole-proprietor/individual enrollment is faster if the company entity isn't set up yet).
- In the Apple Developer portal, create a **"Developer ID Application"** certificate and download it into your Mac's login keychain.
- Create an **app-specific password** for notarization at appleid.apple.com (Sign-In and Security → App-Specific Passwords), and note your **Team ID** (Membership page).
- You will then have: the Developer ID cert in your keychain, `APPLE_ID` (your Apple account email), `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

### Windows — Authenticode
- Buy a code-signing certificate from a CA (DigiCert, Sectigo, SSL.com, etc.). An **OV** cert is cheaper (~$200–400/yr) but SmartScreen reputation builds slowly; an **EV** cert (~$300–700/yr, on a hardware token or cloud HSM) gives instant SmartScreen trust. For an app users download, EV is worth it if budget allows.
- Business identity verification takes a few days to a couple of weeks — start this early.
- You'll get either a `.pfx` file + password (OV) or an HSM/token (EV, which needs the CA's signing tooling).

### When the certs are in hand — activation (my side is ~10 minutes)
1. macOS: export the Developer ID cert as a `.p12`; set `CSC_LINK` (path to the .p12) and `CSC_KEY_PASSWORD`, plus `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`, in the shell where you run `release.sh`. `notarize.js` switches on automatically when those three Apple vars are present; `release.sh` already reads `CSC_LINK`.
2. Windows: set `CSC_LINK` / `CSC_KEY_PASSWORD` to the `.pfx` (OV), or configure the CA's token tooling (EV).
3. I flip `AUTO_UPDATE_SIGNED = true` in `main.js` (one line), rerun the desktop wall, and you release. Lock 1 (the manifest signature) keeps applying on top — the two are belt and suspenders.

## Also on the desktop list (not S24, for when you want them)
- **S27** — the desktop repo has no git remote (4 commits, no backup). One command once you pick a host: `git remote add origin <url> && git push -u origin main`. Ten minutes, no cost.
- **S25/S26** — Electron hardening and moving `config.json` secrets to the OS keychain; and the bundle is three web releases behind (predates the save/sync data-loss fix). These are separate items.
