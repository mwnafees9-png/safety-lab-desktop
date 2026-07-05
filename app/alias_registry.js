// ============================================================================
// alias_registry.js — v1.1 — AL1: signed system aliases. USER INPUT ONLY.
// v1.1: wired the same as the CCF similarity dispositions — proper in-app
// modals (.modal-overlay pattern) for add AND remove, signature required on
// both, error line in-modal. No inline forms, no browser prompts.
//
// The scope decision, in full, because it matters:
//   · NO derivation. "Electrical Power System" → EPS is a guess wearing a
//     deterministic costume — EPS is Emergency Power Supply on half the
//     fleet. A derived equivalence is a hallucination with extra steps.
//   · NO AI. Not gated, not opt-in, not suggestion-only. A stochastic input
//     anywhere in the naming path makes the pipeline non-reproducible, and
//     "deterministic MBSA core" has to be literally checkable by a DER.
//   · Aliases are TYPED and SIGNED by the engineer. That makes every alias
//     confirmed by construction — no candidate state, no two-lane machinery.
//     Signed in, journaled, deterministic out.
//
// What they buy: the CCF lookalike detector (ccf_similarity v1.2) canonical-
// izes event names through the registry, so "EPS pump fails" and "Electrical
// Power System pump fails" under an AND gate stop sailing past each other
// when names were carried over from Jama / DOORS / Cameo with different
// naming conventions.
//
// Store: system.aliases = [{ t, by, at }] — term, signature, timestamp.
// Surface: "Also known as" panel on the system workspace Functions tab
// (step 1 — where the system's identity lives). No new tabs.
// Born-modular: wraps switchWorkspaceTab + openSystemWorkspace. No monolith
// edits. Every add/remove journaled + autosaved.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _sysById(id) {
        return ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(s => s && s.id === id) || null;
    }
    function _activeSys() {
        return _sysById(typeof activeSystemId !== 'undefined' ? activeSystemId : null);
    }
    function _clean(t) { return String(t || '').trim().replace(/\s+/g, ' '); }
    function _jr(kind, msg) { try { if (typeof window.jrnl === 'function') window.jrnl(kind, msg); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    // ------------------------------------------------------------- the store
    window.aliasList = function (sysId) {
        const s = _sysById(sysId);
        return (s && Array.isArray(s.aliases)) ? s.aliases : [];
    };

    window.aliasAdd = function (sysId, term, by) {
        const s = _sysById(sysId);
        term = _clean(term); by = _clean(by);
        if (!s || !term || !by) return { ok: false, err: 'Alias and signature are both required.' };
        if (term.toLowerCase() === String(s.name || '').toLowerCase())
            return { ok: false, err: 'That is the system name itself, not an alias.' };
        s.aliases = Array.isArray(s.aliases) ? s.aliases : [];
        if (s.aliases.some(a => a.t.toLowerCase() === term.toLowerCase()))
            return { ok: false, err: 'Alias "' + term + '" is already on record.' };
        // an alias claiming a DIFFERENT system's name or alias is a collision, not an alias
        const clash = ((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(o =>
            o && o.id !== s.id && (
                String(o.name || '').toLowerCase() === term.toLowerCase() ||
                (Array.isArray(o.aliases) && o.aliases.some(a => a.t.toLowerCase() === term.toLowerCase()))
            ));
        if (clash) return { ok: false, err: 'Collision: "' + term + '" already identifies system "' + (clash.name || clash.id) + '". One name, one system.' };
        s.aliases.push({ t: term, by: by, at: new Date().toISOString() });
        _jr('alias-add', (s.name || s.id) + ' also known as "' + term + '" — signed ' + by);
        _save();
        _bumpEpoch();
        return { ok: true };
    };

    window.aliasRemove = function (sysId, term, by) {
        const s = _sysById(sysId);
        by = _clean(by);
        if (!by) return { ok: false, err: 'A signature is required to remove an alias.' };
        if (!s || !Array.isArray(s.aliases)) return { ok: false, err: 'Nothing to remove.' };
        const i = s.aliases.findIndex(a => a.t.toLowerCase() === String(term || '').toLowerCase());
        if (i < 0) return { ok: false, err: 'Alias not found.' };
        const gone = s.aliases.splice(i, 1)[0];
        _jr('alias-remove', (s.name || s.id) + ' alias "' + gone.t + '" removed — signed ' + by);
        _save();
        _bumpEpoch();
        return { ok: true };
    };

    // ------------------------------------------- canonicalization pair feed
    // Raw lowercase (alias, canonical-name) pairs, longest alias first so
    // multi-word aliases win before their fragments. The consumer
    // (ccf_similarity) runs both sides through its own normalizer — this
    // module owns the facts, not the token rules.
    let _epoch = 0;
    let _cache = null, _cacheEpoch = -1;
    function _bumpEpoch() { _epoch++; }
    window._aliasBumpEpoch = _bumpEpoch;   // for importers/loaders that swap systemsData wholesale

    window.aliasCanonPairs = function () {
        if (_cache && _cacheEpoch === _epoch) return _cache;
        const out = [];
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => {
            if (!s || !Array.isArray(s.aliases) || !s.aliases.length) return;
            const canon = String(s.name || '').toLowerCase().trim();
            if (!canon) return;
            s.aliases.forEach(a => {
                const t = String(a.t || '').toLowerCase().trim();
                if (t && t !== canon) out.push({ a: t, c: canon });
            });
        });
        out.sort((x, y) => y.a.length - x.a.length);
        _cache = out; _cacheEpoch = _epoch;
        return out;
    };

    // ------------------------------------------------------------- the panel
    function _render() {
        const view = document.getElementById('ws-view-func');
        if (!view) return;
        const s = _activeSys();
        let host = document.getElementById('alias-reg-panel');
        if (!host) {
            host = document.createElement('div');
            host.id = 'alias-reg-panel';
            host.style.cssText = 'margin: 0 0 14px;';
            const header = view.querySelector('.header-with-export');
            if (header && header.nextSibling) view.insertBefore(host, header.nextSibling);
            else view.insertBefore(host, view.firstChild);
        }
        if (!s) { host.style.display = 'none'; return; }
        host.style.display = 'block';
        const aliases = window.aliasList(s.id);
        const chips = aliases.map(a =>
            '<span style="display:inline-flex; align-items:center; gap:6px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:3px 8px; font-size:11.5px;" title="Signed ' + _esc(a.by) + ' · ' + _esc(String(a.at).slice(0, 10)) + '">' +
            '<b>' + _esc(a.t) + '</b><span style="color:var(--color-text-tertiary);">' + _esc(a.by) + '</span>' +
            '<a role="button" style="cursor:pointer; font-weight:700; color:var(--color-danger);" onclick="aliasRemoveModal(\'' + _esc(s.id) + '\', \'' + _esc(a.t).replace(/'/g, "\\'") + '\')">×</a></span>'
        ).join(' ');
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:10px 14px;">' +
            '<div style="font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; margin-bottom:6px;">Also known as — signed aliases</div>' +
            '<div style="font-size:11.5px; color:var(--color-text-secondary); margin-bottom:8px;">Names this system carries in other tools (Jama, DOORS, Cameo, ATA shorthand). The CCF lookalike detector reads these — "' + _esc((aliases[0] && aliases[0].t) || 'EPS') + ' pump fails" and "' + _esc(s.name || 'this system') + ' pump fails" become the same question. User-entered and signed only; nothing is derived, nothing is guessed.</div>' +
            (aliases.length ? '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' + chips + '</div>' : '') +
            '<button class="ckpt-m-btn" style="font-size:11.5px; padding:4px 12px;" onclick="aliasAddModal(\'' + _esc(s.id) + '\')">Add alias…</button>' +
            '</div>';
    }
    window._alRenderPanel = _render;

    // ------------------------------------------------------------- the modal
    // Same wiring as the CCF similarity dispositions: a proper in-app modal
    // (.modal-overlay / .modal-content pattern), signature required, error
    // line, no inline forms, no browser prompts.
    function _ensureModal() {
        let modal = document.getElementById('alias-reg-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'alias-reg-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML =
            '<div class="modal-content" style="max-width: 560px;">' +
            '<div class="modal-header">' +
            '<h2 id="alias-modal-title">Add Alias</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="aliasCloseModal()">Cancel</button>' +
            '</div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<div id="alias-modal-ctx" style="font-size:13px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-bottom:14px;"></div>' +
            '<div id="alias-modal-fields"></div>' +
            '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">' +
            '<button id="alias-modal-submit" class="ckpt-m-btn" style="font-size:13px; padding:6px 18px;"></button>' +
            '</div>' +
            '<p id="alias-modal-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) window.aliasCloseModal(); });
        return modal;
    }

    const fieldCss = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
    const labelCss = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';

    function _openModal(mode, sysId, term) {
        const s = _sysById(sysId);
        if (!s) return;
        const modal = _ensureModal();
        modal._alMode = mode; modal._alSysId = sysId; modal._alTerm = term || '';
        document.getElementById('alias-modal-title').textContent =
            mode === 'add' ? 'Add Alias' : 'Remove Alias';
        document.getElementById('alias-modal-ctx').innerHTML =
            '<b>' + _esc(s.name || s.id) + '</b>' +
            (mode === 'remove' ? '<div style="margin-top:6px;">Alias on record: <b>' + _esc(term) + '</b></div>' : '') +
            '<div style="color:var(--color-text-secondary); margin-top:6px;">' +
            (mode === 'add'
                ? 'An alias is a signed statement of fact: this name, wherever it appears, means this system. The CCF lookalike detector reads it immediately. Nothing is derived, nothing is guessed.'
                : 'Removing the alias withdraws that statement — pairs that matched only through it drop from the lookalike detector. The removal is journaled.') +
            '</div>';
        const fields = document.getElementById('alias-modal-fields');
        if (mode === 'add') {
            fields.innerHTML =
                '<label style="' + labelCss + '">Alias (required)</label>' +
                '<input id="alias-modal-term" type="text" style="' + fieldCss + '" placeholder="e.g. EPS, ELEC PWR, ATA-24 shorthand">' +
                '<label style="' + labelCss + '">Signature (required)</label>' +
                '<input id="alias-modal-by" type="text" style="' + fieldCss + '" placeholder="Your name">';
            document.getElementById('alias-modal-submit').textContent = 'Record alias';
        } else {
            fields.innerHTML =
                '<label style="' + labelCss + '">Signature (required)</label>' +
                '<input id="alias-modal-by" type="text" style="' + fieldCss + '" placeholder="Your name">';
            document.getElementById('alias-modal-submit').textContent = 'Remove alias';
        }
        document.getElementById('alias-modal-err').style.display = 'none';
        document.getElementById('alias-modal-submit').onclick = window._alModalSubmit;
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        setTimeout(() => {
            const first = document.getElementById(mode === 'add' ? 'alias-modal-term' : 'alias-modal-by');
            if (first) first.focus();
        }, 260);
    }

    window.aliasCloseModal = function () {
        const modal = document.getElementById('alias-reg-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    };

    window._alModalSubmit = function () {
        const modal = document.getElementById('alias-reg-modal');
        if (!modal) return;
        const err = document.getElementById('alias-modal-err');
        const fail = msg => { err.textContent = msg; err.style.display = 'block'; };
        const by = (document.getElementById('alias-modal-by').value || '').trim();
        if (!by) return fail('A signature is required.');
        let r;
        if (modal._alMode === 'add') {
            const term = (document.getElementById('alias-modal-term').value || '').trim();
            if (!term) return fail('An alias is required.');
            r = window.aliasAdd(modal._alSysId, term, by);
        } else {
            r = window.aliasRemove(modal._alSysId, modal._alTerm, by);
        }
        if (!r.ok) return fail(r.err);
        window.aliasCloseModal();
        _render();
        try { if (typeof showToast === 'function') showToast(modal._alMode === 'add' ? 'Alias recorded. The lookalike detector reads it immediately.' : 'Alias removed and journaled.', 'success', 3000); } catch (_) {}
    };

    window.aliasAddModal = function (sysId) { _openModal('add', sysId); };
    window.aliasRemoveModal = function (sysId, term) { _openModal('remove', sysId, term); };

    // ------------------------------------------------------------- the hooks
    (function wrap() {
        if (typeof window.switchWorkspaceTab === 'function' && !window.switchWorkspaceTab._alWrapped) {
            const o = window.switchWorkspaceTab;
            const w = function (tab) {
                const r = o.apply(this, arguments);
                try { if (tab === 'func') _render(); } catch (_) {}
                return r;
            };
            w._alWrapped = true;
            window.switchWorkspaceTab = w;
        }
        if (typeof window.openSystemWorkspace === 'function' && !window.openSystemWorkspace._alWrapped) {
            const o2 = window.openSystemWorkspace;
            const w2 = function () {
                const r = o2.apply(this, arguments);
                try { _render(); } catch (_) {}
                return r;
            };
            w2._alWrapped = true;
            window.openSystemWorkspace = w2;
        }
    })();
})();
