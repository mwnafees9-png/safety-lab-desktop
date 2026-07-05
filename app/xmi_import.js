// ============================================================================
// xmi_import.js — v0.9 — M5: the Cameo/SysML socket, built and waiting.
//
// DRAFT SOCKET, honestly labeled: the parser targets the standard UML/SysML
// XMI 2.x shape (uml:Model → packagedElement trees with xmi:type/xmi:id/name)
// and is proven against a synthetic Cameo-style fixture in the regression
// suite. Vendor quirks get pinned the day the program sample file arrives —
// the mapping table below is the only thing that should need touching.
//
// WHAT IT IMPORTS (draft-1, deliberately narrow):
//   · uml:Package (and blocks directly under the model root) → SYSTEM
//     candidates. Matching against the live model runs name-first, then
//     through the SIGNED alias registry (AL1) — "EPS" in Cameo finds
//     Electrical Power System here because an engineer signed that fact,
//     never because an algorithm guessed it.
//   · uml:Class / SysML Blocks inside a matched package → ITEM candidates,
//     owned by that system.
//   · NOT imported: geometry, behavior, internal block wiring — Cameo owns
//     the architecture; we take the safety projection only.
//
// Discipline (the Q10 playbook, verbatim):
//   · TWO-STEP: parse → preview → signed apply. Nothing writes unconfirmed.
//   · IDEMPOTENT: everything applied carries xmiSource {tool, xmiId, at} —
//     re-import matches on xmiId; unchanged skips, renames update with the
//     change counted, vanished elements are FLAGGED, never deleted.
//   · Reuses Q10's strict XML parser (window._reqifXmlParse) — one parser,
//     browser and harness identical.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------------- parsing
    function xmiParse(text) {
        if (typeof window._reqifXmlParse !== 'function') throw new Error('XML parser unavailable (reqif_import.js must load first)');
        const root = window._reqifXmlParse(String(text));
        // locate the model node: <XMI><Model …> or the root itself being Model
        let model = null;
        (function find(n) {
            if (model) return;
            if (n.tag === 'Model') { model = n; return; }
            (n.children || []).forEach(c => { if (c.tag !== '#text') find(c); });
        })(root);
        if (!model) throw new Error('No uml:Model element found — is this a UML/SysML XMI export?');
        const tool = (root.attrs && (root.attrs.exporter || root.attrs['exporter'])) || 'cameo/xmi';
        const packages = [], blocks = [];
        (function walk(n, pkg) {
            (n.children || []).forEach(c => {
                if (c.tag === '#text') return;
                if (c.tag === 'packagedElement') {
                    const t = (c.attrs.type || '').replace(/^.*:/, '');
                    const name = c.attrs.name || '';
                    const id = c.attrs.id || '';
                    if (t === 'Package' && name) {
                        packages.push({ xmiId: id, name });
                        walk(c, { xmiId: id, name });
                        return;
                    }
                    if ((t === 'Class' || t === 'Block') && name) {
                        blocks.push({ xmiId: id, name, pkg: pkg ? pkg.name : '', pkgId: pkg ? pkg.xmiId : '' });
                    }
                    walk(c, pkg);
                    return;
                }
                walk(c, pkg);
            });
        })(model, null);
        return { tool, modelName: model.attrs.name || '', packages, blocks };
    }

    // ------------------------------------------------------------- matching
    // Name-first, then the SIGNED alias registry. Lowercased trim compare —
    // nothing fuzzy, nothing derived.
    function _matchSystem(name) {
        const n = String(name || '').trim().toLowerCase();
        if (!n) return null;
        const systems = (typeof systemsData !== 'undefined' ? systemsData : []) || [];
        let hit = systems.find(s => String(s.name || '').trim().toLowerCase() === n);
        if (hit) return { sys: hit, via: 'name' };
        hit = systems.find(s => (s.aliases || []).some(a => String(a.t || '').trim().toLowerCase() === n));
        if (hit) return { sys: hit, via: 'signed alias' };
        return null;
    }

    // ------------------------------------------------------------- preview
    function xmiPreview(text) {
        const p = xmiParse(text);
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        const systems = (typeof systemsData !== 'undefined' ? systemsData : []) || [];
        const rows = [];
        p.packages.forEach(pk => {
            const prior = systems.find(s => s.xmiSource && s.xmiSource.xmiId === pk.xmiId);
            const m = prior ? { sys: prior, via: 'xmiId (re-import)' } : _matchSystem(pk.name);
            rows.push({
                kind: 'system', xmiId: pk.xmiId, name: pk.name,
                action: m ? (prior && prior.name !== pk.name ? 'update-name' : 'bind') : 'new',
                targetId: m ? m.sys.id : '', targetName: m ? (m.sys.name || m.sys.id) : '', via: m ? m.via : '',
            });
        });
        p.blocks.forEach(b => {
            const priorIt = items.find(it => it.xmiSource && it.xmiSource.xmiId === b.xmiId);
            const owner = rows.find(r => r.kind === 'system' && r.xmiId === b.pkgId);
            rows.push({
                kind: 'item', xmiId: b.xmiId, name: b.name, pkg: b.pkg,
                action: priorIt ? (priorIt.name !== b.name ? 'update-name' : 'unchanged') : 'new',
                targetId: priorIt ? priorIt.itemId : '',
                ownerAction: owner ? owner.action : 'none', ownerXmiId: b.pkgId,
            });
        });
        // vanished: previously imported by xmiId, absent from this file
        const inFile = new Set(rows.map(r => r.xmiId));
        const vanished = []
            .concat(systems.filter(s => s.xmiSource && !inFile.has(s.xmiSource.xmiId)).map(s => ({ kind: 'system', name: s.name })))
            .concat(items.filter(it => it.xmiSource && !inFile.has(it.xmiSource.xmiId)).map(it => ({ kind: 'item', name: it.name })));
        return { tool: p.tool, modelName: p.modelName, rows, vanished };
    }

    // -------------------------------------------------------------- apply
    function xmiApply(preview, signedBy) {
        if (!signedBy || !String(signedBy).trim()) return { ok: false, err: 'A signature is required — the import proposes, you decide.' };
        const at = new Date().toISOString();
        const tool = preview.tool || 'cameo/xmi';
        const systems = (typeof systemsData !== 'undefined' ? systemsData : []) || [];
        const items = (typeof itemsData !== 'undefined' ? itemsData : []) || [];
        const res = { systemsBound: 0, systemsNew: 0, itemsNew: 0, updated: 0, unchanged: 0 };
        const sysByXmi = {};
        preview.rows.filter(r => r.kind === 'system').forEach(r => {
            if (r.action === 'bind' || r.action === 'update-name') {
                const s = systems.find(x => x.id === r.targetId);
                if (!s) return;
                s.xmiSource = { tool, xmiId: r.xmiId, at, by: signedBy };
                sysByXmi[r.xmiId] = s;
                res.systemsBound++;
            } else if (r.action === 'new') {
                const s = {
                    id: 'sys-xmi-' + String(r.xmiId).replace(/[^\w]+/g, '').slice(-8),
                    name: r.name, functions: [], fha: [], req: [], asm: [],
                    xmiSource: { tool, xmiId: r.xmiId, at, by: signedBy }
                };
                systems.push(s);
                sysByXmi[r.xmiId] = s;
                res.systemsNew++;
            }
        });
        preview.rows.filter(r => r.kind === 'item').forEach(r => {
            if (r.action === 'unchanged') { res.unchanged++; return; }
            if (r.action === 'update-name') {
                const it = items.find(x => x.xmiSource && x.xmiSource.xmiId === r.xmiId);
                if (it) { it.name = r.name; it.xmiSource.at = at; it.xmiSource.by = signedBy; res.updated++; }
                return;
            }
            const owner = sysByXmi[r.ownerXmiId];
            items.push({
                internalId: (typeof internalIdCounter !== 'undefined' ? internalIdCounter++ : Date.now()),
                itemId: 'IT-XMI-' + (items.filter(x => x.xmiSource).length + 1),
                name: r.name, type: 'LRU', dal: '', description: 'Imported from ' + tool + (r.pkg ? ' · package ' + r.pkg : ''),
                owningSystemId: owner ? owner.id : '',
                xmiSource: { tool, xmiId: r.xmiId, at, by: signedBy }
            });
            res.itemsNew++;
        });
        try { if (typeof window.jrnl === 'function') window.jrnl('xmi-import', 'XMI import applied (' + tool + '): ' + res.systemsBound + ' system(s) bound, ' + res.systemsNew + ' new, ' + res.itemsNew + ' item(s) — signed ' + signedBy); } catch (_) {}
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {}
        try { if (typeof window._aliasBumpEpoch === 'function') window._aliasBumpEpoch(); } catch (_) {}
        return Object.assign({ ok: true }, res);
    }

    // ---------------------------------------------------------------- page
    let _pending = null;
    function renderXmiPage() {
        const host = document.getElementById('xmi-host');
        if (!host) return;
        let html = '<div style="border:1px dashed var(--color-border-strong); padding:10px 14px; margin-bottom:14px; font-size:11.5px; color:var(--color-text-secondary);">' +
            '<b>Draft socket.</b> Built against the standard UML/SysML XMI shape and proven on a synthetic Cameo-style fixture; the field mapping gets pinned against your program’s sample export the day it arrives. Architecture stays in Cameo — this imports the safety projection only: packages as systems (matched by name, then by signed alias), blocks as items. Two-step, signed, idempotent, journaled.</div>' +
            '<div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">' +
            '<input type="file" id="xmi-file" accept=".xmi,.xml,.uml" style="font-size:12px;">' +
            '<button class="ckpt-m-btn" onclick="xmiPickFile()">Parse & preview</button></div>' +
            '<div id="xmi-preview"></div>';
        host.innerHTML = html;
    }

    window.xmiPickFile = function () {
        const inp = document.getElementById('xmi-file');
        const f = inp && inp.files && inp.files[0];
        if (!f) { try { showToast('Choose an XMI/XML file first.', 'error', 2600); } catch (_) {} return; }
        const rd = new FileReader();
        rd.onload = () => {
            let pv;
            try { pv = xmiPreview(String(rd.result)); } catch (e) {
                document.getElementById('xmi-preview').innerHTML = '<p style="color:var(--color-danger); font-size:12.5px;"><b>Parse failed:</b> ' + _esc(e.message) + '. Send this file over — pinning the vendor shape is exactly what the socket is waiting for.</p>';
                return;
            }
            _pending = pv;
            const sys = pv.rows.filter(r => r.kind === 'system'), it = pv.rows.filter(r => r.kind === 'item');
            document.getElementById('xmi-preview').innerHTML =
                '<b style="font-size:12.5px;">' + _esc(pv.modelName || 'Model') + '</b> <span class="u-mono" style="font-size:11px; color:var(--color-text-tertiary);">' + _esc(pv.tool) + '</span>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:8px;"><thead><tr><th></th><th>Element</th><th>Action</th><th>Binds to</th></tr></thead><tbody>' +
                sys.map(r => '<tr><td class="u-mono" style="font-size:10px;">PKG</td><td><b>' + _esc(r.name) + '</b></td><td>' + _esc(r.action) + '</td><td>' + _esc(r.targetName || '(new system)') + (r.via ? ' <span style="font-size:10px; color:var(--color-text-tertiary);">via ' + _esc(r.via) + '</span>' : '') + '</td></tr>').join('') +
                it.map(r => '<tr><td class="u-mono" style="font-size:10px;">BLK</td><td>' + _esc(r.name) + '</td><td>' + _esc(r.action) + '</td><td>' + _esc(r.pkg || '') + '</td></tr>').join('') +
                '</tbody></table>' +
                (pv.vanished.length ? '<p style="font-size:11.5px; color:var(--color-warning);"><b>' + pv.vanished.length + ' previously imported element(s) missing from this file</b> — flagged, never deleted: ' + pv.vanished.map(v => _esc(v.name)).join(', ') + '</p>' : '') +
                '<div style="display:flex; gap:10px; align-items:center; margin-top:10px;">' +
                '<input id="xmi-by" type="text" placeholder="Signature (required)" style="font-size:12px; padding:5px 9px; border:1px solid var(--color-border-strong); background:var(--color-surface-1); color:var(--color-text-primary); width:200px;">' +
                '<button class="ckpt-m-btn ckpt-m-btn-primary" onclick="xmiConfirmImport()">Sign & apply</button>' +
                '<span id="xmi-err" style="color:var(--color-danger); font-size:11.5px; font-weight:600;"></span></div>';
        };
        rd.readAsText(f);
    };

    window.xmiConfirmImport = function () {
        if (!_pending) return;
        const by = (document.getElementById('xmi-by') || { value: '' }).value.trim();
        const r = xmiApply(_pending, by);
        const err = document.getElementById('xmi-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        _pending = null;
        try { showToast('XMI applied: ' + r.systemsBound + ' bound, ' + r.systemsNew + ' new system(s), ' + r.itemsNew + ' item(s).', 'success', 4200); } catch (_) {}
        renderXmiPage();
        try { if (typeof _renderSidebarContext === 'function') _renderSidebarContext(); } catch (_) {}
    };

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._xmiWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-xmi');
                if (v) v.style.display = (tabId === 'xmi') ? 'block' : 'none';
                const s = document.getElementById('snav-xmi');
                if (s) s.classList.toggle('snav-active', tabId === 'xmi');
                if (tabId === 'xmi') renderXmiPage();
            } catch (_) {}
            return r;
        };
        wrapped._xmiWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.xmiParse = xmiParse;
    window.xmiPreview = xmiPreview;
    window.xmiApply = xmiApply;
    window.renderXmiPage = renderXmiPage;
})();
