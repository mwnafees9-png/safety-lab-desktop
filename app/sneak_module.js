// ============================================================================
// sneak_module.js — Phase R7: sneak circuit analysis as a guided register
// with deterministic candidates mined from the model's own topology.
//
// A sneak condition is an unintended path, timing, indication or label that
// causes an unwanted function WITHOUT any component having failed — which is
// why no FTA or FMEA finds it: those start from failures. The classical
// method is topological: enumerate paths, look for the handful of patterns
// that historically produce sneaks, then interrogate each with a clue list.
//
// What the model already knows (deterministic candidate mining):
//   · a resource with MULTIPLE PROVIDERS feeding common consumers — the
//     reverse-flow candidate (current/fluid can return through the second
//     provider's path when one side is energized)
//   · BIDIRECTIONAL declared interfaces — the classic "H" topology seat
//   · a system that both PROVIDES and CONSUMES the same resource type —
//     loop-back candidate
//   · MMEL-deferrable items on multi-provider resources — configuration
//     sneaks (a legal dispatch configuration re-routes flow in a way the
//     analysis never examined)
//
// Each candidate carries WHY it was mined; disposition is elicited (signed
// examined/confirmed-sneak/not-credible per the two-lane discipline). Clue
// categories (original wording): unintended path, timing/race, misleading
// indication, label/annotation error.
//
// Born modular: page 'sneak', state under projectConfig.sneak.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _store() {
        if (typeof projectConfig === 'undefined') return { dispositions: {} };
        if (!projectConfig.sneak) projectConfig.sneak = { dispositions: {} };
        if (!projectConfig.sneak.dispositions) projectConfig.sneak.dispositions = {};
        return projectConfig.sneak;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // ----------------------------------------------------- candidate mining
    function sneakCandidates() {
        const out = [];
        const res = (typeof resourcesData !== 'undefined' && resourcesData) || [];
        const sys = (typeof systemsData !== 'undefined' && systemsData) || [];
        const name = id => (sys.find(s => s.id === id) || {}).name || id;

        // 1. multi-provider resources → reverse-flow candidates
        res.forEach(r => {
            if ((r.providedBy || []).length >= 2) {
                out.push({
                    id: 'SNK-RF-' + (r.resId || r.internalId),
                    pattern: 'reverse flow',
                    subject: r.name || r.resId,
                    why: (r.providedBy || []).map(name).join(' and ') + ' both provide ' + (r.resId || 'this resource') +
                        ' — with one side energized and the other not, can flow return through the un-energized provider\'s path? Check isolation (check valves / diodes / contactor logic).',
                    clue: 'unintended path',
                });
            }
        });
        // 2. bidirectional interfaces → H-topology seats
        const ifaces = (typeof projectConfig !== 'undefined' && projectConfig && Array.isArray(projectConfig.interfaces)) ? projectConfig.interfaces : [];
        ifaces.forEach(i => {
            if (i.direction === 'bidirectional') out.push({
                id: 'SNK-H-' + i.fromSystemId + '-' + i.toSystemId,
                pattern: 'H topology',
                subject: name(i.fromSystemId) + ' ↔ ' + name(i.toSystemId),
                why: 'bidirectional ' + (i.medium || i.kind || 'interface') + ' — the crossbar of an H pattern: with asymmetric source states, does anything flow the way nobody intended?',
                clue: 'unintended path',
            });
        });
        // 3. provider that also consumes the same resource type → loop-back
        res.forEach(r => {
            (r.providedBy || []).forEach(p => {
                if ((r.consumedBySystems || []).includes(p)) out.push({
                    id: 'SNK-LB-' + (r.resId || r.internalId) + '-' + p,
                    pattern: 'loop-back',
                    subject: name(p) + ' on ' + (r.name || r.resId),
                    why: name(p) + ' both provides and consumes ' + (r.resId || 'this resource') + ' — self-energizing or latch-up path candidate.',
                    clue: 'timing/race',
                });
            });
        });
        // 4. MMEL-deferrable items on multi-provider resources → config sneaks
        try {
            const mmel = (typeof projectConfig !== 'undefined' && projectConfig.mmel && projectConfig.mmel.items) || [];
            const multiRes = res.filter(r => (r.providedBy || []).length >= 2);
            mmel.forEach(m => {
                if (m.state === 'rejected') return;
                // prefer the bound LRU link: item → owning system → resource membership
                const bound = (typeof window.gtLink === 'function') ? window.gtLink('mmel:' + (m.id || m.item)) : null;
                const boundSys = bound && bound.itemId
                    ? ((((typeof itemsData !== 'undefined' && itemsData) || []).find(i => i.itemId === bound.itemId) || {}).owningSystemId) : null;
                multiRes.forEach(r => {
                    const members = (r.providedBy || []).concat(r.consumedBySystems || []);
                    const touches = boundSys ? members.includes(boundSys) : members.some(sid => {
                        const s = sys.find(z => z.id === sid);
                        return s && (String(m.item || '') + String(m.id || '')).toLowerCase().includes((s.name || '').split(' ')[0].toLowerCase());
                    });
                    if (touches) out.push({
                        id: 'SNK-CFG-' + (m.id || m.item) + '-' + (r.resId || ''),
                        pattern: 'configuration',
                        subject: (m.item || m.id) + ' deferred on ' + (r.name || r.resId),
                        why: 'a legal dispatch configuration (MMEL ' + (m.id || '') + ') changes the topology of a multi-provider resource — was the deferred configuration part of the path enumeration?',
                        clue: 'unintended path',
                    });
                });
            });
        } catch (_) {}
        return out;
    }

    // ------------------------------------------------------------ actions
    window.sneakDisposition = function (id) {
        const st = _store();
        const cur = st.dispositions[id];
        if (cur && cur.by) {
            if (confirm('Withdraw the disposition on ' + id + '?')) { delete st.dispositions[id]; _save(); renderSneakPage(); }
            return;
        }
        const verdict = window.prompt('Disposition — type "examined" (no sneak found), "confirmed" (sneak exists → raise a Problem Report), or "not-credible":', 'examined');
        if (!verdict || !['examined', 'confirmed', 'not-credible'].includes(verdict.trim())) return;
        const by = window.prompt('Signature (name):', '');
        if (!by || !by.trim()) return;
        const note = window.prompt('Basis (what was checked — drawings, ICDs, bench test):', '') || '';
        st.dispositions[id] = { verdict: verdict.trim(), by: by.trim(), note, at: new Date().toISOString() };
        _save(); renderSneakPage();
        if (verdict.trim() === 'confirmed' && typeof window.prRaise === 'function')
            alert('Confirmed sneak — raise a Problem Report from the Problem Reports page and reference ' + id + '.');
    };

    // ---------------------------------------------------------------- page
    function renderSneakPage() {
        const host = document.getElementById('sneak-host');
        if (!host) return;
        const cands = sneakCandidates();
        const disp = _store().dispositions;
        const open = cands.filter(c => !disp[c.id]).length;
        const confirmed = cands.filter(c => disp[c.id] && disp[c.id].verdict === 'confirmed').length;

        let html = '<div style="display:flex; gap:12px; margin-bottom:14px;">' +
            [['Candidates mined', cands.length, 'from topology, deterministically'],
             ['Awaiting examination', open, 'signed disposition owed'],
             ['Confirmed sneaks', confirmed, confirmed ? 'raise Problem Reports' : '—']].map(([l, v, sub]) =>
                '<div style="border:1px solid var(--color-border-hair); border-radius:10px; padding:12px 14px; background:var(--color-surface-1); flex:1;">' +
                '<div style="font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase;">' + l + '</div>' +
                '<div style="font-size:24px; font-weight:700;' + (l.startsWith('Confirmed') && v ? ' color:#8E2A2A;' : '') + '">' + v + '</div>' +
                '<div style="font-size:11px; color:var(--color-text-tertiary);">' + sub + '</div></div>').join('') + '</div>';

        if (!cands.length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No candidates mined — the model has no multi-provider resources, bidirectional interfaces, loop-backs or deferrable-configuration overlaps. Sneak analysis proper still requires drawing-level path enumeration; this page catches what the architecture model can see.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Pattern</th><th>Subject</th><th>Why mined (the question to answer)</th><th>Clue class</th><th>Disposition</th></tr></thead><tbody>' +
                cands.map(c => {
                    const d = disp[c.id];
                    return '<tr><td class="u-mono" style="font-size:11px;">' + _esc(c.pattern) + '</td>' +
                        '<td><b>' + _esc(c.subject) + '</b></td>' +
                        '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(c.why) + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + _esc(c.clue) + '</td>' +
                        '<td>' + (d
                            ? '<span style="display:inline-block; padding:2px 8px; font-size:10px; font-weight:600; text-transform:uppercase; border-radius:var(--r-full);' +
                                (d.verdict === 'confirmed' ? ' color:#8E2A2A; background:rgba(255,59,48,0.12);' : d.verdict === 'examined' ? ' color:#1D6E3E; background:rgba(52,199,89,0.13);' : ' color:var(--color-text-tertiary); background:var(--color-surface-2);') + '">' +
                                _esc(d.verdict) + '</span> <span style="font-size:10.5px;">' + _esc(d.by) + '</span> <a href="#" style="font-size:10px;" onclick="sneakDisposition(\'' + _esc(c.id) + '\'); return false;">withdraw</a>'
                            : '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="sneakDisposition(\'' + _esc(c.id) + '\')">examine…</button>') + '</td></tr>';
                }).join('') + '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Sneaks are unintended paths/timing/indications/labels with NOTHING failed — outside FTA/FMEA\'s reach by construction, which is why this register exists separately. ' +
            'Candidates are mined deterministically from the architecture model; full sneak analysis additionally requires drawing-level path enumeration against the clue lists. Confirmed sneaks go to Problem Reports.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._sneakWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-sneak');
                if (v) v.style.display = (tabId === 'sneak') ? 'block' : 'none';
                const s = document.getElementById('snav-sneak');
                if (s) s.classList.toggle('snav-active', tabId === 'sneak');
                if (tabId === 'sneak') renderSneakPage();
            } catch (_) {}
            return r;
        };
        wrapped._sneakWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.sneakCandidates = sneakCandidates;
    window.renderSneakPage = renderSneakPage;
})();
