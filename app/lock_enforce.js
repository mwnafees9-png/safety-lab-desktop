// ============================================================================
// lock_enforce.js — v1.0 — locking that means it.
//
// The spec, verbatim from the boss:
//   · A user lock belongs to its HOLDER. Only they edit. Only they unlock —
//     the override path is gone. A voluntary unlock is FLAGGED: recorded in
//     the workspace change log AND the hash-chained journal.
//   · BASELINED is stronger than locked: once a gate is baselined, nobody
//     unlocks it. Reopening requires a PROBLEM REPORT raised through a
//     full-parameter modal — gate, artifacts, reason, change description,
//     impact assessment, safety relevance, signature. The PR is the key;
//     there is no other key.
//   · Enforcement: BLOCK, PERIOD. Locked views are inert (no clicks, no
//     keys), with a banner that says who/what/why — and, for baselines,
//     the one legitimate way back in.
//
// Rides the existing machinery: area locks (acWorkspace.lock / system.lock,
// _wsEditable), the change log, problem reports (projectConfig store), the
// journal, and the PSSA/SSA pages for the baseline controls.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _user() {
        try { return (typeof _wsUser === 'function') ? _wsUser() : { email: '', name: '' }; } catch (_) { return { email: '', name: '' }; }
    }

    // ------------------------------------------------------------ the model
    // Gates lock AREAS: aircraft-level gates freeze the aircraft workspace,
    // system-level gates freeze every system workspace.
    const GATE_SCOPES = { AFHA: 'ac', PASA: 'ac', ASA: 'ac', SFHA: 'system', PSSA: 'system', SSA: 'system' };
    const TAB_AREAS = {
        'ac-func': { scope: 'ac' }, 'ac-fcim': { scope: 'ac' }, 'ac-fha': { scope: 'ac' },
        'ac-req': { scope: 'ac' }, 'ac-asm': { scope: 'ac' }, 'pasa': { scope: 'ac' }, 'asa': { scope: 'ac' },
        'sys-workspace': { scope: 'system', dynamic: true },
    };

    function _bl() {
        const pc = _pc();
        if (!pc.gateBaselines) pc.gateBaselines = {};
        return pc.gateBaselines;
    }
    function _areaBaseline(scope) {
        const bl = _bl();
        return Object.keys(bl).map(g => Object.assign({ gate: g }, bl[g]))
            .find(b => b.state === 'locked' && GATE_SCOPES[b.gate] === scope) || null;
    }

    // The single truth: can this area be edited, and if not, why.
    window.slLockState = function (scope, systemId) {
        const base = _areaBaseline(scope);
        if (base) return { editable: false, kind: 'baseline', gate: base.gate, by: base.by, at: base.at, prId: base.prId || null };
        let userLock = null;
        try { userLock = (typeof _wsGetLock === 'function') ? _wsGetLock(scope, systemId) : null; } catch (_) {}
        if (userLock) {
            const mine = String(userLock.by || '').toLowerCase() === (_user().email || '').toLowerCase();
            if (!mine) return { editable: false, kind: 'user', by: userLock.by, name: userLock.name, at: userLock.at };
            return { editable: true, kind: 'held-by-me', by: userLock.by };
        }
        return { editable: true, kind: 'open' };
    };

    // -------------------------------------------------- BLOCK, PERIOD (UI)
    function _viewIdForTab(tab) {
        return document.getElementById('view-' + tab) || null;
    }
    function _enforceOn(tab) {
        const map = TAB_AREAS[tab];
        if (!map) return;
        const scope = map.scope;
        const sysId = map.dynamic ? (typeof activeSystemId !== 'undefined' ? activeSystemId : '') : '';
        const view = _viewIdForTab(tab);
        if (!view) return;
        const st = window.slLockState(scope, sysId);
        let banner = view.querySelector(':scope > .sl-lockbanner');
        if (st.editable) {
            if (view.inert) view.inert = false;
            if (banner) banner.remove();
            return;
        }
        view.inert = true;   // no clicks, no keys — block, period
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'sl-lockbanner';
            banner.style.cssText = 'position:sticky; top:0; z-index:50; margin:0 0 10px; padding:10px 16px;' +
                'background:#8E2A2A; color:#fff; font-size:13px; font-weight:600; border-radius:var(--r-md, 8px); display:flex; justify-content:space-between; align-items:center; gap:12px;';
            view.insertBefore(banner, view.firstChild);
        }
        // the banner itself must stay interactive inside an inert view — it
        // can't, so it renders actions as instructions + the PR modal opens
        // from OUTSIDE the view (floating button appended to body).
        if (st.kind === 'baseline') {
            banner.textContent = '🧊 BASELINED — ' + st.gate + ' was baselined by ' + (st.by || '?') + ' on ' + new Date(st.at).toISOString().slice(0, 10) +
                '. Editing is blocked. Reopening requires a Problem Report.';
            _floatReopen(st.gate);
        } else {
            banner.textContent = '🔒 Locked by ' + (st.name || st.by || 'another user') + ' — only the lock holder can edit or unlock. Editing is blocked.';
            _floatReopen(null);
        }
    }
    function _floatReopen(gate) {
        let btn = document.getElementById('sl-reopen-float');
        if (!gate) { if (btn) btn.remove(); return; }
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'sl-reopen-float';
            btn.className = 'ckpt-m-btn';
            btn.style.cssText = 'position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:2500; font-size:13px; padding:8px 20px; box-shadow:var(--shadow-xl, 0 8px 24px rgba(0,0,0,.35));';
            document.body.appendChild(btn);
        }
        btn.textContent = 'Reopen ' + gate + ' baseline — raise Problem Report…';
        btn.onclick = () => window.blReopenUi(gate);
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._lockWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                setTimeout(() => {
                    _enforceOn(tabId);
                    // clear the float when leaving a baselined area
                    if (!TAB_AREAS[tabId]) _floatReopen(null);
                }, 150);
            } catch (_) {}
            return r;
        };
        wrapped._lockWrapped = true;
        window.switchTab = wrapped;
    })();

    // Override path dies: the inline pill wrapper refuses foreign unlocks…
    (function killOverride() {
        if (typeof window._wsToggleInlineLock === 'function' && !window._wsToggleInlineLock._lockWrapped) {
            const orig = window._wsToggleInlineLock;
            const wrapped = async function (scope, systemId) {
                try {
                    const lk = (typeof _wsGetLock === 'function') ? _wsGetLock(scope, systemId) : null;
                    const mine = lk && String(lk.by || '').toLowerCase() === (_user().email || '').toLowerCase();
                    if (lk && !mine) {
                        try { if (typeof showToast === 'function') showToast('Only the lock holder can unlock this area.', 'warning', 3200); } catch (_) {}
                        return;
                    }
                } catch (_) {}
                return orig.apply(this, arguments);
            };
            wrapped._lockWrapped = true;
            window._wsToggleInlineLock = wrapped;
        }
        // …and the panel's override button is neutralized at capture phase,
        // before the panel's own handler can see the click.
        if (typeof document !== 'undefined' && !window._slOverrideShield) {
            window._slOverrideShield = true;
            document.addEventListener('click', e => {
                const t = e.target;
                if (t && t.getAttribute && t.getAttribute('data-act') === 'override') {
                    e.stopPropagation(); e.preventDefault();
                    try { if (typeof showToast === 'function') showToast('Override is disabled: only the lock holder can unlock. Baselined gates reopen only via Problem Report.', 'warning', 4200); } catch (_) {}
                }
            }, true);
        }
    })();

    // ------------------------------------- voluntary unlocks are FLAGGED
    // Ride the autosave chain: any new lock/unlock entries in the workspace
    // change log get mirrored into the hash-chained journal.
    let _clSeen = 0;
    (function wrapSave() {
        if (typeof window.scheduleAutosave !== 'function' || window.scheduleAutosave._lockWrapped) return;
        const orig = window.scheduleAutosave;
        const wrapped = function () {
            try {
                const log = _pc().changeLog || [];
                for (let i = _clSeen; i < log.length; i++) {
                    const e = log[i];
                    if (e && (e.action === 'unlock' || e.action === 'lock')) {
                        try { if (typeof window.jrnl === 'function') window.jrnl('ws-' + e.action, (e.name || e.by || '?') + ' ' + e.summary); } catch (_) {}
                    }
                }
                _clSeen = log.length;
            } catch (_) {}
            return orig.apply(this, arguments);
        };
        wrapped._lockWrapped = true;
        window.scheduleAutosave = wrapped;
    })();
    try { _clSeen = (_pc().changeLog || []).length; } catch (_) {}

    // --------------------------------------------------- baseline machine
    function _blApply(gate, by, note) {
        if (!GATE_SCOPES[gate] || !by || !String(by).trim()) return false;
        _bl()[gate] = { state: 'locked', by: String(by).trim(), note: String(note || '').trim(), at: Date.now(), prId: null };
        try { if (typeof window.jrnl === 'function') window.jrnl('baseline', gate + ' baselined by ' + by + (note ? ' — ' + note : '')); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return true;
    }
    // The PR is the key. Every parameter is required.
    function _blReopenApply(gate, p) {
        const bl = _bl()[gate];
        if (!bl || bl.state !== 'locked') return { ok: false, reason: 'gate is not baselined' };
        const req = ['reason', 'change', 'impact', 'by'];
        for (const k of req) if (!p || !String(p[k] || '').trim()) return { ok: false, reason: 'missing required parameter: ' + k };
        if (!Array.isArray(p.artifacts) || !p.artifacts.length) return { ok: false, reason: 'missing required parameter: artifacts' };
        const pc = _pc();
        if (!Array.isArray(pc.problemReports)) pc.problemReports = [];
        // derive from BOTH the counter and existing ids — seeded projects may
        // carry PR rows the counter never saw (collision would silently alias
        // an old PR, which for an audit trail is unforgivable)
        let n = pc.prCounter || 0;
        pc.problemReports.forEach(x => { const m = /^PR-(\d+)$/.exec((x && x.id) || ''); if (m) n = Math.max(n, parseInt(m[1], 10)); });
        n += 1; pc.prCounter = n;
        const prId = 'PR-' + String(n).padStart(3, '0');
        const now = new Date().toISOString();
        pc.problemReports.push({
            id: prId,
            title: 'Reopen ' + gate + ' baseline: ' + String(p.reason).trim().slice(0, 80),
            description: 'BASELINE REOPEN — ' + gate + '\nArtifacts affected: ' + p.artifacts.join(', ') +
                '\nReason: ' + p.reason + '\nChange description: ' + p.change +
                '\nImpact assessment: ' + p.impact + '\nSafety related: ' + (p.safety ? 'YES' : 'no'),
            safetyRelated: !!p.safety, source: 'baseline-reopen', linked: gate,
            state: 'open', raisedBy: String(p.by).trim(), raisedAt: now,
            history: [{ state: 'open', by: String(p.by).trim(), at: now, note: 'baseline reopen requested' }],
            deferral: null, disposition: '',
            reopen: { gate, artifacts: p.artifacts.slice(), reason: p.reason, change: p.change, impact: p.impact, safety: !!p.safety }
        });
        _bl()[gate] = Object.assign({}, bl, { state: 'reopened', prId, reopenedBy: String(p.by).trim(), reopenedAt: Date.now() });
        try { if (typeof window.jrnl === 'function') window.jrnl('baseline-reopen', gate + ' reopened under ' + prId + ' by ' + p.by + ' — ' + p.reason); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        return { ok: true, prId };
    }

    // ------------------------------------------------------------ the modals
    function _modal(id, title, bodyHtml, submitLabel, onSubmit) {
        let m = document.getElementById(id);
        if (m) m.remove();
        m = document.createElement('div');
        m.id = id;
        m.className = 'modal-overlay';
        m.innerHTML = '<div class="modal-content" style="max-width: 640px;">' +
            '<div class="modal-header"><h2>' + title + '</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="this.closest(\'.modal-overlay\').classList.remove(\'show\'); setTimeout(()=>this.closest(\'.modal-overlay\').remove(), 250);">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' + bodyHtml +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;">' +
            '<button class="ckpt-m-btn" id="' + id + '-go" style="font-size:13px; padding:6px 18px;">' + submitLabel + '</button></div>' +
            '<p id="' + id + '-err" style="color:#FCA5A5; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(m);
        document.getElementById(id + '-go').onclick = () => onSubmit(m, msg => {
            const err = document.getElementById(id + '-err');
            err.textContent = msg; err.style.display = 'block';
        });
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
        return m;
    }
    const F = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
    const L = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';

    window.blBaselineUi = function (gate) {
        _modal('bl-modal', 'Baseline ' + _esc(gate),
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">Baselining locks every workspace this gate covers. There is no unlock: reopening requires a Problem Report with full change parameters. The act is journaled.</p>' +
            '<label style="' + L + '">Signature (required)</label><input id="bl-by" type="text" style="' + F + '" placeholder="Your name">' +
            '<label style="' + L + '">Baseline note</label><input id="bl-note" type="text" style="' + F + '" placeholder="e.g. SOI-2 data freeze">',
            'Baseline & lock', (m, fail) => {
                const by = document.getElementById('bl-by').value.trim();
                if (!by) return fail('A signature is required.');
                if (_blApply(gate, by, document.getElementById('bl-note').value)) {
                    m.classList.remove('show'); setTimeout(() => m.remove(), 250);
                    try { if (typeof showToast === 'function') showToast(gate + ' baselined and locked.', 'success', 3200); } catch (_) {}
                    try { if (typeof renderPssaPage === 'function') renderPssaPage(); } catch (_) {}
                    try { if (typeof renderSsaPage === 'function') renderSsaPage(); } catch (_) {}
                }
            });
    };

    window.blReopenUi = function (gate) {
        const arts = ['Hazard assessments (FHA rows)', 'Fault trees / allocations', 'DAL allocations', 'Requirements & V&V', 'CCA (PRA/ZSA/CMA)', 'Assumptions', 'R&M / dispatch data'];
        _modal('bl-reopen-modal', 'Reopen ' + _esc(gate) + ' Baseline — Problem Report',
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">A baselined gate reopens only through a Problem Report. Be specific — every parameter below lands in the PR and the journal.</p>' +
            '<label style="' + L + '">Artifacts affected (select all that apply)</label>' +
            arts.map((a, i) => '<label style="display:flex; gap:8px; align-items:center; font-size:12.5px; padding:2px 0;"><input type="checkbox" id="blr-a' + i + '" value="' + _esc(a) + '">' + _esc(a) + '</label>').join('') +
            '<label style="' + L + '">Reason for reopening (required)</label><input id="blr-reason" type="text" style="' + F + '" placeholder="What was found / what changed upstream">' +
            '<label style="' + L + '">Change description (required)</label><textarea id="blr-change" rows="2" style="' + F + ' resize:vertical;" placeholder="Exactly what will be modified"></textarea>' +
            '<label style="' + L + '">Impact assessment (required)</label><textarea id="blr-impact" rows="2" style="' + F + ' resize:vertical;" placeholder="Which analyses re-run, which gates re-verify, downstream effects"></textarea>' +
            '<label style="display:flex; gap:8px; align-items:center; font-size:12.5px; margin-top:10px;"><input type="checkbox" id="blr-safety"> Safety related</label>' +
            '<label style="' + L + '">Requested by (signature, required)</label><input id="blr-by" type="text" style="' + F + '" placeholder="Your name">',
            'Raise PR & reopen', (m, fail) => {
                const artifacts = arts.filter((a, i) => document.getElementById('blr-a' + i).checked);
                const p = {
                    artifacts,
                    reason: document.getElementById('blr-reason').value,
                    change: document.getElementById('blr-change').value,
                    impact: document.getElementById('blr-impact').value,
                    safety: document.getElementById('blr-safety').checked,
                    by: document.getElementById('blr-by').value
                };
                const r = _blReopenApply(gate, p);
                if (!r.ok) return fail(r.reason + '.');
                m.classList.remove('show'); setTimeout(() => m.remove(), 250);
                try { if (typeof showToast === 'function') showToast(gate + ' reopened under ' + r.prId + '. The PR carries every parameter; the journal carries the act.', 'success', 4600); } catch (_) {}
                _floatReopen(null);
                try { const cur = (typeof window._slCurrentTab !== 'undefined') ? window._slCurrentTab : null; if (cur) _enforceOn(cur); } catch (_) {}
                try { if (typeof renderPssaPage === 'function') renderPssaPage(); } catch (_) {}
                try { if (typeof renderSsaPage === 'function') renderSsaPage(); } catch (_) {}
            });
    };

    // ------------------------------ baseline controls on the PSSA/SSA pages
    function _blButton(gate) {
        const bl = _bl()[gate];
        if (!bl) return '<button class="ckpt-m-btn" style="font-size:12px; padding:4px 14px;" onclick="blBaselineUi(\'' + gate + '\')">Baseline &amp; lock…</button>';
        if (bl.state === 'locked') return '<span class="u-mono" style="font-size:11px; font-weight:700; color:#1D9E75;">🧊 BASELINED ' + new Date(bl.at).toISOString().slice(0, 10) + ' (' + _esc(bl.by) + ')</span>' +
            ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="blReopenUi(\'' + gate + '\')">Reopen via PR…</button>';
        return '<span class="u-mono" style="font-size:11px; font-weight:700; color:#B7791F;">REOPENED under ' + _esc(bl.prId) + '</span>' +
            ' <button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="blBaselineUi(\'' + gate + '\')">Re-baseline…</button>';
    }
    ['renderPssaPage', 'renderSsaPage'].forEach((fn, i) => {
        const gate = i === 0 ? 'PSSA' : 'SSA';
        const orig = window[fn];
        if (typeof orig !== 'function' || orig._blWrapped) return;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try {
                const host = document.getElementById(i === 0 ? 'view-pssa-page' : 'view-ssa-page');
                const hdr = host && host.querySelector('.header-with-export > div');
                if (hdr && !hdr.querySelector('.bl-ctl')) {
                    const span = document.createElement('span');
                    span.className = 'bl-ctl';
                    span.innerHTML = _blButton(gate);
                    hdr.insertBefore(span, hdr.firstChild);
                }
            } catch (_) {}
            return r;
        };
        wrapped._blWrapped = true;
        window[fn] = wrapped;
    });

    // ------------------------------------------------------------- exports
    window._blApply = _blApply;
    window._blReopenApply = _blReopenApply;
    window._blGateScopes = GATE_SCOPES;
})();
