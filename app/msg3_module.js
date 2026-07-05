// msg3_module.js — Phase F4: MSG-3 scheduled-maintenance analysis (systems &
// powerplant logic). BORN MODULAR: new file, zero monolith edits; loads after
// ram_modules.js and pushes selected tasks into the RAM task ledger, from
// where the τ bridge carries them to CCMR and the golden thread.
//
// Grounded in the MSG-3 logic (ATA, Operator/Manufacturer Scheduled
// Maintenance Development):
//   Level 1 — effect categorization of each functional failure:
//     Q1 evident to operating crew?  Q2 safety?  Q3 operational?  Q4 hidden+safety?
//       5 evident safety · 6 evident operational · 7 evident economic
//       8 hidden safety  · 9 hidden non-safety
//   Level 2 — task selection in the prescribed order:
//     LU/SV → OP/VC (hidden failures only) → IN/FC → RS → DS
//   Rule: categories 5 and 8 REQUIRE an applicable & effective task —
//   otherwise redesign is mandatory. 6/7/9 accept "no scheduled maintenance"
//   when no task is cost-effective.

(function () {
    'use strict';

    // ---------------------------------------------------------------- store
    function _store() {
        if (!projectConfig.msg3) projectConfig.msg3 = { msis: [] };
        if (!Array.isArray(projectConfig.msg3.msis)) projectConfig.msg3.msis = [];
        return projectConfig.msg3;
    }
    function _save() { try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {} }
    function _toast(m, k, t) { try { if (typeof showToast === 'function') showToast(m, k || 'info', t || 3000); } catch (_) {} }
    async function _ask(msg, dflt) {
        try { if (typeof slPrompt === 'function') return await slPrompt(msg, dflt || ''); } catch (_) {}
        return window.prompt(msg, dflt || '');
    }
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    function _access() { return (typeof window._ramHasAccess === 'function') ? window._ramHasAccess() : true; }

    // ------------------------------------------------------- level 1 logic
    // ff carries three ternary answers: evident, safety, operational
    // (true / false / null = unanswered). Category derives; never stored raw.
    function msg3Category(ff) {
        if (ff.evident == null) return null;
        if (ff.evident) {
            if (ff.safety == null) return null;
            if (ff.safety) return 5;
            if (ff.operational == null) return null;
            return ff.operational ? 6 : 7;
        }
        if (ff.safety == null) return null;   // hidden: safety = "failure combination has safety effect?"
        return ff.safety ? 8 : 9;
    }
    const CAT_LABEL = { 5: '5 · EVIDENT SAFETY', 6: '6 · EVIDENT OPERATIONAL', 7: '7 · EVIDENT ECONOMIC', 8: '8 · HIDDEN SAFETY', 9: '9 · HIDDEN NON-SAFETY' };
    const CAT_COLOR = { 5: '#8E2A2A', 6: '#9A6200', 7: '#3D5A80', 8: '#8E2A2A', 9: '#3D5A80' };

    // ------------------------------------------------------- level 2 logic
    // Ordered task hierarchy per MSG-3 (incl. the SHM WG IP-105 additions:
    // inspection sub-types GVI/DET/SDI and Scheduled Structural Health
    // Monitoring). OP/VC apply to HIDDEN failures only — their purpose is to
    // make the hidden failure evident within an interval.
    const TASK_TYPES = [
        { code: 'LU/SV', name: 'Lubrication / Servicing', hiddenOnly: false,
          def: 'Replenishment of consumables to maintain inherent design capability.' },
        { code: 'OP/VC', name: 'Operational / Visual Check (failure-finding)', hiddenOnly: true,
          def: 'A qualitative check that an item is fulfilling its intended purpose — failure-finding for hidden functions; no quantitative tolerances.' },
        { code: 'GVI', name: 'General Visual Inspection', hiddenOnly: false,
          def: 'Visual examination of an area/installation/assembly for obvious damage, failure or irregularity — within touching distance, normal lighting; may need panel access, mirrors, stands.' },
        { code: 'DET', name: 'Detailed Inspection', hiddenOnly: false,
          def: 'Intensive examination of a specific item for damage, failure or irregularity — supplemented lighting, mirrors/magnification, surface cleaning and elaborate access as required.' },
        { code: 'SDI', name: 'Special Detailed Inspection', hiddenOnly: false,
          def: 'Intensive examination using specialized techniques/equipment (NDT); intricate cleaning, substantial access or disassembly may be required.' },
        { code: 'S-SHM', name: 'Scheduled Structural Health Monitoring', hiddenOnly: false,
          def: 'The act to use/run/read-out an SHM device at a fixed-schedule interval (IP-105); the device must be certified for the intended function.' },
        { code: 'FNC', name: 'Functional Check', hiddenOnly: false,
          def: 'A quantitative check that one or more functions perform within specified limits.' },
        { code: 'RS', name: 'Restoration', hiddenOnly: false,
          def: 'Rework/replacement of parts to restore the item to a specific standard.' },
        { code: 'DS', name: 'Discard (hard time)', hiddenOnly: false,
          def: 'Removal from service at a specified life limit.' },
    ];
    // Disposition per the category rule.
    function msg3Disposition(ff) {
        const cat = msg3Category(ff);
        if (cat == null) return { state: 'open', label: 'ANSWER LEVEL 1', color: '#8A8B90' };
        const effective = (ff.tasks || []).some(t => t.applicable && t.effective);
        if (cat === 5 || cat === 8) {
            return effective ? { state: 'controlled', label: 'TASK SELECTED ✓', color: '#1D9E75' }
                             : { state: 'redesign', label: 'REDESIGN REQUIRED — no applicable & effective task', color: '#8E2A2A' };
        }
        if (effective) return { state: 'controlled', label: 'TASK SELECTED ✓', color: '#1D9E75' };
        return (ff.tasks || []).length
            ? { state: 'open', label: 'TASKS NOT YET APPLICABLE & EFFECTIVE', color: '#9A6200' }
            : { state: 'nsm', label: 'NO SCHEDULED MAINTENANCE (acceptable for 6/7/9)', color: '#45464A' };
    }

    // -------------------------------------------------------------- actions
    // MSI SELECTION (MSG-3 2-3-1): an item is an MSI if ANY selection question
    // is YES. IP-105 notes honored: structural items amenable to systems
    // analysis and SHM systems are included here (coordinate with the
    // Structures WG); safety/emergency systems or equipment are ALWAYS included.
    const MSI_QUESTIONS = [
        { id: 'hidden', q: 'Could its failure be UNDETECTABLE or not likely to be detected by the operating crew during normal duties?' },
        { id: 'safety', q: 'Could its failure affect SAFETY (ground or flight), including safety/emergency systems or equipment?' },
        { id: 'ops', q: 'Could its failure have significant OPERATIONAL impact?' },
        { id: 'econ', q: 'Could its failure have significant ECONOMIC impact?' },
    ];
    async function msg3AddMsi() {
        if (!_access()) { _toast('MSG-3 analysis requires a Pro+ subscription.', 'warning', 3500); return; }
        const name = await _ask('Candidate item — name:'); if (!name || !name.trim()) return;
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        const itemId = (await _ask('Linked LRU / item id (optional):\n' + items.slice(0, 12).map(i => '  ' + i.itemId + ' — ' + i.name).join('\n'), '')) || '';
        const sel = {};
        for (const qq of MSI_QUESTIONS) {
            const a = (await _ask('MSI selection — ' + qq.q + '  (y/n):', 'y')) || '';
            sel[qq.id] = /^y/i.test(a.trim());
        }
        const isMsi = msg3IsMsi(sel);
        if (!isMsi) {
            _store().screened = _store().screened || [];
            _store().screened.push({ id: 'SCR-' + Date.now(), name: name.trim(), itemId: itemId.trim(), sel, at: new Date().toISOString() });
            _save();
            _toast('All four selection questions NO — recorded as screened out (auditable), not an MSI. Note: SHM systems not selected as MSI go to the Structures WG for awareness (IP-105).', 'info', 6000);
            renderMsg3Page(); return;
        }
        _store().msis.push({ id: 'MSI-' + Date.now(), name: name.trim(), itemId: itemId.trim(), sel, ffs: [] });
        _save(); renderMsg3Page();
    }
    function msg3IsMsi(sel) { return !!(sel && (sel.hidden || sel.safety || sel.ops || sel.econ)); }
    function msg3DeleteMsi(id) {
        const s = _store();
        const i = s.msis.findIndex(m => m.id === id);
        if (i >= 0 && confirm('Remove this MSI and its analysis?')) { s.msis.splice(i, 1); _save(); renderMsg3Page(); }
    }
    async function msg3AddFf(msiId) {
        const m = _store().msis.find(x => x.id === msiId); if (!m) return;
        const func = await _ask('Function (what the item does):'); if (!func || !func.trim()) return;
        const failure = await _ask('Functional failure (how it fails to do it):'); if (!failure || !failure.trim()) return;
        const effect = (await _ask('Failure effect:', '')) || '';
        const cause = (await _ask('Failure cause(s):', '')) || '';
        m.ffs.push({ id: 'FF-' + Date.now(), func: func.trim(), failure: failure.trim(), effect, cause,
                     evident: null, safety: null, operational: null, tasks: [] });
        _save(); renderMsg3Page();
    }
    // Level-1 answer cycling: null → yes → no → null.
    function msg3Cycle(msiId, ffId, field) {
        const m = _store().msis.find(x => x.id === msiId); if (!m) return;
        const ff = m.ffs.find(x => x.id === ffId); if (!ff) return;
        ff[field] = ff[field] == null ? true : ff[field] === true ? false : null;
        if (field === 'evident') { ff.safety = null; ff.operational = null; }   // downstream answers reset
        _save(); renderMsg3Page();
    }
    async function msg3AddTask(msiId, ffId) {
        const m = _store().msis.find(x => x.id === msiId); if (!m) return;
        const ff = m.ffs.find(x => x.id === ffId); if (!ff) return;
        const cat = msg3Category(ff);
        if (cat == null) { _toast('Answer the Level-1 questions first — the category drives task selection.', 'warning', 3500); return; }
        const hidden = cat === 8 || cat === 9;
        const avail = TASK_TYPES.filter(t => hidden || !t.hiddenOnly);
        const pick = (await _ask('Task type — MSG-3 selection ORDER matters (choose the first applicable & effective):\n' +
            avail.map((t, i) => (i + 1) + '. ' + t.code + ' — ' + t.name).join('\n') +
            '\n\n(GVI/DET/SDI/S-SHM are the inspection sub-types per IP-105; S-SHM = scheduled read-out of a certified SHM device.)', '1')) || '';
        const idx = parseInt(pick) - 1;
        if (!(idx >= 0 && idx < avail.length)) return;
        const desc = (await _ask('Task description:', avail[idx].name + ' — ' + m.name)) || '';
        const interval = parseFloat(await _ask('Interval (FH):', '500')) || 0;
        ff.tasks.push({ type: avail[idx].code, desc: desc.trim(), interval, applicable: false, effective: false, pushedTaskId: null });
        _save(); renderMsg3Page();
    }
    function msg3ToggleTask(msiId, ffId, ti, field) {
        const m = _store().msis.find(x => x.id === msiId); if (!m) return;
        const ff = m.ffs.find(x => x.id === ffId); if (!ff || !ff.tasks[ti]) return;
        ff.tasks[ti][field] = !ff.tasks[ti][field];
        _save(); renderMsg3Page();
    }
    // Push a selected task into the RAM maintainability ledger — from there the
    // engineer links the basic event and applies τ; the golden thread follows.
    function msg3Push(msiId, ffId, ti) {
        const m = _store().msis.find(x => x.id === msiId); if (!m) return;
        const ff = m.ffs.find(x => x.id === ffId); if (!ff || !ff.tasks[ti]) return;
        const task = ff.tasks[ti];
        if (!(task.applicable && task.effective)) { _toast('Only applicable & effective tasks enter the maintenance program.', 'warning', 3500); return; }
        if (task.pushedTaskId) { _toast('Already in the task ledger.', 'info', 2500); return; }
        if (typeof window._ramStore !== 'function') { _toast('RAM module not loaded.', 'error', 3000); return; }
        const ledger = window._ramStore();
        const id = 'RAM-' + Date.now();
        ledger.tasks.push({
            id, name: task.type + ' · ' + (task.desc || m.name), itemId: m.itemId || '', beRef: '',
            activeRepair: 0, logistics: 0, admin: 0, interval: task.interval || 0, demonstrated: null, by: '',
            msg3: m.id + '/' + ff.id,
        });
        task.pushedTaskId = id;
        _save();
        _toast('Task pushed to the MTTR/MDT ledger — link its basic event there and apply → τ to bound it in CCMR.', 'success', 4500);
        renderMsg3Page();
    }

    // --------------------------------------------------------------- render
    const _tern = v => v == null ? '<span style="color:#8A8B90;">?</span>' : v ? '<b style="color:#1D9E75;">YES</b>' : '<b style="color:#8E2A2A;">NO</b>';
    function renderMsg3Page() {
        const host = document.getElementById('ram-msg3-host');
        if (!host) return;
        if (!_access()) {
            host.innerHTML = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-2); padding:26px 30px; max-width:640px;">' +
                '<h3 style="margin:0 0 10px; border:none; padding:0;">MSG-3 analysis is a Pro+ capability</h3>' +
                '<p style="font-size:13px; color:var(--color-text-secondary);">Scheduled-maintenance development per the MSG-3 logic, feeding the task ledger, the CCMR τ bridge, and the golden thread.</p></div>';
            return;
        }
        const S = _store();
        const nFf = S.msis.reduce((a, m) => a + m.ffs.length, 0);
        const nRedesign = S.msis.reduce((a, m) => a + m.ffs.filter(f => msg3Disposition(f).state === 'redesign').length, 0);
        const nPushed = S.msis.reduce((a, m) => a + m.ffs.reduce((b, f) => b + f.tasks.filter(t => t.pushedTaskId).length, 0), 0);

        let html = '<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">' +
            ['MSIs <b style="margin-left:6px;">' + S.msis.length + '</b>',
             'Functional failures <b style="margin-left:6px;">' + nFf + '</b>',
             'Redesign flags <b style="margin-left:6px;' + (nRedesign ? 'color:#8E2A2A;' : '') + '">' + nRedesign + '</b>',
             'Tasks in ledger <b style="margin-left:6px;">' + nPushed + '</b>']
            .map(c => '<div style="height:32px; display:inline-flex; align-items:center; padding:0 12px; border:1px solid var(--color-border-strong); font-family:var(--font-mono); font-size:12px;">' + c + '</div>').join('') +
            '</div>' +
            '<div style="margin:0 0 12px;"><button class="btn-cyan" onclick="msg3AddMsi()">+ Add MSI</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Level 1: click the Evident / Safety / Operational cells to cycle YES / NO · category derives · Level 2: tasks in MSG-3 order · categories 5 &amp; 8 demand an applicable &amp; effective task or redesign</span></div>';

        if (!S.msis.length) html += '<p style="color:var(--color-text-tertiary); font-size:13px;">No Maintenance Significant Items yet — start with the LRUs whose failure is safety-significant, hidden, or economically heavy.</p>';

        S.msis.forEach(m => {
            html += '<div style="border:1px solid var(--color-border-strong); margin-bottom:16px; background:var(--color-surface-1);">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; border-bottom:2px solid var(--color-text-primary);">' +
                '<div><b>' + _esc(m.name) + '</b>' + (m.itemId ? ' <span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(m.itemId) + '</span>' : '') +
                (m.sel ? ' <span class="u-mono" style="font-size:9.5px; border:1px solid currentColor; padding:0 4px; color:var(--color-text-secondary);" title="MSI selection basis (2-3-1)">MSI: ' + ['hidden','safety','ops','econ'].filter(k => m.sel[k]).join('+').toUpperCase() + '</span>' : '') +
                ' <span class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(m.id) + '</span></div>' +
                '<div><button class="btn-cyan" style="font-size:11px; padding:3px 9px;" onclick="msg3AddFf(\'' + m.id + '\')">+ Functional failure</button> ' +
                '<button class="node-delete-btn-inner" style="font-size:11px;" onclick="msg3DeleteMsi(\'' + m.id + '\')">✕</button></div></div>';
            if (!m.ffs.length) { html += '<p style="padding:10px 14px; color:var(--color-text-tertiary); font-size:12.5px;">No functional failures analyzed yet.</p></div>'; return; }
            html += '<div style="overflow-x:auto;"><table class="data-table" style="width:100%; font-size:12px;"><thead><tr>' +
                '<th>Function / Failure</th><th>Effect · Cause</th><th style="width:70px">Evident?</th><th style="width:66px">Safety?</th><th style="width:66px">Operat.?</th><th style="width:150px">Category</th><th>Level-2 tasks</th><th style="width:190px">Disposition</th></tr></thead><tbody>';
            m.ffs.forEach(ff => {
                const cat = msg3Category(ff);
                const disp = msg3Disposition(ff);
                const hidden = cat === 8 || cat === 9;
                html += '<tr>' +
                    '<td><b>' + _esc(ff.func) + '</b><br><span style="color:var(--color-text-secondary);">' + _esc(ff.failure) + '</span></td>' +
                    '<td style="color:var(--color-text-secondary); font-size:11.5px;">' + _esc(ff.effect || '—') + (ff.cause ? '<br><span style="color:var(--color-text-tertiary);">cause: ' + _esc(ff.cause) + '</span>' : '') + '</td>' +
                    '<td class="u-mono" style="cursor:pointer; text-align:center;" title="Q1 — evident to the operating crew during normal duties?" onclick="msg3Cycle(\'' + m.id + '\',\'' + ff.id + '\',\'evident\')">' + _tern(ff.evident) + '</td>' +
                    '<td class="u-mono" style="cursor:pointer; text-align:center;" title="' + (ff.evident === false ? 'Q4 — does the combination of the hidden functional failure and one additional failure of a system-related or back-up function have an adverse effect on operating safety? (For safety/emergency equipment the additional failure is the event the equipment protects against — no redundancy ⇒ category 8.)' : 'Q2 — direct adverse effect on operating safety?') + '" onclick="msg3Cycle(\'' + m.id + '\',\'' + ff.id + '\',\'safety\')">' + _tern(ff.safety) + '</td>' +
                    '<td class="u-mono" style="text-align:center;' + (ff.evident === true && ff.safety === false ? ' cursor:pointer;' : ' opacity:0.3;') + '" title="Q3 — adverse effect on operating capability?"' + (ff.evident === true && ff.safety === false ? ' onclick="msg3Cycle(\'' + m.id + '\',\'' + ff.id + '\',\'operational\')"' : '') + '>' + (ff.evident === true && ff.safety === false ? _tern(ff.operational) : '—') + '</td>' +
                    '<td>' + (cat != null
                        ? '<span style="font-family:var(--font-mono); font-size:10.5px; font-weight:600; letter-spacing:0.04em; padding:3px 7px; color:' + CAT_COLOR[cat] + '; background:' + CAT_COLOR[cat] + '1A; box-shadow: inset 0 0 0 1.5px currentColor; white-space:nowrap;">' + CAT_LABEL[cat] + '</span>'
                        : '<span style="color:var(--color-text-tertiary); font-size:11px;">answer Level 1…</span>') + '</td>' +
                    '<td>' + ((ff.tasks || []).map((t, ti) =>
                        '<div style="margin:2px 0; font-size:11.5px;"><span class="u-mono"' +
                        (t.type === 'GVI' && (cat === 5 || cat === 8) ? ' title="IP-105: a GVI from a Category 5/8 analysis must be retained as a STANDALONE task — it may not be absorbed into a zonal inspection."' : '') +
                        '>' + _esc(t.type) + (t.type === 'GVI' && (cat === 5 || cat === 8) ? '<span style="color:#9A6200;" title="standalone — not transferable to zonal">*</span>' : '') + '</span> ' + _esc(t.desc || '') +
                        (t.interval > 0 ? ' <span class="u-mono" style="color:var(--color-text-tertiary);">@ ' + t.interval + ' FH</span>' : '') +
                        ' · <a href="#" onclick="msg3ToggleTask(\'' + m.id + '\',\'' + ff.id + '\',' + ti + ',\'applicable\'); return false;" style="color:' + (t.applicable ? '#1D9E75' : '#8A8B90') + ';" title="applicable: the task can physically address the failure cause">A' + (t.applicable ? '✓' : '?') + '</a>' +
                        ' <a href="#" onclick="msg3ToggleTask(\'' + m.id + '\',\'' + ff.id + '\',' + ti + ',\'effective\'); return false;" style="color:' + (t.effective ? '#1D9E75' : '#8A8B90') + ';" title="effective: doing it at the interval reduces the risk to an acceptable level">E' + (t.effective ? '✓' : '?') + '</a>' +
                        (t.pushedTaskId ? ' <span class="u-mono" style="font-size:10px; color:#1D9E75;" title="in the MTTR/MDT ledger">→ ledger ✓</span>'
                            : (t.applicable && t.effective ? ' <button class="ckpt-m-btn" style="font-size:10px; padding:0 6px;" onclick="msg3Push(\'' + m.id + '\',\'' + ff.id + '\',' + ti + ')" title="push into the MTTR/MDT task ledger — link its event and apply → τ there">→ ledger</button>' : '')) +
                        '</div>').join('') || '<span style="color:var(--color-text-tertiary); font-size:11px;">none</span>') +
                        '<div><button class="ckpt-m-btn" style="font-size:10px; padding:0 6px; margin-top:3px;" onclick="msg3AddTask(\'' + m.id + '\',\'' + ff.id + '\')">+ task' + (hidden ? ' (incl. OP/VC failure-finding)' : '') + '</button></div></td>' +
                    '<td><span style="font-family:var(--font-mono); font-size:10px; font-weight:600; color:' + disp.color + ';">' + _esc(disp.label) + '</span></td>' +
                    '</tr>';
            });
            html += '</tbody></table></div></div>';
        });

        const scr = S.screened || [];
        if (scr.length) {
            html += '<h3 style="margin-top:var(--s-4);">Screened out — selection questions all NO (auditable register)</h3>' +
                '<table class="data-table" style="width:100%; max-width:640px; font-size:12px;"><tbody>' +
                scr.map(x => '<tr><td>' + _esc(x.name) + '</td><td class="u-mono" style="width:160px;">' + _esc(x.itemId || '—') + '</td><td class="prov" style="width:140px;">' + _esc(String(x.at).slice(0, 10)) + '</td></tr>').join('') +
                '</tbody></table>';
        }
        html += '<div style="border:1px solid var(--color-border-hair); border-left:3px solid var(--color-text-primary); background:var(--color-surface-2); padding:10px 14px; font-size:12px; color:var(--color-text-secondary); margin-top:14px;">' +
            '<b>SHM in MSG-3 (IP-105)</b> — <span class="u-mono">S-SHM</span> (scheduled read-out of a certified SHM device at a fixed interval) is a selectable task type above. ' +
            'Automated/on-condition SHM (<i>A-SHM</i>) is NON-scheduled by definition — its reports enter through the FRACAS lane and data analysis, not this logic. ' +
            'SHM systems are classified by OPERATION MODE and TECHNOLOGY TYPE; structural items amenable to systems analysis are handled here in coordination with the Structures WG, and SHM systems not selected as MSIs are reported to the Structures WG for awareness.</div>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">MSG-3 systems &amp; powerplant logic (task taxonomy incl. SHM WG IP-105: GVI/DET/SDI sub-types, S-SHM) · Level-1 categories derive from the answers (never stored); 5/8 without an applicable &amp; effective task = redesign, by rule · pushed tasks appear in the MTTR/MDT ledger with an MSG-3 badge, link their basic event there and the τ bridge + golden thread take over.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------------------ exports
    window.renderMsg3Page = renderMsg3Page;
    window.msg3AddMsi = msg3AddMsi;
    window.msg3DeleteMsi = msg3DeleteMsi;
    window.msg3AddFf = msg3AddFf;
    window.msg3Cycle = msg3Cycle;
    window.msg3AddTask = msg3AddTask;
    window.msg3ToggleTask = msg3ToggleTask;
    window.msg3Push = msg3Push;
    window.msg3Category = msg3Category;
    window.msg3IsMsi = msg3IsMsi;
    window.msg3Disposition = msg3Disposition;
    window._msg3Store = _store;
})();
