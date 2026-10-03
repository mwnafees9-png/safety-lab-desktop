// ============================================================================
// ai_main.js — the user's OWN Anthropic key, used from the MAIN process. NEW 2 Oct 2026.
//
// WHY THIS EXISTS. Until now the desktop had two AI settings: Safety Lab's AI (trial cloud
// only) and "my organization's AI endpoint", which means a proxy somewhere holding the key.
// A single engineer on a files-only install, or a small team on their own server, had to
// stand up that proxy before the first AI draft. This is the third setting, "my own key":
// the key goes into the OS keychain through secrets.js, and when the page asks for an AI
// call, THIS file reads the key, makes the request to api.anthropic.com, and streams the
// answer back. Nothing of ours is in the path: this computer, the key, Anthropic.
//
// THE RULES THAT DO NOT MOVE. The key never crosses to the renderer (same as the Jama
// token: write and ask, never read). The renderer's egress fence does not widen by one
// host; the main process is outside it, exactly like bridge_main.js. Only the Anthropic
// messages endpoint, only POST, only https, no redirects. The ITAR fence is the page's and
// has already refused a controlled project before the request reaches here; it is checked
// again here from the request so a page bug cannot route controlled text out.
//
// Pure pieces (requestProblem, the header set) are exported so the test wall executes them.
// ============================================================================
'use strict';
const secrets = require('./secrets.js');
const R = require('./shell_rules.js');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const KIND = 'anthropic_key';

function requestProblem(cfg, body, meta) {
  if (!cfg || cfg.ai !== 'key') return 'this computer is not set to use its own AI key';
  if (cfg.backend === 'safetylab') return 'own AI key is not available on the trial cloud';
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'malformed request';
  if (!body.model || !Array.isArray(body.messages)) return 'malformed request';
  if (meta && meta.itar === true) return 'export-controlled project: nothing leaves this computer';
  // 3 Oct 2026: a Claude model, at least one message, and no more than Anthropic's own 32 MB
  // request ceiling (shell_rules.aiBodyProblem), so the page cannot hand the main process an
  // unbounded payload or spend the key on anything but what the app asks for.
  return R.aiBodyProblem(body);
}

function headersFor(key) {
  return {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01'
  };
}

// Calls `head({status, contentType})` as soon as the upstream headers are known, then
// `emit(chunkBytes)` for every body chunk; resolves { ok, status, contentType } once the body
// has been fully forwarded, or { ok:false, error }. The renderer builds a Response from the
// head and the chunks as they arrive, so the page's existing SSE reader runs unchanged and a
// long draft streams instead of landing all at once.
async function messages(cfg, body, meta, emit, head) {
  const problem = requestProblem(cfg, body, meta);
  if (problem) return { ok: false, error: problem };
  const key = secrets.reveal(KIND);
  if (!key || typeof key !== 'string') return { ok: false, error: 'No AI key on this computer yet. Paste your Anthropic key under Advanced.' };
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: headersFor(key),
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(300000)
    });
  } catch (e) {
    // Never echo the exception: fetch errors can carry the request headers, and the key is in them.
    return { ok: false, error: 'Could not reach api.anthropic.com from this computer.' };
  }
  const status = res.status, contentType = res.headers.get('content-type') || '';
  try { if (typeof head === 'function') head({ status, contentType }); } catch (_) {}
  try {
    if (res.body && typeof res.body.getReader === 'function') {
      const r = res.body.getReader();
      for (;;) { const { done, value } = await r.read(); if (done) break; if (value && value.length) emit(Buffer.from(value)); }
    } else {
      emit(Buffer.from(await res.arrayBuffer()));
    }
  } catch (_) {
    return { ok: false, error: 'The AI answer was cut off mid-stream.', status, contentType };
  }
  return { ok: true, status, contentType };
}

module.exports = { messages, requestProblem, headersFor, ANTHROPIC_URL, KIND };
