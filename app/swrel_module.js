// ============================================================================
// swrel_module.js — Phase R8: quantitative software reliability growth models
// on the CSCI failure logs the program collects during integration and test.
//
// Two classical models, both fit by maximum likelihood on exact failure
// times (cumulative execution hours), all math original and held against
// independently computed fixtures in the regression suite:
//
//   Goel–Okumoto NHPP:  m(t) = a(1 − e^{−bt})
//     MLE: b solves  n/b − Σtᵢ − nT·e^{−bT}/(1 − e^{−bT}) = 0,  a = n/(1−e^{−bT})
//     Gives: expected residual faults (a − n), current intensity λ(T) = ab·e^{−bT},
//     execution time to reach a target intensity: t* = ln(ab/λ*)/b.
//
//   Jelinski–Moranda:   λᵢ = φ(N − i + 1) between failures
//     MLE: φ(N) = n / Σ(N − i + 1)xᵢ closed-form; N by 1-D likelihood search.
//     Gives: initial fault estimate N̂, residual N̂ − n.
//
// Honesty rails: fits with n < 8 render as LOW CONFIDENCE; a JM search that
// runs to its upper bound reports "unbounded — growth not yet observable"
// rather than a number; the page never extrapolates past 10× observed time.
//
// DO-178C positioning (stated on the page): these models inform TEST
// PROGRESS decisions; they are not certification credit — development
// assurance (DAL) is the certification argument for software.
//
// Born modular: page 'swrel', state under projectConfig.swrel, CSCIs seeded
// from itemsData rows with daType 'Software'.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _bisect(f, a, b, it) {
        let fa = f(a), fb = f(b);
        if (!(fa * fb < 0)) return null;
        for (let i = 0; i < (it || 200); i++) {
            const m = (a + b) / 2, fm = f(m);
            if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
        }
        return (a + b) / 2;
    }

    // ------------------------------------------------------- Goel–Okumoto
    function goMle(times, T) {
        const ts = (times || []).filter(t => t > 0).sort((x, y) => x - y);
        const n = ts.length;
        if (n < 3 || !(T > 0) || ts[n - 1] > T) return null;
        const sum = ts.reduce((a, t) => a + t, 0);
        const g = b => n / b - sum - n * T * Math.exp(-b * T) / (1 - Math.exp(-b * T));
        const b = _bisect(g, 1e-9, 10);
        if (b == null) return null;
        const a = n / (1 - Math.exp(-b * T));
        const intensity = a * b * Math.exp(-b * T);
        return {
            model: 'GO', a, b, n, T,
            residual: a - n,
            intensity,
            mT: a * (1 - Math.exp(-b * T)),
            // execution time (from 0) to reach target intensity λ*
            tToIntensity: lStar => (lStar > 0 && lStar < a * b) ? Math.log(a * b / lStar) / b : null,
            lowConfidence: n < 8,
        };
    }

    // ---------------------------------------------------- Jelinski–Moranda
    function jmMle(times) {
        const ts = (times || []).filter(t => t > 0).sort((x, y) => x - y);
        const n = ts.length;
        if (n < 3) return null;
        const x = ts.map((t, i) => i === 0 ? t : t - ts[i - 1]);   // interfailure times
        const ll = N => {
            const denom = x.reduce((a, xi, i) => a + (N - i) * xi, 0);
            const phi = n / denom;
            let v = 0;
            for (let i = 0; i < n; i++) v += Math.log(phi * (N - i)) - phi * (N - i) * x[i];
            return { ll: v, phi };
        };
        // 1-D search on N ∈ (n, n + 2000]
        let best = null, cap = n + 2000;
        for (let N = n + 0.01; N <= cap; N += 0.01) {
            const r = ll(N);
            if (!best || r.ll > best.ll) best = { N, phi: r.phi, ll: r.ll };
        }
        if (!best) return null;
        const unbounded = best.N > cap - 1;   // likelihood still rising at the cap
        return {
            model: 'JM', N: best.N, phi: best.phi, n,
            residual: best.N - n,
            intensity: best.phi * (best.N - n),   // rate after the n-th fix
            unbounded,
            lowConfidence: n < 8,
        };
    }

    // ------------------------------------------------------------- store
    function _store() {
        if (typeof projectConfig === 'undefined') return { cscis: [] };
        if (!projectConfig.swrel) projectConfig.swrel = { cscis: [] };
        if (!Array.isArray(projectConfig.swrel.cscis)) projectConfig.swrel.cscis = [];
        return projectConfig.swrel;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // ------------------------------------------------------------ actions
    window.swrelAdd = function () {
        // seed the picker from software items
        const swItems = ((typeof itemsData !== 'undefined' && itemsData) || []).filter(i => /soft/i.test(i.daType || ''));
        const hint = swItems.length ? ' (software items: ' + swItems.map(i => i.itemId).join(', ') + ')' : '';
        const name = window.prompt('CSCI / software item name' + hint + ':', swItems.length ? swItems[0].name : '');
        if (!name || !name.trim()) return;
        const ft = window.prompt('Cumulative failure times (execution hours, comma-separated):', '10, 28, 45, 70, 95, 130, 175, 230, 300, 390, 500, 640');
        if (!ft) return;
        const times = ft.split(',').map(x => parseFloat(x)).filter(x => x > 0);
        if (times.length < 3) { alert('Need at least three failure times.'); return; }
        const T = parseFloat(window.prompt('Total execution time observed T (h, ≥ last failure):', String(Math.ceil(Math.max.apply(null, times) * 1.1))));
        if (!(T > 0) || T < Math.max.apply(null, times)) { alert('T must cover the last failure.'); return; }
        _store().cscis.push({ id: 'SW-' + Date.now(), name: name.trim(), times, T });
        _save(); renderSwrelPage();
    };
    window.swrelDelete = function (id) {
        const s = _store();
        const i = s.cscis.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this failure log?')) { s.cscis.splice(i, 1); _save(); renderSwrelPage(); }
    };

    // ---------------------------------------------------------------- page
    const _f = (v, d) => v == null || !isFinite(v) ? '—' : Number(v).toFixed(d == null ? 2 : d);

    function renderSwrelPage() {
        const host = document.getElementById('swrel-host');
        if (!host) return;
        const cscis = _store().cscis;
        let html = '<div style="margin-bottom:12px;"><button class="btn-cyan" style="font-size:12.5px; padding:7px 14px;" onclick="swrelAdd()">+ CSCI failure log</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Goel–Okumoto NHPP + Jelinski–Moranda, MLE on exact failure times</span></div>';
        if (!cscis.length) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No failure logs yet. Log cumulative execution-hour failure times per CSCI as integration proceeds; both growth models fit on every render.</p>';
        } else {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th></th><th>CSCI</th><th>n · T</th>' +
                '<th>GO residual faults</th><th>GO intensity /h</th><th>GO t→λ/10</th>' +
                '<th>JM initial N̂</th><th>JM residual</th><th>Verdict</th></tr></thead><tbody>' +
                cscis.map(c => {
                    const go = goMle(c.times, c.T);
                    const jm = jmMle(c.times);
                    let verdict = '—';
                    if (go && jm) {
                        if (jm.unbounded) verdict = 'growth not yet observable (JM unbounded) — keep testing';
                        else if (go.residual < 1 && jm.residual < 1) verdict = 'both models see < 1 residual fault';
                        else verdict = 'residual ' + _f(Math.min(go.residual, jm.residual), 1) + '–' + _f(Math.max(go.residual, jm.residual), 1) + ' faults (model range)';
                    }
                    const tTenth = go ? go.tToIntensity(go.intensity / 10) : null;
                    const capNote = tTenth != null && tTenth > 10 * c.T ? ' (> 10×T — beyond honest extrapolation)' : '';
                    return '<tr><td><a href="#" onclick="swrelDelete(\'' + c.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                        '<td><b>' + _esc(c.name) + '</b>' + ((go && go.lowConfidence) ? ' <span style="font-size:9.5px; color:#9A6200; font-weight:700;">LOW CONFIDENCE (n<8)</span>' : '') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + c.times.length + ' · ' + c.T + 'h</td>' +
                        '<td class="u-mono">' + (go ? _f(go.residual, 2) : '—') + '</td>' +
                        '<td class="u-mono">' + (go ? go.intensity.toExponential(2) : '—') + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + (tTenth != null && !capNote ? _f(tTenth, 0) + ' h' : (capNote ? '—' + capNote : '—')) + '</td>' +
                        '<td class="u-mono">' + (jm ? (jm.unbounded ? 'unbounded' : _f(jm.N, 1)) : '—') + '</td>' +
                        '<td class="u-mono">' + (jm && !jm.unbounded ? _f(jm.residual, 2) : '—') + '</td>' +
                        '<td style="font-size:11px;">' + verdict + '</td></tr>';
                }).join('') + '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Positioning per DO-178C: growth models inform TEST-PROGRESS decisions (when is the failure intensity low enough to stop?); they are not certification credit — ' +
            'the certification argument for software is development assurance at the assigned DAL. Two models are shown because their disagreement is itself information: JM assumes a fixed fault count, GO does not.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._swrelWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-swrel');
                if (v) v.style.display = (tabId === 'swrel') ? 'block' : 'none';
                const s = document.getElementById('snav-swrel');
                if (s) s.classList.toggle('snav-active', tabId === 'swrel');
                if (tabId === 'swrel') renderSwrelPage();
            } catch (_) {}
            return r;
        };
        wrapped._swrelWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.goMle = goMle;
    window.jmMle = jmMle;
    window.renderSwrelPage = renderSwrelPage;
})();
