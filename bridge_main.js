// ============================================================================
// bridge_main.js — the ALM live bridge's outbound request, run in the MAIN
// process. NEW 16 Sep 2026.
//
// WHY THIS EXISTS. live_bridge.js was written to fetch Jama directly from the
// page on the desktop ("the desktop app fetches the tool directly", its own
// header says). It never could. The desktop's egress fence, shell_rules
// allowedHosts(), admits ONLY the configured backend host and AI endpoint host,
// and webRequest.onBeforeRequest cancels everything else in the app partition.
// A Jama host is not in that set under ANY of the three backend configurations,
// files-only included, where nothing at all is allowed. So on the desktop the
// connector screen has always been fillable and the connector has never made a
// single request.
//
// Moving the call here fixes it without loosening the fence by one host: the
// main process is outside the renderer's session, so the page still cannot
// reach anything but its own backend, and it never holds the credential either.
// Same shape as /api/bridge on the web, and the same constraints, plus one the
// worker cannot enforce: the target host must match the base URL the user
// actually saved with the credential, which the renderer cannot widen because
// it is read from the keychain entry's meta rather than from the request.
// ============================================================================
'use strict';
const secrets = require('./secrets.js');

// Same read-only posture as the web relay: GET only, https only, public host,
// port 443, and an ALM REST path. Phase 1 is read-only by decision.
function targetProblem(rawUrl, allowedHost) {
  let u;
  try { u = new URL(String(rawUrl)); } catch (_) { return 'invalid target URL'; }
  if (u.protocol !== 'https:') return 'target must be https';
  const host = u.hostname.toLowerCase();
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':');
  if (isIp || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'target must be a public host';
  }
  if (u.port && u.port !== '443') return 'only port 443 is allowed';
  if (u.pathname.indexOf('/rest/') === -1) return 'only ALM REST paths are allowed';
  if (!allowedHost) return 'no connector is configured on this computer';
  if (host !== String(allowedHost).toLowerCase()) {
    return 'target host does not match the configured connector (' + allowedHost + ')';
  }
  return '';
}

// Returns { ok, status, data } | { ok:false, error }. The credential is read
// here, used here, and never crosses back to the renderer.
async function get(rawUrl) {
  const meta = secrets.metaFor('jama');
  const problem = targetProblem(rawUrl, meta && meta.baseHost);
  if (problem) return { ok: false, error: problem };

  const cred = secrets.reveal('jama');
  if (!cred || !cred.token) {
    return { ok: false, error: 'No stored connector credential. Connect the tool again in the live bridge panel.' };
  }

  const auth = 'Basic ' + Buffer.from((cred.user || '') + ':' + cred.token, 'utf8').toString('base64');
  let res;
  try {
    res = await fetch(String(rawUrl), {
      method: 'GET',
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
      redirect: 'error',                // a redirect could carry the header off-host
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    // Never echo the exception verbatim: some fetch errors include the request
    // headers, and the Authorization header is in there.
    return { ok: false, error: 'Could not reach ' + (meta && meta.baseHost || 'the connector') + '.' };
  }
  if (!res.ok) return { ok: false, error: 'HTTP ' + res.status + ' from ' + (meta && meta.baseHost || 'the connector') };
  let data;
  try { data = await res.json(); } catch (_) { return { ok: false, error: 'the connector did not return JSON' }; }
  return { ok: true, status: res.status, data: data };
}

module.exports = { get, targetProblem };
