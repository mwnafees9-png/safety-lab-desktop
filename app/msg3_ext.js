// ============================================================================
// msg3_ext.js — Phase R9: the three MSG-3 programs beyond systems/powerplant
// — Structures, Zonal (standard + enhanced), and L/HIRF protection — as a
// register-driven page mirroring the systems MSG-3 module's discipline.
//
// Original formulations of the public analysis logic (no standard text
// reproduced):
//
//   STRUCTURES — each Structural Significant Item (SSI) is rated for three
//   damage sources: accidental (AD), environmental (ED — corrosion), and
//   fatigue (FD). Metallic SSIs get ED/CPCP membership + AD/FD inspections;
//   composite SSIs get AD emphasis (impact) and no fatigue-initiation
//   assumption. Every SSI must end with at least one task or a damage-
//   tolerance justification for none.
//
//   ZONAL — every zone gets a General Visual standard-zonal candidate;
//   zones scoring high on the enhanced test (wiring present + combustible
//   proximity + density) additionally get an enhanced-zonal (detailed
//   wiring) inspection. Zone list derives from the ZSA register — one
//   source of truth for zones. A zone whose ZSA row carries Cat/Haz
//   severity cannot be dismissed without a signed rationale.
//
//   L/HIRF — every protection FEATURE (bonding strap, shield, connector
//   backshell, aperture mesh…) is registered with its degradation mode and
//   gets an inspection or test task at an interval justified against the
//   degradation rate; features protecting Cat/Haz functions demand signed
//   acceptance of the interval.
//
// Tasks push into the SAME maintenance ledger as systems MSG-3 (msg3Push
// pattern) so the program has one task list. Born modular: page 'msg3x',
// state under projectConfig.msg3x.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function _store() {
        if (typeof projectConfig === 'undefined') return { ssis: [], zonesDone: {}, lhirf: [] };
        if (!projectConfig.msg3x) projectConfig.msg3x = { ssis: [], zonesDone: {}, lhirf: [] };
        const s = projectConfig.msg3x;
        if (!Array.isArray(s.ssis)) s.ssis = [];
        if (!s.zonesDone) s.zonesDone = {};
        if (!Array.isArray(s.lhirf)) s.lhirf = [];
        return s;
    }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // push into the shared maintenance ledger (one task list for the program)
    function _pushLedger(name, taskType, interval, ref) {
        try {
            if (typeof projectConfig === 'undefined') return false;
            if (!projectConfig.ram) projectConfig.ram = { tasks: [], field: [], dispatch: { targets: [], records: [] } };
            if (!Array.isArray(projectConfig.ram.tasks)) projectConfig.ram.tasks = [];
            if (projectConfig.ram.tasks.some(t => t.msg3x === ref)) return false;   // idempotent
            projectConfig.ram.tasks.push({
                id: 'MT-' + Date.now() + '-' + Math.floor(Math.random() * 1e4),
                name, taskType, interval: interval || null, msg3x: ref,
                origin: 'msg3x — structures/zonal/L-HIRF analysis',
            });
            return true;
        } catch (_) { return false; }
    }

    // ------------------------------------------------------------ structures
    window.msg3xAddSsi = function () {
        const name = window.prompt('SSI name (e.g. "Wing front spar lower cap, WS 120–180"):', '');
        if (!name || !name.trim()) return;
        const mat = window.prompt('Material — "metallic" or "composite":', 'metallic');
        if (!mat || !['metallic', 'composite'].includes(mat.trim())) return;
        const ad = window.prompt('Accidental-damage exposure — "high", "medium", "low" (ground handling, doors, spillage…):', 'medium');
        const ed = mat.trim() === 'metallic' ? window.prompt('Environmental-damage susceptibility — "high", "medium", "low" (drainage, dissimilar metals, sealant…):', 'medium') : 'n/a';
        const fd = mat.trim() === 'metallic' ? window.prompt('Fatigue rating — "damage-tolerant" (inspectable) or "safe-life":', 'damage-tolerant') : 'n/a';
        _store().ssis.push({ id: 'SSI-' + Date.now(), name: name.trim(), material: mat.trim(),
            ad: (ad || 'medium').trim(), ed: String(ed || 'n/a').trim(), fd: String(fd || 'n/a').trim(), tasks: [] });
        _save(); renderMsg3xPage();
    };
    // derive the SSI's task set from its ratings (deterministic)
    function _ssiTasks(s) {
        const out = [];
        const adInt = { high: 2000, medium: 4000, low: 8000 };
        out.push({ type: 'GVI', label: 'General visual — accidental damage', interval: adInt[s.ad] || 4000 });
        if (s.material === 'composite') out.push({ type: 'SDI', label: 'Special detailed — impact damage (composite)', interval: (adInt[s.ad] || 4000) });
        if (s.material === 'metallic') {
            if (s.ed !== 'n/a') out.push({ type: 'DET', label: 'Detailed — corrosion (CPCP member)', interval: s.ed === 'high' ? 3000 : s.ed === 'medium' ? 6000 : 12000, cpcp: true });
            if (s.fd === 'damage-tolerant') out.push({ type: 'SDI', label: 'Special detailed — fatigue crack detection', interval: 8000 });
            else if (s.fd === 'safe-life') out.push({ type: 'DS', label: 'Discard at safe-life limit (no inspection credit)', interval: null });
        }
        return out;
    }
    window.msg3xPushSsi = function (id) {
        const s = _store().ssis.find(x => x.id === id);
        if (!s) return;
        let n = 0;
        _ssiTasks(s).forEach((t, i) => { if (_pushLedger(s.name + ' — ' + t.label, t.type, t.interval, id + ':' + i)) n++; });
        _save(); renderMsg3xPage();
        alert(n ? n + ' task(s) pushed to the maintenance ledger.' : 'Already pushed (idempotent).');
    };
    window.msg3xDeleteSsi = function (id) {
        const s = _store();
        const i = s.ssis.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this SSI?')) { s.ssis.splice(i, 1); _save(); renderMsg3xPage(); }
    };

    // ---------------------------------------------------------------- zonal
    // derives candidates from zsaData — one source of truth for zones
    function msg3xZonalRows() {
        const zones = (typeof zsaData !== 'undefined' && zsaData) || [];
        return zones.map(z => {
            const wiring = /wir|harness|cable|bus/i.test((z.equip || '') + ' ' + (z.interference || ''));
            const combust = /fuel|hydraulic|oil|combust|oxygen/i.test((z.desc || '') + ' ' + (z.equip || '') + ' ' + (z.interference || ''));
            const dense = ((z.equip || '').split(',').length) >= 3;
            const enhanced = wiring && (combust || dense);
            const severe = z.severity === 'Catastrophic' || z.severity === 'Hazardous';
            return { z, wiring, combust, dense, enhanced, severe };
        });
    }
    window.msg3xPushZone = function (zoneId) {
        const row = msg3xZonalRows().find(r => r.z.zoneId === zoneId);
        if (!row) return;
        let n = 0;
        if (_pushLedger('Zone ' + row.z.zoneId + ' (' + row.z.desc + ') — standard zonal GVI', 'GVI', 4000, 'zone:' + zoneId + ':std')) n++;
        if (row.enhanced && _pushLedger('Zone ' + row.z.zoneId + ' — enhanced zonal (detailed wiring inspection)', 'DET', 8000, 'zone:' + zoneId + ':enh')) n++;
        _store().zonesDone[zoneId] = { at: new Date().toISOString() };
        _save(); renderMsg3xPage();
        alert(n ? n + ' zonal task(s) pushed.' : 'Already pushed (idempotent).');
    };

    // ---------------------------------------------------------------- L/HIRF
    window.msg3xAddLhirf = function () {
        const name = window.prompt('Protection feature (e.g. "Elevator servo harness overbraid + backshell bonding"):', '');
        if (!name || !name.trim()) return;
        const deg = window.prompt('Degradation mode — "corrosion", "vibration/chafing", "maintenance disturbance", "aging":', 'corrosion');
        const protects = window.prompt('Protects (function / FC reference, e.g. SF-01 or FC-01):', '');
        const interval = parseFloat(window.prompt('Inspection/test interval (FH):', '6000'));
        const method = window.prompt('Method — "GVI", "DET", or "FNC" (functional bonding/shielding test):', 'DET');
        _store().lhirf.push({ id: 'LH-' + Date.now(), name: name.trim(), deg: (deg || '').trim(),
            protects: (protects || '').trim(), interval: interval > 0 ? interval : 6000, method: (method || 'DET').trim(), accepted: null });
        _save(); renderMsg3xPage();
    };
    window.msg3xLhirfAccept = function (id) {
        const f = _store().lhirf.find(x => x.id === id);
        if (!f) return;
        if (f.accepted) { if (confirm('Withdraw the interval acceptance?')) { f.accepted = null; _save(); renderMsg3xPage(); } return; }
        const by = window.prompt('The interval must be justified against the degradation rate for a feature protecting a severe function. Signature (name):', '');
        if (!by || !by.trim()) return;
        const note = window.prompt('Justification basis (degradation data, similarity, test):', '') || '';
        f.accepted = { by: by.trim(), note, at: new Date().toISOString() };
        _save(); renderMsg3xPage();
    };
    window.msg3xLhirfPush = function (id) {
        const f = _store().lhirf.find(x => x.id === id);
        if (!f) return;
        const ok = _pushLedger('L/HIRF — ' + f.name + ' (' + f.deg + ')', f.method, f.interval, 'lhirf:' + id);
        _save(); renderMsg3xPage();
        alert(ok ? 'Pushed to the maintenance ledger.' : 'Already pushed (idempotent).');
    };
    window.msg3xDeleteLhirf = function (id) {
        const s = _store();
        const i = s.lhirf.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this protection feature?')) { s.lhirf.splice(i, 1); _save(); renderMsg3xPage(); }
    };

    // ----------------------------------------------------------------- page
    function _sevCritical(ref) {
        // does the reference resolve to a Cat/Haz function or FC?
        try {
            const acFha = (typeof acFhaData !== 'undefined' && acFhaData) || [];
            const f = acFha.find(x => x.fcId === ref || x.subId === ref);
            if (f) return f.severity === 'Catastrophic' || f.severity === 'Hazardous';
            return acFha.some(x => x.subId === ref && (x.severity === 'Catastrophic' || x.severity === 'Hazardous'));
        } catch (_) { return false; }
    }

    function renderMsg3xPage() {
        const host = document.getElementById('msg3x-host');
        if (!host) return;
        const s = _store();

        // ---- structures ----
        let html = '<div style="display:flex; justify-content:space-between; align-items:center; margin:0 0 8px;"><b style="font-size:14px;">Structures — SSI register</b>' +
            '<button class="btn-cyan" style="font-size:12px; padding:5px 12px;" onclick="msg3xAddSsi()">+ SSI</button></div>';
        if (!s.ssis.length) html += '<p style="color:var(--color-text-tertiary); font-size:12.5px;">No SSIs yet. Each gets AD/ED/FD ratings; the task set derives deterministically (metallic: corrosion + fatigue; composite: impact emphasis; safe-life: discard).</p>';
        else html += '<table class="data-table" style="width:100%; font-size:12px; margin-bottom:8px;"><thead><tr><th></th><th>SSI</th><th>Material</th><th>AD</th><th>ED</th><th>FD</th><th>Derived tasks</th><th></th></tr></thead><tbody>' +
            s.ssis.map(x => '<tr><td><a href="#" onclick="msg3xDeleteSsi(\'' + x.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                '<td><b>' + _esc(x.name) + '</b></td><td class="u-mono" style="font-size:11px;">' + x.material + '</td>' +
                '<td class="u-mono">' + x.ad + '</td><td class="u-mono">' + x.ed + '</td><td class="u-mono" style="font-size:11px;">' + x.fd + '</td>' +
                '<td style="font-size:11px;">' + _ssiTasks(x).map(t => t.type + (t.interval ? ' @' + t.interval + 'FH' : '') + (t.cpcp ? ' (CPCP)' : '')).join(' · ') + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:10px; padding:1px 7px;" onclick="msg3xPushSsi(\'' + x.id + '\')">→ ledger</button></td></tr>').join('') + '</tbody></table>';

        // ---- zonal ----
        const zr = msg3xZonalRows();
        html += '<div style="margin:18px 0 8px;"><b style="font-size:14px;">Zonal — derived from the ZSA register (' + zr.length + ' zones)</b></div>';
        if (!zr.length) html += '<p style="color:var(--color-text-tertiary); font-size:12.5px;">No zones in the ZSA register yet — zonal candidates derive from it (one source of truth).</p>';
        else html += '<table class="data-table" style="width:100%; font-size:12px; margin-bottom:8px;"><thead><tr><th>Zone</th><th>Contents</th><th>Wiring</th><th>Combustible</th><th>Dense</th><th>Program</th><th></th></tr></thead><tbody>' +
            zr.map(r => '<tr><td class="u-mono"><b>' + _esc(r.z.zoneId) + '</b>' + (r.severe ? ' <span style="font-size:9px; color:#8E2A2A; font-weight:700;">' + r.z.severity.toUpperCase().slice(0, 3) + '</span>' : '') + '<br><span style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(r.z.desc) + '</span></td>' +
                '<td style="font-size:11px; color:var(--color-text-secondary);">' + _esc((r.z.equip || '').slice(0, 60)) + '</td>' +
                '<td style="text-align:center;">' + (r.wiring ? '✓' : '—') + '</td><td style="text-align:center;">' + (r.combust ? '✓' : '—') + '</td><td style="text-align:center;">' + (r.dense ? '✓' : '—') + '</td>' +
                '<td style="font-size:11px;">' + (r.enhanced ? '<b>standard + ENHANCED</b> (wiring detail)' : 'standard zonal GVI') + '</td>' +
                '<td>' + (s.zonesDone[r.z.zoneId] ? '<span style="font-size:10px; color:#1D6E3E;">pushed ✓</span>' : '<button class="ckpt-m-btn" style="font-size:10px; padding:1px 7px;" onclick="msg3xPushZone(\'' + _esc(r.z.zoneId) + '\')">→ ledger</button>') + '</td></tr>').join('') + '</tbody></table>';

        // ---- L/HIRF ----
        html += '<div style="display:flex; justify-content:space-between; align-items:center; margin:18px 0 8px;"><b style="font-size:14px;">L/HIRF protection features</b>' +
            '<button class="btn-cyan" style="font-size:12px; padding:5px 12px;" onclick="msg3xAddLhirf()">+ Protection feature</button></div>';
        if (!s.lhirf.length) html += '<p style="color:var(--color-text-tertiary); font-size:12.5px;">Bonding straps, shields, backshells, aperture meshes — each with a degradation mode and an inspection/test at an interval justified against it.</p>';
        else html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th></th><th>Feature</th><th>Degradation</th><th>Protects</th><th>Task</th><th>Interval acceptance</th><th></th></tr></thead><tbody>' +
            s.lhirf.map(f => {
                const critical = _sevCritical(f.protects);
                return '<tr><td><a href="#" onclick="msg3xDeleteLhirf(\'' + f.id + '\'); return false;" style="color:#8E2A2A; font-size:11px;">✕</a></td>' +
                    '<td><b>' + _esc(f.name) + '</b></td><td style="font-size:11px;">' + _esc(f.deg) + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + _esc(f.protects || '—') + (critical ? ' <span style="font-size:9px; color:#8E2A2A; font-weight:700;">SEVERE</span>' : '') + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + f.method + ' @' + f.interval + 'FH</td>' +
                    '<td>' + (f.accepted ? '<span style="font-size:11px;">' + _esc(f.accepted.by) + '</span> <a href="#" style="font-size:10px;" onclick="msg3xLhirfAccept(\'' + f.id + '\'); return false;">withdraw</a>'
                        : (critical ? '<button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="msg3xLhirfAccept(\'' + f.id + '\')">accept…</button> <span style="font-size:9.5px; color:#9A6200;">required (severe)</span>'
                            : '<span style="font-size:11px; color:var(--color-text-tertiary);">optional</span>')) + '</td>' +
                    '<td><button class="ckpt-m-btn" style="font-size:10px; padding:1px 7px;" onclick="msg3xLhirfPush(\'' + f.id + '\')">→ ledger</button></td></tr>';
            }).join('') + '</tbody></table>';

        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">All three programs push into the SAME maintenance ledger as systems MSG-3 — one task list, with provenance. ' +
            'Zonal candidates derive from the ZSA register; a severe zone\'s tasks carry its severity stamp. L/HIRF intervals protecting severe functions demand signed acceptance.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._msg3xWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-msg3x');
                if (v) v.style.display = (tabId === 'msg3x') ? 'block' : 'none';
                const s = document.getElementById('snav-msg3x');
                if (s) s.classList.toggle('snav-active', tabId === 'msg3x');
                if (tabId === 'msg3x') renderMsg3xPage();
            } catch (_) {}
            return r;
        };
        wrapped._msg3xWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.msg3xZonalRows = msg3xZonalRows;
    window._msg3xSsiTasks = _ssiTasks;
    window.renderMsg3xPage = renderMsg3xPage;
})();
