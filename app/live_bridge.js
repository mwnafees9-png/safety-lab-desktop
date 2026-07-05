// ============================================================================
// live_bridge.js — v1.0 — J1: live tracking of Jama (connector-shaped for
// Polarion/DOORS next). READ-ONLY phase 1 by decision.
//
// "Live" without breaking the deterministic core:
//   · The bridge WATCHES — it polls the tool's REST API (manually or on a
//     timer) and diffs what it sees against the requirements' reqSource
//     fingerprints. Detection is computed.
//   · Application is SIGNED — changes stage into the same preview → sign →
//     idempotent apply discipline as Q10. Nothing writes on its own, ever.
//   · Every check and every apply is journaled.
//
// CREDENTIALS: connector config (URL, project, user, token) lives in
// localStorage ONLY — never in the project file, never in autosave, never
// on any server. The Worker proxy (/api/bridge) is a stateless relay the
// browser needs for CORS; the desktop app fetches the tool directly.
//
// Write-back stays the M8 ReqIF file until phase 2 earns API writes.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const CFG_KEY = 'safetyLab.bridge.v1';
    const TOOL = 'jama-live';

    // ------------------------------------------------------------- config
    function bridgeConfig() {
        try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {}; } catch (_) { return {}; }
    }
    function bridgeConfigSave(c) {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(c || {})); } catch (_) {}
    }

    // ------------------------------------------------------------ transport
    function _isDesktop() {
        try { return !!(window.__slabDesktop || (navigator.userAgent || '').indexOf('Electron') >= 0); } catch (_) { return false; }
    }
    async function _get(targetUrl, cfg) {
        const auth = 'Basic ' + btoa((cfg.user || '') + ':' + (cfg.token || ''));
        const u = _isDesktop() ? targetUrl : ('/api/bridge?target=' + encodeURIComponent(targetUrl));
        const res = await fetch(u, { headers: { 'Authorization': auth, 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + (_isDesktop() ? 'Jama' : 'bridge'));
        return res.json();
    }

    // Jama REST: abstractitems paged. Defensive field reads — vendor payloads
    // drift; anything missing degrades to empty string, never a throw.
    async function bridgeFetchItems() {
        const cfg = bridgeConfig();
        if (!cfg.baseUrl || !cfg.projectId) throw new Error('Configure the connector first (URL + project id).');
        const base = String(cfg.baseUrl).replace(/\/+$/, '');
        const out = [];
        let startAt = 0;
        for (let page = 0; page < 10; page++) {          // hard cap: 10 pages / 500 items per check
            const data = await _get(base + '/rest/latest/abstractitems?project=' + encodeURIComponent(cfg.projectId) + '&maxResults=50&startAt=' + startAt, cfg);
            const items = (data && data.data) || [];
            items.forEach(it => out.push({
                key: it.documentKey || ('jama-' + it.id),
                id: it.id,
                name: (it.fields && (it.fields.name || it.fields.title)) || '',
                text: (it.fields && (it.fields.description || it.fields.text)) || '',
                modified: it.modifiedDate || (it.fields && it.fields.modifiedDate) || '',
            }));
            const pi = data && data.meta && data.meta.pageInfo;
            if (!pi || startAt + items.length >= (pi.totalResults || 0) || !items.length) break;
            startAt += items.length;
        }
        return out;
    }

    // ------------------------------------------------------------- the diff
    // Pure — testable without a network. Remote items vs the requirements'
    // reqSource fingerprints (tool: 'jama-live', reqifId: documentKey).
    function _allReqs() {
        const out = [];
        (((typeof acReqData !== 'undefined' ? acReqData : []) || [])).forEach(r => out.push(r));
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => (s.req || []).forEach(r => out.push(r)));
        return out;
    }
    function bridgeDiff(remoteItems) {
        const reqs = _allReqs();
        const byKey = new Map();
        reqs.forEach(r => { if (r.reqSource && r.reqSource.reqifId) byKey.set(r.reqSource.reqifId, r); });
        const fresh = [], changed = [], unchanged = [];
        const seen = new Set();
        (remoteItems || []).forEach(it => {
            seen.add(it.key);
            const r = byKey.get(it.key);
            if (!r) { fresh.push(it); return; }
            const last = (r.reqSource.lastChange || '');
            if (it.modified && it.modified !== last) changed.push({ it, r });
            else unchanged.push({ it, r });
        });
        const missing = reqs.filter(r => r.reqSource && r.reqSource.tool === TOOL && !seen.has(r.reqSource.reqifId));
        return { fresh, changed, unchanged, missing, checkedAt: new Date().toISOString() };
    }

    // ------------------------------------------------------------ the apply
    function bridgeApply(diff, signedBy) {
        if (!signedBy || !String(signedBy).trim()) return { ok: false, err: 'A signature is required — the bridge watches, you decide.' };
        const at = new Date().toISOString();
        const store = (typeof acReqData !== 'undefined' ? acReqData : null);
        if (!store) return { ok: false, err: 'Requirement store unavailable.' };
        let added = 0, updated = 0, flagged = 0;
        (diff.fresh || []).forEach(it => {
            store.push({
                internalId: (typeof internalIdCounter !== 'undefined' ? internalIdCounter++ : Date.now() + added),
                id: it.key, traceId: it.key, level: 'aircraft', type: 'Imported',
                text: it.text || it.name, rat: '',
                reqSource: { tool: TOOL, reqifId: it.key, remoteId: it.id, lastChange: it.modified, by: signedBy, at }
            });
            added++;
        });
        (diff.changed || []).forEach(({ it, r }) => {
            r.text = it.text || it.name || r.text;
            r.reqSource.lastChange = it.modified;
            r.reqSource.by = signedBy; r.reqSource.at = at;
            delete r.reqSource.missingInSource;
            updated++;
        });
        (diff.missing || []).forEach(r => { r.reqSource.missingInSource = true; flagged++; });
        try { if (typeof window.jrnl === 'function') window.jrnl('bridge-sync', 'Jama live sync applied: +' + added + ' new, ' + updated + ' updated, ' + flagged + ' flagged missing — signed ' + signedBy); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return { ok: true, added, updated, flagged };
    }

    // --------------------------------------------------------------- check
    let _lastDiff = null;
    async function bridgeCheck(silent) {
        const items = await bridgeFetchItems();
        _lastDiff = bridgeDiff(items);
        try { if (typeof window.jrnl === 'function') window.jrnl('bridge-check', 'Jama checked: ' + items.length + ' remote item(s) — ' + _lastDiff.fresh.length + ' new, ' + _lastDiff.changed.length + ' changed, ' + _lastDiff.missing.length + ' missing'); } catch (_) {}
        const pending = _lastDiff.fresh.length + _lastDiff.changed.length + _lastDiff.missing.length;
        if (!silent || pending) {
            try { if (typeof showToast === 'function') showToast(pending ? 'Jama: ' + _lastDiff.fresh.length + ' new · ' + _lastDiff.changed.length + ' changed · ' + _lastDiff.missing.length + ' missing — review below.' : 'Jama: everything in sync.', pending ? 'info' : 'success', 4200); } catch (_) {}
        }
        _render();
        return _lastDiff;
    }

    // ---------------------------------------------------------- auto-poll
    let _timer = null;
    function _armPoll() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        const cfg = bridgeConfig();
        if (cfg.auto && cfg.baseUrl && cfg.token) {
            _timer = setInterval(() => { bridgeCheck(true).catch(() => {}); }, 5 * 60 * 1000);
        }
    }

    // ------------------------------------------------------------- the panel
    function _render() {
        const host = document.getElementById('reqif-host');
        if (!host) return;
        let div = document.getElementById('bridge-panel');
        if (!div) { div = document.createElement('div'); div.id = 'bridge-panel'; host.parentNode.insertBefore(div, host.parentNode.querySelector('#statusback-panel') || host); }
        const cfg = bridgeConfig();
        const fieldCss = 'font-size:12px; padding:5px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:10px 14px; margin-bottom:14px;">' +
            '<div style="font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">Live bridge — Jama <span style="font-weight:400; text-transform:none;">(read-only phase; connector-shaped for Polarion/DOORS)</span></div>' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); margin-bottom:8px;">The bridge watches; you decide. Credentials live in this browser only — never in the project file, never on a server. ' + (_isDesktop() ? 'Desktop: direct connection.' : 'Web: relayed through the stateless /api/bridge proxy.') + '</div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">' +
            '<input id="lb-url" type="text" placeholder="https://yourco.jamacloud.com" value="' + _esc(cfg.baseUrl || '') + '" style="' + fieldCss + ' width:230px;">' +
            '<input id="lb-pid" type="text" placeholder="project id" value="' + _esc(cfg.projectId || '') + '" style="' + fieldCss + ' width:90px;">' +
            '<input id="lb-user" type="text" placeholder="username" value="' + _esc(cfg.user || '') + '" style="' + fieldCss + ' width:120px;">' +
            '<input id="lb-token" type="password" placeholder="API token" value="' + _esc(cfg.token || '') + '" style="' + fieldCss + ' width:140px;">' +
            '<label style="display:inline-flex; align-items:center; gap:4px; font-size:11px;"><input id="lb-auto" type="checkbox"' + (cfg.auto ? ' checked' : '') + '> watch every 5 min</label>' +
            '<button class="ckpt-m-btn" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeSaveUi()">Save</button>' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeCheckUi()">Check Jama now</button>' +
            '</div>';
        if (_lastDiff) {
            const d = _lastDiff;
            const pending = d.fresh.length + d.changed.length + d.missing.length;
            html += '<div style="font-size:12px; margin-bottom:6px;"><b>' + (pending ? pending + ' item(s) need review' : 'In sync') + '</b>' +
                ' <span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">checked ' + _esc(String(d.checkedAt).slice(11, 19)) + ' · ' + d.unchanged.length + ' unchanged</span></div>';
            if (pending) {
                const row = (tag, color, name, detail) => '<tr><td><span style="font-size:10px; font-weight:700; color:' + color + ';">' + tag + '</span></td><td style="font-size:11.5px;"><b>' + _esc(name) + '</b></td><td style="font-size:11px; color:var(--color-text-secondary);">' + _esc(detail) + '</td></tr>';
                html += '<table class="data-table" style="width:100%;"><tbody>' +
                    d.fresh.slice(0, 12).map(it => row('NEW', 'var(--color-success)', it.key + ' — ' + it.name, (it.text || '').slice(0, 90))).join('') +
                    d.changed.slice(0, 12).map(x => row('CHANGED', 'var(--color-warning)', x.it.key + ' — ' + x.it.name, 'modified ' + x.it.modified + ' (yours: ' + (x.r.reqSource.lastChange || '—') + ')')).join('') +
                    d.missing.slice(0, 12).map(r => row('MISSING', 'var(--color-danger)', r.id || r.traceId, 'in the model, absent from Jama — will be flagged, never deleted')).join('') +
                    '</tbody></table>' +
                    '<div style="display:flex; gap:10px; align-items:center; margin-top:8px;">' +
                    '<input id="lb-by" type="text" placeholder="Signature (required)" style="' + fieldCss + ' width:200px;">' +
                    '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:3px 12px;" onclick="bridgeApplyUi()">Sign & apply staged changes</button>' +
                    '<span id="lb-err" style="color:var(--color-danger); font-size:11.5px; font-weight:600;"></span></div>';
            }
        }
        html += '</div>';
        div.innerHTML = html;
    }

    // ------------------------------------------------------------ UI verbs
    window.bridgeSaveUi = function () {
        const g = id => { const el = document.getElementById(id); return el ? (el.type === 'checkbox' ? el.checked : el.value.trim()) : ''; };
        bridgeConfigSave({ kind: 'jama', baseUrl: g('lb-url'), projectId: g('lb-pid'), user: g('lb-user'), token: g('lb-token'), auto: g('lb-auto') });
        _armPoll();
        try { showToast('Connector saved (this browser only).', 'success', 2600); } catch (_) {}
        _render();
    };
    window.bridgeCheckUi = function () {
        bridgeCheck(false).catch(e => { try { showToast('Bridge: ' + e.message, 'error', 4200); } catch (_) {} });
    };
    window.bridgeApplyUi = function () {
        if (!_lastDiff) return;
        const by = (document.getElementById('lb-by') || { value: '' }).value.trim();
        const r = bridgeApply(_lastDiff, by);
        const err = document.getElementById('lb-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        _lastDiff = null;
        try { showToast('Applied: +' + r.added + ' new, ' + r.updated + ' updated, ' + r.flagged + ' flagged.', 'success', 4200); } catch (_) {}
        _render();
    };

    // ------------------------------------------------------------- the wrap
    (function wrap() {
        if (typeof window.renderReqifPage === 'function' && !window.renderReqifPage._lbWrapped) {
            const orig = window.renderReqifPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _render(); } catch (_) {}
                return r;
            };
            wrapped._lbWrapped = true;
            window.renderReqifPage = wrapped;
        }
    })();
    _armPoll();

    // ------------------------------------------------------------- exports
    window.bridgeConfig = bridgeConfig;
    window.bridgeConfigSave = bridgeConfigSave;
    window.bridgeFetchItems = bridgeFetchItems;
    window.bridgeDiff = bridgeDiff;
    window.bridgeApply = bridgeApply;
    window.bridgeCheck = bridgeCheck;
})();
