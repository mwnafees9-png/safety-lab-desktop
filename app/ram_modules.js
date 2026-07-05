// ram_modules.js — Phase F (F1–F3): Reliability · Availability · Maintainability
// for Safety Lab Aero. BORN MODULAR: this file never edits the monolith — it
// reads its globals (classic-script load order), stores under projectConfig.ram
// (auto-serialized), and wraps switchTab instead of patching it.
//
//   F1 Maintainability ledger — MTTR/MDT tasks linked to LRUs and fault-tree
//      basic events; inspection intervals bridge INTO the CCMR machinery
//      (task interval → node.tau, so the latent sweep sees the maintenance
//      program — the safety↔maintainability link nobody else has).
//   F2 Availability / dispatch reliability — inherent Ai from λ + MTTR and
//      operational estimate from λ + MDT (computed lane, MIL-HDBK-338B
//      definitions); monthly dispatch records elicited from ops (elicited
//      lane); targets scored.
//   F3 FRACAS field lane — observed MTBF per linked event vs the model's
//      prediction; field worse than prediction = FINDING, never averaged in.

(function () {
    'use strict';

    // ------------------------------------------------------------- gating
    // RAM analyses are a Pro+ capability. Comped domains (Electra et al.) hold
    // Pro+ via getEffectiveTier(), so pilots keep access automatically.
    function _ramHasAccess() {
        try {
            if (typeof getEffectiveTier !== 'function' || typeof LICENSE_TIER_RANK === 'undefined') return true;   // headless / test
            const t = getEffectiveTier();
            return (LICENSE_TIER_RANK[t] || 0) >= (LICENSE_TIER_RANK['pro-plus'] || 2);
        } catch (_) { return true; }
    }
    function _ramGateHtml() {
        return '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; max-width:640px;">' +
            '<h3 style="margin:0 0 10px; border:none; padding:0;">R&amp;M — Dispatch &amp; Maintainability is a Pro+ capability</h3>' +
            '<p style="font-size:13.5px; color:var(--color-text-secondary); line-height:1.6; margin:0 0 14px;">' +
            'The RAM module adds the maintenance program to the safety model: MTTR/MDT task ledger linked to your LRUs and fault-tree events, ' +
            'computed inherent availability, dispatch-reliability tracking from operations records, the FRACAS field lane (observed MTBF vs the model\'s prediction), ' +
            'and the τ bridge that feeds inspection intervals straight into the CCMR latent sweep.</p>' +
            '<p style="font-size:12px; font-family:var(--font-mono); color:var(--color-text-tertiary); margin:0 0 16px;">Current plan: ' +
            _esc((typeof getEffectiveTier === 'function' ? getEffectiveTier() : 'unknown')) + '</p>' +
            '<button class="btn-cyan" onclick="try{ if(typeof openBillingModal===\'function\') openBillingModal(); else if(typeof openSubscribeModal===\'function\') openSubscribeModal(); else showToast(\'Upgrade via Settings → Subscription.\',\'info\',3500);}catch(_){}">Upgrade to Pro+</button></div>';
    }

    // ---------------------------------------------------------------- store
    function _ramStore() {
        if (!projectConfig.ram) projectConfig.ram = { tasks: [], field: [], dispatch: { targets: [], records: [] } };
        const r = projectConfig.ram;
        if (!Array.isArray(r.tasks)) r.tasks = [];
        if (!Array.isArray(r.field)) r.field = [];
        if (!r.dispatch) r.dispatch = { targets: [], records: [] };
        if (!Array.isArray(r.dispatch.targets)) r.dispatch.targets = [];
        if (!Array.isArray(r.dispatch.records)) r.dispatch.records = [];
        return r;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ------------------------------------------------------------- helpers
    // Find a basic event across all trees by displayId / logicalId / id
    // (reuses the monolith's type-tolerant walker when present).
    function _findBe(ref) {
        if (!ref) return null;
        try { if (typeof _fmesFindBe === 'function') return _fmesFindBe(ref); } catch (_) {}
        return null;
    }
    function _beLambda(node) {
        try { if (typeof getEffectiveLambda === 'function') return getEffectiveLambda(node) || 0; } catch (_) {}
        return (node && node.lambda) || 0;
    }
    const _mdt = t => (parseFloat(t.activeRepair) || 0) + (parseFloat(t.logistics) || 0) + (parseFloat(t.admin) || 0);
    // Availability per MIL-HDBK-338B §10: INHERENT Ai = MTBF/(MTBF+MTTR) uses
    // ACTIVE repair time only; including logistics/admin delays gives the
    // operational estimate Ao = MTBF/(MTBF+MDT). Time-base assumption (stated,
    // not hidden): λ is per flight hour, repair times are clock hours — the
    // ratio treats 1 FH ≈ 1 operating hour (utilization = 1).
    function _availOf(lambda, downH) {
        const m = lambda > 0 ? 1 / lambda : Infinity;
        return isFinite(m) ? m / (m + downH) : 1;
    }

    // ---- reliability statistics (MIL-HDBK-781A / chi-square demonstration) ----
    // One-sided lower confidence bound on MTBF from (T total hours, r failures):
    //   r = 0:  m_LCB = T / (−ln(1−C))                (zero-failure demonstration)
    //   r > 0:  m_LCB = 2T / χ²(C; 2r+2)              (time-terminated test)
    function _normInv(p) {   // Beasley–Springer rational approximation (|err| < 3e-4)
        const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
        const pl = 0.02425;
        if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
        if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
        const q = p - 0.5, r = q * q;
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    }
    function _chi2Quantile(p, k) {   // Wilson–Hilferty; exact closed form for k=2
        if (k === 2) return -2 * Math.log(1 - p);
        const z = _normInv(p), t = 2 / (9 * k);
        return k * Math.pow(1 - t + z * Math.sqrt(t), 3);
    }
    function _mtbfLcb(T, r, C) {
        if (!(T > 0) || r < 0) return null;
        if (r === 0) return T / (-Math.log(1 - C));
        return 2 * T / _chi2Quantile(C, 2 * r + 2);
    }
    const RAM_CONFIDENCE = 0.6;   // customary one-sided level for reliability demonstration
    // R10 — the program may raise the level via RAM Settings; absent = default.
    const _conf = () => { try { const v = typeof window._ramConfidence === 'function' ? window._ramConfidence() : null; return (v > 0 && v < 1) ? v : RAM_CONFIDENCE; } catch (_) { return RAM_CONFIDENCE; } };

    function _gated() {
        if (_ramHasAccess()) return false;
        _toast('R&M analyses require a Pro+ subscription.', 'warning', 3500);
        return true;
    }

    // ================================================================ F1 —
    // Maintainability ledger + the CCMR bridge.
    async function ramAddTask() {
        if (_gated()) return;
        const name = await _ask('Maintenance task name (e.g. "Elevator servo LRU swap"):'); if (!name || !name.trim()) return;
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        const itemId = (await _ask('Linked LRU / item id (optional):\n' + items.slice(0, 12).map(i => '  ' + i.itemId + ' — ' + i.name).join('\n'), '')) || '';
        const beRef = (await _ask('Linked fault-tree basic event (displayId / logicalId, optional — enables Ai + the CCMR τ bridge):', '')) || '';
        const act = parseFloat(await _ask('Active repair time (hours):', '0.5')) || 0;
        const log = parseFloat(await _ask('Logistics delay (hours):', '0.25')) || 0;
        const adm = parseFloat(await _ask('Admin delay (hours):', '0.1')) || 0;
        const itv = parseFloat(await _ask('Scheduled inspection/test interval (FH, 0 = on-condition):', '0')) || 0;
        _ramStore().tasks.push({
            id: 'RAM-' + Date.now(), name: name.trim(), itemId: itemId.trim(), beRef: beRef.trim(),
            activeRepair: act, logistics: log, admin: adm, interval: itv, demonstrated: null, by: '',
        });
        _save(); renderRamPage();
    }
    async function ramDemonstrate(id) {
        if (_gated()) return;
        const t = _ramStore().tasks.find(x => x.id === id); if (!t) return;
        const v = parseFloat(await _ask('Demonstrated repair time for "' + t.name + '" (hours):', t.demonstrated != null ? t.demonstrated : t.activeRepair));
        if (isNaN(v)) return;
        const by = (await _ask('Timed by (name):', '')) || '';
        t.demonstrated = v; t.by = by.trim();
        _save(); renderRamPage();
    }
    function ramDeleteTask(id) {
        const s = _ramStore();
        const i = s.tasks.findIndex(x => x.id === id);
        if (i >= 0 && confirm('Remove this task?')) { s.tasks.splice(i, 1); _save(); renderRamPage(); }
    }
    // The bridge: push a task's inspection interval onto its linked basic event
    // as a periodic-test τ — the CCMR latent sweep then bounds it live.
    async function ramApplyTau(id) {
        if (_gated()) return;
        const t = _ramStore().tasks.find(x => x.id === id); if (!t) return;
        if (!(t.interval > 0) || !t.beRef) { _toast('Task needs a linked basic event and a non-zero interval.', 'warning'); return; }
        const hit = _findBe(t.beRef);
        if (!hit) { _toast('No basic event matches "' + t.beRef + '" in any tree.', 'warning', 3500); return; }
        hit.node.repairModel = 'periodic';
        hit.node.tau = t.interval;
        _save();
        try { if (typeof ccmrLatentSweep === 'function') ccmrLatentSweep(true); } catch (_) {}
        _toast('τ = ' + t.interval + ' FH applied to ' + (hit.node.displayId || hit.node.name) + ' on "' + hit.page.name + '" — the CCMR sweep now bounds it.', 'success', 4500);
        renderRamPage();
    }

    // ================================================================ F3 —
    // FRACAS field lane.
    async function ramAddField() {
        if (_gated()) return;
        let hint = '';
        try { if (typeof window.fracasCandidates === 'function') { const c = window.fracasCandidates(); if (c.length) hint = '\nCandidates (derived from latents + FMEA links):\n' + c.map(x => '  ' + x.ref + ' — ' + x.why).join('\n'); } } catch (_) {}
        const beRef = (await _ask('Linked basic event (displayId / logicalId) the field data applies to:' + hint, '')) || '';
        if (!beRef.trim()) return;
        // Statistical entry (preferred): total fleet operating hours + failure
        // count → chi-square lower confidence bound (MIL-HDBK-781A). A bare
        // point MTBF is accepted but labeled as such.
        const T = parseFloat(await _ask('Total fleet operating hours in the window (blank for point-MTBF entry):', '')) || 0;
        let rec;
        if (T > 0) {
            const r = parseInt(await _ask('Failures observed in the window:', '0')) || 0;
            rec = { hours: T, failures: r };
        } else {
            const m = parseFloat(await _ask('Observed point MTBF (hours):', '50000')); if (!(m > 0)) return;
            rec = { observedMtbf: m };
        }
        const w = parseInt(await _ask('Observation window (months):', '12')) || 12;
        const by = (await _ask('Recorded by (name):', '')) || '';
        _ramStore().field.push(Object.assign({ id: 'FRC-' + Date.now(), beRef: beRef.trim(), windowMonths: w, by: by.trim(), at: new Date().toISOString() }, rec));
        _save(); renderRamPage();
    }
    // FRACAS is Reporting AND Corrective Action — every finding carries an
    // action with an open/closed state (NASA RAM Training ch.4: FRACA + concurrence).
    async function ramFracasAction(id) {
        if (_gated()) return;
        const f = _ramStore().field.find(x => x.id === id); if (!f) return;
        const action = (await _ask('Corrective action for this record:', f.action || '')) || '';
        if (!action.trim()) return;
        const closed = /^y/i.test(((await _ask('Is the action CLOSED (verified effective)? y/n:', f.actionClosed ? 'y' : 'n')) || '').trim());
        const by = (await _ask('Signed by:', f.actionBy || '')) || '';
        f.action = action.trim(); f.actionClosed = closed; f.actionBy = by.trim();
        _save(); renderRamRelPage();
    }

    function ramFieldRows() {
        return _ramStore().field.map(f => {
            const hit = _findBe(f.beRef);
            const lam = hit ? _beLambda(hit.node) : 0;
            const predicted = lam > 0 ? 1 / lam : null;
            const statistical = f.hours > 0 && f.failures != null;
            const point = statistical ? (f.failures > 0 ? f.hours / f.failures : null) : (f.observedMtbf || null);
            const lcb = statistical ? _mtbfLcb(f.hours, f.failures, _conf()) : null;
            // Verdict discipline: with statistical data, VERIFIED means the
            // 60%-confidence lower bound clears the prediction; a point estimate
            // below prediction is a FINDING; in between = keep accumulating hours.
            let verdict = 'unlinked';
            if (predicted != null) {
                if (statistical) {
                    if (lcb >= predicted) verdict = 'verified';
                    else if (point != null && point < predicted) verdict = 'finding';
                    else verdict = 'inconclusive';
                } else {
                    verdict = (point >= predicted) ? 'point-above' : 'finding';
                }
            }
            return { f, hit, predicted, point, lcb, statistical, verdict };
        });
    }

    // ================================================================ F2 —
    // Dispatch reliability / availability.
    async function ramAddDispatchRecord() {
        if (_gated()) return;
        const month = (await _ask('Month (YYYY-MM):', new Date().toISOString().slice(0, 7))) || '';
        if (!/^\d{4}-\d{2}$/.test(month.trim())) return;
        const cyc = parseInt(await _ask('Revenue departures (cycles):', '250')) || 0;
        const del = parseInt(await _ask('Technical delays > 15 min:', '2')) || 0;
        const cnc = parseInt(await _ask('Technical cancellations:', '0')) || 0;
        _ramStore().dispatch.records.push({ month: month.trim(), cycles: cyc, delays: del, cancellations: cnc });
        _save(); renderRamPage();
    }
    async function ramSetDispatchTarget() {
        if (_gated()) return;
        const v = parseFloat(await _ask('Dispatch reliability target (%):', '99.0'));
        if (!(v > 0 && v <= 100)) return;
        _ramStore().dispatch.targets = [{ name: 'Dispatch reliability', target: v }];
        _save(); renderRamPage();
    }
    function ramDispatchStats() {
        const R = _ramStore().dispatch.records;
        const cyc = R.reduce((a, r) => a + r.cycles, 0);
        const bad = R.reduce((a, r) => a + r.delays + r.cancellations, 0);
        return { cycles: cyc, interruptions: bad, dr: cyc > 0 ? (1 - bad / cyc) * 100 : null };
    }

    // ============================================================== render
    const _chip = (label, val, warn) =>
        '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' +
        label + ' <b style="margin-left:6px;' + (warn ? ' color:#B45309;' : '') + '">' + val + '</b></div>';

    // ---- Reliability page: prediction rollup + dispatch + FRACAS ----------
    // Prediction = the as-built λ picture from the verification trees: every
    // basic event with a rate, grouped by system, sourced (library key or
    // manual), with per-system Σλ / MTBF subtotals. Computed lane only.
    function _ramPredictionRows() {
        const groups = new Map();   // sysName -> rows
        ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
            if (!p || !p.root) return;
            if (!(p.verifies || p.mode === 'bottom-up')) return;   // as-built trees only
            const sysName = p.systemId
                ? ((((typeof systemsData !== 'undefined' ? systemsData : []) || []).find(s => s.id === p.systemId) || {}).name || String(p.systemId))
                : 'Aircraft level';
            (function walk(n, seen) {
                if (!n || seen.has(n.id)) return;
                seen.add(n.id);
                if (n.type !== 'gate') {
                    const lam = _beLambda(n);
                    if (lam > 0) {
                        if (!groups.has(sysName)) groups.set(sysName, []);
                        groups.get(sysName).push({
                            event: n.displayId || n.name || ('node ' + n.id), name: n.name || '',
                            page: p.name || p.id, lambda: lam,
                            source: n.libraryKey ? String(n.libraryKey) : 'manual entry',
                        });
                    }
                }
                (n.children || n._children || []).forEach(c => walk(c, seen));
            })(p.root, new Set());
        });
        return groups;
    }

    function renderRamRelPage() {
        const host = document.getElementById('ram-rel-host');
        if (!host) return;
        if (!_ramHasAccess()) { host.innerHTML = _ramGateHtml(); return; }
        const S = _ramStore();
        const ds = ramDispatchStats();
        const target = S.dispatch.targets[0];
        const field = ramFieldRows();
        const findings = field.filter(x => x.verdict === 'finding').length;
        const pred = _ramPredictionRows();
        let totalLambda = 0; pred.forEach(rows => rows.forEach(r => { totalLambda += r.lambda; }));

        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            _chip('Σλ (as-built)', totalLambda > 0 ? totalLambda.toExponential(2) + ' /FH' : '—') +
            _chip('System MTBF', totalLambda > 0 ? Math.round(1 / totalLambda).toLocaleString() + ' h' : '—') +
            _chip('Dispatch', ds.dr != null ? ds.dr.toFixed(2) + '%' : 'no data') +
            _chip('FRACAS findings', String(findings), findings > 0) + '</div>';

        // ---- prediction rollup
        html += '<h3>Reliability prediction — as-built λ rollup (computed lane)</h3>';
        if (!pred.size) {
            html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No verification trees with failure-rate data yet — populate mirrors (SSA) or bottom-up trees and the rollup builds itself.</p>';
        } else {
            pred.forEach((rows, sysName) => {
                const sub = rows.reduce((a, r) => a + r.lambda, 0);
                html += '<h4 style="font-size:12px; font-family:var(--font-mono); letter-spacing:0.06em; text-transform:uppercase; color:var(--color-text-secondary); margin:14px 0 6px;">' + _esc(sysName) +
                    ' — Σλ ' + sub.toExponential(2) + ' /FH · MTBF ' + Math.round(1 / sub).toLocaleString() + ' h</h4>';
                html += '<table class="data-table" style="width:100%; max-width:880px; font-size:12.5px;"><thead><tr><th>Basic event</th><th>Tree</th><th style="width:110px">λ (/FH)</th><th style="width:110px">MTBF (h)</th><th style="width:170px">Source</th><th style="width:110px">Share</th></tr></thead><tbody>' +
                    rows.sort((a, b) => b.lambda - a.lambda).map(r =>
                        '<tr><td class="u-mono">' + _esc(r.event) + '</td><td style="color:var(--color-text-tertiary);">' + _esc(r.page) + '</td>' +
                        '<td class="u-mono">' + r.lambda.toExponential(2) + '</td>' +
                        '<td class="u-mono">' + Math.round(1 / r.lambda).toLocaleString() + '</td>' +
                        '<td class="u-mono" style="font-size:11px;">' + _esc(r.source) + '</td>' +
                        '<td class="u-mono">' + (r.lambda / sub * 100).toFixed(1) + '%</td></tr>').join('') +
                    '</tbody></table>';
            });
            html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">λ via the engine (stress factors, CCF β where modeled) · exponential model · sources: component library keys or manual entry. Manage entries in the Component Library.</p>';
        }

        // ---- dispatch (elicited lane)
        html += '<div id="ram-dispatch-sec"></div>';
        html += '<h3 style="margin-top:var(--s-5);">Availability — dispatch reliability (elicited lane)</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="ramAddDispatchRecord()">+ Monthly record</button> ' +
            '<button class="btn-cyan" onclick="ramSetDispatchTarget()">Set target</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">from operations records — the computed lane never fills this</span></div>';
        html += '<table class="data-table" style="width:100%; max-width:720px; font-size:12.5px;"><thead><tr><th>Month</th><th>Departures</th><th>Tech delays &gt;15 min</th><th>Cancellations</th><th>DR %</th></tr></thead><tbody>';
        if (!S.dispatch.records.length) html += '<tr><td colspan="5" style="color:var(--color-text-tertiary);">No dispatch records yet.</td></tr>';
        S.dispatch.records.slice(-12).forEach(rr => {
            const dr = rr.cycles > 0 ? (1 - (rr.delays + rr.cancellations) / rr.cycles) * 100 : null;
            html += '<tr><td class="u-mono">' + _esc(rr.month) + '</td><td class="u-mono">' + rr.cycles + '</td><td class="u-mono">' + rr.delays + '</td><td class="u-mono">' + rr.cancellations + '</td>' +
                '<td class="u-mono">' + (dr != null ? dr.toFixed(2) + '%' : '—') + '</td></tr>';
        });
        html += '</tbody></table>';
        if (ds.dr != null) {
            const meets = target ? ds.dr >= target.target : null;
            html += '<p style="font-size:12px; font-family:var(--font-mono); margin-top:8px;">Cumulative: ' + ds.cycles + ' departures · ' + ds.interruptions + ' interruptions · DR ' + ds.dr.toFixed(2) + '%' +
                (target ? ' vs target ' + target.target + '% — ' + (meets ? '<span style="color:#1D9E75;">meets ✓</span>' : '<span style="color:#B45309;">below ⚠</span>') : ' · <a href="#" onclick="ramSetDispatchTarget(); return false;">set a target</a>') + '</p>';
        }

        // ---- FRACAS (statistical lane check)
        html += '<h3 style="margin-top:var(--s-5);">FRACAS — field lane vs prediction (MIL-HDBK-781A)</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="ramAddField()">+ Field record</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">verified = 60% lower confidence bound clears the prediction; field below prediction = finding, never averaged in</span></div>';
        html += '<table class="data-table" style="width:100%; max-width:980px; font-size:12.5px;"><thead><tr><th>Basic event</th><th>Predicted MTBF</th><th>Field data (window)</th><th>MTBF LCB (60%)</th><th>Verdict</th><th>Corrective action</th><th>By</th></tr></thead><tbody>';
        if (!field.length) html += '<tr><td colspan="6" style="color:var(--color-text-tertiary);">No field data yet.</td></tr>';
        field.forEach(x => {
            const dataTxt = x.statistical
                ? Math.round(x.f.hours).toLocaleString() + ' h · ' + x.f.failures + ' failure' + (x.f.failures === 1 ? '' : 's') + ' (' + x.f.windowMonths + ' mo)'
                : (x.point != null ? Math.round(x.point).toLocaleString() + ' h point (' + x.f.windowMonths + ' mo)' : '—');
            html += '<tr><td class="u-mono">' + (x.hit ? _esc(x.hit.node.displayId || x.f.beRef) : _esc(x.f.beRef) + ' ?') + '</td>' +
                '<td class="u-mono">' + (x.predicted != null ? Math.round(x.predicted).toLocaleString() + ' h' : '—') + '</td>' +
                '<td class="u-mono">' + dataTxt + '</td>' +
                '<td class="u-mono">' + (x.lcb != null ? Math.round(x.lcb).toLocaleString() + ' h' : '—') + '</td>' +
                '<td>' + (x.verdict === 'verified' ? '<span style="color:#1D9E75; font-family:var(--font-mono); font-size:11px;">✓ VERIFIED — LCB ≥ prediction (χ², 60%)</span>'
                    : x.verdict === 'finding' ? '<span style="color:#8E2A2A; font-family:var(--font-mono); font-size:11px;">FINDING — field challenges the prediction</span>'
                    : x.verdict === 'inconclusive' ? '<span style="color:#9A6200; font-family:var(--font-mono); font-size:11px;">INCONCLUSIVE — accumulate hours</span>'
                    : x.verdict === 'point-above' ? '<span style="color:var(--color-text-secondary); font-family:var(--font-mono); font-size:11px;">point ≥ prediction (no confidence bound)</span>'
                    : '<span style="color:var(--color-text-tertiary);">unlinked</span>') + '</td>' +
                '<td class="clickable" style="font-size:11.5px;" onclick="ramFracasAction(\'' + x.f.id + '\')">' +
                (x.f.action ? _esc(x.f.action.slice(0, 60)) + ' · ' + (x.f.actionClosed ? '<span style="color:#1D9E75;" class="u-mono">CLOSED</span>' : '<span style="color:#9A6200;" class="u-mono">OPEN</span>')
                    : (x.verdict === 'finding' ? '<span style="color:#8E2A2A;">action required…</span>' : '<span class="prov">record…</span>')) + '</td>' +
                '<td>' + _esc(x.f.by || '') + '</td></tr>';
        });
        html += '</tbody></table>';
        const openActions = field.filter(x => x.verdict === 'finding' && !(x.f.action && x.f.actionClosed)).length;
        if (openActions) html += '<p style="font-size:12px; font-family:var(--font-mono); color:#9A6200; margin-top:8px;">' + openActions + ' finding(s) without a CLOSED corrective action — FRACAS is not reporting, it is reporting + corrective action + concurrence.</p>';
        host.innerHTML = html;
    }

    // ---- Maintainability page: MTTR/MDT task ledger + τ bridge ------------
    function renderRamMxPage() {
        const host = document.getElementById('ram-mx-host');
        if (!host) return;
        if (!_ramHasAccess()) { host.innerHTML = _ramGateHtml(); return; }
        const S = _ramStore();
        const _pageFcMap = _ramPageFcMap();
        const taskRows = S.tasks.map(t => {
            const hit = t.beRef ? _findBe(t.beRef) : null;
            const lam = hit ? _beLambda(hit.node) : 0;
            const mdtH = _mdt(t);
            const fcs = hit ? Array.from(_ramFcsForBeRef(t.beRef, _pageFcMap)).map(_ramFcIdOf).filter(Boolean) : [];
            return { t, hit, lam, mdtH, fcs,
                     ai: lam > 0 ? _availOf(lam, parseFloat(t.activeRepair) || 0) : null,
                     ao: lam > 0 ? _availOf(lam, mdtH) : null };
        });
        const meanMttr = (() => {
            let n = 0, d = 0;
            taskRows.forEach(r => { const w = r.lam || 1e-9; n += w * (r.t.activeRepair || 0); d += w; });
            return d > 0 ? n / d : 0;
        })();
        const fleetAi = taskRows.filter(r => r.ai != null).reduce((a, r) => a * r.ai, 1);

        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            _chip('Tasks', String(S.tasks.length)) +
            _chip('Mean MTTR (λ-wt)', meanMttr ? (meanMttr * 60).toFixed(0) + ' min' : '—') +
            _chip('Linked-item Ai', taskRows.some(r => r.ai != null) ? (fleetAi * 100).toFixed(4) + '%' : '—') + '</div>';

        html += '<h3>Task ledger</h3>' +
            '<div style="margin:0 0 10px;"><button class="btn-cyan" onclick="ramAddTask()">+ Add task</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">MDT = active + logistics + admin (MIL-HDBK-338B) · link a basic event to compute Ai/Ao and enable the CCMR τ bridge · ⇢ shows the golden threads the task protects</span></div>';
        html += '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12.5px;"><thead><tr>' +
            '<th>Task</th><th>LRU</th><th>Basic event</th><th>λ (/FH)</th><th>MTTR (h)</th><th>MDT (h)</th><th>Ai</th><th>Ao (est)</th><th>Interval (FH)</th><th>Demonstrated</th><th></th></tr></thead><tbody>';
        if (!taskRows.length) html += '<tr><td colspan="11" style="color:var(--color-text-tertiary);">No tasks yet — the maintenance program starts here (or push tasks from the MSG-3 analysis).</td></tr>';
        taskRows.forEach(r => {
            const t = r.t;
            const demoOk = t.demonstrated != null ? t.demonstrated <= (t.activeRepair || 0) : null;
            html += '<tr><td>' + _esc(t.name) + (t.msg3 ? ' <span style="font-size:9.5px; font-family:var(--font-mono); border:1px solid currentColor; padding:0 4px; color:var(--color-text-tertiary);" title="derived from MSG-3 analysis ' + _esc(t.msg3) + '">MSG-3</span>' : '') + '</td>' +
                '<td class="u-mono">' + _esc(t.itemId || '—') + '</td>' +
                '<td class="u-mono"' + (r.fcs.length ? ' title="on the golden thread of: ' + _esc(r.fcs.join(', ')) + '"' : '') + '>' + (r.hit ? _esc(r.hit.node.displayId || t.beRef) + ' <span style="color:#1D9E75;">✓</span>' + (r.fcs.length ? ' <span style="color:var(--color-text-tertiary); font-size:10px;">⇢ ' + _esc(r.fcs.slice(0, 3).join(', ')) + (r.fcs.length > 3 ? '…' : '') + '</span>' : '') : (t.beRef ? _esc(t.beRef) + ' <span style="color:#B45309;" title="no match in any tree">?</span>' : '—')) + '</td>' +
                '<td class="u-mono">' + (r.lam > 0 ? r.lam.toExponential(1) : '—') + '</td>' +
                '<td class="u-mono">' + (t.activeRepair || 0).toFixed(2) + '</td>' +
                '<td class="u-mono">' + r.mdtH.toFixed(2) + '</td>' +
                '<td class="u-mono">' + (r.ai != null ? (r.ai * 100).toFixed(4) + '%' : '—') + '</td>' +
                '<td class="u-mono">' + (r.ao != null ? (r.ao * 100).toFixed(4) + '%' : '—') + '</td>' +
                '<td class="u-mono">' + (t.interval > 0 ? t.interval : '—') +
                (t.interval > 0 && r.hit ? ' <button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 6px;" title="Set this interval as the event\'s periodic-test τ — the CCMR sweep will bound it" onclick="ramApplyTau(\'' + t.id + '\')">→ τ</button>' : '') + '</td>' +
                '<td class="u-mono">' + (t.demonstrated != null
                    ? t.demonstrated.toFixed(2) + ' h ' + (demoOk ? '<span style="color:#1D9E75;">✓</span>' : '<span style="color:#B45309;">⚠ over</span>') + (t.by ? ' <span style="color:var(--color-text-tertiary); font-size:10.5px;">' + _esc(t.by) + '</span>' : '')
                    : '<a href="#" onclick="ramDemonstrate(\'' + t.id + '\'); return false;">record…</a>') + '</td>' +
                '<td><button class="node-delete-btn-inner" style="font-size:11px;" title="remove" onclick="ramDeleteTask(\'' + t.id + '\')">✕</button></td></tr>';
        });
        html += '</tbody></table></div>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:14px;">Two-lane discipline: Ai/Ao computed from the live model; demonstrated times elicited from timed demonstrations. Intervals claimed here should own the periodic-test τ of their events — the golden-thread gaps line flags any that do not.</p>';
        host.innerHTML = html;
    }

    // Legacy single-page entry (deep links, harness): renders the ledger.
    function renderRamPage() { renderRamMxPage(); renderRamRelPage(); }


    // ==================================================== golden thread —
    // RAM evidence joins the certification trace. Each failure-condition
    // thread gains an 'R&M Evidence' column (maintenance tasks owning the
    // thread's events + FRACAS posture), and the gaps line learns two RAM
    // gaps: periodic-test intervals no maintenance task owns (an interval
    // claimed in the safety analysis with no maintenance program behind it
    // is an unsubstantiated assumption), and open FRACAS findings.

    // Map every FTA page to the failure-condition internalIds it serves,
    // following TRANSFER links: an aircraft tree's FC also covers the events
    // of the system trees it transfers into.
    function _ramPageFcMap() {
        const map = new Map();   // pageId -> Set(fcInternalId)
        const pages = (typeof ftaPages !== 'undefined' ? ftaPages : []) || [];
        pages.forEach(p => {
            const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            map.set(String(p.id), new Set(ids.map(String)));
        });
        // propagate across TRANSFER gates (fixpoint; graphs are tiny)
        let changed = true, guard = 0;
        while (changed && guard++ < 20) {
            changed = false;
            pages.forEach(p => {
                const from = map.get(String(p.id));
                if (!from || !from.size || !p.root) return;
                (function walk(n, seen) {
                    if (!n || seen.has(n.id)) return;
                    seen.add(n.id);
                    if (n.gateType === 'TRANSFER' && n.linkedPageId) {
                        const to = map.get(String(n.linkedPageId));
                        if (to) from.forEach(id => { if (!to.has(id)) { to.add(id); changed = true; } });
                    }
                    (n.children || n._children || []).forEach(c => walk(c, seen));
                })(p.root, new Set());
            });
        }
        return map;
    }
    // fcInternalId(s) served by the page a task/field record's event lives on.
    function _ramFcsForBeRef(beRef, pageFcMap) {
        const hit = _findBe(beRef);
        if (!hit) return new Set();
        return pageFcMap.get(String(hit.page.id)) || new Set();
    }
    function _ramFcIdOf(internalId) {
        const want = String(internalId);
        const ac = (typeof acFhaData !== 'undefined' ? acFhaData : []).find(f => String(f.internalId) === want);
        if (ac) return ac.fcId;
        for (const s of (typeof systemsData !== 'undefined' ? systemsData : [])) {
            const f = (s.fha || []).find(x => String(x.internalId) === want);
            if (f) return f.fcId;
        }
        return null;
    }
    // Per-FC R&M evidence summary + thread-level gap census.
    function ramThreadEvidence() {
        const S = _ramStore();
        const pageFcMap = _ramPageFcMap();
        const byFcId = new Map();   // fcId -> { tasks: [], fracas: [] }
        const get = fcId => { if (!byFcId.has(fcId)) byFcId.set(fcId, { tasks: [], fracas: [] }); return byFcId.get(fcId); };
        S.tasks.forEach(t => {
            if (!t.beRef) return;
            _ramFcsForBeRef(t.beRef, pageFcMap).forEach(iid => {
                const fcId = _ramFcIdOf(iid);
                if (fcId) get(fcId).tasks.push(t);
            });
        });
        ramFieldRows().forEach(x => {
            if (!x.f.beRef) return;
            _ramFcsForBeRef(x.f.beRef, pageFcMap).forEach(iid => {
                const fcId = _ramFcIdOf(iid);
                if (fcId) get(fcId).fracas.push(x);
            });
        });
        // Gap: periodic/latent events with no owning maintenance task.
        const owned = new Set(S.tasks.map(t => { const h = _findBe(t.beRef); return h ? String(h.node.id) : null; }).filter(Boolean));
        let unowned = 0;
        ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).forEach(p => {
            if (!p.root) return;
            (function walk(n, seen) {
                if (!n || seen.has(n.id)) return;
                seen.add(n.id);
                if (n.type !== 'gate' && ((n.repairModel === 'periodic' && n.tau > 0) || (n.exposureMode === 'latent' && n.dormancyInterval > 0)) && !owned.has(String(n.id))) unowned++;
                (n.children || n._children || []).forEach(c => walk(c, seen));
            })(p.root, new Set());
        });
        return { byFcId, unowned, findings: ramFieldRows().filter(x => x.verdict === 'finding').length };
    }
    window.ramThreadEvidence = ramThreadEvidence;

    // Wrap the golden-thread builders (global declarations — same rebinding
    // discipline as switchTab; the GTT report and the Sankey both call these).
    (function wrapGoldenThread() {
        if (typeof window._gtvReportRows !== 'function' || window._gtvReportRows._ramWrapped) return;
        const origRows = window._gtvReportRows;
        const wrappedRows = function (functionSubId) {
            const rows = origRows.apply(this, arguments);
            try {
                const ev = ramThreadEvidence();
                rows.forEach(r => {
                    const e = ev.byFcId.get(r['FC ID']);
                    if (!e || (!e.tasks.length && !e.fracas.length)) { r['R&M Evidence'] = '—'; return; }
                    const bits = [];
                    if (e.tasks.length) {
                        const withTau = e.tasks.filter(t => t.interval > 0);
                        bits.push(e.tasks.length + ' maint task' + (e.tasks.length === 1 ? '' : 's') +
                            (withTau.length ? ' (τ ' + withTau.map(t => t.interval).join('/') + ' FH)' : ''));
                    }
                    if (e.fracas.length) {
                        const v = e.fracas.some(x => x.verdict === 'finding') ? 'FINDING'
                            : e.fracas.every(x => x.verdict === 'verified') ? 'verified'
                            : 'in work';
                        bits.push('FRACAS: ' + v);
                    }
                    r['R&M Evidence'] = bits.join(' · ');
                });
            } catch (_) { /* the thread must render even if RAM eval fails */ }
            return rows;
        };
        wrappedRows._ramWrapped = true;
        window._gtvReportRows = wrappedRows;

        if (typeof window._gtvReportGaps === 'function' && !window._gtvReportGaps._ramWrapped) {
            const origGaps = window._gtvReportGaps;
            const wrappedGaps = function (functionSubId) {
                let out = origGaps.apply(this, arguments);
                try {
                    const ev = ramThreadEvidence();
                    if (ev.unowned) out += ' ' + ev.unowned + ' periodic-test/latent interval' + (ev.unowned === 1 ? '' : 's') + ' in the trees with NO owning maintenance task — an interval claimed in the safety analysis without a maintenance program behind it is an unsubstantiated assumption.';
                    if (ev.findings) out += ' ' + ev.findings + ' open FRACAS finding' + (ev.findings === 1 ? '' : 's') + ' — field data challenges a prediction the threads rest on.';
                } catch (_) {}
                return out;
            };
            wrappedGaps._ramWrapped = true;
            window._gtvReportGaps = wrappedGaps;
        }
    })();

    // ------------------------------------------------- navigation wrapper
    // Pro+ ONLY in the nav: the whole R&M group stays hidden below Pro+ — no
    // badge, no upsell in the sidebar. Re-checked on every navigation so a
    // sign-in or upgrade mid-session reveals it without a reload. Deep links
    // (switchTab('ram')) below Pro+ land on the in-page gate panel, which is
    // where the upgrade pitch lives.
    function _ramSyncNav() {
        try {
            const ok = _ramHasAccess();
            const mx = document.getElementById('asb-grp-ram-mx');
            if (mx) mx.style.display = ok ? '' : 'none';
            document.querySelectorAll('.ram-proplus').forEach(el => { el.style.display = ok ? '' : 'none'; });
        } catch (_) {}
    }
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._ramWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            if (tabId === 'ram') tabId = 'ram-mx';   // legacy deep links
            const r = orig.apply(this, arguments.length ? [tabId].concat([].slice.call(arguments, 1)) : [tabId]);
            try {
                _ramSyncNav();
                ['ram-rel', 'ram-mx', 'ram-msg3'].forEach(id => {
                    const v = document.getElementById('view-' + id);
                    if (v) v.style.display = (tabId === id) ? 'block' : 'none';
                    const s = document.getElementById('snav-' + id);
                    if (s) s.classList.toggle('snav-active', tabId === id);
                });
                if (tabId === 'ram-rel') renderRamRelPage();
                if (tabId === 'ram-mx') renderRamMxPage();
                if (tabId === 'ram-msg3' && typeof window.renderMsg3Page === 'function') window.renderMsg3Page();
            } catch (_) {}
            return r;
        };
        wrapped._ramWrapped = true;
        window.switchTab = wrapped;
    })();
    _ramSyncNav();
    try { document.addEventListener('DOMContentLoaded', _ramSyncNav); } catch (_) {}
    try { setTimeout(_ramSyncNav, 1500); } catch (_) {}   // after auth/licensing settles

    // ------------------------------------------------------------ exports
    window.renderRamPage = renderRamPage;
    window.renderRamRelPage = renderRamRelPage;
    window.renderRamMxPage = renderRamMxPage;
    window._ramHasAccess = _ramHasAccess;
    window.ramAddTask = ramAddTask;
    window.ramDemonstrate = ramDemonstrate;
    window.ramDeleteTask = ramDeleteTask;
    window.ramApplyTau = ramApplyTau;
    window.ramAddField = ramAddField;
    window.ramFracasAction = ramFracasAction;
    window.ramAddDispatchRecord = ramAddDispatchRecord;
    window.ramSetDispatchTarget = ramSetDispatchTarget;
    window._ramStore = _ramStore;
    window.ramFieldRows = ramFieldRows;
    window._ramMtbfLcb = _mtbfLcb;
    window._ramPredictionRows = _ramPredictionRows;
    window._ramPageFcMap = _ramPageFcMap;
    window._ramFcsForBeRef = _ramFcsForBeRef;
    window._ramChi2Q = _chi2Quantile;
    window.ramDispatchStats = ramDispatchStats;
})();
