// ============================================================================
// reqif_import.js — ReqIF import (Polarion / DOORS / any OMG-ReqIF tool).
//
// ReqIF (OMG, ReqIF 1.0.1/1.1) is the standard requirements interchange
// format every serious ALM exports — Polarion does it natively from any
// LiveDoc. Unlike Word/PDF, the export carries work-item IDENTIFIERS, typed
// attributes, document hierarchy and TRACE RELATIONS, so imported
// requirements arrive on the golden thread instead of as text to rebind.
//
// Discipline:
//   · TWO-STEP: parse → preview (counts, doc title, sample rows, detected
//     field mapping) → apply. Nothing touches the model until confirmed.
//   · IDEMPOTENT: rows carry reqSource.reqifId (the SPEC-OBJECT IDENTIFIER).
//     Re-import matches on it — unchanged rows skip, changed rows update
//     with the change counted, rows missing from the new file are FLAGGED
//     (never silently deleted; the delete guard philosophy).
//   · Relations import as parentReqId where both endpoints are in the set,
//     and are kept verbatim in projectConfig.reqifRelations for the sweep.
//   · Own strict XML parser (no DOMParser dependency) so the exact same
//     code runs in the browser and in the regression harness.
//
// Standard-shape field mapping (overridable when a customer sample arrives):
//   id    ← ReqIF.ForeignID | "id" attribute | SPEC-OBJECT IDENTIFIER
//   text  ← ReqIF.Text | "description" | "text" | "title"
//   title ← ReqIF.Name | "title" | "name"
//   type  ← SPEC-OBJECT-TYPE long name (headings/chapters are skipped)
//
// Born modular: page 'reqif' under Traceability & Evidence.
// ============================================================================
(function () {
    'use strict';

    const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ==================================================== tiny strict XML
    // Namespace-blind (localName only) recursive parser for well-formed XML.
    // Handles prolog, comments, CDATA, self-closing tags, standard entities.
    function _decodeEnt(s) {
        return String(s).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    function xmlParse(src) {
        let i = 0;
        const err = m => { throw new Error('XML: ' + m + ' @' + i); };
        function skipMisc() {
            for (;;) {
                while (i < src.length && /\s/.test(src[i])) i++;
                if (src.startsWith('<?', i)) { i = src.indexOf('?>', i) + 2; if (i < 2) err('unterminated PI'); continue; }
                if (src.startsWith('<!--', i)) { i = src.indexOf('-->', i) + 3; if (i < 3) err('unterminated comment'); continue; }
                if (src.startsWith('<!DOCTYPE', i)) { i = src.indexOf('>', i) + 1; if (i < 1) err('unterminated doctype'); continue; }
                return;
            }
        }
        function node() {
            if (src[i] !== '<') err('expected <');
            i++;
            let name = '';
            while (i < src.length && /[^\s/>]/.test(src[i])) name += src[i++];
            const local = name.replace(/^.*:/, '');
            const attrs = {};
            for (;;) {
                while (i < src.length && /\s/.test(src[i])) i++;
                if (src[i] === '/' && src[i + 1] === '>') { i += 2; return { tag: local, attrs, children: [], text: '' }; }
                if (src[i] === '>') { i++; break; }
                let an = '';
                while (i < src.length && /[^\s=]/.test(src[i])) an += src[i++];
                while (/\s/.test(src[i])) i++;
                if (src[i] !== '=') err('attr = expected');
                i++;
                while (/\s/.test(src[i])) i++;
                const q = src[i]; if (q !== '"' && q !== "'") err('attr quote');
                i++;
                const end = src.indexOf(q, i);
                if (end < 0) err('unterminated attr');
                attrs[an.replace(/^.*:/, '')] = _decodeEnt(src.slice(i, end));
                i = end + 1;
            }
            const children = [];
            let text = '';
            for (;;) {
                if (i >= src.length) err('unterminated <' + local + '>');
                if (src.startsWith('<![CDATA[', i)) {
                    const end = src.indexOf(']]>', i); if (end < 0) err('unterminated CDATA');
                    const cd = src.slice(i + 9, end);
                    text += cd;
                    if (cd.trim()) children.push({ tag: '#text', attrs: {}, children: [], text: cd });
                    i = end + 3; continue;
                }
                if (src.startsWith('<!--', i)) { i = src.indexOf('-->', i) + 3; if (i < 3) err('unterminated comment'); continue; }
                if (src.startsWith('</', i)) {
                    const end = src.indexOf('>', i); if (end < 0) err('unterminated close');
                    i = end + 1;
                    return { tag: local, attrs, children, text };
                }
                if (src[i] === '<') { children.push(node()); continue; }
                let nx = src.indexOf('<', i);
                if (nx < 0) nx = src.length;
                const seg = _decodeEnt(src.slice(i, nx));
                text += seg;
                // ordered mixed content: text runs live in the children list too,
                // so XHTML like "retain <b>antiskid</b>." flattens in ORDER
                if (seg.trim()) children.push({ tag: '#text', attrs: {}, children: [], text: seg });
                i = nx;
            }
        }
        skipMisc();
        const root = node();
        return root;
    }
    // helpers over the parse tree
    const _kids = (n, tag) => (n.children || []).filter(c => c.tag === tag);
    const _kid = (n, tag) => _kids(n, tag)[0] || null;
    function _find(n, tag, out) {   // depth-first collect (elements only)
        out = out || [];
        if (n.tag === tag) out.push(n);
        (n.children || []).forEach(c => { if (c.tag !== '#text') _find(c, tag, out); });
        return out;
    }
    function _flatText(n) {
        // ordered walk: #text runs and element subtrees interleave correctly
        if (!(n.children || []).length) return (n.text || '').replace(/\s+/g, ' ').trim();
        let t = '';
        n.children.forEach(c => { t += (c.tag === '#text') ? c.text : _flatText(c); });
        return t.replace(/\s+/g, ' ').trim();
    }

    // ================================================== ReqIF → structure
    function reqifParse(xmlText) {
        const root = xmlParse(xmlText);
        if (root.tag !== 'REQ-IF') throw new Error('Not a ReqIF file (root <' + root.tag + '>)');
        const out = { title: '', objects: [], relations: [], specs: [], skippedHeadings: 0 };

        const header = _find(root, 'REQ-IF-HEADER')[0];
        if (header) out.title = (_kid(header, 'TITLE') || {}).text || '';

        // enum values: IDENTIFIER → label
        const enums = {};
        _find(root, 'ENUM-VALUE').forEach(ev => { enums[ev.attrs.IDENTIFIER] = ev.attrs['LONG-NAME'] || ev.attrs.IDENTIFIER; });

        // attribute definitions: IDENTIFIER → long name (all datatype flavors)
        const attrDefs = {};
        (root ? _find(root, 'SPEC-ATTRIBUTES') : []).forEach(sa =>
            (sa.children || []).forEach(ad => {
                if (/^ATTRIBUTE-DEFINITION-/.test(ad.tag) && ad.attrs.IDENTIFIER)
                    attrDefs[ad.attrs.IDENTIFIER] = ad.attrs['LONG-NAME'] || ad.attrs.IDENTIFIER;
            }));

        // spec-object types: IDENTIFIER → long name
        const objTypes = {};
        _find(root, 'SPEC-OBJECT-TYPE').forEach(t => { objTypes[t.attrs.IDENTIFIER] = t.attrs['LONG-NAME'] || 'Requirement'; });
        const relTypes = {};
        _find(root, 'SPEC-RELATION-TYPE').forEach(t => { relTypes[t.attrs.IDENTIFIER] = t.attrs['LONG-NAME'] || 'relation'; });

        // spec objects with resolved values
        _find(root, 'SPEC-OBJECT').forEach(o => {
            const values = {};
            const vals = _kid(o, 'VALUES');
            (vals ? vals.children : []).forEach(v => {
                const defWrap = _kid(v, 'DEFINITION');
                const refNode = defWrap && (defWrap.children || []).find(c => c.tag !== '#text');
                const defId = refNode ? refNode.text.trim() : null;
                const name = (defId && attrDefs[defId]) || defId || '?';
                let value = '';
                if (v.tag === 'ATTRIBUTE-VALUE-ENUMERATION') {
                    const vv = _kid(v, 'VALUES');
                    value = (vv ? _find(vv, 'ENUM-VALUE-REF') : []).map(r => enums[r.text.trim()] || r.text.trim()).join(', ');
                } else if (v.tag === 'ATTRIBUTE-VALUE-XHTML') {
                    const tv = _kid(v, 'THE-VALUE');
                    value = tv ? _flatText(tv) : '';
                } else {
                    value = v.attrs['THE-VALUE'] != null ? v.attrs['THE-VALUE'] : _flatText(v);
                }
                values[name] = value;
            });
            const typeWrap = _kid(o, 'TYPE');
            const typeRef = typeWrap && (typeWrap.children || []).find(c => c.tag !== '#text');
            out.objects.push({
                reqifId: o.attrs.IDENTIFIER,
                lastChange: o.attrs['LAST-CHANGE'] || '',
                typeName: (typeRef && objTypes[typeRef.text.trim()]) || 'Requirement',
                values,
            });
        });

        // relations
        _find(root, 'SPEC-RELATION').forEach(r => {
            const src = _kid(r, 'SOURCE'), tgt = _kid(r, 'TARGET'), typ = _kid(r, 'TYPE');
            const ref = w => { const c = w && (w.children || []).find(x => x.tag !== '#text'); return c ? c.text.trim() : null; };
            const s = ref(src), t = ref(tgt);
            if (s && t) out.relations.push({ id: r.attrs.IDENTIFIER, source: s, target: t,
                type: (typ && relTypes[ref(typ)]) || 'relation' });
        });

        // document hierarchy (flattened with levels, per specification)
        _find(root, 'SPECIFICATION').forEach(sp => {
            const rows = [];
            (function walk(n, level) {
                _kids(n, 'CHILDREN').forEach(ch => _kids(ch, 'SPEC-HIERARCHY').forEach(h => {
                    const ow = _kid(h, 'OBJECT');
                    const oref = ow && (ow.children || []).find(c => c.tag !== '#text');
                    if (oref) rows.push({ ref: oref.text.trim(), level });
                    walk(h, level + 1);
                }));
            })(sp, 0);
            out.specs.push({ id: sp.attrs.IDENTIFIER, name: sp.attrs['LONG-NAME'] || out.title || 'Specification', rows });
        });
        return out;
    }

    // ======================================= FHA content (severity-bearing)
    // Severity normalization is the safety-critical step: values map only via
    // unambiguous patterns; anything else imports UNCLASSIFIED (blank) and is
    // counted — the importer never guesses a classification.
    const SEV_PATTERNS = [
        [/^cat(astrophic)?$|^i$/i, 'Catastrophic'],
        [/^haz(ardous)?$|^severe[- ]?major$|^ii$/i, 'Hazardous'],
        [/^maj(or)?$|^iii$/i, 'Major'],
        [/^min(or)?$|^iv$/i, 'Minor'],
        [/^(nse|no ?safety ?effect|none)$|^v$/i, 'No Safety Effect'],
    ];
    function reqifNormalizeSeverity(raw) {
        const v = String(raw == null ? '' : raw).trim();
        if (!v) return '';
        for (const [re, sev] of SEV_PATTERNS) if (re.test(v)) return sev;
        return '';   // unknown wording → unclassified, never a guess
    }
    const FHA_MAP = {
        severity: [/^sever/i, /^class/i, /criticality/i],
        phases: [/phase/i],
        effAc: [/aircraft.*effect/i, /effect.*aircraft/i],
        effCrew: [/crew.*effect/i, /effect.*crew/i],
        effPax: [/(pax|passenger|occupant).*effect/i, /effect.*(pax|passenger|occupant)/i],
    };
    const _pickRe = (values, regs) => {
        for (const k of Object.keys(values)) if (regs.some(re => re.test(k)) && String(values[k]).trim() !== '') return String(values[k]).trim();
        return '';
    };
    // does this export look like an FHA? (a severity-like attribute on most rows)
    function reqifLooksLikeFha(parsed) {
        const objs = parsed.objects.filter(o => !_isHeading(o));
        if (!objs.length) return false;
        const withSev = objs.filter(o => _pickRe(o.values, FHA_MAP.severity) !== '').length;
        return withSev >= Math.max(1, Math.floor(objs.length / 2));
    }

    // standard-shape field mapping (first match wins)
    const MAP = {
        id: ['ReqIF.ForeignID', 'id', 'ID', 'Polarion ID'],
        title: ['ReqIF.Name', 'title', 'Title', 'name'],
        text: ['ReqIF.Text', 'description', 'Description', 'text', 'Text'],
        chapter: ['ReqIF.ChapterName'],
    };
    const _pick = (values, keys) => { for (const k of keys) if (values[k] != null && String(values[k]).trim() !== '') return String(values[k]).trim(); return ''; };
    const _isHeading = o => /head|chapter|title/i.test(o.typeName) || (!!_pick(o.values, MAP.chapter) && !_pick(o.values, MAP.text));

    // structure → requirement candidates (headings dropped, counted)
    function reqifCandidates(parsed) {
        const rows = [], seen = new Set();
        let headings = 0;
        // hierarchy order when available; stragglers appended
        const order = [];
        (parsed.specs || []).forEach(sp => sp.rows.forEach(r => { if (!seen.has(r.ref)) { seen.add(r.ref); order.push(r.ref); } }));
        parsed.objects.forEach(o => { if (!seen.has(o.reqifId)) order.push(o.reqifId); });
        const byId = {};
        parsed.objects.forEach(o => { byId[o.reqifId] = o; });
        order.forEach(ref => {
            const o = byId[ref];
            if (!o) return;
            if (_isHeading(o)) { headings++; return; }
            const text = _pick(o.values, MAP.text) || _pick(o.values, MAP.title);
            if (!text) return;
            rows.push({
                reqifId: o.reqifId,
                foreignId: _pick(o.values, MAP.id) || o.reqifId,
                title: _pick(o.values, MAP.title),
                text, typeName: o.typeName, lastChange: o.lastChange,
            });
        });
        return { rows, headings };
    }

    // ================================================= idempotent apply
    // target: 'aircraft' or a system id. Returns { added, updated, unchanged,
    // missing } — missing = previously imported from this doc, absent now.
    function reqifApply(parsed, target, byUser) {
        const cand = reqifCandidates(parsed);
        const store = target === 'aircraft'
            ? ((typeof acReqData !== 'undefined') ? acReqData : null)
            : (((typeof systemsData !== 'undefined' && systemsData) || []).find(s => s.id === target) || {}).req;
        if (!store) throw new Error('Import target not found: ' + target);
        const docId = (parsed.specs[0] && parsed.specs[0].id) || parsed.title || 'reqif-doc';
        const res = { added: 0, updated: 0, unchanged: 0, missing: 0, total: cand.rows.length };
        const nowIds = new Set(cand.rows.map(r => r.reqifId));

        cand.rows.forEach(r => {
            const existing = store.find(x => x.reqSource && x.reqSource.reqifId === r.reqifId);
            const fields = {
                id: r.foreignId, text: r.text,
                rat: r.title && r.title !== r.text ? r.title : (existing ? existing.rat : ''),
                type: r.typeName, level: 'Imported',
            };
            if (existing) {
                const changed = existing.text !== fields.text || existing.id !== fields.id || existing.type !== fields.type;
                if (changed) {
                    Object.assign(existing, fields);
                    existing.reqSource.lastChange = r.lastChange;
                    existing.reqSource.updatedAt = new Date().toISOString();
                    res.updated++;
                } else res.unchanged++;
                delete existing.reqSource.missingInSource;
            } else {
                store.push(Object.assign({
                    internalId: (typeof newRowId === 'function') ? newRowId() :
                        (typeof internalIdCounter !== 'undefined' ? internalIdCounter++ : Date.now() + Math.random()),
                    traceId: '', verifMethod: '', verifStatus: 'Pending', verifEvidence: '',
                    reqSource: { generator: 'reqif', reqifId: r.reqifId, foreignId: r.foreignId,
                        doc: parsed.title || docId, docId, lastChange: r.lastChange,
                        importedAt: new Date().toISOString(), by: byUser || '' },
                }, fields));
                res.added++;
            }
        });

        // rows previously imported from THIS document, now absent → flag
        store.forEach(x => {
            if (x.reqSource && x.reqSource.generator === 'reqif' && x.reqSource.docId === docId &&
                !nowIds.has(x.reqSource.reqifId)) {
                if (!x.reqSource.missingInSource) res.missing++;
                x.reqSource.missingInSource = new Date().toISOString();
            }
        });

        // relations: keep verbatim + wire parentReqId when both endpoints landed
        if (typeof projectConfig !== 'undefined') {
            if (!Array.isArray(projectConfig.reqifRelations)) projectConfig.reqifRelations = [];
            const known = new Set(projectConfig.reqifRelations.map(x => x.id));
            parsed.relations.forEach(rel => {
                if (!known.has(rel.id)) projectConfig.reqifRelations.push(rel);
                const src = store.find(x => x.reqSource && x.reqSource.reqifId === rel.source);
                const tgt = store.find(x => x.reqSource && x.reqSource.reqifId === rel.target);
                if (src && tgt && !src.parentReqId) {
                    src.parentReqId = String(tgt.internalId);
                    src.derivationType = src.derivationType || rel.type;
                }
            });
            // import log
            if (!Array.isArray(projectConfig.reqifImports)) projectConfig.reqifImports = [];
            projectConfig.reqifImports.push({ at: new Date().toISOString(), doc: parsed.title || docId,
                target, added: res.added, updated: res.updated, unchanged: res.unchanged, missing: res.missing,
                relations: parsed.relations.length, headingsSkipped: cand.headings });
        }
        res.relations = parsed.relations.length;
        res.headings = cand.headings;
        return res;
    }

    // ------------------------------------------- FHA apply (idempotent too)
    function reqifApplyFha(parsed, target, byUser) {
        const cand = reqifCandidates(parsed);
        const store = target === 'aircraft'
            ? ((typeof acFhaData !== 'undefined') ? acFhaData : null)
            : (((typeof systemsData !== 'undefined' && systemsData) || []).find(s => s.id === target) || {}).fha;
        if (!store) throw new Error('FHA import target not found: ' + target);
        const docId = (parsed.specs[0] && parsed.specs[0].id) || parsed.title || 'reqif-doc';
        const res = { added: 0, updated: 0, unchanged: 0, missing: 0, unclassified: 0, total: cand.rows.length };
        const nowIds = new Set(cand.rows.map(r => r.reqifId));
        const byId = {};
        parsed.objects.forEach(o => { byId[o.reqifId] = o; });

        cand.rows.forEach(r => {
            const o = byId[r.reqifId] || { values: {} };
            const sevRaw = _pickRe(o.values, FHA_MAP.severity);
            const severity = reqifNormalizeSeverity(sevRaw);
            if (sevRaw && !severity) res.unclassified++;
            const fields = {
                fcId: r.foreignId, fcDesc: r.text,
                severity,
                phases: _pickRe(o.values, FHA_MAP.phases),
                effAc: _pickRe(o.values, FHA_MAP.effAc),
                effCrew: _pickRe(o.values, FHA_MAP.effCrew),
                effPax: _pickRe(o.values, FHA_MAP.effPax),
            };
            const existing = store.find(x => x.reqifSource && x.reqifSource.reqifId === r.reqifId);
            if (existing) {
                const changed = ['fcId', 'fcDesc', 'severity', 'phases', 'effAc', 'effCrew', 'effPax']
                    .some(k => fields[k] !== '' && existing[k] !== fields[k]);
                if (changed) {
                    Object.keys(fields).forEach(k => { if (fields[k] !== '' || k === 'severity') existing[k] = fields[k]; });
                    existing.reqifSource.lastChange = r.lastChange;
                    existing.reqifSource.updatedAt = new Date().toISOString();
                    res.updated++;
                } else res.unchanged++;
                delete existing.reqifSource.missingInSource;
            } else {
                const row = Object.assign({
                    internalId: (typeof newRowId === 'function') ? newRowId() :
                        (typeof internalIdCounter !== 'undefined' ? internalIdCounter++ : Date.now() + Math.random()),
                    subId: '', assumptionIds: [],
                    comments: 'Imported from ' + (parsed.title || docId) + (sevRaw && !severity ? ' — SEVERITY "' + sevRaw + '" UNRECOGNIZED, classify manually' : ''),
                    reqifSource: { generator: 'reqif', reqifId: r.reqifId, foreignId: r.foreignId,
                        doc: parsed.title || docId, docId, lastChange: r.lastChange,
                        importedAt: new Date().toISOString(), by: byUser || '' },
                }, fields);
                if (target !== 'aircraft') row.acTrace = '';   // system rows trace later
                store.push(row);
                res.added++;
            }
        });
        store.forEach(x => {
            if (x.reqifSource && x.reqifSource.generator === 'reqif' && x.reqifSource.docId === docId &&
                !nowIds.has(x.reqifSource.reqifId)) {
                if (!x.reqifSource.missingInSource) res.missing++;
                x.reqifSource.missingInSource = new Date().toISOString();
            }
        });
        if (typeof projectConfig !== 'undefined') {
            if (!Array.isArray(projectConfig.reqifImports)) projectConfig.reqifImports = [];
            projectConfig.reqifImports.push({ at: new Date().toISOString(), doc: parsed.title || docId,
                target: target + ' (FHA)', added: res.added, updated: res.updated, unchanged: res.unchanged,
                missing: res.missing, unclassified: res.unclassified,
                relations: parsed.relations.length, headingsSkipped: cand.headings });
        }
        res.relations = parsed.relations.length;
        res.headings = cand.headings;
        return res;
    }

    // ====================================================== page & actions
    let _pending = null;   // { parsed, fileName }

    window.reqifPickFile = function () {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.reqif,.xml,.reqifz,.zip';
        inp.onchange = async () => {
            const f = inp.files && inp.files[0];
            if (!f) return;
            try {
                let text;
                if (/\.(reqifz|zip)$/i.test(f.name)) {
                    if (typeof JSZip === 'undefined') {
                        alert('.reqifz is a zip archive — unzip it and drop the .reqif inside (archive support needs the zip library, not loaded on this build).');
                        return;
                    }
                    const zip = await JSZip.loadAsync(f);
                    const entry = Object.values(zip.files).find(e => /\.(reqif|xml)$/i.test(e.name));
                    if (!entry) { alert('No .reqif file inside the archive.'); return; }
                    text = await entry.async('string');
                } else {
                    text = await f.text();
                }
                _pending = { parsed: reqifParse(text), fileName: f.name };
                renderReqifPage();
            } catch (e) { alert('Parse failed: ' + e.message); }
        };
        inp.click();
    };

    window.reqifConfirmImport = async function () {
        if (!_pending) return;
        const systems = ((typeof systemsData !== 'undefined' && systemsData) || []);
        const looksFha = reqifLooksLikeFha(_pending.parsed);
        const kind = window.prompt('What is this document?\n  req — requirements\n  fha — failure conditions (FHA)' +
            (looksFha ? '\n\n(severity attributes detected — FHA suggested)' : ''), looksFha ? 'fha' : 'req');
        if (!kind || !['req', 'fha'].includes(kind.trim())) return;
        const dest = window.prompt('Import destination — type "aircraft" or a system id:\n' +
            ['aircraft'].concat(systems.map(s => s.id + ' — ' + s.name)).join('\n'), 'aircraft');
        if (!dest) return;
        const target = dest.trim().split(' — ')[0].trim();
        const by = window.prompt('Import signature (name):', '') || '';
        try {
            const res = kind.trim() === 'fha'
                ? reqifApplyFha(_pending.parsed, target, by)
                : reqifApply(_pending.parsed, target, by);
            try { if (typeof saveState === 'function') saveState(); } catch (_) {}
            alert('Imported "' + (_pending.parsed.title || _pending.fileName) + '" → ' + target + '\n\n' +
                res.added + ' added · ' + res.updated + ' updated · ' + res.unchanged + ' unchanged · ' +
                res.missing + ' missing-in-source flagged' +
                (res.unclassified ? '\n⚠ ' + res.unclassified + ' severity value(s) unrecognized — imported UNCLASSIFIED, classify manually' : '') +
                '\n' + res.relations + ' relation(s) · ' + res.headings + ' heading(s) skipped');
            _pending = null;
            renderReqifPage();
        } catch (e) { alert('Import failed: ' + e.message); }
    };
    window.reqifDiscard = function () { _pending = null; renderReqifPage(); };

    function renderReqifPage() {
        const host = document.getElementById('reqif-host');
        if (!host) return;
        let html = '<div style="margin-bottom:14px;"><button class="btn-cyan" style="font-size:12.5px; padding:7px 14px;" onclick="reqifPickFile()">⇪ Open .reqif file…</button> ' +
            '<span style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono);">Polarion: LiveDoc → ReqIF Round-trip · Jama: Interchange/Data Exchange → Export to ReqIF · DOORS: standard ReqIF export. IDs, attributes, hierarchy and trace relations survive.</span></div>';

        if (_pending) {
            const p = _pending.parsed;
            const cand = reqifCandidates(p);
            html += '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-bottom:16px;">' +
                '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
                '<b>Preview — ' + _esc(p.title || _pending.fileName) + '</b>' +
                '<div><button class="btn-cyan" style="font-size:12px; padding:5px 12px;" onclick="reqifConfirmImport()">Import…</button> ' +
                '<button class="ckpt-m-btn" style="font-size:12px; padding:5px 12px;" onclick="reqifDiscard()">discard</button></div></div>' +
                '<p class="u-mono" style="font-size:11.5px; padding:8px 14px 0;">' + cand.rows.length + ' row(s) · ' +
                cand.headings + ' heading(s) will be skipped · ' + p.relations.length + ' trace relation(s) · ' + p.specs.length + ' specification(s)' +
                (reqifLooksLikeFha(p) ? ' · <b style="color:#8E2A2A;">severity attributes detected — looks like an FHA</b>' : '') + '</p>' +
                '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>ID</th><th>Type</th><th>Text</th><th>ReqIF identifier</th></tr></thead><tbody>' +
                cand.rows.slice(0, 12).map(r => '<tr><td class="u-mono"><b>' + _esc(r.foreignId) + '</b></td>' +
                    '<td style="font-size:11px;">' + _esc(r.typeName) + '</td>' +
                    '<td>' + _esc(r.text.slice(0, 110)) + (r.text.length > 110 ? '…' : '') + '</td>' +
                    '<td class="u-mono" style="font-size:10px; color:var(--color-text-tertiary);">' + _esc(r.reqifId) + '</td></tr>').join('') +
                '</tbody></table>' +
                (cand.rows.length > 12 ? '<p class="u-mono" style="font-size:10.5px; color:var(--color-text-tertiary); padding:0 14px 10px;">… ' + (cand.rows.length - 12) + ' more</p>' : '') +
                '</div>';
        }

        const log = (typeof projectConfig !== 'undefined' && projectConfig.reqifImports) || [];
        if (log.length) {
            html += '<b style="font-size:13px;">Import history</b>' +
                '<table class="data-table" style="width:100%; font-size:12px; margin-top:6px;"><thead><tr><th>When</th><th>Document</th><th>Target</th><th>Result</th></tr></thead><tbody>' +
                log.slice().reverse().map(l => '<tr><td class="u-mono" style="font-size:11px;">' + _esc(l.at.slice(0, 16).replace('T', ' ')) + '</td>' +
                    '<td>' + _esc(l.doc) + '</td><td class="u-mono" style="font-size:11px;">' + _esc(l.target) + '</td>' +
                    '<td class="u-mono" style="font-size:11px;">' + l.added + ' added · ' + l.updated + ' updated · ' + l.unchanged + ' unchanged' +
                    (l.missing ? ' · <span style="color:#9A6200;">' + l.missing + ' missing-in-source</span>' : '') + '</td></tr>').join('') +
                '</tbody></table>';
        }
        html += '<p style="font-size:11px; color:var(--color-text-tertiary); font-family:var(--font-mono); margin-top:12px;">Re-import is idempotent: rows match on the ReqIF identifier — unchanged skip, changed update, rows gone from the source are FLAGGED (never silently deleted). ' +
            'Relations land as parent links where both endpoints imported, and are kept verbatim for the thread. Word/PDF stays the last resort: it loses exactly what this preserves.</p>';
        host.innerHTML = html;
    }

    // ------------------------------------------------- navigation wrapper
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._reqifWrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try {
                const v = document.getElementById('view-reqif');
                if (v) v.style.display = (tabId === 'reqif') ? 'block' : 'none';
                const s = document.getElementById('snav-reqif');
                if (s) s.classList.toggle('snav-active', tabId === 'reqif');
                if (tabId === 'reqif') renderReqifPage();
            } catch (_) {}
            return r;
        };
        wrapped._reqifWrapped = true;
        window.switchTab = wrapped;
    })();

    // ------------------------------------------------------------ exports
    window.reqifParse = reqifParse;
    window.reqifCandidates = reqifCandidates;
    window.reqifApply = reqifApply;
    window.reqifApplyFha = reqifApplyFha;
    window.reqifLooksLikeFha = reqifLooksLikeFha;
    window.reqifNormalizeSeverity = reqifNormalizeSeverity;
    window._reqifXmlParse = xmlParse;
    window.renderReqifPage = renderReqifPage;
})();
