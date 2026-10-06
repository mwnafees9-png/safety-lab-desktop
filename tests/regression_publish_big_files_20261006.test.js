#!/usr/bin/env node
/*
 * Regression: big release files go up in pieces (6 Oct 2026).
 * The ~85 MB Windows installer failed eight one-piece wrangler uploads in a row on a home connection
 * and stopped the 0.18.7 publish half way. publish-desktop.sh now sends anything over 50 MB through
 * upload-via-worker.sh (5 MB pieces, 25 retries each) with the cache lifetime the file needs, and
 * refuses before uploading anything if the token those uploads need is missing.
 * Part 1 runs the real upload-via-worker.sh against a stand-in /api/upload that drops a piece.
 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); } else { fail++; console.log('  FAIL  ' + n + (d ? ' — ' + d : '')); } };
const R = path.join(__dirname, '..');

(async () => {
  console.log('[1] upload-via-worker.sh: pieces, a dropped piece retried, the cache lifetime carried');
  const store = {}, parts = {}, seen = { cc: null, drops: 0, key: null };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
    if (req.method === 'HEAD') { const o = store[decodeURIComponent(u.pathname.slice(1))]; res.writeHead(o ? 200 : 404, { 'content-length': o ? o.length : 0 }); return res.end(); }
    if (req.headers['x-upload-token'] !== 'tok') { res.writeHead(401); return res.end('{}'); }
    const a = u.searchParams.get('action'), key = u.searchParams.get('key');
    if (a === 'create') { seen.cc = u.searchParams.get('cc'); seen.key = key; res.end(JSON.stringify({ uploadId: 'U1', key })); return; }
    if (a === 'part') { const n = +u.searchParams.get('part'); if (n === 2 && seen.drops === 0) { seen.drops++; res.writeHead(502); return res.end('{"error":"dropped"}'); } parts[n] = body; res.end(JSON.stringify({ partNumber: n, etag: 'e' + n })); return; }
    if (a === 'complete') { const list = JSON.parse(body); store[key] = Buffer.concat(list.map(p => parts[p.partNumber])); res.end(JSON.stringify({ ok: true })); return; }
    res.writeHead(400); res.end('{}');
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const port = srv.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slpub-')), file = path.join(dir, 'Safety Lab Aero-9.9.9-mac.zip');
  const data = crypto.randomBytes(12 * 1024 * 1024 + 777); fs.writeFileSync(file, data);
  const r = await new Promise(ok => { const p = cp.spawn('bash', [path.join(R, 'upload-via-worker.sh'), file], { env: Object.assign({}, process.env, { UPLOAD_TOKEN: 'tok', CACHE_CONTROL: 'public, max-age=31536000, immutable', RETRY_SLEEP: '0', SLAB_UPLOAD_API: 'http://127.0.0.1:' + port + '/api/upload', SLAB_UPLOAD_PUBLIC: 'http://127.0.0.1:' + port }) });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('close', code => ok({ code, out })); });
  srv.close();
  const srv2 = http.createServer((req, res) => { res.writeHead(req.headers['x-upload-token'] === 'tok' ? 200 : 401, { 'content-type': 'application/json' }); res.end('{"error":"unauthorized"}'); });
  await new Promise(ok => srv2.listen(0, '127.0.0.1', ok)); const port2 = srv2.address().port;
  check('the upload finishes', r.code === 0, r.out.slice(-400));
  check('a dropped piece is sent again, not fatal', seen.drops === 1 && /part 2 dropped/.test(r.out));
  check('the file arrives byte for byte (a name with spaces included)', !!store['desktop/Safety Lab Aero-9.9.9-mac.zip'] && store['desktop/Safety Lab Aero-9.9.9-mac.zip'].equals(data));
  check('the cache lifetime reaches the server', seen.cc === 'public, max-age=31536000, immutable', String(seen.cc));
  { const r2 = await new Promise(ok => { const p = cp.spawn('bash', [path.join(R, 'upload-via-worker.sh'), file], { env: Object.assign({}, process.env, { UPLOAD_TOKEN: 'YOUR-SAVED-TOKEN', RETRY_SLEEP: '0', SLAB_UPLOAD_API: 'http://127.0.0.1:' + port2 + '/api/upload', SLAB_UPLOAD_PUBLIC: 'http://127.0.0.1:' + port2 }) });
      let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('close', code => ok({ code, out })); });
    check('a wrong token is reported in plain words, not a silent failure', r2.code !== 0 && /refused the upload token/.test(r2.out), r2.out.slice(-300)); }
  srv2.close();
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('[2] publish-desktop.sh');
  check('the token is checked with the site before anything is uploaded', (() => { const p = fs.readFileSync(path.join(R, 'publish-desktop.sh'), 'utf8'); const i = p.indexOf('the site does not accept this upload token'); return i > 0 && i < p.indexOf('\nput "'); })());
  const pub = fs.readFileSync(path.join(R, 'publish-desktop.sh'), 'utf8');
  const put = pub.slice(pub.indexOf('put () {'), pub.indexOf('\n}\n', pub.indexOf('put () {')));
  check('files over 50 MB go through upload-via-worker.sh with their cache lifetime', /BIG_BYTES=\$\(\(50 \* 1024 \* 1024\)\)/.test(pub) && /-gt "\$\{BIG_BYTES:-52428800\}"/.test(put) && /CACHE_CONTROL="\$cc" bash "\$HERE\/upload-via-worker\.sh" "\$f"/.test(put));
  check('...and that path is taken before the one-piece wrangler upload', put.indexOf('upload-via-worker.sh') < put.indexOf('wrangler r2 object put'));
  const iRefuse = pub.indexOf('REFUSED: these files are over 50 MB'), iFirstPut = pub.indexOf('\nput "');
  check('a missing upload token stops the publish before anything is uploaded', iRefuse > 0 && iRefuse < iFirstPut && /\[ -z "\$\{UPLOAD_TOKEN:-\}" \]/.test(pub));
  check('the scripts parse', cp.spawnSync('bash', ['-n', path.join(R, 'publish-desktop.sh')]).status === 0 && cp.spawnSync('bash', ['-n', path.join(R, 'upload-via-worker.sh')]).status === 0);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('  FAIL  suite crashed — ' + (e && e.stack || e)); process.exitCode = 1; });
