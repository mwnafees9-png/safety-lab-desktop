// ============================================================================
// lock_custody.js — v1.0 — L3 + L5: gates know their neighbors, and custody
// transfers with a paper trail instead of a shrug.
//
// L3 — BASELINE CASCADE AWARENESS:
//   The workflow is a chain: AFHA → PASA → SFHA → PSSA → SSA → ASA.
//   Reopening an upstream gate means every downstream baseline now rests on
//   moving ground — so the reopen STAMPS each locked downstream baseline
//   "impacted (upstream <gate> reopened under <PR>)", INV-23 (advisory)
//   names every impacted baseline on every sweep, and the PSSA/SSA page
//   chips show the stamp. The flag clears the honest way only: by
//   re-baselining the downstream gate after re-verification. Baselining
//   out of workflow order is journaled as a named act (allowed — programs
//   have reasons — but never silent).
//
// L5 — BREAK-GLASS LOCK TAKEOVER:
//   Holder-only locking has a stranded-holder problem (engineer on leave,
//   machine dead). Takeover transfers custody through a full-parameter
//   modal — new holder signature + reason, both required — recorded in the
//   change log, the hash-chained journal, AND a dedicated takeover register
//   the REG report prints. Block-period is not weakened: baselined gates
//   have no takeover path at all; this transfers USER locks only, loudly.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _bl() { const pc = _pc(); if (!pc.gateBaselines) pc.gateBaselines = {}; return pc.gateBaselines; }
    function _jr(k, m) { try { if (typeof window.jrnl === 'function') window.jrnl(k, m); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _user() { try { return (typeof _wsUser === 'function') ? _wsUser() : { email: '', name: '' }; } catch (_) { return { email: '', name: '' }; } }

    const ORDER = ['AFHA', 'PASA', 'SFHA', 'PSSA', 'SSA', 'ASA'];

    // ================================================= L3 — cascade stamping
    (function wrapReopen() {
        if (typeof window._blReopenApply !== 'function' || window._blReopenApply._cascadeWrapped) return;
        const orig = window._blReopenApply;
        const wrapped = function (gate, p) {
            const r = orig.apply(this, arguments);
            if (r && r.ok) {
                try {
                    const idx = ORDER.indexOf(gate);
                    if (idx >= 0) {
                        const bl = _bl();
                        ORDER.slice(idx + 1).forEach(d => {
                            if (bl[d] && bl[d].state === 'locked') {
                                bl[d].impacted = { upstream: gate, prId: r.prId, at: Date.now() };
                                _jr('baseline-impact', d + ' baseline IMPACTED — upstream ' + gate + ' reopened under ' + r.prId + '; re-verify and re-baseline ' + d);
                            }
                        });
                        _save();
                    }
                } catch (_) {}
            }
            return r;
        };
        wrapped._cascadeWrapped = true;
        window._blReopenApply = wrapped;
    })();

    // out-of-order baselining: allowed, never silent
    (function wrapApply() {
        if (typeof window._blApply !== 'function' || window._blApply._cascadeWrapped) return;
        const orig = window._blApply;
        const wrapped = function (gate, by, note) {
            const ok = orig.apply(this, arguments);
            if (ok) {
                try {
                    const idx = ORDER.indexOf(gate);
                    const bl = _bl();
                    const skipped = ORDER.slice(0, Math.max(0, idx)).filter(g => !bl[g] || bl[g].state !== 'locked');
                    if (skipped.length) {
                        _jr('baseline-order', gate + ' baselined ahead of un-baselined upstream gate(s): ' + skipped.join(', ') + ' — deliberate act, recorded');
                        try { if (typeof showToast === 'function') showToast('Note: ' + gate + ' baselined while ' + skipped.join(', ') + ' remain(s) open upstream. Recorded in the journal.', 'warning', 5200); } catch (_) {}
                    }
                } catch (_) {}
            }
            return ok;
        };
        wrapped._cascadeWrapped = true;
        window._blApply = wrapped;
    })();

    // INV-23 (advisory): impacted baselines are named until re-baselined
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-23', name: 'No locked baseline rests on a reopened upstream gate (cascade integrity)', sev: 'advisory',
                run: () => {
                    const fails = []; let checked = 0;
                    const bl = _pc().gateBaselines || {};
                    Object.keys(bl).forEach(g => {
                        const b = bl[g];
                        if (!b || b.state !== 'locked') return;
                        checked++;
                        if (b.impacted) fails.push(g + ': baselined content rests on ' + b.impacted.upstream + ' which was reopened under ' + b.impacted.prId + ' — re-verify and re-baseline ' + g);
                    });
                    return { checked, fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // impacted badge on the PSSA/SSA page chips
    ['renderPssaPage', 'renderSsaPage'].forEach((fn, i) => {
        const gate = i === 0 ? 'PSSA' : 'SSA';
        const orig = window[fn];
        if (typeof orig !== 'function' || orig._impWrapped) return;
        const wrapped = function () {
            const r = orig.apply(this, arguments);
            try {
                const b = (_pc().gateBaselines || {})[gate];
                const host = document.getElementById(i === 0 ? 'view-pssa-page' : 'view-ssa-page');
                const ctl = host && host.querySelector('.bl-ctl');
                if (ctl && b && b.impacted && !ctl.querySelector('.bl-imp')) {
                    const s = document.createElement('span');
                    s.className = 'bl-imp u-mono';
                    s.style.cssText = 'font-size:11px; font-weight:700; color:#B7791F; margin-left:8px;';
                    s.textContent = '⚠ IMPACTED — ' + b.impacted.upstream + ' reopened under ' + b.impacted.prId;
                    ctl.appendChild(s);
                }
            } catch (_) {}
            return r;
        };
        wrapped._impWrapped = true;
        window[fn] = wrapped;
    });

    // ================================================ L5 — break-glass takeover
    function _takeovers() { const pc = _pc(); if (!Array.isArray(pc.lockTakeovers)) pc.lockTakeovers = []; return pc.lockTakeovers; }

    window._lockTakeoverApply = function (scope, systemId, p) {
        if (!p || !String(p.by || '').trim()) return { ok: false, reason: 'a signature is required' };
        if (!String(p.reason || '').trim()) return { ok: false, reason: 'a reason is required — takeovers are never silent' };
        let ref = null;
        try { ref = (typeof _wsAreaRef === 'function') ? _wsAreaRef(scope, systemId) : null; } catch (_) {}
        if (!ref || !ref.obj) return { ok: false, reason: 'area not found' };
        const lk = ref.obj.lock;
        if (!lk) return { ok: false, reason: 'area is not locked — nothing to take over' };
        const u = _user();
        const rec = {
            scope, systemId: systemId || '', area: ref.label,
            from: lk.by || '', fromName: lk.name || '',
            to: u.email || p.by, toName: p.by.trim(),
            reason: p.reason.trim(), at: new Date().toISOString(),
        };
        _takeovers().push(rec);
        ref.obj.lock = { by: u.email || p.by, name: p.by.trim(), at: Date.now(), takeover: true };
        try { if (typeof slWorkspaceLog === 'function') slWorkspaceLog(scope, systemId, 'takeover', 'BREAK-GLASS: lock taken over from ' + (rec.fromName || rec.from) + ' by ' + rec.toName + ' — ' + rec.reason); } catch (_) {}
        _jr('lock-takeover', 'BREAK-GLASS on ' + ref.label + ': custody transferred from ' + (rec.fromName || rec.from || '?') + ' to ' + rec.toName + ' — ' + rec.reason);
        _save();
        return { ok: true, rec };
    };

    window.lockTakeoverUi = function (scope, systemId) {
        let lk = null;
        try { lk = (typeof _wsGetLock === 'function') ? _wsGetLock(scope, systemId) : null; } catch (_) {}
        if (!lk) return;
        const F = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const L = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';
        let m = document.getElementById('lk-takeover-modal');
        if (m) m.remove();
        m = document.createElement('div');
        m.id = 'lk-takeover-modal';
        m.className = 'modal-overlay';
        m.innerHTML = '<div class="modal-content" style="max-width: 600px;">' +
            '<div class="modal-header"><h2>Break-Glass Lock Takeover</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="this.closest(\'.modal-overlay\').remove()">Cancel</button></div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">This area is locked by <b>' + _esc(lk.name || lk.by || '?') + '</b>. Taking over transfers custody to you — recorded in the change log, the journal, and the takeover register that prints in the Registers report. Takeovers are for stranded locks, not disagreements: the previous holder will see this.</p>' +
            '<label style="' + L + '">Your signature (required)</label><input id="lkt-by" type="text" style="' + F + '" placeholder="Your name">' +
            '<label style="' + L + '">Reason (required)</label><textarea id="lkt-reason" rows="2" style="' + F + ' resize:vertical;" placeholder="e.g. holder on leave; machine unavailable; program deadline"></textarea>' +
            '<div style="display:flex; justify-content:flex-end; margin-top:16px;">' +
            '<button class="ckpt-m-btn" id="lkt-go" style="font-size:13px; padding:6px 18px;">Take over lock</button></div>' +
            '<p id="lkt-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(m);
        document.getElementById('lkt-go').onclick = function () {
            const r = window._lockTakeoverApply(scope, systemId, {
                by: document.getElementById('lkt-by').value,
                reason: document.getElementById('lkt-reason').value,
            });
            const err = document.getElementById('lkt-err');
            if (!r.ok) { err.textContent = r.reason + '.'; err.style.display = 'block'; return; }
            m.remove();
            try { if (typeof showToast === 'function') showToast('Custody transferred — loudly. The takeover is journaled and prints in the register.', 'success', 4600); } catch (_) {}
            try { if (typeof switchTab === 'function' && window._slCurrentTab) switchTab(window._slCurrentTab); } catch (_) {}
        };
        m.style.display = 'flex';
        setTimeout(() => m.classList.add('show'), 10);
    };

    // float the break-glass button when a foreign user lock blocks the view
    const TAB_SCOPES = {
        'ac-func': 'ac', 'ac-fcim': 'ac', 'ac-fha': 'ac', 'ac-req': 'ac', 'ac-asm': 'ac',
        'pasa': 'ac', 'asa': 'ac', 'sys-workspace': 'system',
    };
    function _floatTakeover(tab) {
        let btn = document.getElementById('sl-takeover-float');
        const scope = TAB_SCOPES[tab];
        if (!scope) { if (btn) btn.remove(); return; }
        const sysId = scope === 'system' ? (typeof activeSystemId !== 'undefined' ? activeSystemId : '') : '';
        let st = { editable: true };
        try { st = window.slLockState(scope, sysId); } catch (_) {}
        if (!(st && st.kind === 'user' && !st.editable)) { if (btn) btn.remove(); return; }
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'sl-takeover-float';
            btn.className = 'ckpt-m-btn';
            btn.style.cssText = 'position:fixed; bottom:64px; left:50%; transform:translateX(-50%); z-index:2500; font-size:12px; padding:6px 16px; box-shadow:var(--shadow-xl, 0 8px 24px rgba(0,0,0,.35));';
            document.body.appendChild(btn);
        }
        btn.textContent = '🔨 Break-glass: take over this lock…';
        btn.onclick = () => window.lockTakeoverUi(scope, sysId);
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._custodyWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            window._slCurrentTab = tabId;
            const r = orig.apply(this, arguments);
            try { setTimeout(() => _floatTakeover(tabId), 300); } catch (_) {}
            return r;
        };
        wrapped._custodyWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------- exports
    window._slBaselineOrder = ORDER.slice();
})();
