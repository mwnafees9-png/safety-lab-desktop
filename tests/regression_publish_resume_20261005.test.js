#!/usr/bin/env node
/*
 * Regression (5 Oct 2026): a re-run of publish-desktop.sh uploads only what is not already in the
 * bucket. A release dropped one ~100 MB zip five times over wifi and left the bucket mixed (new
 * dmgs and arm64 zip, old x64 zip, old manifest); a re-run re-uploaded every large file and hit
 * the same wall. EXECUTED: put() is run in bash with wrangler and curl stubbed.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const src = fs.readFileSync(path.join(__dirname, '..', 'publish-desktop.sh'), 'utf8');
const fn = n => (src.match(new RegExp('^' + n + ' \\(\\)[\\s\\S]*?^}', 'm')) || [''])[0];
const cacheFn = (src.match(/^cache_control_for \(\)[\s\S]*?^}/m) || [''])[0];
check('the script has the skip helpers and put()', fn('_local_md5') && fn('_live_etag') && fn('put') && cacheFn);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
fs.writeFileSync(path.join(dir, 'same.zip'), 'SAME-BYTES');
fs.writeFileSync(path.join(dir, 'changed.zip'), 'NEW-BYTES');
fs.writeFileSync(path.join(dir, 'latest-mac.yml'), 'version: 9.9.9');
const md5 = s => require('crypto').createHash('md5').update(s).digest('hex');
// curl stub: the bucket holds same.zip and latest-mac.yml byte for byte, and an OLD changed.zip
fs.writeFileSync(path.join(bin, 'curl'), `#!/bin/bash
url="\${@: -1}"
case "$url" in *same.zip*) e=${md5('SAME-BYTES')};; *changed.zip*) e=${md5('OLD-BYTES')};; *latest-mac.yml*) e=${md5('version: 9.9.9')};; *) e=none;; esac
printf 'HTTP/2 200\\r\\netag: "%s"\\r\\n' "$e"
`);
fs.writeFileSync(path.join(bin, 'wrangler'), '#!/bin/bash\necho "$4" >> "$UPLOADS"\n');
for (const f of ['curl', 'wrangler']) fs.chmodSync(path.join(bin, f), 0o755);
const uploads = path.join(dir, 'uploads.txt'); fs.writeFileSync(uploads, '');
const script = ['set -u', 'BUCKET=b; PREFIX=desktop', cacheFn, fn('_local_md5'), fn('_live_etag'), fn('put'),
  `put "${dir}/same.zip" application/zip`, `put "${dir}/changed.zip" application/zip`, `put "${dir}/latest-mac.yml" text/yaml`, `put "${dir}/missing.zip" application/zip`].join('\n');
const r = cp.spawnSync('bash', ['-c', script], { encoding: 'utf8', env: Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH, UPLOADS: uploads }) });
const up = fs.readFileSync(uploads, 'utf8');
check('a payload already in the bucket byte for byte is skipped', !/same\.zip/.test(up) && /same\.zip  already in the bucket/.test(r.stdout), r.stdout + r.stderr);
check('a payload whose bucket copy differs is uploaded', /changed\.zip/.test(up));
check('the manifest is ALWAYS uploaded, even when the bucket copy matches', /latest-mac\.yml/.test(up));
check('a missing local file is still a skip, not an error', r.status === 0 && /SKIP \(missing\): missing\.zip/.test(r.stdout));
check('the ETag is read on a cache-busting URL (the edge cannot answer with an old copy)', /\?nocache=/.test(fn('_live_etag')));
check('retries raised to 8 with a longer wait', /max=8/.test(fn('put')) && /tries \* 10/.test(fn('put')));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
