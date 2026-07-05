// ============================================================================
// ccf_similarity.js — v1.2 — "Confirm independence" flags for lookalike
// FTA events (CCF candidate detection with engineer disposition).
// v1.2 (AL1): signed alias canonicalization — cross-tool naming variance
// ("EPS" carried from Jama vs "Electrical Power System" typed here) stops
// hiding lookalike pairs. Aliases are user-entered + signed ONLY.
//
// The gap this closes: the pipeline reacts to DECLARED common cause (shared
// ccfGroup, shared library entry, shared logicalId) but the classic miss is
// the copy-paste redundancy pair — "Hydraulic pump A fails" / "Hydraulic
// pump B fails", same λ, no group — which sails through looking independent.
//
// Framing is positive-confirmation, not accusation: a lookalike pair under an
// AND-family gate is INDEPENDENCE UNCONFIRMED until the engineer either
//   · confirms independence (signed, with basis; fingerprinted so any change
//     to either event reopens the question), or
//   · assigns both events to a CCF bucket (ccfGroup + user-entered β) —
//     quantification and the AutoReq CCF-group requirement fire automatically.
// This matches ARP4761A's position that independence is a claim requiring
// substantiation, and the claimed/substantiated vocabulary of the DAL path.
//
// Detector (deterministic, no AI): sibling leaf pairs under AND-family gates
// on allocation trees, scored on (a) name equality after channel-token
// stripping (A/B, left/right, green/blue, …), (b) identical allocated
// value, (c) same component library entry. Score ≥ 2 → candidate.
//
// Surface: a panel in the FTA node drawer, directly ABOVE the input-mode
// (failure rate / probability / library) block, for basic + undeveloped
// events that participate in a candidate pair.
//
// State: projectConfig.ccfIndependence = { pairKey: { state:'confirmed', by,
// at, note, fingerprint } }. Bucketed state derives live from the nodes
// (both members share a ccfGroup) — never stored redundantly. Two-lane:
// detection computes, disposition is elicited and signed.
// ============================================================================
(function () {
    'use strict';

    // -------------------------------------------------------- name stripping
    const CHANNEL_TOKENS = new Set([
        'a', 'b', 'c', 'd', 'no', 'ch', 'chan', 'channel', 'chnl',
        'left', 'right', 'lh', 'rh', 'l', 'r', 'port', 'starboard',
        'green', 'blue', 'yellow', 'red',
        'fwd', 'forward', 'aft', 'upper', 'lower', 'inboard', 'outboard',
        'inbd', 'outbd', 'primary', 'secondary', 'main', 'backup',
        'standby', 'alt', 'alternate', 'redundant', 'lane', 'side'
    ]);
    function ccfNormName(name) {
        return String(name || '').toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t && !CHANNEL_TOKENS.has(t) && !/^\d+$/.test(t))
            .join(' ');
    }

    // v1.2 — alias canonicalization (AL1). Signed user-entered aliases from
    // alias_registry.js collapse cross-tool naming variance: "EPS pump fails"
    // and "Electrical Power System pump fails" become the same normalized
    // string. Deterministic: aliases are elicited + signed facts, never
    // derived, never AI-proposed. Raw ccfNormName behavior and fingerprints
    // are UNTOUCHED — canonicalization is an additional match signal only.
    function _aliasPairsNorm() {
        if (typeof window === 'undefined' || typeof window.aliasCanonPairs !== 'function') return [];
        try {
            return window.aliasCanonPairs()
                .map(p => ({ a: ccfNormName(p.a), c: ccfNormName(p.c) }))
                .filter(p => p.a && p.c && p.a !== p.c)
                .sort((x, y) => y.a.length - x.a.length);
        } catch (_) { return []; }
    }
    function ccfCanonName(normed, pairs) {
        const ps = pairs || _aliasPairsNorm();
        if (!ps.length) return normed;
        let s = ' ' + normed + ' ';
        const hits = [];
        ps.forEach(p => {
            const needle = ' ' + p.a + ' ';
            if (s.indexOf(needle) >= 0) {
                s = s.split(needle).join(' ' + p.c + ' ');
                hits.push(p.a + ' → ' + p.c);
            }
        });
        const out = s.trim().replace(/\s+/g, ' ');
        out && hits.length && (ccfCanonName._lastHits = hits);
        return out;
    }

    // ------------------------------------------------------------- helpers
    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _isLeaf(n) { return n && (n.type === 'basic' || n.type === 'undeveloped'); }
    function _lid(n) { return n.logicalId != null ? n.logicalId : n.id; }
    function _isAndFamily(n) {
        if (!n || n.type !== 'gate') return false;
        if (n.gateType === 'AND' || n.gateType === 'INHIBIT' || n.gateType === 'PAND') return true;
        if (n.gateType === 'VOTING') {
            const k = parseInt(n.votingK) || 0;
            const c = (n.children || []).length;
            return k > 0 && k === c;
        }
        return false;
    }
    // Comparable quantitative value: allocated probability if set, else λ.
    function _val(n) {
        const p = parseFloat(n.probability) || 0;
        const l = parseFloat(n.lambda) || 0;
        if (p > 0) return 'P:' + p.toExponential(6);
        if (l > 0) return 'L:' + l.toExponential(6);
        return '';
    }
    function _fingerprint(a, b) {
        const one = n => [n.name || '', _val(n), n.libraryKey || ''].join('~');
        return [one(a), one(b)].sort().join('||');
    }

    // ------------------------------------------------------------- detector
    function _pairsForGate(gate, page) {
        const kids = (gate.children || []).filter(_isLeaf);
        const out = [];
        for (let i = 0; i < kids.length; i++) {
            for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i], b = kids[j];
                if (_lid(a) === _lid(b)) continue;   // same physical event = common-mode, flagged elsewhere
                let score = 0;
                const signals = [];
                const na = ccfNormName(a.name), nb = ccfNormName(b.name);
                if (na && na === nb) { score += 2; signals.push('names match after channel-token stripping'); }
                else if (na && nb) {
                    // v1.2 — try again through the signed alias registry
                    const pairs = _aliasPairsNorm();
                    if (pairs.length) {
                        ccfCanonName._lastHits = null;
                        const ca = ccfCanonName(na, pairs), cb = ccfCanonName(nb, pairs);
                        if (ca && ca === cb) {
                            score += 2;
                            const via = ccfCanonName._lastHits ? ' (' + ccfCanonName._lastHits.join('; ') + ')' : '';
                            signals.push('names match through signed alias canonicalization' + via);
                        }
                    }
                }
                const va = _val(a), vb = _val(b);
                if (va && va === vb) { score += 1; signals.push('identical allocated value'); }
                if (a.libraryKey && a.libraryKey === b.libraryKey) { score += 1; signals.push('same component library entry'); }
                if (score < 2) continue;
                out.push({ a, b, gate, page, score, signals });
            }
        }
        return out;
    }

    // All candidate pairs, with resolved state:
    //   'bucketed'    — both members share a ccfGroup (β modeled). Done.
    //   'confirmed'   — signed confirmation on record, fingerprint still valid.
    //   'reopened'    — was confirmed, but an event changed since. Re-disposition.
    //   'unconfirmed' — awaiting disposition.
    function ccfPairs() {
        const out = [];
        (typeof ftaPages !== 'undefined' ? ftaPages : []).forEach(page => {
            if (!page || !page.root || page.verifies) return;   // allocation trees only
            (function walk(n) {
                if (!n) return;
                if (_isAndFamily(n)) out.push(..._pairsForGate(n, page));
                (n.children || []).forEach(walk);
            })(page.root);
        });
        const store = (typeof projectConfig !== 'undefined' && projectConfig.ccfIndependence) || {};
        out.forEach(p => {
            p.key = [_lid(p.a), _lid(p.b)].sort().join('|');
            p.fingerprint = _fingerprint(p.a, p.b);
            if (p.a.ccfGroup && p.a.ccfGroup === p.b.ccfGroup) {
                p.state = 'bucketed';
                p.group = p.a.ccfGroup;
                p.beta = p.a.beta || p.b.beta || 0;
                return;
            }
            const rec = store[p.key];
            if (rec && rec.state === 'confirmed') {
                p.rec = rec;
                p.state = (rec.fingerprint === p.fingerprint) ? 'confirmed' : 'reopened';
            } else {
                p.state = 'unconfirmed';
            }
        });
        return out;
    }
    function ccfPairsForNode(node) {
        if (!_isLeaf(node)) return [];
        const lid = _lid(node);
        return ccfPairs().filter(p => _lid(p.a) === lid || _lid(p.b) === lid);
    }

    // ---------------------------------------------------------- dispositions
    // Both flows run through a proper in-app modal (same .modal-overlay /
    // .modal-content pattern as the AutoReq and Golden Thread modals) —
    // no browser prompt() dialogs.
    function _applyConfirm(key, by, note) {
        const p = ccfPairs().find(x => x.key === key);
        if (!p || typeof projectConfig === 'undefined') return false;
        projectConfig.ccfIndependence = projectConfig.ccfIndependence || {};
        projectConfig.ccfIndependence[key] = {
            state: 'confirmed', by: by, at: new Date().toISOString(),
            note: note || '', fingerprint: p.fingerprint
        };
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Independence confirmed. Reopens automatically if either event changes.', 'success', 3400); } catch (_) {}
        _refreshPanel();
        return true;
    }

    function _applyBucket(key, grp, beta) {
        const p = ccfPairs().find(x => x.key === key);
        if (!p) return false;
        const lids = new Set([_lid(p.a), _lid(p.b)]);
        (typeof ftaPages !== 'undefined' ? ftaPages : []).forEach(page => {
            if (!page || !page.root) return;
            (function walk(n) {
                if (!n) return;
                if (_isLeaf(n) && lids.has(_lid(n))) { n.ccfGroup = grp; n.beta = beta; }
                (n.children || []).forEach(walk);
            })(page.root);
        });
        // Bucketed state now derives from the nodes; drop any stale confirmation.
        try { if (projectConfig.ccfIndependence) delete projectConfig.ccfIndependence[key]; } catch (_) {}
        try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
        try {
            if (typeof AutoReq !== 'undefined' && AutoReq.recomputeFlags) {
                AutoReq.recomputeFlags('ac');
                (typeof systemsData !== 'undefined' ? systemsData : []).forEach(s => AutoReq.recomputeFlags('sys-' + s.id));
            }
        } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Both events assigned to CCF group "' + grp + '" (β = ' + beta + '). Quantification and AutoReq pick it up automatically.', 'success', 4200); } catch (_) {}
        // Refresh drawer fields (ccf group / β inputs) for the selected node.
        try { if (typeof selectedNodeData !== 'undefined' && selectedNodeData && typeof selectNode === 'function') selectNode(selectedNodeData); } catch (_) { _refreshPanel(); }
        return true;
    }

    // ------------------------------------------------------------- the modal
    function _ensureModal() {
        let modal = document.getElementById('ccf-indep-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'ccf-indep-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML =
            '<div class="modal-content" style="max-width: 620px;">' +
            '<div class="modal-header">' +
            '<h2 id="ccf-modal-title">Confirm Independence</h2>' +
            '<button class="btn-red" style="margin:0;" onclick="ccfCloseModal()">Cancel</button>' +
            '</div>' +
            '<div class="modal-body" style="padding: 18px 22px;">' +
            '<div id="ccf-modal-pair" style="font-size:13px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:10px 14px; margin-bottom:14px;"></div>' +
            '<div id="ccf-modal-fields"></div>' +
            '<div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">' +
            '<button id="ccf-modal-submit" class="ckpt-m-btn" style="font-size:13px; padding:6px 18px;"></button>' +
            '</div>' +
            '<p id="ccf-modal-err" style="color:#8E2A2A; font-size:12px; font-weight:600; margin:8px 0 0; display:none;"></p>' +
            '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) window.ccfCloseModal(); });
        return modal;
    }

    function _openModal(mode, key) {
        const p = ccfPairs().find(x => x.key === key);
        if (!p) return;
        const modal = _ensureModal();
        modal._ccfMode = mode;
        modal._ccfKey = key;
        document.getElementById('ccf-modal-title').textContent =
            mode === 'confirm' ? 'Confirm Independence' : 'Assign to CCF Bucket';
        document.getElementById('ccf-modal-pair').innerHTML =
            '<b>' + _esc(p.a.name || p.a.displayId) + '</b><br><b>' + _esc(p.b.name || p.b.displayId) + '</b>' +
            '<div style="color:var(--color-text-secondary); margin-top:6px;">Under gate ' + _esc(p.gate.displayId || p.gate.name || 'AND') + ' on ' + _esc(p.page.name || '') + '.<br>Detected: ' + _esc(p.signals.join('; ')) + '.</div>';
        const fieldCss = 'width:100%; box-sizing:border-box; font-size:13px; padding:7px 10px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);';
        const labelCss = 'display:block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin:12px 0 4px;';
        const fields = document.getElementById('ccf-modal-fields');
        if (mode === 'confirm') {
            fields.innerHTML =
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">Independence is a claim that requires substantiation. Your signature records that these events share no common cause of failure; the confirmation reopens automatically if either event changes.</p>' +
                '<label style="' + labelCss + '">Signature (required)</label>' +
                '<input id="ccf-modal-by" type="text" style="' + fieldCss + '" placeholder="Your name">' +
                '<label style="' + labelCss + '">Basis for independence</label>' +
                '<textarea id="ccf-modal-note" rows="3" style="' + fieldCss + ' resize:vertical;" placeholder="Different supplier · separate power/cooling/location · CMA reference …"></textarea>';
            document.getElementById('ccf-modal-submit').textContent = 'Confirm independence';
        } else {
            const suggested = 'CCF-' + (ccfNormName(p.a.name).split(' ').slice(0, 3).join('-').toUpperCase() || 'GROUP');
            fields.innerHTML =
                '<p style="font-size:12.5px; color:var(--color-text-secondary); margin:0;">Both events join one CCF group; the β term enters the gate quantification and AutoReq emits the common-cause control requirement automatically.</p>' +
                '<label style="' + labelCss + '">CCF group name</label>' +
                '<input id="ccf-modal-grp" type="text" style="' + fieldCss + '" value="' + _esc(suggested) + '">' +
                '<label style="' + labelCss + '">β — common-cause fraction (0–1)</label>' +
                '<input id="ccf-modal-beta" type="number" min="0" max="1" step="0.01" style="' + fieldCss + '" value="' + _esc(p.a.beta || p.b.beta || '') + '" placeholder="Your value, from your common-cause assessment">';
            document.getElementById('ccf-modal-submit').textContent = 'Assign to bucket';
        }
        document.getElementById('ccf-modal-err').style.display = 'none';
        document.getElementById('ccf-modal-submit').onclick = window._ccfModalSubmit;
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);
        setTimeout(() => {
            const first = document.getElementById(mode === 'confirm' ? 'ccf-modal-by' : 'ccf-modal-grp');
            if (first) first.focus();
        }, 260);
    }

    window.ccfCloseModal = function () {
        const modal = document.getElementById('ccf-indep-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => { modal.style.display = 'none'; }, 250);
    };

    window._ccfModalSubmit = function () {
        const modal = document.getElementById('ccf-indep-modal');
        if (!modal) return;
        const err = document.getElementById('ccf-modal-err');
        const fail = msg => { err.textContent = msg; err.style.display = 'block'; };
        if (modal._ccfMode === 'confirm') {
            const by = (document.getElementById('ccf-modal-by').value || '').trim();
            if (!by) return fail('A signature is required to confirm independence.');
            const note = (document.getElementById('ccf-modal-note').value || '').trim();
            if (_applyConfirm(modal._ccfKey, by, note)) window.ccfCloseModal();
        } else {
            const grp = (document.getElementById('ccf-modal-grp').value || '').trim();
            if (!grp) return fail('A CCF group name is required.');
            const beta = parseFloat(document.getElementById('ccf-modal-beta').value);
            if (!(beta >= 0 && beta <= 1)) return fail('β must be a number between 0 and 1.');
            if (_applyBucket(modal._ccfKey, grp, beta)) window.ccfCloseModal();
        }
    };

    window.ccfConfirmPair = function (key) { _openModal('confirm', key); };
    window.ccfBucketPair = function (key) { _openModal('bucket', key); };
    // Direct (non-UI) surfaces for the harness and power users.
    window._ccfApplyConfirm = _applyConfirm;
    window._ccfApplyBucket = _applyBucket;

    // ------------------------------------------------------------ the panel
    // Injected directly ABOVE the input-mode (failure rate / probability /
    // library) block in the node drawer. Rendered on every selectNode.
    function _stateRow(p, node) {
        const other = _lid(p.a) === _lid(node) ? p.b : p.a;
        const otherLabel = _esc((other.displayId ? other.displayId + ' — ' : '') + (other.name || ''));
        const gateLabel = _esc(p.gate.displayId || p.gate.name || 'AND gate');
        const base = 'padding:8px 12px; font-size:12px; border-left:3px solid ';
        if (p.state === 'bucketed') {
            return '<div style="' + base + 'var(--color-success, #2e7d32);">' +
                '<b>Common cause modeled</b> — this event and ' + otherLabel + ' are in CCF group "' + _esc(p.group) + '" (β = ' + _esc(p.beta) + ').</div>';
        }
        if (p.state === 'confirmed') {
            return '<div style="' + base + 'var(--color-success, #2e7d32);">' +
                '<b>Independence confirmed</b> — vs ' + otherLabel + ', signed ' + _esc(p.rec.by) + ' on ' + _esc(String(p.rec.at).slice(0, 10)) +
                (p.rec.note ? ' · ' + _esc(p.rec.note) : '') +
                '. Reopens automatically if either event changes.</div>';
        }
        const reopened = p.state === 'reopened';
        return '<div style="' + base + '#B7791F;">' +
            '<b>' + (reopened ? 'Confirmation stale' : 'Confirm independence') + '</b> — ' +
            (reopened
                ? 'an event changed since ' + _esc(p.rec.by) + ' confirmed independence on ' + _esc(String(p.rec.at).slice(0, 10)) + '. Re-disposition required. '
                : 'this event and ' + otherLabel + ' under gate ' + gateLabel + ' look like a redundant twin pair (' + _esc(p.signals.join('; ')) + '). Independence is a claim — substantiate it or model the common cause. ') +
            '<div style="margin-top:6px; display:flex; gap:8px;">' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="ccfConfirmPair(\'' + _esc(p.key) + '\')">Confirm independence…</button>' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="ccfBucketPair(\'' + _esc(p.key) + '\')">Assign to CCF bucket…</button>' +
            '</div></div>';
    }

    function _renderCcfPanel(dataNode) {
        const host = document.getElementById('config-input-mode-container');
        if (!host || !host.parentNode) return;
        let div = document.getElementById('ccf-indep-panel');
        if (!div) {
            div = document.createElement('div');
            div.id = 'ccf-indep-panel';
            div.style.cssText = 'margin-top:12px;';
            host.parentNode.insertBefore(div, host);
        }
        if (!dataNode || !_isLeaf(dataNode)) { div.style.display = 'none'; div.innerHTML = ''; return; }
        const pairs = ccfPairsForNode(dataNode);
        if (!pairs.length) { div.style.display = 'none'; div.innerHTML = ''; return; }
        div.style.display = 'block';
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1);">' +
            '<div style="padding:6px 12px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">Independence</div>' +
            pairs.map(p => _stateRow(p, dataNode)).join('') +
            '</div>';
    }
    function _refreshPanel() {
        try { if (typeof selectedNodeData !== 'undefined' && selectedNodeData) _renderCcfPanel(selectedNodeData); } catch (_) {}
    }

    // Hook the node drawer: selectNode is a top-level monolith function, so
    // internal call sites resolve through the global — the wrap intercepts all.
    (function wrap() {
        if (typeof window.selectNode === 'function' && !window.selectNode._ccfWrapped) {
            const orig = window.selectNode;
            const wrapped = function (dataNode) {
                const r = orig.apply(this, arguments);
                try { _renderCcfPanel(dataNode); } catch (_) {}
                return r;
            };
            wrapped._ccfWrapped = true;
            window.selectNode = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.ccfPairs = ccfPairs;
    window.ccfPairsForNode = ccfPairsForNode;
    window.ccfNormName = ccfNormName;
    window.ccfCanonName = ccfCanonName;
    window._ccfRefreshPanel = _refreshPanel;
})();
