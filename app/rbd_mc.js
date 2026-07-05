// ============================================================================
// rbd_mc.js — Phase R2: Monte Carlo simulation for the configurations the
// exact RBD engine cannot fold into a product form — standby redundancy with
// imperfect switching, warm-standby dormancy factors, and phased missions
// where the success criterion changes mid-flight.
//
// Discipline: SEEDED runs (mulberry32 PRNG) so every result is reproducible
// — the same seed and model always give the same number, which is what an
// auditor needs. Results carry the binomial standard error and a 95% Wilson
// interval; the page states N and the seed next to every figure.
//
// Analytic anchors (verified independently):
//   2-unit cold standby, perfect switch:  R(t) = e^{−λt}(1 + λt)
//   2-unit cold standby, switch prob p:   R(t) = e^{−λt}(1 + p·λt)
//   active parallel:                      R(t) = 1 − (1 − e^{−λt})²
// The harness holds the simulator against all three.
//
// Model (JSON, kept deliberately small):
//   { type:'exp',     lambda }                          — one unit
//   { type:'standby', lambda, units, switchP, warmK }   — 1 active + (units−1)
//        in standby; standby draws λ·warmK while waiting (warmK 0 = cold,
//        1 = hot); each takeover succeeds with probability switchP
//   { type:'series'|'parallel', children:[…] }
//   { type:'koon', k, children:[…] }
// Phased mission: [{ name, duration, model }] — unit ages carry across
// phases (failures persist; no repair within the mission).
//
// Born modular: page 'rbd-mc', state under projectConfig.rbdMc.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------- seeded PRNG
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const _expDraw = (rng, lambda) => lambda > 0 ? -Math.log(1 - rng()) / lambda : Infinity;

    // ------------------------------------------------- one-mission sample
    // Returns true if the model survives [0, t]. Component states persist in
    // `mem` (keyed by node path) so phases share unit histories.
    function _survive(node, t0, t1, rng, mem, path) {
        const key = path.join('.');
        switch (node.type) {
            case 'exp': {
                let st = mem[key];
                // life is drawn ONCE at first touch, anchored at that moment —
                // a component entering service mid-mission is not charged for
                // hours it never ran; a component shared across phases ages.
                if (!st) { st = mem[key] = { failAt: t0 + _expDraw(rng, node.lambda) }; }
                return st.failAt > t1;
            }
            case 'standby': {
                let st = mem[key];
                if (!st) {
                    st = mem[key] = { active: 0, failedAt: [], dead: false, clock: t0, exhausted: false };
                    st.units = node.units || 2;
                }
                if (st.dead) return false;
                // walk time forward from st.clock to t1
                let now = Math.max(st.clock, t0);
                while (now < t1) {
                    const remaining = st.units - st.active - 1;   // standbys left
                    // active unit's remaining life from `now`
                    if (st.activeFailAt == null) st.activeFailAt = now + _expDraw(rng, node.lambda);
                    // warm standby can fail while waiting — draw a dormant death
                    // for the NEXT standby if not yet drawn
                    if (remaining > 0 && st.dormantFailAt == null && (node.warmK || 0) > 0)
                        st.dormantFailAt = now + _expDraw(rng, node.lambda * node.warmK);
                    if (st.activeFailAt > t1) { st.clock = t1; return true; }
                    // active failed inside window
                    now = st.activeFailAt;
                    if (remaining <= 0) { st.dead = true; st.clock = now; return false; }
                    // is the standby itself alive?
                    const standbyDead = (node.warmK || 0) > 0 && st.dormantFailAt != null && st.dormantFailAt <= now;
                    st.dormantFailAt = null;
                    if (standbyDead) { st.active++; st.activeFailAt = now; continue; }   // consumed a dead standby, try next
                    // switch attempt
                    if ((node.switchP == null ? 1 : node.switchP) < rng()) { st.dead = true; st.clock = now; return false; }
                    st.active++;
                    st.activeFailAt = now + _expDraw(rng, node.lambda);
                }
                st.clock = t1;
                return !st.dead;
            }
            case 'series':
                return (node.children || []).every((c, i) => _survive(c, t0, t1, rng, mem, path.concat(i)));
            case 'parallel':
                return (node.children || []).some((c, i) => _survive(c, t0, t1, rng, mem, path.concat(i)));
            case 'koon': {
                const up = (node.children || []).filter((c, i) => _survive(c, t0, t1, rng, mem, path.concat(i))).length;
                return up >= (node.k || 1);
            }
            default: return true;
        }
    }

    // NOTE on phased missions: _survive asks "alive through [t0,t1]" per
    // phase; exp units draw a single life at first touch so ages carry.
    // A unit idle in phase 1's model but present in phase 2's still draws
    // its life from first touch — conservative for cold spares across
    // phases, exact for continuously-energized units.
    function mcRun(phases, n, seed) {
        const rng = mulberry32(seed == null ? 42 : seed);
        let ok = 0;
        for (let i = 0; i < n; i++) {
            const mem = {};
            let t = 0, alive = true;
            for (const ph of phases) {
                // position-based identity: the same slot in the model tree IS the
                // same physical unit across phases (histories carry). Structurally
                // different phase models re-map by position — document per case.
                if (!_survive(ph.model, t, t + ph.duration, rng, mem, [])) { alive = false; break; }
                t += ph.duration;
            }
            if (alive) ok++;
        }
        const p = ok / n;
        const se = Math.sqrt(Math.max(p * (1 - p), 1e-12) / n);
        // 95% Wilson interval
        const z = 1.959963985;
        const den = 1 + z * z / n;
        const mid = (p + z * z / (2 * n)) / den;
        const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
        return { r: p, se, lo: Math.max(0, mid - half), hi: Math.min(1, mid + half), n, seed: seed == null ? 42 : seed, survivors: ok };
    }

    // ------------------------------------------------------------- store
    function _store() {
        if (typeof projectConfig === 'undefined') return { cases: [] };
        if (!projectConfig.rbdMc) projectConfig.rbdMc = { cases: [] };
        if (!Array.isArray(projectConfig.rbdMc.cases)) projectConfig.rbdMc.cases = [];
        return projectConfig.rbdMc;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // ------------------------------------------------------------ actions
    const EXAMPLE = JSON.stringify([
        { name: 'takeoff', duration: 0.2, model: { type: 'series', children: [
            { type: 'standby', lambda: 1e-3, units: 2, switchP: 0.98, warmK: 0.1 },
            { type: 'exp', lambda: 5e-5 } ] } },
        { name: 'cruise', duration: 3, model: { type: 'series', children: [
            { type: 'standby', lambda: 1e-3, units: 2, switchP: 0.98, warmK: 0.1 } ] } },
    ], null, 1);

    window.rbdMcAdd = async function () {
        const name = window.prompt('Simulation case name:', 'Hydraulic pump standby pair — full mission');
        if (!name || !name.trim()) return;
        const json = window.prompt('Phased-mission model (JSON — see the example on the page):', EXAMPLE.replace(/\n\s*/g, ' '));
        if (!json) return;
        let phases;
        try {
            phases = JSON.parse(json);
            if (!Array.isArray(phases) || !phases.every(p => p.duration > 0 && p.model)) throw new Error('need [{name,duration,model}…]');
        } catch (e) { alert('Model rejected: ' + e.message); return; }
        const nStr = window.prompt('Trials N (reproducible; SE ∝ 1/√N):', '200000');
        const n = Math.max(1000, parseInt(nStr, 10) || 200000);
        const seedStr = window.prompt('Seed (same seed ⇒ same result, always):', '42');
        _store().cases.push({ id: 'MC-' + Date.now(), name: name.trim(), phases, n, seed: parseInt(seedStr, 10) || 42, result: null });
        _save(); renderRbdMcPage();
    };
    window.rbdMcRun = function (id) {
        const c = _store().cases.find(x => x.id === id);
        if (!c) return;
        c.result = mcRun(c.phases, c.n, c.seed);
        c.ranAt = new Date().toISOString();
        _save(); renderRbdMcPage();
    };
    window.rbdMcDelete = function (id) {
        const s = _store();
        const i = s.cases.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this simulation case?')) { s.cases.splice(i, 1); _save(); renderRbdMcPage(); }
    };

    // ---------------------------------------------------------------- page
    function renderRbdMcPage() {
        const host = document.getElementById('rbd-mc-host');
        if (!host) return;
        const cases = _store().cases;
        let html = '<div style="margin-bottom:12px;"><button class="btn-cyan" style="font-size:12.5px; padding:7px 14px;" onclick="rbdMcAdd()">+ Simulation case</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">standby · imperfect switching · warm dormancy · phased missions — seeded, reproducible</span></div>';
        if (!cases.length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No cases yet. Model shape:</p>' +
                '<pre style="font-size:11px; background:var(--color-surface-2); padding:12px; overflow:auto; border-radius:6px;">' + _esc(EXAMPLE) + '</pre>' +
                '<p style="font-size:11.5px; color:var(--color-text-secondary);">`standby`: 1 active + (units−1) spares; a spare waits at λ·warmK (0 = cold, 1 = hot) and takes over with probability switchP. `koon` needs k of its children. Phases share unit histories — no repair mid-mission.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th></th><th>Case</th><th>Phases</th><th>N · seed</th><th>R(mission)</th><th>95% Wilson</th><th>SE</th><th></th></tr></thead><tbody>' +
                cases.map(c => {
                    const r = c.result;
                    return '<tr><td><a href="#" onclick="rbdMcDelete(\'' + c.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                        '<td><b>' + _esc(c.name) + '</b><br><span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + c.phases.map(p => (p.name || '?') + ' ' + p.duration + 'h').join(' → ') + '</span></td>' +
                        '<td class="u-mono">' + c.phases.length + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + c.n.toLocaleString() + ' · ' + c.seed + '</td>' +
                        (r ? '<td class="u-mono"><b>' + r.r.toFixed(6) + '</b></td>' +
                            '<td class="u-mono" style="font-size:11px;">[' + r.lo.toFixed(6) + ', ' + r.hi.toFixed(6) + ']</td>' +
                            '<td class="u-mono" style="font-size:11px;">' + r.se.toExponential(1) + '</td>'
                            : '<td colspan="3" style="color:var(--color-text-tertiary); font-size:11px;">not run</td>') +
                        '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="rbdMcRun(\'' + c.id + '\')">' + (r ? 're-run' : 'run') + '</button></td></tr>';
                }).join('') + '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Use the exact RBD page for anything it can express — simulation is for what product forms cannot: switching failures, dormancy, phase changes. ' +
            'Same seed, same model, same number: every figure here is reproducible on demand. The engine is held against analytic standby solutions in the regression suite.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._rbdMcWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-rbd-mc');
                if (v) v.style.display = (tabId === 'rbd-mc') ? 'block' : 'none';
                const s = document.getElementById('snav-rbd-mc');
                if (s) s.classList.toggle('snav-active', tabId === 'rbd-mc');
                if (tabId === 'rbd-mc') renderRbdMcPage();
            } catch (_) {}
            return r;
        };
        wrapped._rbdMcWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.mcRun = mcRun;
    window._mcMulberry32 = mulberry32;
    window.renderRbdMcPage = renderRbdMcPage;
})();
