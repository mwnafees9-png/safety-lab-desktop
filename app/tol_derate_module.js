// tol_derate_module.js — Phase F8: tolerance accumulation & derating audit.
// Coverage closers for NASA/TP-2000-207428 ch.4 (derating, application
// factors) and ch.5 (normal distribution, tolerance accumulation / worst-case).
// BORN MODULAR: new file, zero monolith edits; store under projectConfig.tolDerate.
//
//   Tolerance / worst-case analysis — a stack of contributors (nominal ± tol):
//     worst case = Σ|tol| (all limits adverse simultaneously);
//     RSS σ = √Σ(tolᵢ/3)² treating each ± tol as 3σ (stated assumption);
//     P(exceed limit) from the normal CDF (Abramowitz–Stegun erf, |err|<1.5e-7).
//   Derating audit — applied vs rated stress against a guideline fraction:
//     ratio = applied/rated; PASS iff ratio ≤ guideline. Default guidelines are
//     TYPICAL practice values and say so — programs confirm against their own
//     derating standard (e.g. company or agency derating manuals).

(function () {
    'use strict';

    function _store() {
        if (!projectConfig.tolDerate) projectConfig.tolDerate = { stacks: [], derate: [] };
        const r = projectConfig.tolDerate;
        if (!Array.isArray(r.stacks)) r.stacks = [];
        if (!Array.isArray(r.derate)) r.derate = [];
        return r;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }
    const _chip = (l, v, warn) => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + l + ' <b style="margin-left:6px;' + (warn ? ' color:#B45309;' : '') + '">' + v + '</b></div>';

    // ---------------------------------------------------------------- math
    // erf — Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7).
    function erf(x) {
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x);
        const t = 1 / (1 + 0.3275911 * x);
        const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
        return sign * y;
    }
    const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));   // standard normal CDF

    // Tolerance stack: contributors [{name, nominal, tol}] with ±tol ≡ 3σ.
    // limits: {lower, upper} on the assembled dimension/parameter.
    function tolStack(contributors, limits) {
        const nominal = contributors.reduce((a, c) => a + c.nominal, 0);
        const wc = contributors.reduce((a, c) => a + Math.abs(c.tol), 0);
        const sigma = Math.sqrt(contributors.reduce((a, c) => a + Math.pow(c.tol / 3, 2), 0));
        const out = { nominal, wcLow: nominal - wc, wcHigh: nominal + wc, wc, sigma, rss3: 3 * sigma };
        if (limits && (limits.lower != null || limits.upper != null)) {
            let pLow = 0, pHigh = 0;
            if (limits.lower != null && sigma > 0) pLow = phi((limits.lower - nominal) / sigma);
            if (limits.upper != null && sigma > 0) pHigh = 1 - phi((limits.upper - nominal) / sigma);
            out.pExceed = pLow + pHigh;
            out.wcInside = (limits.lower == null || out.wcLow >= limits.lower) && (limits.upper == null || out.wcHigh <= limits.upper);
        }
        return out;
    }

    // Derating: TYPICAL guideline fractions — a starting point, not an authority.
    const DERATE_TYPICAL = {
        'Resistor (power)': 0.5, 'Capacitor (voltage)': 0.6, 'Semiconductor (junction temp margin)': 0.7,
        'Semiconductor (power)': 0.5, 'Inductor/transformer (current)': 0.6, 'Relay/switch contacts (current)': 0.5,
        'Connector contacts (current)': 0.5, 'Wire/cable (current)': 0.6, 'IC (supply voltage)': 0.8,
    };
    function derateVerdict(row) {
        const ratio = row.rated > 0 ? row.applied / row.rated : Infinity;
        return { ratio, pass: ratio <= row.guideline, margin: row.guideline - ratio };
    }

    // ------------------------------------------------------------- actions
    async function tolAddStack() {
        if (!_access()) return;
        const name = await _ask('Stack name (e.g. "Actuator end-play chain" or "Reference voltage chain"):'); if (!name || !name.trim()) return;
        const raw = (await _ask('Contributors — name:nominal:±tol, semicolon-separated:', 'Housing:10.00:0.05; Bearing:5.00:0.03; Shaft:-14.90:0.04')) || '';
        const contributors = raw.split(';').map(seg => {
            const p = seg.split(':');
            return { name: (p[0] || '').trim(), nominal: parseFloat(p[1]), tol: Math.abs(parseFloat(p[2])) };
        }).filter(c => c.name && isFinite(c.nominal) && isFinite(c.tol));
        if (contributors.length < 2) { _toast('Need at least two contributors (name:nominal:tol).', 'warning', 3500); return; }
        const lo = parseFloat(await _ask('Lower spec limit on the result (blank = none):', ''));
        const hi = parseFloat(await _ask('Upper spec limit on the result (blank = none):', ''));
        _store().stacks.push({ id: 'TS-' + Date.now(), name: name.trim(), contributors,
            limits: { lower: isFinite(lo) ? lo : null, upper: isFinite(hi) ? hi : null } });
        _save(); renderRamTolPage();
    }
    function tolDeleteStack(id) {
        const s = _store();
        const i = s.stacks.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this stack?')) { s.stacks.splice(i, 1); _save(); renderRamTolPage(); }
    }
    async function derateAdd() {
        if (!_access()) return;
        const part = await _ask('Part (e.g. "R42 — load resistor"):'); if (!part || !part.trim()) return;
        const cats = Object.keys(DERATE_TYPICAL);
        const pick = (await _ask('Stress category:\n' + cats.map((c, i) => (i + 1) + '. ' + c + ' (typical ≤ ' + (DERATE_TYPICAL[c] * 100) + '%)').join('\n'), '1')) || '';
        const idx = parseInt(pick) - 1;
        if (!(idx >= 0 && idx < cats.length)) return;
        const rated = parseFloat(await _ask('Rated value (datasheet):', '1')); if (!(rated > 0)) return;
        const applied = parseFloat(await _ask('Applied (worst-case operating) value:', '0.4')); if (!(applied >= 0)) return;
        const guideline = parseFloat(await _ask('Guideline fraction — confirm against YOUR derating standard:', DERATE_TYPICAL[cats[idx]])) || DERATE_TYPICAL[cats[idx]];
        _store().derate.push({ id: 'DR-' + Date.now(), part: part.trim(), category: cats[idx], rated, applied, guideline });
        _save(); renderRamTolPage();
    }
    function derateDelete(id) {
        const s = _store();
        const i = s.derate.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this derating row?')) { s.derate.splice(i, 1); _save(); renderRamTolPage(); }
    }

    // --------------------------------------------------------------- render
    function renderRamTolPage() {
        const host = document.getElementById('ram-tol-host');
        if (!host) return;
        if (!_access()) { host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; max-width:640px;"><h3 style="margin:0 0 10px; border:none; padding:0;">Tolerance &amp; derating analysis is a Pro+ capability</h3></div>'; return; }
        const S = _store();
        const failsWc = S.stacks.filter(st => { const r = tolStack(st.contributors, st.limits); return r.wcInside === false; }).length;
        const failsDr = S.derate.filter(d => !derateVerdict(d).pass).length;

        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            _chip('Tolerance stacks', String(S.stacks.length)) + _chip('WC violations', String(failsWc), failsWc > 0) +
            _chip('Derating rows', String(S.derate.length)) + _chip('Over guideline', String(failsDr), failsDr > 0) + '</div>';

        html += '<h3>Tolerance accumulation — worst case vs RSS</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="tolAddStack()">+ Tolerance stack</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">±tol treated as 3σ (stated assumption) · WC = all limits adverse at once · P(exceed) from the normal CDF</span></div>';
        if (!S.stacks.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No stacks yet — dimension chains, voltage dividers, timing budgets all fit.</p>';
        S.stacks.forEach(st => {
            const r = tolStack(st.contributors, st.limits);
            html += '<h4 style="font-size:12px; font-family:var(--font-mono); letter-spacing:0.06em; text-transform:uppercase; color:var(--color-text-secondary); margin:12px 0 6px;">' + _esc(st.name) +
                ' <a href="#" style="font-size:11px; text-transform:none;" onclick="tolDeleteStack(\'' + st.id + '\'); return false;">remove</a></h4>' +
                '<table class="data-table" style="width:100%; max-width:560px; font-size:12px;"><thead><tr><th>Contributor</th><th>Nominal</th><th>± tol</th></tr></thead><tbody>' +
                st.contributors.map(c => '<tr><td>' + _esc(c.name) + '</td><td class="u-mono">' + c.nominal + '</td><td class="u-mono">' + c.tol + '</td></tr>').join('') +
                '</tbody></table>' +
                '<div style="display:flex; gap:10px; flex-wrap:wrap; margin:8px 0;">' +
                _chip('Nominal', r.nominal.toFixed(4)) +
                _chip('Worst case', r.wcLow.toFixed(4) + ' … ' + r.wcHigh.toFixed(4), r.wcInside === false) +
                _chip('RSS ±3σ', '±' + r.rss3.toFixed(4)) +
                (r.pExceed != null ? _chip('P(exceed limits)', r.pExceed < 1e-6 ? r.pExceed.toExponential(2) : (r.pExceed * 100).toFixed(4) + '%', r.pExceed > 1e-3) : '') +
                '</div>' +
                (r.wcInside === false ? '<p style="font-size:12px; color:#8E2A2A; font-family:var(--font-mono);">WORST CASE VIOLATES the spec limits — statistically rare is not the same as impossible; disposition required (tighten tolerances, widen limits, or accept with the RSS probability recorded).</p>' : '');
        });

        html += '<h3 style="margin-top:var(--s-5);">Derating audit — applied vs rated stress</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="derateAdd()">+ Derating row</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">guidelines shown are TYPICAL practice — confirm each against the program\'s derating standard</span></div>';
        html += '<table class="data-table" style="width:100%; max-width:880px; font-size:12.5px;"><thead><tr>' +
            '<th>Part</th><th>Category</th><th>Rated</th><th>Applied</th><th>Ratio</th><th>Guideline</th><th>Verdict</th><th></th></tr></thead><tbody>';
        if (!S.derate.length) html += '<tr><td colspan="8" style="color:var(--color-text-tertiary);">No derating rows yet.</td></tr>';
        S.derate.forEach(d => {
            const v = derateVerdict(d);
            html += '<tr><td>' + _esc(d.part) + '</td><td style="font-size:11.5px;">' + _esc(d.category) + '</td>' +
                '<td class="u-mono">' + d.rated + '</td><td class="u-mono">' + d.applied + '</td>' +
                '<td class="u-mono"' + (!v.pass ? ' style="color:#8E2A2A;"' : '') + '>' + (v.ratio * 100).toFixed(1) + '%</td>' +
                '<td class="u-mono">≤ ' + (d.guideline * 100).toFixed(0) + '%</td>' +
                '<td>' + (v.pass ? '<span style="color:#1D9E75; font-family:var(--font-mono); font-size:11px;">✓ within</span>'
                    : '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px;">OVER — reduce stress or justify</span>') + '</td>' +
                '<td><button class="node-delete-btn-inner" style="font-size:11px;" onclick="derateDelete(\'' + d.id + '\')">✕</button></td></tr>';
        });
        html += '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Derating buys failure-rate margin before any statistics happen (NASA RAM Training ch.4); the stress ratios here should agree with the π factors used in the prediction library.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._tolWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-ram-tol');
                if (v) v.style.display = (tabId === 'ram-tol') ? 'block' : 'none';
                const s = document.getElementById('snav-ram-tol');
                if (s) s.classList.toggle('snav-active', tabId === 'ram-tol');
                if (tabId === 'ram-tol') renderRamTolPage();
            } catch (_) {}
            return r;
        };
        wrapped._tolWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.renderRamTolPage = renderRamTolPage;
    window.tolAddStack = tolAddStack;
    window.tolDeleteStack = tolDeleteStack;
    window.derateAdd = derateAdd;
    window.derateDelete = derateDelete;
    window._tolStack = tolStack;
    window._tolErf = erf;
    window._deratVerdict = derateVerdict;
})();
