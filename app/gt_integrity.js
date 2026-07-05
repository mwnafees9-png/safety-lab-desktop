// ============================================================================
// gt_integrity.js — Golden Thread integrity: the referee for "pristine".
//
// The thread's promise is that every artifact either connects automatically
// or has a first-class way to connect. This module makes that promise
// MECHANICALLY CHECKABLE, three verdict classes:
//
//   DANGLING — an id-based reference whose target no longer resolves
//              (a deleted system, a renamed FC, a removed tree node).
//              These are defects; the sweep names each one.
//   FRAGILE  — an edge that today rides on TEXT matching (PRA system names,
//              MMEL item names, L/HIRF "protects" refs, SW-reliability CSCI
//              names, LCC free-text items). Each gets a BIND action that
//              records a proper id link in projectConfig.threadLinks —
//              consumers prefer the bound link and fall back to text.
//   ORPHAN   — an artifact with no inbound or outbound thread edge at all
//              (an FC with no requirement and no tree; an item nothing
//              references). Orphans are not always wrong — but they must be
//              visible, because an orphan in evidence is a claim nobody
//              checked.
//
// The link store (threadLinks) is elicited data — bindings are human acts —
// while every verdict here is computed. Two lanes, as everywhere else.
//
// Surfaces: 'gt-integrity' page under Traceability & Evidence, a wrap on the
// golden-thread gaps line, and an evidence-package section. Born modular.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------ the link store
    function _links() {
        if (typeof projectConfig === 'undefined') return {};
        if (!projectConfig.threadLinks) projectConfig.threadLinks = {};
        return projectConfig.threadLinks;
    }
    function gtLink(key) { return _links()[key] || null; }
    const _save = () => { try { if (typeof saveState === 'function') saveState(); } catch (_) {} };

    // ------------------------------------------------------------ helpers
    const _sys = () => (typeof systemsData !== 'undefined' && systemsData) || [];
    const _acFha = () => (typeof acFhaData !== 'undefined' && acFhaData) || [];
    const _acFn = () => (typeof acFunctionsData !== 'undefined' && acFunctionsData) || [];
    const _items = () => (typeof itemsData !== 'undefined' && itemsData) || [];
    const _pages = () => (typeof ftaPages !== 'undefined' && ftaPages) || [];
    const _subIds = () => new Set(_acFn().map(f => f.subId).filter(Boolean));
    const _sysIds = () => new Set(_sys().map(s => s.id));
    const _fcIds = () => new Set(_acFha().map(f => f.fcId).concat(_sys().flatMap(s => (s.fha || []).map(x => x.fcId))));
    const _findBe = ref => { try { return typeof _fmesFindBe === 'function' ? _fmesFindBe(ref) : null; } catch (_) { return null; } };

    // ---------------------------------------------------------- the sweep
    function gtIntegrity() {
        const out = { dangling: [], fragile: [], orphans: [], edges: 0, checked: 0 };
        const dang = (where, ref, detail) => out.dangling.push({ where, ref, detail });
        const frag = (where, ref, detail, linkKey, candidates) => out.fragile.push({ where, ref, detail, linkKey, candidates });
        const subs = _subIds(), sysIds = _sysIds(), fcs = _fcIds();
        const E = () => { out.edges++; };

        // ---- 1. id-based edges: every reference must resolve --------------
        _acFha().forEach(f => {
            if (f.subId) { E(); if (!subs.has(f.subId)) dang('AC FHA ' + f.fcId, f.subId, 'sub-function no longer exists'); }
            (f.assumptionIds || []).forEach(a => { E(); if (!((typeof acAssumptionsData !== 'undefined' && acAssumptionsData) || []).some(x => x.asmId === a)) dang('AC FHA ' + f.fcId, a, 'assumption id unresolved'); });
        });
        const reqTrace = (r, where) => (Array.isArray(r.traceIds) ? r.traceIds : (r.traceId ? [r.traceId] : [])).forEach(t => {
            E(); if (!fcs.has(t) && !subs.has(t) && !_sys().some(s => (s.functions || []).some(fn => fn.funcId === t)))
                dang(where, t, 'trace target (FC / sub-function / function) unresolved');
        });
        ((typeof acReqData !== 'undefined' && acReqData) || []).forEach(r => reqTrace(r, 'AC req ' + (r.id || r.traceId || r.internalId)));
        _sys().forEach(s => {
            (s.functions || []).forEach(fn => (Array.isArray(fn.traceIds) ? fn.traceIds : []).forEach(t => { E(); if (t && !subs.has(t)) dang(s.name + ' fn ' + fn.funcId, t, 'traced sub-function unresolved'); }));
            (s.fha || []).forEach(f => { if (f.acTrace) { E(); if (!_acFha().some(x => String(x.internalId) === String(f.acTrace))) dang(s.name + ' ' + f.fcId, String(f.acTrace), 'AC FHA trace unresolved'); } });
            (s.req || []).forEach(r => reqTrace(r, s.name + ' req ' + (r.id || r.internalId)));
        });
        _items().forEach(i => {
            if (i.owningSystemId) { E(); if (!sysIds.has(i.owningSystemId)) dang('Item ' + i.itemId, i.owningSystemId, 'owning system unresolved'); }
            (i.traceIds || []).forEach(t => { E(); if (!subs.has(t)) dang('Item ' + i.itemId, t, 'realized sub-function unresolved'); });
        });
        _pages().forEach(p => {
            if (p.systemId) { E(); if (!sysIds.has(p.systemId)) dang('Tree ' + (p.name || p.id), p.systemId, 'system unresolved'); }
            if (p.linkedFhaId != null) {
                E();
                const hit = _acFha().some(x => String(x.internalId) === String(p.linkedFhaId)) ||
                    _sys().some(s => (s.fha || []).some(x => String(x.internalId) === String(p.linkedFhaId)));
                if (!hit) dang('Tree ' + (p.name || p.id), String(p.linkedFhaId), 'linked FHA row unresolved');
            }
        });
        ((typeof resourcesData !== 'undefined' && resourcesData) || []).forEach(r => {
            (r.providedBy || []).forEach(id => { E(); if (!sysIds.has(id)) dang('Resource ' + r.resId, id, 'provider system unresolved'); });
            (r.consumedBySystems || []).forEach(id => { E(); if (!sysIds.has(id)) dang('Resource ' + r.resId, id, 'consumer system unresolved'); });
            (r.consumedBy || []).forEach(sf => { E(); if (!subs.has(sf)) dang('Resource ' + r.resId, sf, 'consuming sub-function unresolved'); });
        });
        ((typeof routingData !== 'undefined' && routingData) || []).forEach(r => {
            (r.routesThroughZones || []).forEach(z => { E(); if (!((typeof zsaData !== 'undefined' && zsaData) || []).some(x => x.zoneId === z)) dang('Routing ' + r.routingId, z, 'zone unresolved'); });
            (r.carriesFunctions || []).forEach(sf => { E(); if (!subs.has(sf)) dang('Routing ' + r.routingId, sf, 'function unresolved'); });
            (r.carriesItems || []).forEach(it => { E(); if (!_items().some(x => x.itemId === it)) dang('Routing ' + r.routingId, it, 'item unresolved'); });
        });
        ((typeof zsaData !== 'undefined' && zsaData) || []).forEach(z =>
            (z.housedFunctions || []).forEach(sf => { E(); if (!subs.has(sf)) dang('Zone ' + z.zoneId, sf, 'housed function unresolved'); }));
        ((typeof cmaData !== 'undefined' && cmaData) || []).forEach(c => {
            if (c.owningSystemId) { E(); if (!sysIds.has(c.owningSystemId)) dang('CMA ' + c.cmaId, c.owningSystemId, 'owning system unresolved'); }
            (c.linkedGateIds || []).forEach(g => {
                E();
                const pid = String(g).split(':')[0];
                if (!_pages().some(p => String(p.id) === pid)) dang('CMA ' + c.cmaId, String(g), 'linked gate page unresolved');
            });
        });
        (((typeof projectConfig !== 'undefined' && projectConfig.interfaces) || [])).forEach(i => {
            [i.fromSystemId, i.toSystemId].forEach(id => { E(); if (id && !sysIds.has(String(id))) dang('Interface', String(id), 'endpoint system unresolved'); });
        });
        (((typeof projectConfig !== 'undefined' && projectConfig.macModels) || [])).forEach(r => {
            E(); if (r.subId && !subs.has(r.subId)) dang('MAC ' + r.id, r.subId, 'sub-function unresolved');
            (r.clauses || []).forEach(c => (c.of || []).forEach(id => { E(); if (!sysIds.has(id)) dang('MAC ' + r.id, id, 'clause member system unresolved'); }));
        });
        const ram = (typeof projectConfig !== 'undefined' && projectConfig.ram) || {};
        (ram.tasks || []).forEach(t => {
            if (t.beRef) { E(); if (!_findBe(t.beRef)) dang('Maint task "' + (t.name || '').slice(0, 40) + '"', t.beRef, 'basic event unresolved'); }
            if (t.itemId) { E(); if (!_items().some(x => x.itemId === t.itemId)) dang('Maint task "' + (t.name || '').slice(0, 40) + '"', t.itemId, 'item unresolved'); }
        });
        (ram.field || []).forEach(f => { if (f.beRef) { E(); if (!_findBe(f.beRef)) dang('FRACAS record ' + (f.id || ''), f.beRef, 'basic event unresolved'); } });
        (((typeof projectConfig !== 'undefined' && projectConfig.msg3 && projectConfig.msg3.msis) || [])).forEach(m => {
            if (m.itemId) { E(); if (!_items().some(x => x.itemId === m.itemId)) dang('MSI ' + (m.name || m.id), m.itemId, 'item unresolved'); }
        });
        // bound links themselves must stay resolvable
        Object.entries(_links()).forEach(([key, v]) => {
            (v.systemIds || []).forEach(id => { E(); if (!sysIds.has(id)) dang('Thread link ' + key, id, 'bound system unresolved'); });
            if (v.itemId) { E(); if (!_items().some(x => x.itemId === v.itemId)) dang('Thread link ' + key, v.itemId, 'bound item unresolved'); }
            if (v.zoneId) { E(); if (!((typeof zsaData !== 'undefined' && zsaData) || []).some(z => z.zoneId === v.zoneId)) dang('Thread link ' + key, v.zoneId, 'bound zone unresolved'); }
        });

        // ---- 2. fragile text edges → offer a binding ----------------------
        ((typeof praData !== 'undefined' && praData) || []).forEach(p => {
            const key = 'pra:' + p.internalId;
            if (gtLink(key)) return;   // already bound
            E();
            frag('PRA ' + p.praId, (p.systems || '').slice(0, 50) || '(no systems text)',
                'struck systems ride on name text — bind system ids so CEA/mod-impact stop guessing',
                key, _sys().map(s => s.id + ' — ' + s.name));
        });
        (((typeof projectConfig !== 'undefined' && projectConfig.mmel && projectConfig.mmel.items) || [])).forEach(m => {
            const key = 'mmel:' + (m.id || m.item);
            if (gtLink(key) || m.itemId) return;
            E();
            frag('MMEL ' + (m.id || ''), m.item || '', 'dispatch item named by text — bind the LRU id', key,
                _items().map(i => i.itemId + ' — ' + i.name));
        });
        (((typeof projectConfig !== 'undefined' && projectConfig.msg3x && projectConfig.msg3x.lhirf) || [])).forEach(f => {
            const p = (f.protects || '').trim();
            const resolves = p && (fcs.has(p) || subs.has(p));
            const key = 'lhirf:' + f.id;
            if (resolves || gtLink(key)) return;
            E();
            frag('L/HIRF ' + f.name.slice(0, 40), p || '(blank)', 'protected function/FC does not resolve — bind a real reference', key,
                [..._acFha().map(x => x.fcId + ' — ' + (x.fcDesc || '').slice(0, 40)), ...[...subs].map(s => s)]);
        });
        (((typeof projectConfig !== 'undefined' && projectConfig.swrel && projectConfig.swrel.cscis) || [])).forEach(c => {
            const key = 'swrel:' + c.id;
            if (gtLink(key)) return;
            const swItems = _items().filter(i => /soft/i.test(i.daType || ''));
            if (swItems.some(i => i.name === c.name || i.itemId === c.name)) return;   // exact match = fine
            E();
            frag('SW log "' + c.name.slice(0, 40) + '"', c.name, 'CSCI named by text — bind the software item', key,
                swItems.map(i => i.itemId + ' — ' + i.name));
        });
        (((typeof projectConfig !== 'undefined' && projectConfig.lcc && projectConfig.lcc.items) || [])).forEach(it => {
            const key = 'lcc:' + it.id;
            if (gtLink(key)) return;
            const inLib = (typeof projectConfig !== 'undefined' && projectConfig.customLibrary && projectConfig.customLibrary[it.name]);
            if (inLib) return;
            E();
            frag('LCC "' + it.name.slice(0, 40) + '"', it.name, 'cost item named by text — bind an LRU so λ stays the model\'s', key,
                _items().map(i => i.itemId + ' — ' + i.name));
        });

        // ---- 3. orphans: artifacts with no thread edge at all -------------
        _acFha().forEach(f => {
            const hasReq = ((typeof acReqData !== 'undefined' && acReqData) || []).some(r =>
                (Array.isArray(r.traceIds) ? r.traceIds : [r.traceId]).includes(f.fcId));
            const hasTree = _pages().some(p => String(p.linkedFhaId) === String(f.internalId));
            const hasSfha = _sys().some(s => (s.fha || []).some(x => String(x.acTrace) === String(f.internalId)));
            if (!hasReq && !hasTree && !hasSfha)
                out.orphans.push({ where: 'AC FHA', ref: f.fcId, detail: (f.severity || '?') + ' condition with no requirement, no tree, no SFHA trace' });
        });
        _items().forEach(i => {
            const inTree = _pages().some(p => { let hit = false; (function w(n) { if (!n || hit) return; if (String(n.realizedByItemId || '') === String(i.internalId) || String(n.realizedByItemId || '') === String(i.itemId)) { hit = true; return; } (n.children || n._children || []).forEach(w); })(p.root); return hit; });
            const inTask = (ram.tasks || []).some(t => t.itemId === i.itemId);
            const inRouting = ((typeof routingData !== 'undefined' && routingData) || []).some(r => (r.carriesItems || []).includes(i.itemId));
            const traced = (i.traceIds || []).length > 0;
            if (!inTree && !inTask && !inRouting && !traced)
                out.orphans.push({ where: 'Item', ref: i.itemId, detail: (i.name || '') + ' — no tree event, no maint task, no routing, no function trace' });
        });
        _sys().forEach(s => {
            const touched = ((typeof resourcesData !== 'undefined' && resourcesData) || []).some(r => (r.providedBy || []).concat(r.consumedBySystems || []).includes(s.id)) ||
                (((typeof projectConfig !== 'undefined' && projectConfig.interfaces) || [])).some(i => String(i.fromSystemId) === s.id || String(i.toSystemId) === s.id);
            if (!touched && (s.functions || []).length === 0)
                out.orphans.push({ where: 'System', ref: s.id, detail: (s.name || '') + ' — no functions, no resource edges, no interfaces' });
        });

        out.checked = out.edges;
        out.pristine = out.dangling.length === 0 && out.fragile.length === 0;
        return out;
    }

    // -------------------------------------------------------- bind action
    window.gtBind = function (linkKey, kind) {
        const rep = gtIntegrity();
        const row = rep.fragile.find(x => x.linkKey === linkKey);
        const cands = (row && row.candidates) || [];
        const pick = window.prompt('Bind ' + linkKey + ' — enter the id (candidates):\n' + cands.slice(0, 14).join('\n'), '');
        if (!pick || !pick.trim()) return;
        const id = pick.trim().split(' — ')[0].trim();
        const L = _links();
        if (linkKey.startsWith('pra:')) {
            const cur = L[linkKey] || { systemIds: [] };
            if (!cur.systemIds.includes(id)) cur.systemIds.push(id);
            L[linkKey] = cur;
            if (confirm('Bound ' + id + '. Bind another system to this PRA row?')) { _save(); window.gtBind(linkKey); return; }
        } else if (linkKey.startsWith('mmel:') || linkKey.startsWith('swrel:') || linkKey.startsWith('lcc:')) {
            L[linkKey] = { itemId: id, by: 'bound', at: new Date().toISOString() };
        } else if (linkKey.startsWith('lhirf:')) {
            L[linkKey] = { ref: id, at: new Date().toISOString() };
        } else {
            L[linkKey] = { id, at: new Date().toISOString() };
        }
        _save(); renderGtIntegrityPage();
    };
    window.gtUnbind = function (linkKey) {
        if (!confirm('Remove the binding ' + linkKey + '?')) return;
        delete _links()[linkKey];
        _save(); renderGtIntegrityPage();
    };

    // ---------------------------------------------------------------- page
    function renderGtIntegrityPage() {
        const host = document.getElementById('gt-integrity-host');
        if (!host) return;
        const r = gtIntegrity();
        const tile = (lbl, val, sub, warn) => '<div style="border:1px solid var(--color-border-hair); border-radius:10px; padding:12px 14px; background:var(--color-surface-1);">' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:0.05em;">' + lbl + '</div>' +
            '<div style="font-size:24px; font-weight:700;' + (warn ? ' color:#8E2A2A;' : '') + '">' + val + '</div>' +
            (sub ? '<div style="font-size:11px; color:var(--color-text-tertiary);">' + sub + '</div>' : '') + '</div>';
        let html = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">' +
            tile('Edges checked', r.checked, 'id references + text edges swept') +
            tile('Dangling', r.dangling.length, 'reference to a deleted/renamed target', r.dangling.length > 0) +
            tile('Fragile (bindable)', r.fragile.length, 'text edge awaiting an id binding', r.fragile.length > 0) +
            tile('Orphans', r.orphans.length, 'no thread edge at all — visible by design') + '</div>';

        const table = (title, rows, cols, render) => {
            if (!rows.length) return '';
            return '<div style="margin-bottom:18px;"><b style="font-size:13px;">' + title + '</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr>' +
                cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
                rows.map(render).join('') + '</tbody></table></div>';
        };
        html += table('Dangling references — fix by restoring the target or correcting the reference', r.dangling,
            ['Where', 'Reference', 'Problem'],
            x => '<tr><td>' + _esc(x.where) + '</td><td class="u-mono">' + _esc(x.ref) + '</td><td style="color:#8E2A2A; font-size:11.5px;">' + _esc(x.detail) + '</td></tr>');
        html += table('Fragile text edges — bind an id so downstream analyses stop guessing', r.fragile,
            ['Where', 'Current text', 'Why it matters', ''],
            x => '<tr><td>' + _esc(x.where) + '</td><td class="u-mono" style="font-size:11px;">' + _esc(x.ref) + '</td>' +
                '<td style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(x.detail) + '</td>' +
                '<td><button class="ckpt-m-btn" style="font-size:10.5px; padding:1px 8px;" onclick="gtBind(\'' + _esc(x.linkKey) + '\')">bind…</button></td></tr>');
        const bound = Object.keys(_links());
        if (bound.length) {
            html += table('Active bindings (elicited — withdraw to re-flag)', bound.map(k => ({ k, v: _links()[k] })),
                ['Link', 'Bound to', ''],
                x => '<tr><td class="u-mono" style="font-size:11px;">' + _esc(x.k) + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + _esc(JSON.stringify(x.v).slice(0, 80)) + '</td>' +
                    '<td><a href="#" style="font-size:10.5px; color:#8E2A2A;" onclick="gtUnbind(\'' + _esc(x.k) + '\'); return false;">unbind</a></td></tr>');
        }
        html += table('Orphans — not always wrong, never invisible', r.orphans,
            ['Kind', 'Artifact', 'Detail'],
            x => '<tr><td>' + _esc(x.where) + '</td><td class="u-mono">' + _esc(x.ref) + '</td><td style="font-size:11.5px; color:var(--color-text-secondary);">' + _esc(x.detail) + '</td></tr>');
        if (r.pristine && !r.orphans.length)
            html += '<p style="color:#1D6E3E; font-size:13px; font-weight:600;">Thread pristine — every reference resolves, no text edge unbound, no orphan.</p>';
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Three verdicts: DANGLING (id points at nothing — a defect), FRAGILE (edge rides on text — bind it), ORPHAN (no edges — visible by design). ' +
            'Bindings live in the project (threadLinks), are elicited acts, and are themselves swept for staleness. The sweep is the referee of "everything connects".</p>';
        host.innerHTML = html;
    }

    // ------------------------ graft: golden-thread gaps name broken edges
    (function wrapGaps() {
        if (typeof window._gtvReportGaps !== 'function' || window._gtvReportGaps._gtiWrapped) return;
        const orig = window._gtvReportGaps;
        const wrapped = function () {
            let out = orig.apply(this, arguments);
            try {
                const r = gtIntegrity();
                if (r.dangling.length) out += ' ' + r.dangling.length + ' dangling reference(s) — edges of the thread point at targets that no longer exist.';
                if (r.fragile.length) out += ' ' + r.fragile.length + ' text-matched edge(s) await id bindings (Thread Integrity page).';
            } catch (_) {}
            return out;
        };
        wrapped._gtiWrapped = true;
        window._gtvReportGaps = wrapped;
    })();

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._gtiWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-gt-integrity');
                if (v) v.style.display = (tabId === 'gt-integrity') ? 'block' : 'none';
                const s = document.getElementById('snav-gt-integrity');
                if (s) s.classList.toggle('snav-active', tabId === 'gt-integrity');
                if (tabId === 'gt-integrity') renderGtIntegrityPage();
            } catch (_) {}
            return r;
        };
        wrapped._gtiWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.gtIntegrity = gtIntegrity;
    window.gtLink = gtLink;
    window.renderGtIntegrityPage = renderGtIntegrityPage;
})();
