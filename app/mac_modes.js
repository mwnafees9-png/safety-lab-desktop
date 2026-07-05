// ============================================================================
// mac_modes.js — v1.0 — M2: mode & reconfiguration dynamics on the MAC model.
//
// The last behavioral gap. L0–L2 speak static redundancy (min-of clauses);
// L3 speaks typed deviations (M1). M2 adds what neither can say: the aircraft
// RECONFIGURES — primary fails, a standby takes over, and the takeover itself
// can fail. Switching is not bookkeeping; it is a failure mode with a name.
//
// DRAFT-1 MODE SEMANTICS (deliberately small, exactly documented):
//   · rule.modes = an ORDERED FALLBACK CHAIN [{id, name, active:[sysId],
//     entry, switchP?, lambda?}] — primary first, then each reconfiguration
//     target. All numeric fields are USER-ENTERED; nothing is derived.
//   · Mode i is DEFEATED under failure set F iff any of its active systems
//     is in F, OR (i>1) its switch event 'sw:<modeId>' is in F.
//   · The RULE is defeated iff EVERY mode is defeated. Survive = some mode
//     stands with its switch intact.
//   · Defeat therefore compiles to AND-over-modes of OR(members ∪ switch) —
//     and every chain is compiled through the SAME BDD engine as everything
//     else; the BDD cutsets must equal the enumerated hitting sets (INV-20,
//     HARD — two engines, one answer, machine-checked on every sweep).
//   · A mode beyond the first claiming reconfiguration without a user-entered
//     switch-failure probability or a bound assumption is an UNSUBSTANTIATED
//     claim (INV-21, advisory) — the assumption-moat discipline.
//
// QUANT CROSS-CHECK: for the symmetric 2-mode chain (equal user-entered λ,
// cold/warm standby), the analytic standby survival
//     R(t) = e^(−λt) · (1 + p·λt)          (cold, switch success p)
// is corroborated by the SEEDED Monte Carlo standby engine (rbd_mc mcRun,
// deterministic by seed) — the verified R2 machinery, not a re-derivation.
//
// Born-modular: wraps window.renderMacPage (own flag). No monolith edits.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _rules() { return (_pc().macModels || []).filter(Boolean); }
    function _rule(id) { return _rules().find(r => r.id === id) || null; }
    function _sysList() { return (typeof systemsData !== 'undefined' ? systemsData : []) || []; }
    function _sysName(id) { const s = _sysList().find(x => x.id === id); return s ? (s.name || s.id) : id; }
    function _jr(kind, msg) { try { if (typeof window.jrnl === 'function') window.jrnl(kind, msg); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }
    function _modeRules() { return _rules().filter(r => Array.isArray(r.modes) && r.modes.length); }

    // ------------------------------------------------------------- semantics
    // Stage token sets: D1 = members(m1); Di>1 = members(mi) ∪ {'sw:'+mi.id}.
    function _stageTokens(rule) {
        return (rule.modes || []).map((m, i) => {
            const toks = (m.active || []).slice();
            if (i > 0) toks.push('sw:' + m.id);
            return toks;
        });
    }

    function m2Evaluate(rule, failedIds) {
        const F = new Set(failedIds || []);
        const modes = rule.modes || [];
        for (let i = 0; i < modes.length; i++) {
            const m = modes[i];
            const memberDown = (m.active || []).some(s => F.has(s));
            const switchDown = i > 0 && F.has('sw:' + m.id);
            if (!memberDown && !switchDown) return { survives: true, mode: m.id, modeName: m.name || m.id };
        }
        return { survives: false, mode: null };
    }

    // Minimal defeat combinations: one token from every stage, deduped inside
    // a combo, subsumption-reduced across combos. Sizes are small by design
    // (mode chains are 2–4 stages of 1–3 members).
    function m2BreachSets(rule) {
        const stages = _stageTokens(rule);
        if (!stages.length || stages.some(s => !s.length)) return [];
        let combos = [[]];
        stages.forEach(stage => {
            const next = [];
            combos.forEach(c => stage.forEach(tok => {
                next.push(c.indexOf(tok) >= 0 ? c.slice() : c.concat([tok]));
            }));
            combos = next;
        });
        // canonicalize + dedupe
        const seen = new Set();
        let sets = [];
        combos.forEach(c => {
            const k = c.slice().sort().join('+');
            if (!seen.has(k)) { seen.add(k); sets.push(c.slice().sort()); }
        });
        // subsumption: drop any superset of another
        sets.sort((a, b) => a.length - b.length);
        const out = [];
        sets.forEach(s => {
            if (!out.some(m => m.every(tok => s.indexOf(tok) >= 0))) out.push(s);
        });
        return out;
    }

    // BDD corroboration: defeat tree = AND over stages of OR(tokens),
    // compiled through the engine that owns everything else.
    function m2Equivalence(rule) {
        const stages = _stageTokens(rule);
        if (!stages.length) return { rule: rule.id, empty: true, agree: true };
        let nid = 910000000;
        const root = {
            id: nid++, logicalId: 'm2root:' + rule.id, displayId: 'G-M2', name: rule.subId + ' mode-chain defeat',
            type: 'gate', gateType: 'AND',
            children: stages.map((toks, i) => ({
                id: nid++, logicalId: 'm2st:' + rule.id + ':' + i, displayId: 'G-M2-' + i, name: 'stage ' + i,
                type: 'gate', gateType: 'OR',
                children: toks.map(tok => ({
                    id: nid++, logicalId: 'm2:' + rule.id + ':' + tok, displayId: 'M2-' + tok,
                    name: tok, type: 'basic', probability: 0.001, inputMode: 'probability', children: []
                }))
            }))
        };
        let cutsets = null;
        try {
            if (typeof bddMinimalCutsets === 'function') {
                cutsets = (bddMinimalCutsets(root) || []).map(cs =>
                    (Array.isArray(cs) ? cs : []).map(ev => String((ev && (ev.logicalId != null ? ev.logicalId : ev)) || '').replace('m2:' + rule.id + ':', '')).sort().join('+')
                ).sort();
            }
        } catch (_) {}
        const expect = m2BreachSets(rule).map(s => s.join('+')).sort();
        const agree = cutsets !== null && cutsets.length === expect.length && cutsets.every((c, i) => c === expect[i]);
        return { rule: rule.id, empty: false, cutsets, expect, agree };
    }

    // ------------------------------------------------- quant cross-check (R2)
    // Symmetric 2-mode chain with user-entered λ and switch-failure γ:
    // analytic cold-standby survival vs the seeded MC standby engine.
    function m2Quant(rule, t, opts) {
        opts = opts || {};
        const modes = rule.modes || [];
        if (modes.length !== 2) return { ok: false, why: 'quant cross-check is defined for 2-mode chains' };
        const lam = parseFloat(modes[0].lambda);
        const lam2 = parseFloat(modes[1].lambda);
        if (!(lam > 0) || lam2 !== lam) return { ok: false, why: 'requires equal user-entered λ on both modes (symmetric standby)' };
        const gamma = parseFloat(modes[1].switchP) || 0;      // user-entered switch FAILURE prob
        const p = 1 - gamma;                                   // switch success
        const T = t > 0 ? t : 1;
        const analytic = Math.exp(-lam * T) * (1 + p * lam * T);
        let mc = null;
        try {
            if (typeof window.mcRun === 'function') {
                const res = window.mcRun([{ duration: T, model: { type: 'standby', lambda: lam, units: 2, switchP: p, warmK: 0 } }],
                    opts.n || 20000, opts.seed == null ? 42 : opts.seed);
                mc = res;
            }
        } catch (_) {}
        const agree = mc ? (analytic >= mc.lo - 1e-9 && analytic <= mc.hi + 1e-9) : null;
        return { ok: true, t: T, lambda: lam, switchFailP: gamma, analytic, mc, agree };
    }

    // ------------------------------------------------------------- mutations
    window.m2ModeAdd = function (ruleId, name, active, entry, switchP, lambda) {
        const r = _rule(ruleId);
        if (!r) return { ok: false, err: 'Rule not found.' };
        if (!Array.isArray(active) || !active.length) return { ok: false, err: 'A mode needs at least one active system.' };
        const modes = Array.isArray(r.modes) ? r.modes : [];
        const mode = { id: 'md-' + ruleId + '-' + (modes.length + 1), name: (name || '').trim() || ('Mode ' + (modes.length + 1)), active: active.slice(), entry: (entry || '').trim() };
        if (switchP !== undefined && switchP !== null && switchP !== '') {
            const g = parseFloat(switchP);
            if (!(g >= 0 && g < 1)) return { ok: false, err: 'Switch-failure probability must be in [0, 1).' };
            mode.switchP = g;
        }
        if (lambda !== undefined && lambda !== null && lambda !== '') {
            const l = parseFloat(lambda);
            if (!(l > 0)) return { ok: false, err: 'λ must be a positive number (per hour).' };
            mode.lambda = l;
        }
        const probe = Object.assign({}, r, { modes: modes.concat([mode]) });
        const issues = window.MBSA_SCHEMA ? window.MBSA_SCHEMA.validateRule(probe) : [];
        if (issues.length) return { ok: false, err: issues[0] };
        r.modes = probe.modes;
        _jr('m2-mode', 'Rule ' + r.id + ': + mode "' + mode.name + '" [' + mode.active.join(', ') + ']' +
            (mode.switchP != null ? ' · switch-failure γ=' + mode.switchP + ' (user-entered)' : ''));
        _save(); _rerender();
        return { ok: true, mode };
    };

    window.m2ModeRemove = function (ruleId, modeId) {
        const r = _rule(ruleId);
        if (!r || !Array.isArray(r.modes)) return { ok: false, err: 'Nothing to remove.' };
        const i = r.modes.findIndex(m => m && m.id === modeId);
        if (i < 0) return { ok: false, err: 'Mode not found.' };
        const gone = r.modes.splice(i, 1)[0];
        if (!r.modes.length) delete r.modes;
        _jr('m2-mode', 'Rule ' + r.id + ': − mode "' + (gone.name || gone.id) + '"');
        _save(); _rerender();
        return { ok: true };
    };

    // ------------------------------------------------------------- invariants
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-20', name: 'Every mode chain: BDD cutsets equal the enumerated defeat sets', sev: 'hard',
                run: () => {
                    const fails = []; let checked = 0;
                    _modeRules().forEach(r => {
                        checked++;
                        const e = m2Equivalence(r);
                        if (!e.agree) fails.push('Rule ' + r.id + ': engines disagree — BDD {' + (e.cutsets || []).join(' , ') + '} vs enumeration {' + (e.expect || []).join(' , ') + '}');
                    });
                    return { checked, fails };
                }
            });
            window.invRegister({
                id: 'INV-21', name: 'Every reconfiguration claim carries a switch-failure value or a bound assumption', sev: 'advisory',
                run: () => {
                    const fails = []; let checked = 0;
                    _modeRules().forEach(r => {
                        (r.modes || []).forEach((m, i) => {
                            if (i === 0) return;
                            checked++;
                            const substantiated = (m.switchP != null) ||
                                (Array.isArray(m.assumptionRefs) && m.assumptionRefs.length) ||
                                (Array.isArray(r.assumptionRefs) && r.assumptionRefs.length);
                            if (!substantiated) fails.push('Rule ' + r.id + ' mode "' + (m.name || m.id) + '": reconfiguration claimed with no user-entered switch-failure probability and no bound assumption');
                        });
                    });
                    return { checked, fails };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ------------------------------------------------------------- the panel
    function _renderM2() {
        const host = document.getElementById('mac-host');
        if (!host) return;
        let div = document.getElementById('m2-modes-panel');
        if (!div) { div = document.createElement('div'); div.id = 'm2-modes-panel'; host.appendChild(div); }
        const rules = _rules();
        if (!rules.length) { div.innerHTML = ''; return; }
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:var(--s-4);">' +
            '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">Modes & reconfiguration — M2</div>' +
            '<div style="padding:8px 14px; font-size:11.5px; color:var(--color-text-secondary);">An ordered fallback chain: primary first, each reconfiguration target after. <b>Switching is a failure mode with a name</b> — every mode past the first carries a switch event in the defeat sets, and an unsubstantiated switch claim is flagged (INV-21). Chains compile through the BDD engine; disagreement with the enumeration is a hard sweep failure (INV-20). Numbers are yours: λ and γ are user-entered, never derived.</div>';
        rules.forEach(rule => {
            const modes = rule.modes || [];
            html += '<div style="padding:10px 14px; border-top:1px solid var(--color-border-hair);">' +
                '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">' +
                '<b style="font-size:12.5px;">' + _esc(rule.subId) + '</b><span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(rule.id) + '</span>';
            if (modes.length) {
                const eq = m2Equivalence(rule);
                html += '<span style="font-size:10.5px; font-weight:700; padding:1px 8px; border:1px solid ' + (eq.agree ? 'var(--color-success)' : 'var(--color-danger)') + '; color:' + (eq.agree ? 'var(--color-success)' : 'var(--color-danger)') + ';">' +
                    (eq.agree ? 'BDD ⇔ chain ✓ (' + eq.expect.length + ' defeat sets)' : 'ENGINES DISAGREE') + '</span>';
                const q = m2Quant(rule, (typeof ftaConfig !== 'undefined' && ftaConfig.exposureTime) || 1);
                if (q.ok && q.mc) html += '<span title="analytic vs seeded MC (n=' + q.mc.n + ', seed=' + q.mc.seed + ')" style="font-size:10.5px; font-weight:700; padding:1px 8px; border:1px solid ' + (q.agree ? 'var(--color-success)' : 'var(--color-danger)') + '; color:' + (q.agree ? 'var(--color-success)' : 'var(--color-danger)') + ';">standby R(t): ' + q.analytic.toExponential(3) + ' ' + (q.agree ? '⇔ MC ✓' : '≠ MC [' + q.mc.lo.toExponential(2) + ', ' + q.mc.hi.toExponential(2) + ']') + '</span>';
            }
            html += '</div>';
            if (modes.length) {
                html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th style="width:26px;">#</th><th>Mode</th><th>Active systems</th><th>Entry</th><th style="width:110px;">γ switch-fail</th><th style="width:90px;">λ (user)</th><th style="width:44px;"></th></tr></thead><tbody>';
                modes.forEach((m, i) => {
                    html += '<tr><td class="u-mono" style="font-size:11px;">' + (i + 1) + '</td>' +
                        '<td><b>' + _esc(m.name || m.id) + '</b>' + (i === 0 ? ' <span style="font-size:10px; color:var(--color-text-tertiary);">PRIMARY</span>' : '') + '</td>' +
                        '<td>' + (m.active || []).map(s => _esc(_sysName(s))).join(', ') + '</td>' +
                        '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(m.entry || '') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + (i === 0 ? '—' : (m.switchP != null ? m.switchP : '<span style="color:var(--color-warning); font-weight:700;">unsubstantiated</span>')) + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + (m.lambda != null ? m.lambda : '—') + '</td>' +
                        '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 7px;" onclick="m2ModeRemove(\'' + _esc(rule.id) + '\',\'' + _esc(m.id) + '\')">✕</button></td></tr>';
                });
                html += '</tbody></table>';
            }
            // add-mode row
            const rid = _esc(rule.id);
            html += '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:6px; padding:6px 8px; background:var(--color-surface-2);">' +
                '<input id="m2-name-' + rid + '" type="text" placeholder="Mode name" style="font-size:11px; padding:3px 7px; width:110px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);">' +
                _sysList().map(s => '<label style="display:inline-flex; align-items:center; gap:3px; font-size:10.5px; cursor:pointer;"><input type="checkbox" class="m2-sys-' + rid + '" value="' + _esc(s.id) + '"> ' + _esc(s.name || s.id) + '</label>').join('') +
                '<input id="m2-entry-' + rid + '" type="text" placeholder="entry condition" style="font-size:11px; padding:3px 7px; width:150px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);">' +
                '<input id="m2-gamma-' + rid + '" type="text" placeholder="γ" title="switch-failure probability (your value)" style="font-size:11px; padding:3px 7px; width:56px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);">' +
                '<input id="m2-lambda-' + rid + '" type="text" placeholder="λ/h" title="aggregate mode failure rate (your value)" style="font-size:11px; padding:3px 7px; width:66px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary);">' +
                '<button class="ckpt-m-btn" style="font-size:10.5px; padding:2px 9px;" onclick="_m2AddUi(\'' + rid + '\')">+ mode</button></div>';
            html += '</div>';
        });
        html += '</div>';
        div.innerHTML = html;
    }
    function _rerender() { try { _renderM2(); } catch (_) {} }

    window._m2AddUi = function (ruleId) {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
        const active = Array.prototype.slice.call(document.querySelectorAll('.m2-sys-' + ruleId + ':checked')).map(el => el.value);
        const r = window.m2ModeAdd(ruleId, g('m2-name-' + ruleId), active, g('m2-entry-' + ruleId), g('m2-gamma-' + ruleId), g('m2-lambda-' + ruleId));
        if (!r.ok && typeof showToast === 'function') showToast(r.err, 'error', 3600);
    };

    // ------------------------------------------------------------- the wrap
    (function wrap() {
        if (typeof window.renderMacPage === 'function' && !window.renderMacPage._m2Wrapped) {
            const orig = window.renderMacPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                _rerender();
                return r;
            };
            wrapped._m2Wrapped = true;
            window.renderMacPage = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.m2Evaluate = m2Evaluate;
    window.m2BreachSets = m2BreachSets;
    window.m2Equivalence = m2Equivalence;
    window.m2Quant = m2Quant;
    window._m2RenderPanel = _renderM2;
})();
