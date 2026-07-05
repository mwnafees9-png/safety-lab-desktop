/* crdt_sync.js — Phase 1: real-time co-authoring foundation (Yjs CRDT over Supabase Realtime).
 *
 * FLAG-GATED + inert by default. Enable with ?crdt=1, localStorage SLA_CRDT='1', or
 * window.SafetyLabAI.crdt=true. NEVER runs for ITAR-controlled projects. Requires a Supabase
 * session + an active cloud project. Loads Yjs (window.Y) lazily from vendor/yjs.min.js — if the
 * bundle is missing or the flag is off, this module does nothing and the app is unaffected.
 *
 * v1 scope: item-level merge for the aircraft-level flat tables (functions / FHA / requirements),
 * proving the loop. Persistence + more collections + fault trees follow (see Phase 1 spec).
 *
 * Model coupling lives in safety_lab.js via window.__crdtCapture() / window.__crdtApply(partial);
 * this module is model-agnostic (Y.Doc + transport + per-item diff/merge only).
 */
(function () {
  'use strict';

  // Collections synced in v1 + their stable key field. MUST match __crdtCapture/__crdtApply.
  var COLLECTIONS = [
    { name: 'acFunctionsData',   key: 'subId' },
    { name: 'acFhaData',         key: 'internalId' },
    { name: 'acReqData',         key: 'internalId' },
    { name: 'acAssumptionsData', key: 'asmId' },
    { name: 'praData',           key: 'internalId' },
    { name: 'zsaData',           key: 'internalId' },
    { name: 'cmaData',           key: 'internalId' },
    { name: 'fmeaData',          key: 'internalId' },
    { name: 'systemsData',       key: 'id' },
    { name: 'ftaPages',          key: 'id' }   // page-level merge (whole-page value); node-level = future
  ];

  var Y = null, ydoc = null, chan = null, _client = null, _idb = null;
  var _started = false, _applying = false, _wsId = null, _projId = null;
  var _saveTimer = null, _pushTimer = null;
  var _tok = (function () { try { return (crypto.randomUUID ? crypto.randomUUID() : 'c' + Math.random().toString(36).slice(2)).slice(0, 8); } catch (_) { return 'c' + Date.now().toString(36).slice(-6); } })();

  // Default ON (further gated by _ready: signed-in + active cloud project + not ITAR). Kill-switch:
  // window.SafetyLabAI.crdt=false, ?crdt=0, or localStorage SLA_CRDT='0'.
  function flagOn() {
    try {
      if (window.SafetyLabAI && window.SafetyLabAI.crdt === false) return false;
      if (/[?&]crdt=0/.test(location.search)) return false;
      if (localStorage.getItem('SLA_CRDT') === '0') return false;
      return true;
    } catch (_) { return true; }
  }
  function _itar()      { try { return !!(window.projectConfig && window.projectConfig.isITARControlled); } catch (_) { return false; } }
  function _signedIn()  { try { return typeof window.isSupabaseSignedIn === 'function' && window.isSupabaseSignedIn(); } catch (_) { return false; } }
  function _proj()      { try { return (typeof window.getActiveCloudProjectId === 'function' && window.getActiveCloudProjectId()) || null; } catch (_) { return null; } }
  function _ws()        { try { return (typeof window.getActiveWorkspaceId === 'function' && window.getActiveWorkspaceId()) || null; } catch (_) { return null; } }
  function _ready()     { return flagOn() && !_itar() && _signedIn() && !!_proj() && !!_ws(); }

  // base64 <-> Uint8Array (chunked so big updates don't blow the call stack)
  function b64enc(u8) { var s = '', C = 0x8000; for (var i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); }
  function b64dec(b)  { var s = atob(b), u8 = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }

  function loadYjs(cb) {
    if (window.Y) { Y = window.Y; return cb(true); }
    var s = document.createElement('script');
    s.src = 'vendor/yjs.min.js'; s.async = true;
    s.onload  = function () { Y = window.Y || null; cb(!!Y); };
    s.onerror = function () { try { console.warn('[CRDT] Yjs bundle missing — run build-yjs.sh.'); } catch (_) {} cb(false); };
    (document.head || document.documentElement).appendChild(s);
  }

  // ---- model <-> Y.Doc -------------------------------------------------------
  function pushLocal() {
    if (!ydoc || _applying) return;
    var cap; try { cap = window.__crdtCapture ? window.__crdtCapture() : null; } catch (_) { cap = null; }
    if (!cap) return;
    ydoc.transact(function () {
      COLLECTIONS.forEach(function (c) {
        var arr = cap[c.name] || [];
        var map = ydoc.getMap('col:' + c.name);
        var ord = ydoc.getMap('ord:' + c.name);   // key -> order index. KEYED (not a Y.Array) so two
        var live = {};                             // peers seeding the same keys can't duplicate order.
        arr.forEach(function (item, i) {
          var k = String(item[c.key]);
          live[k] = 1;
          var next = JSON.stringify(item);
          if (map.get(k) !== next) map.set(k, next);
          if (ord.get(k) !== i)    ord.set(k, i);
        });
        Array.from(map.keys()).forEach(function (k) { if (!live[k]) map.delete(k); });
        Array.from(ord.keys()).forEach(function (k) { if (!live[k]) ord.delete(k); });
      });
    }, 'local');
  }

  function pullToModel() {
    if (!ydoc) return;
    var partial = {};
    COLLECTIONS.forEach(function (c) {
      var map = ydoc.getMap('col:' + c.name);
      var ord = ydoc.getMap('ord:' + c.name);
      // map keys are unique (dedupe is automatic); order by the keyed index map.
      var keys = Array.from(map.keys()).sort(function (a, b) {
        var oa = ord.get(a), ob = ord.get(b);
        return (oa != null ? oa : 1e9) - (ob != null ? ob : 1e9);
      });
      var arr = [];
      keys.forEach(function (k) { var v = map.get(k); if (v != null) { try { arr.push(JSON.parse(v)); } catch (_) {} } });
      partial[c.name] = arr;
    });
    _applying = true;
    try { if (window.__crdtApply) window.__crdtApply(partial); } finally { _applying = false; }
  }

  // ---- transport (Supabase Realtime broadcast) -------------------------------
  function _broadcast(event, payload) { try { if (chan) chan.send({ type: 'broadcast', event: event, payload: payload }); } catch (_) {} }
  function _applyRemote(b64) { try { Y.applyUpdate(ydoc, b64dec(b64), 'remote'); } catch (e) { try { console.warn('[CRDT] applyUpdate failed', e); } catch (_) {} } }

  function start() {
    if (_started || !_ready()) return;
    loadYjs(function (ok) {
      if (!ok || !_ready() || _started) return;
      try { _client = window.getSupabaseClient && window.getSupabaseClient(); } catch (_) { _client = null; }
      if (!_client) return;
      _wsId = _ws(); _projId = _proj();
      ydoc = new Y.Doc();
      ydoc.on('update', function (update, origin) {
        if (origin === 'local') _broadcast('yupdate', { u: b64enc(update), t: _tok });
        else if (origin !== _idb) pullToModel();   // idb-origin updates reconciled once after load
        if (origin !== _idb) _scheduleSave();       // don't re-save what we just read back from idb
      });
      _started = true;

      // Phase 2 — durable LOCAL persistence first (IndexedDB). Works with no network and survives a
      // reload/restart, so edits made offline are never lost; they merge on reconnect.
      _idb = null;
      try { if (Y.IndexeddbPersistence) _idb = new Y.IndexeddbPersistence('slab-crdt-' + _projId, ydoc); } catch (_) { _idb = null; }

      var afterLocal = function () {
        if (_docHasContent()) {
          // we have a local offline copy → it's the working doc; merge the server on top if online
          pullToModel();
          if (_online()) _goOnline();
        } else if (_online()) {
          // nothing local yet, online → let the server doc be authoritative (don't seed stale local)
          _loadState(function (had) {
            if (had) pullToModel(); else pushLocal();
            if (!chan) _openChannel();
          });
        } else {
          // nothing local, offline → seed from whatever model is on this device
          pushLocal();
        }
        _renderOfflineBadge();
        try { console.info('[CRDT] active on slab-crdt:' + _wsId + ':' + _projId + (_online() ? '' : ' (OFFLINE — local only, will sync on reconnect)')); } catch (_) {}
      };
      if (_idb && _idb.whenSynced) _idb.whenSynced.then(afterLocal).catch(afterLocal);
      else afterLocal();
    });
  }

  // Bring a started session online: merge the latest server doc, ensure the live channel is up, and
  // re-handshake so edits made while offline propagate to peers. Idempotent (CRDT union, no overwrite).
  function _goOnline() {
    if (!_started || !_client || !_online()) return;
    _loadState(function () {});
    if (!chan) { _openChannel(); }
    else {
      try { _broadcast('ysync1', { sv: b64enc(Y.encodeStateVector(ydoc)), t: _tok }); } catch (_) {}
      setTimeout(function () { try { _broadcast('yupdate', { u: b64enc(Y.encodeStateAsUpdate(ydoc)), t: _tok }); } catch (_) {} }, 400);
    }
    _renderOfflineBadge();
  }

  function _online() { try { return navigator.onLine !== false; } catch (_) { return true; } }
  function _docHasContent() { try { return COLLECTIONS.some(function (c) { return ydoc.getMap('col:' + c.name).size > 0; }); } catch (_) { return false; } }
  function _renderOfflineBadge() {
    var show = _started && !_online();
    var el = document.getElementById('crdt-offline');
    if (!show) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'crdt-offline';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483600;background:#fff4e5;color:#7a4b00;border:1px solid #f0c878;border-radius:10px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 20px rgba(0,0,0,.15);';
      el.textContent = '⚡ Offline — changes save on this device and sync when you reconnect.';
      document.body.appendChild(el);
    }
  }

  function _openChannel() {
    chan = _client.channel('slab-crdt:' + _wsId + ':' + _projId, { config: { broadcast: { self: false } } });
    chan.on('broadcast', { event: 'yupdate' }, function (m) { if (m && m.payload && m.payload.u) _applyRemote(m.payload.u); });
    chan.on('broadcast', { event: 'ysync1' }, function (m) {
      if (!m || !m.payload || !m.payload.sv) return;
      try { _broadcast('yupdate', { u: b64enc(Y.encodeStateAsUpdate(ydoc, b64dec(m.payload.sv))), t: _tok }); } catch (_) {}
    });
    chan.subscribe(function (status) {
      if (status !== 'SUBSCRIBED') return;
      // ask peers for what we're missing, then push our full state so peers get our unique data
      try { _broadcast('ysync1', { sv: b64enc(Y.encodeStateVector(ydoc)), t: _tok }); } catch (_) {}
      setTimeout(function () { try { _broadcast('yupdate', { u: b64enc(Y.encodeStateAsUpdate(ydoc)), t: _tok }); } catch (_) {} }, 800);
    });
  }

  // ---- persistence (project_crdt) -------------------------------------------
  function _loadState(cb) {
    try {
      _client.from('project_crdt').select('state').eq('project_id', _projId).maybeSingle()
        .then(function (res) {
          var st = res && res.data && res.data.state;
          if (st) { try { Y.applyUpdate(ydoc, b64dec(st), 'persist'); return cb(true); } catch (_) {} }
          cb(false);
        })
        .catch(function () { cb(false); });
    } catch (_) { cb(false); }
  }
  function _scheduleSave() {
    if (_saveTimer) return;   // coalesce — at most one upsert per window
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      try {
        if (!_client || !ydoc || !_projId) return;
        var state = b64enc(Y.encodeStateAsUpdate(ydoc));
        _client.from('project_crdt')
          .upsert({ project_id: _projId, state: state, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
          .then(function () {}).catch(function () {});
      } catch (_) {}
    }, 5000);
  }

  function stop() {
    try { clearTimeout(_pushTimer); } catch (_) {} _pushTimer = null;
    try { clearTimeout(_saveTimer); } catch (_) {} _saveTimer = null;
    try { if (chan) chan.unsubscribe(); } catch (_) {}
    chan = null;
    try { if (_idb && _idb.destroy) _idb.destroy(); } catch (_) {} _idb = null;
    try { if (ydoc) ydoc.destroy(); } catch (_) {}
    ydoc = null; _started = false;
    try { var b = document.getElementById('crdt-offline'); if (b) b.remove(); } catch (_) {}
  }

  // called from safety_lab.js scheduleAutosave() — debounced so rapid edits coalesce into one push
  function onLocalChange() {
    if (!_started || _applying) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(function () { try { pushLocal(); } catch (_) {} }, 350);
  }

  // (re)start when workspace/project/eligibility changes
  function refresh() {
    var w = _ws(), p = _proj();
    if (_started && (w !== _wsId || p !== _projId || !_ready())) stop();
    if (!_started && _ready()) start();
  }

  window.SafetyLabCRDT = {
    start: start, stop: stop, refresh: refresh, onLocalChange: onLocalChange, enabled: flagOn,
    status: function () { return { flag: flagOn(), ready: _ready(), started: _started, yjs: !!window.Y, idb: !!_idb, online: _online(), ws: _wsId, project: _projId }; },
    _doc: function () { return ydoc; }
  };

  // Boot: if enabled, start once the app + session settle, and poll cheaply for ws/project changes.
  try {
    // Phase 2 — react to connectivity changes: merge + re-handshake on reconnect; badge on drop.
    window.addEventListener('online',  function () { try { if (_started) _goOnline(); else refresh(); } catch (_) {} });
    window.addEventListener('offline', function () { try { _renderOfflineBadge(); } catch (_) {} });
    window.addEventListener('load', function () {
      if (!flagOn()) return;
      setTimeout(refresh, 3500);
      setInterval(refresh, 6000);
    });
  } catch (_) {}
})();
