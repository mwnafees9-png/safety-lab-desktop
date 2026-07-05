// ============================================================================
// rel_mle.js — Phase R1: maximum-likelihood Weibull estimation with Fisher
// confidence bounds, alongside the median-rank regression the Weibull page
// already carries. MRR is the plotting-position method; MLE is the
// statistically efficient one — showing both, on the same data sets, is the
// honest presentation (they disagree most exactly when data is thin, which
// is when the user most needs to know).
//
// Math (MIL-HDBK-338B / standard likelihood theory, all original code):
//   β̂ solves  Σ_all t^β ln t / Σ_all t^β − 1/β = (1/r) Σ_fail ln t
//   η̂ = (Σ_all t^β / r)^(1/β)          (suspensions enter both sums)
//   Bounds: observed information (numeric Hessian of the log-likelihood),
//   log-normal asymptotic CIs: θ · exp(±z·SE/θ). One-sided z at 95% two-
//   sided-equivalent = 1.6448536270 (90% two-sided interval).
//
// Born modular: reads the SAME life-data sets as rel_analytics (single
// source of truth), appends an MLE panel to the Weibull page via render
// wrapping. Zero edits to other files.
// ============================================================================
(function () {
    'use strict';

    const Z90 = 1.6448536269514722;   // Φ⁻¹(0.95)

    // -------------------------------------------------------------- solver
    function _bisect(f, a, b, it) {
        let fa = f(a), fb = f(b);
        if (!(fa * fb < 0)) return null;
        for (let i = 0; i < (it || 200); i++) {
            const m = (a + b) / 2, fm = f(m);
            if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
        }
        return (a + b) / 2;
    }

    function weibullMle(failures, suspensions) {
        const fails = (failures || []).filter(t => t > 0);
        const susp = (suspensions || []).filter(t => t > 0);
        const all = fails.concat(susp);
        const r = fails.length;
        if (r < 2) return null;
        const sumLnF = fails.reduce((a, t) => a + Math.log(t), 0);
        const g = beta => {
            let s1 = 0, s2 = 0;
            all.forEach(t => { const tb = Math.pow(t, beta); s1 += tb * Math.log(t); s2 += tb; });
            return s1 / s2 - 1 / beta - sumLnF / r;
        };
        const beta = _bisect(g, 0.05, 40);
        if (beta == null) return null;
        const eta = Math.pow(all.reduce((a, t) => a + Math.pow(t, beta), 0) / r, 1 / beta);

        // observed information via numeric Hessian of ℓ(β, η)
        const ll = (b, e) => {
            let v = 0;
            fails.forEach(t => { v += Math.log(b) - b * Math.log(e) + (b - 1) * Math.log(t) - Math.pow(t / e, b); });
            susp.forEach(t => { v += -Math.pow(t / e, b); });
            return v;
        };
        const h1 = beta * 1e-5, h2 = eta * 1e-5;
        const Hbb = (ll(beta + h1, eta) - 2 * ll(beta, eta) + ll(beta - h1, eta)) / (h1 * h1);
        const Hee = (ll(beta, eta + h2) - 2 * ll(beta, eta) + ll(beta, eta - h2)) / (h2 * h2);
        const Hbe = (ll(beta + h1, eta + h2) - ll(beta + h1, eta - h2) - ll(beta - h1, eta + h2) + ll(beta - h1, eta - h2)) / (4 * h1 * h2);
        const det = Hbb * Hee - Hbe * Hbe;
        let seBeta = null, seEta = null, ci = null;
        if (det !== 0 && isFinite(det)) {
            const vB = -Hee / det, vE = -Hbb / det;   // inv(−H) diagonals
            if (vB > 0 && vE > 0) {
                seBeta = Math.sqrt(vB); seEta = Math.sqrt(vE);
                ci = {
                    betaLo: beta * Math.exp(-Z90 * seBeta / beta), betaHi: beta * Math.exp(Z90 * seBeta / beta),
                    etaLo: eta * Math.exp(-Z90 * seEta / eta), etaHi: eta * Math.exp(Z90 * seEta / eta),
                    level: '90% (two-sided, asymptotic log-normal)',
                };
            }
        }
        // characteristic quantities
        const gamma = (typeof window._relGamma === 'function') ? window._relGamma(1 + 1 / beta) : null;
        const mttf = gamma != null ? eta * gamma : null;
        const b10 = eta * Math.pow(-Math.log(0.90), 1 / beta);
        return { beta, eta, seBeta, seEta, ci, mttf, b10, r, n: all.length, loglik: ll(beta, eta) };
    }

    // ------------------------------------------------------------ panel
    function _fmt(v, d) { return v == null ? '—' : Number(v).toFixed(d == null ? 3 : d); }

    function _injectMlePanel() {
        const host = document.getElementById('ram-weibull-host');
        if (!host || document.getElementById('rel-mle-panel')) return;
        const sets = (typeof projectConfig !== 'undefined' && projectConfig.relAnalytics && projectConfig.relAnalytics.lifeData) || [];
        if (!sets.length) return;
        const div = document.createElement('div');
        div.id = 'rel-mle-panel';
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary);"><b>Maximum-likelihood fits (R1)</b> ' +
            '<span class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary);">same data sets as the regression above — MLE is efficient; disagreement with MRR flags thin data</span></div>' +
            '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
            '<th>Data set</th><th>n (r fail)</th><th>β̂ (MLE)</th><th>β 90% CI</th><th>η̂ (MLE)</th><th>η 90% CI</th><th>MTTF</th><th>B10</th><th>Wear-out?</th></tr></thead><tbody>';
        sets.forEach(s => {
            const m = weibullMle(s.failures, s.suspensions);
            if (!m) { html += '<tr><td>' + s.name + '</td><td colspan="8" style="color:var(--color-text-tertiary);">needs ≥ 2 failures</td></tr>'; return; }
            const wear = m.ci ? (m.ci.betaLo > 1 ? 'YES — β CI above 1' : (m.ci.betaHi < 1 ? 'infant/early — β CI below 1' : 'inconclusive — CI straddles 1')) : '—';
            html += '<tr><td>' + s.name + '</td><td class="u-mono">' + m.n + ' (' + m.r + ')</td>' +
                '<td class="u-mono"><b>' + _fmt(m.beta) + '</b></td>' +
                '<td class="u-mono" style="font-size:11px;">' + (m.ci ? '[' + _fmt(m.ci.betaLo, 2) + ', ' + _fmt(m.ci.betaHi, 2) + ']' : '—') + '</td>' +
                '<td class="u-mono"><b>' + _fmt(m.eta, 1) + '</b></td>' +
                '<td class="u-mono" style="font-size:11px;">' + (m.ci ? '[' + _fmt(m.ci.etaLo, 0) + ', ' + _fmt(m.ci.etaHi, 0) + ']' : '—') + '</td>' +
                '<td class="u-mono">' + _fmt(m.mttf, 1) + '</td><td class="u-mono">' + _fmt(m.b10, 1) + '</td>' +
                '<td style="font-size:11px;' + (m.ci && m.ci.betaLo > 1 ? ' color:#8E2A2A; font-weight:600;' : '') + '">' + wear + '</td></tr>';
        });
        html += '</tbody></table>' +
            '<p style="font-size:10.5px; color:var(--color-text-tertiary); font-family:var(--font-mono); padding:0 14px 10px;">Bounds are asymptotic (observed information, log-normal). A wear-out claim needs the whole β interval above 1 — a point estimate alone is not evidence.</p></div>';
        div.innerHTML = html;
        host.appendChild(div);
    }

    // Two hooks: the window render fn (manual calls) AND switchTab — rel_analytics'
    // own nav wrapper calls its INTERNAL render reference, which no window-level
    // wrap can see; hooking switchTab (we load later, so we sit outermost in the
    // chain) guarantees the panel lands after that internal render completes.
    (function wrap() {
        if (typeof window.renderRamWeibullPage === 'function' && !window.renderRamWeibullPage._mleWrapped) {
            const orig = window.renderRamWeibullPage;
            const wrapped = function () { const r = orig.apply(this, arguments); try { _injectMlePanel(); } catch (_) {} return r; };
            wrapped._mleWrapped = true;
            window.renderRamWeibullPage = wrapped;
        }
        if (typeof window.switchTab === 'function' && !window.switchTab._mleWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'ram-weibull') _injectMlePanel(); } catch (_) {}
                return r;
            };
            wrapped._mleWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    window.weibullMle = weibullMle;
})();
