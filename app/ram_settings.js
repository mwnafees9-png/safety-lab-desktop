// ============================================================================
// ram_settings.js — Phase R10: one place for the program-level utilization
// and statistical-policy numbers every R&M module currently assumes.
//
//   annual FH        — used by MSG-3 intervals, PM optimizer, LCC, TLD
//   fleet size       — LCC and spares demand scale with it
//   FRACAS confidence — the one-sided level the field-data verdicts use
//                      (0.60 is the customary demonstration level; a program
//                      may demand more — the setting propagates)
//   default duty cycle & nonoperating K — the R5 composition defaults
//
// Modules read these via projectConfig.ramSettings (each keeps its own safe
// default when the setting is absent, so nothing breaks headless).
// ram_modules' FRACAS verdicts consult the confidence setting through the
// exported hook _ramConfidence() below — the ledger and FRACAS pages pick it
// up on next render.
//
// Born modular: page 'ram-settings'.
// ============================================================================
(function () {
    'use strict';

    function _store() {
        if (typeof projectConfig === 'undefined') return {};
        if (!projectConfig.ramSettings) projectConfig.ramSettings = {};
        const s = projectConfig.ramSettings;
        if (!(s.annualFH > 0)) s.annualFH = (projectConfig.mxAnalytics && projectConfig.mxAnalytics.annualFH) || 600;
        if (!(s.fleet > 0)) s.fleet = 1;
        if (!(s.confidence > 0 && s.confidence < 1)) s.confidence = 0.6;
        if (!(s.dutyDefault >= 0)) s.dutyDefault = 1;
        if (!(s.kNonopDefault >= 0)) s.kNonopDefault = 0.03;
        return s;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // hook other modules can consult
    window._ramConfidence = () => _store().confidence;
    window._ramAnnualFH = () => _store().annualFH;
    window._ramFleet = () => _store().fleet;

    const FIELDS = [
        ['annualFH', 'Annual utilization (FH per aircraft per year)', 'drives MSG-3 interval ⇄ calendar conversion, PM optimizer, TLD budgets, LCC'],
        ['fleet', 'Fleet size (aircraft)', 'scales spares demand and LCC totals'],
        ['confidence', 'FRACAS one-sided confidence (0–1)', 'the level the chi-square MTBF lower bound uses in field-data verdicts; 0.60 is the customary demonstration level'],
        ['dutyDefault', 'Default duty cycle (0–1)', 'operating fraction for duty-composed rates (R5)'],
        ['kNonopDefault', 'Default nonoperating ratio K', 'λ_storage = K·λ_op default for the frameworks page'],
    ];

    window.ramSettingsEdit = function (key) {
        const s = _store();
        const f = FIELDS.find(x => x[0] === key);
        if (!f) return;
        const v = parseFloat(window.prompt(f[1] + ':', String(s[key])));
        if (!(v > 0) && !(key === 'dutyDefault' && v === 0)) return;
        if ((key === 'confidence' || key === 'dutyDefault') && v > 1) return;
        s[key] = v;
        // keep the older mxAnalytics store in step so existing pages agree
        if (key === 'annualFH' && projectConfig.mxAnalytics) projectConfig.mxAnalytics.annualFH = v;
        _save(); renderRamSettingsPage();
    };

    function renderRamSettingsPage() {
        const host = document.getElementById('ram-settings-host');
        if (!host) return;
        const s = _store();
        let html = '<table class="data-table" style="width:100%; max-width:860px; font-size:12.5px;"><thead><tr><th>Setting</th><th>Value</th><th>What it drives</th><th></th></tr></thead><tbody>' +
            FIELDS.map(([key, label, drives]) =>
                '<tr><td><b>' + label + '</b></td>' +
                '<td class="u-mono" style="font-size:13px;"><b>' + s[key] + '</b></td>' +
                '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + drives + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="ramSettingsEdit(\'' + key + '\')">edit</button></td></tr>').join('') +
            '</tbody></table>' +
            '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Every R&M module keeps a safe default when a setting is absent — changing a value here propagates on the next render of each page. ' +
            'Raising the FRACAS confidence makes VERIFIED harder to earn (the lower bound drops); it never relabels existing signed dispositions.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._ramSettingsWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-ram-settings');
                if (v) v.style.display = (tabId === 'ram-settings') ? 'block' : 'none';
                const s = document.getElementById('snav-ram-settings');
                if (s) s.classList.toggle('snav-active', tabId === 'ram-settings');
                if (tabId === 'ram-settings') renderRamSettingsPage();
            } catch (_) {}
            return r;
        };
        wrapped._ramSettingsWrapped = true;
        window.switchTab = wrapped;
    })();

    window.renderRamSettingsPage = renderRamSettingsPage;
})();
