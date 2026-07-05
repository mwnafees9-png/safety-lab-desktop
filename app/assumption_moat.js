// ============================================================================
// assumption_moat.js — v1.0 — A1: assumptions become load-bearing citizens.
//
// The story is the customer's: every claim in the project knows what it
// rests on — and says so. Assumptions were already first-class records
// (lifecycle, validation strategy, routing); what was missing is the LOOP:
//
//   WHERE-USED — one resolver aggregating everything that rests on each
//   assumption: FHA rows (assumptionIds), MAC rule substantiations, and
//   text references across requirements, SPF/zonal disposition bases, and
//   PRA/ZSA mitigations. Both directions are honest: an assumption nothing
//   rests on is flagged DECORATIVE (bind it or retire it), and a MAC rule
//   claiming assumption-substantiation without naming one is flagged too.
//
//   THE CHECKS (via invRegister — same sweep, same panel, same evidence):
//     INV-13 (hard)     — a claim rests on a DEAD assumption (invalidated /
//                         retired / rejected but still load-bearing). The
//                         foundation moved; everything on it is exposed.
//     INV-14 (advisory) — Cat/Haz claims resting on assumptions still
//                         awaiting validation (Proposed).
//     INV-15 (advisory) — decorative assumptions + unnamed substantiations.
//
//   THE REGISTER — a program-wide panel on the aircraft assumptions page:
//   every assumption (aircraft, per-system, AI-extracted) with scope,
//   lifecycle state, and its load-bearing list by name.
//
// Read-only resolver; two-lane throughout — the module never edits an
// assumption, it only tells the truth about what rests where.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _sevRank(s) { return (typeof SEVERITY_RANK !== 'undefined' ? SEVERITY_RANK[s] : 0) || 0; }
    const DEAD_STATES = ['Invalidated', 'Retired', 'Rejected', 'Withdrawn'];

    // ------------------------------------------------------------ inventory
    function asmAll() {
        const out = [];
        ((typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []) || []).forEach(a =>
            a && out.push({ asmId: a.asmId, text: a.text || '', state: a.state || 'Proposed', scope: 'Aircraft', origin: a.origin || '' }));
        _sysList().forEach(s => (s.asm || []).forEach(a =>
            a && out.push({ asmId: a.asmId, text: a.text || '', state: a.state || 'Proposed', scope: s.name || s.id, origin: a.origin || '' })));
        ((typeof aiAssumptions !== 'undefined' ? aiAssumptions : []) || []).forEach(a =>
            a && out.push({ asmId: a.asmId || a.id || ('AI-' + (a.internalId || '')), text: a.text || '', state: a.state || 'Proposed', scope: 'AI-extracted', origin: a.origin || 'AI draft' }));
        return out;
    }

    // ----------------------------------------------------------- where-used
    // uses: { kind, ref, detail, severity? } — id-bound (FHA) or text-bound.
    function asmWhereUsed() {
        const map = new Map();     // asmId → uses[]
        const gaps = [];           // unnamed substantiations etc.
        const add = (asmId, use) => {
            if (!map.has(asmId)) map.set(asmId, []);
            map.get(asmId).push(use);
        };
        const ids = asmAll().map(a => a.asmId).filter(Boolean);

        // 1. FHA rows — the id-bound lane
        ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).forEach(f => {
            (f && f.assumptionIds || []).forEach(id =>
                add(id, { kind: 'FHA', ref: f.fcId || '', severity: f.severity || '', detail: 'AC FC ' + (f.fcId || '') + ' [' + (f.severity || '') + ']' }));
        });
        _sysList().forEach(s => (s.fha || []).forEach(f => {
            (f && f.assumptionIds || []).forEach(id =>
                add(id, { kind: 'FHA', ref: f.fcId || '', severity: f.severity || '', detail: (s.name || s.id) + ' FC ' + (f.fcId || '') + ' [' + (f.severity || '') + ']' }));
        }));

        // 2. MAC rule substantiations — the model lane
        const fhaBySub = new Map();
        ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).forEach(f => {
            [f.subId].concat(Array.isArray(f.subIds) ? f.subIds : []).filter(Boolean).forEach(su => {
                const prev = fhaBySub.get(su);
                if (!prev || _sevRank(f.severity) > _sevRank(prev.severity)) fhaBySub.set(su, f);
            });
        });
        ((_pc().macModels) || []).forEach(r => {
            if (!r || !r.substantiation || r.substantiation.kind !== 'assumption') return;
            const ref = String(r.substantiation.ref || '');
            const hit = ids.find(id => ref.indexOf(id) >= 0);
            const worst = fhaBySub.get(r.subId);
            if (hit) add(hit, { kind: 'MAC', ref: r.id, severity: worst ? worst.severity : '', detail: 'MAC rule ' + r.id + ' (' + r.subId + ')' + (worst ? ' feeding [' + worst.severity + ']' : '') });
            else gaps.push('MAC rule ' + r.id + ' (' + r.subId + ') is substantiated by assumption but names no ASM reference — name it so the thread can hold it');
        });

        // 3. Text-bound lane: exact ASM-id mentions in consequential prose
        function scanText(txt, mk) {
            const t = String(txt || '');
            ids.forEach(id => { if (id && t.indexOf(id) >= 0) add(id, mk(id)); });
        }
        ((typeof acReqData !== 'undefined' ? acReqData : []) || []).forEach(r => {
            if (!r || r.deleted) return;
            scanText((r.text || '') + ' ' + (r.rat || ''), () => ({ kind: 'REQ', ref: r.traceId || '', detail: 'AC requirement ' + (r.traceId || r.internalId) }));
        });
        _sysList().forEach(s => (s.req || []).forEach(r => {
            if (!r || r.deleted) return;
            scanText((r.text || '') + ' ' + (r.rat || ''), () => ({ kind: 'REQ', ref: r.traceId || '', detail: (s.name || s.id) + ' requirement ' + (r.traceId || '') }));
        }));
        Object.entries(_pc().spfAccepted || {}).forEach(([k, rec]) =>
            scanText(rec && rec.basis, () => ({ kind: 'SPF', ref: k, severity: 'Catastrophic', detail: 'single-failure acceptance ' + k })));
        Object.entries(_pc().zonalAccepted || {}).forEach(([k, rec]) =>
            scanText(rec && rec.basis, () => ({ kind: 'ZONAL', ref: k, severity: 'Catastrophic', detail: 'zonal acceptance ' + k })));
        ((typeof praData !== 'undefined' ? praData : []) || []).forEach(p =>
            scanText(p && p.mitigation, () => ({ kind: 'PRA', ref: p.praId || '', detail: 'PRA ' + (p.praId || '') + ' mitigation' })));
        ((typeof zsaData !== 'undefined' ? zsaData : []) || []).forEach(z =>
            scanText(z && z.mitigation, () => ({ kind: 'ZSA', ref: z.zoneId || '', detail: 'zone ' + (z.zoneId || '') + ' mitigation' })));

        return { map, gaps };
    }

    // Consolidated register rows.
    function asmRegister() {
        const { map, gaps } = asmWhereUsed();
        const rows = asmAll().map(a => {
            const uses = map.get(a.asmId) || [];
            const catHaz = uses.some(u => _sevRank(u.severity) >= 4);
            return Object.assign({}, a, {
                uses, loadBearing: uses.length, catHaz,
                dead: DEAD_STATES.indexOf(a.state) >= 0,
                decorative: uses.length === 0
            });
        });
        return { rows, gaps };
    }

    // ------------------------------------------------------- the invariants
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-13', name: 'No claim rests on a dead assumption (invalidated / retired but load-bearing)', sev: 'hard',
                run: () => {
                    const rows = asmRegister().rows.filter(r => r.loadBearing > 0);
                    return { checked: rows.length, fails: rows.filter(r => r.dead)
                        .map(r => r.asmId + ' [' + r.state + '] is still load-bearing for: ' + r.uses.slice(0, 4).map(u => u.detail).join('; ') + (r.uses.length > 4 ? ' +' + (r.uses.length - 4) + ' more' : '')) };
                }
            });
            window.invRegister({
                id: 'INV-14', name: 'Cat/Haz claims resting on assumptions awaiting validation', sev: 'advisory',
                run: () => {
                    const rows = asmRegister().rows.filter(r => r.catHaz);
                    return { checked: rows.length, fails: rows.filter(r => !r.dead && r.state !== 'Validated')
                        .map(r => r.asmId + ' [' + r.state + '] carries Cat/Haz claims: ' + r.uses.filter(u => _sevRank(u.severity) >= 4).slice(0, 3).map(u => u.detail).join('; ')) };
                }
            });
            window.invRegister({
                id: 'INV-15', name: 'Decorative assumptions and unnamed substantiations', sev: 'advisory',
                run: () => {
                    const reg2 = asmRegister();
                    const fails = reg2.rows.filter(r => r.decorative)
                        .map(r => r.asmId + ' [' + r.scope + ']: nothing rests on it — bind it to the analyses it supports, or retire it')
                        .concat(reg2.gaps);
                    return { checked: reg2.rows.length + ((_pc().macModels || []).length), fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------ the program register
    function renderAsmRegister() {
        const view = document.getElementById('view-ac-asm');
        if (!view) return;
        let host = document.getElementById('asm-register-host');
        if (!host) {
            host = document.createElement('div');
            host.id = 'asm-register-host';
            view.insertBefore(host, view.firstChild);
        }
        const reg2 = asmRegister();
        const rows = reg2.rows;
        const validated = rows.filter(r => r.state === 'Validated').length;
        const bearing = rows.filter(r => r.loadBearing > 0).length;
        const problems = rows.filter(r => r.dead && r.loadBearing > 0).length;
        const stateBadge = r => {
            const color = r.dead ? '#8E2A2A' : (r.state === 'Validated' ? '#1D9E75' : '#B7791F');
            return '<span class="u-mono" style="font-size:10.5px; font-weight:700; color:' + color + ';">' + _esc(r.state.toUpperCase()) + '</span>';
        };
        host.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Program assumption register — every claim knows what it rests on</b>' +
            '<span class="u-mono" style="font-size:11px; font-weight:700;' + (problems ? ' color:#8E2A2A;' : '') + '">' +
            rows.length + ' assumptions · ' + validated + ' validated · ' + bearing + ' load-bearing' + (problems ? ' · ' + problems + ' BROKEN' : '') + '</span></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">Aircraft, system, and AI-extracted assumptions in one register, each with everything that rests on it — FHA classifications, MAC model substantiations, requirements, signed dispositions, mitigations. Invalidate one and INV-13 names every exposed claim. Assumptions nothing rests on are flagged too: bind them or retire them.</p>' +
            '<div style="overflow-x:auto; padding:0 14px 12px;"><table class="data-table" style="width:100%; font-size:12px;">' +
            '<thead><tr><th>Assumption</th><th>Scope</th><th>State</th><th>Load-bearing for</th></tr></thead><tbody>' +
            rows.map(r =>
                '<tr><td class="u-mono" style="white-space:nowrap;"><b>' + _esc(r.asmId) + '</b></td>' +
                '<td>' + _esc(r.scope) + '</td>' +
                '<td>' + stateBadge(r) + '</td>' +
                '<td style="font-size:11.5px;">' + (r.uses.length
                    ? '<span class="u-mono" style="font-weight:700;">' + r.uses.length + '</span> — ' + _esc(r.uses.slice(0, 4).map(u => u.detail).join(' · ')) + (r.uses.length > 4 ? ' <span style="color:var(--color-text-tertiary);">+' + (r.uses.length - 4) + '</span>' : '')
                    : '<span style="color:#B7791F; font-weight:600;">decorative — nothing rests on it</span>') + '</td></tr>').join('') +
            '</tbody></table>' +
            (reg2.gaps.length ? '<p style="font-size:11.5px; color:#B7791F; font-weight:600;">⚠ ' + reg2.gaps.map(_esc).join('<br>⚠ ') + '</p>' : '') +
            '</div></div>';
    }
    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._asmMoatWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'ac-asm') setTimeout(renderAsmRegister, 120); } catch (_) {}
                return r;
            };
            wrapped._asmMoatWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.asmAll = asmAll;
    window.asmWhereUsed = asmWhereUsed;
    window.asmRegister = asmRegister;
    window.renderAsmRegister = renderAsmRegister;
})();
