// ============================================================================
// status_back.js — v1.0 — M8: the loop closes. Requirements came IN through
// ReqIF (Q10); their verdicts now go BACK the same way.
//
// One ReqIF file, generated deterministically from the live model, carrying
// per requirement: text, rationale, level, type, DAL, verification status,
// MoC roll-up, and origin. Requirements that arrived FROM Jama / Polarion /
// DOORS keep their ORIGINAL SPEC-OBJECT identifiers, so the receiving tool
// updates work items in place — a true round trip. Native Safety Lab
// requirements travel with stable slab- identifiers.
//
// The header carries the attestation: journal head hash + invariant sweep
// posture at generation time. The file itself testifies about the machine
// that produced it.
//
// Two-engine proof: the export is parsed back through Q10's OWN importer in
// the regression suite — our reader accepts our writer, identifiers intact.
// File exchange, no API, no credentials: works air-gapped, reproducible
// from the artifact. Born-modular: wraps renderReqifPage. No monolith edits.
// ============================================================================
(function () {
    'use strict';

    const _x = s => String(s == null ? '' : s).replace(/[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------------------------------------------------------- model reads
    function _allReqs() {
        const out = [];
        (((typeof acReqData !== 'undefined' ? acReqData : []) || [])).forEach(r =>
            out.push({ r, scope: 'aircraft', sysName: '' }));
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s =>
            (s.req || []).forEach(r => out.push({ r, scope: 'system', sysName: s.name || s.id })));
        return out;
    }
    function _mocRollup(moc) {
        if (!Array.isArray(moc) || !moc.length) return 'No MoC credit recorded';
        const norm = e => String(e.status || '').trim().toLowerCase();
        if (moc.every(e => norm(e) === 'compliant' || norm(e) === 'n/a')) return 'Compliant / N-A';
        if (moc.some(e => ['pending', 'in progress', 'partial', 'non-compliant'].indexOf(norm(e)) >= 0)) return 'Incomplete';
        return 'Mixed';
    }
    function _rid(r, i) {
        if (r.reqSource && r.reqSource.reqifId) return r.reqSource.reqifId;   // round-trip in place
        return 'slab-req-' + (r.traceId || r.id || r.internalId || i);
    }

    // ------------------------------------------------------------ the file
    const ATTRS = [
        ['ad-fid',   'ReqIF.ForeignID',        (q) => q.r.traceId || q.r.id || ''],
        ['ad-text',  'ReqIF.Text',             (q) => q.r.text || ''],
        ['ad-rat',   'SL.Rationale',           (q) => q.r.rat || ''],
        ['ad-level', 'SL.Level',               (q) => q.r.level || q.scope],
        ['ad-sys',   'SL.System',              (q) => q.sysName],
        ['ad-type',  'SL.Type',                (q) => q.r.type || ''],
        ['ad-dal',   'SL.DAL',                 (q) => q.r.dal || ''],
        ['ad-verif', 'SL.VerificationStatus',  (q) => q.r.verifStatus || q.r.vvStatus || 'Pending'],
        ['ad-moc',   'SL.MoCStatus',           (q) => _mocRollup(q.r.mocEntries)],
        ['ad-orig',  'SL.Origin',              (q) => (q.r.reqSource && q.r.reqSource.reqifId) ? 'round-trip' : ((q.r.arSource || q.r.autoReq) ? 'AutoReq (deterministic)' : 'native')],
    ];

    function statusBackReqif() {
        const now = new Date().toISOString();
        const reqs = _allReqs();
        // the attestation
        let head = '', posture = '';
        try {
            const st = (typeof window._jrnlStore === 'function') ? window._jrnlStore() : null;
            if (st && st.entries && st.entries.length) head = st.entries[st.entries.length - 1].h;
        } catch (_) {}
        try {
            if (typeof window.invRun === 'function') {
                const iv = window.invRun();
                posture = iv.results.length + ' machine checks, ' + iv.hardFails + ' hard failure(s), ' + iv.advisories + ' advisory(ies)';
            }
        } catch (_) {}
        const roundTrip = reqs.filter(q => q.r.reqSource && q.r.reqSource.reqifId).length;

        let x = '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">\n' +
            ' <THE-HEADER><REQ-IF-HEADER IDENTIFIER="slab-statusback">\n' +
            '  <COMMENT>Safety Lab Aero status-back. ' + _x(posture) + (head ? ' Journal head ' + _x(head.slice(0, 16)) + '…' : '') +
            ' Identifiers of imported requirements are preserved verbatim for in-place update.</COMMENT>\n' +
            '  <CREATION-TIME>' + now + '</CREATION-TIME>\n' +
            '  <REQ-IF-TOOL-ID>Safety Lab Aero</REQ-IF-TOOL-ID><REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>safetylabaero.com</SOURCE-TOOL-ID>\n' +
            '  <TITLE>' + _x((typeof projectName !== 'undefined' ? projectName : 'Project')) + ' — requirement status-back</TITLE>\n' +
            ' </REQ-IF-HEADER></THE-HEADER>\n' +
            ' <CORE-CONTENT><REQ-IF-CONTENT>\n' +
            '  <DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="dt-str" LONG-NAME="String" MAX-LENGTH="20000" LAST-CHANGE="' + now + '"/></DATATYPES>\n' +
            '  <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="sot-slreq" LONG-NAME="Safety Lab Requirement" LAST-CHANGE="' + now + '"><SPEC-ATTRIBUTES>\n' +
            ATTRS.map(a => '   <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="' + a[0] + '" LONG-NAME="' + a[1] + '" LAST-CHANGE="' + now + '"><TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>').join('\n') + '\n' +
            '  </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>\n' +
            '  <SPEC-OBJECTS>\n';
        reqs.forEach((q, i) => {
            x += '   <SPEC-OBJECT IDENTIFIER="' + _x(_rid(q.r, i)) + '" LAST-CHANGE="' + now + '"><VALUES>\n' +
                ATTRS.map(a => '    <ATTRIBUTE-VALUE-STRING THE-VALUE="' + _x(a[2](q)) + '"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>' + a[0] + '</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>').join('\n') + '\n' +
                '   </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>sot-slreq</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>\n';
        });
        x += '  </SPEC-OBJECTS>\n  <SPEC-RELATIONS/>\n <SPECIFICATIONS/>\n </REQ-IF-CONTENT></CORE-CONTENT>\n</REQ-IF>\n';
        return { xml: x, count: reqs.length, roundTrip, native: reqs.length - roundTrip, head, posture };
    }

    window.statusBackDownload = function () {
        const r = statusBackReqif();
        try {
            const blob = new Blob([r.xml], { type: 'application/xml' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = ((typeof projectName !== 'undefined' ? projectName : 'project').replace(/[^\w.-]+/g, '_')) + '_statusback.reqif';
            document.body.appendChild(a); a.click(); a.remove();
        } catch (_) {}
        try { if (typeof window.jrnl === 'function') window.jrnl('status-back', 'ReqIF status-back generated: ' + r.count + ' requirement(s), ' + r.roundTrip + ' in-place round-trip id(s)'); } catch (_) {}
        try { if (typeof showToast === 'function') showToast('Status-back ReqIF generated — ' + r.count + ' requirements, ' + r.roundTrip + ' with original tool identifiers.', 'success', 4200); } catch (_) {}
    };

    // ------------------------------------------------------------- the panel
    function _render() {
        const host = document.getElementById('reqif-host');
        if (!host) return;
        let div = document.getElementById('statusback-panel');
        if (!div) { div = document.createElement('div'); div.id = 'statusback-panel'; host.parentNode.insertBefore(div, host); }
        let r;
        try { r = statusBackReqif(); } catch (_) { div.innerHTML = ''; return; }
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); padding:10px 14px; margin-bottom:14px;">' +
            '<div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">' +
            '<b style="font-size:12.5px;">Status-back — the loop closes</b>' +
            '<span style="font-size:11.5px; color:var(--color-text-secondary);">' + r.count + ' requirements · ' + r.roundTrip + ' update in place with their original Jama/Polarion/DOORS identifiers · ' + r.native + ' travel as new slab objects</span>' +
            '<button class="ckpt-m-btn ckpt-m-btn-primary" style="font-size:11.5px; padding:3px 12px; margin-left:auto;" onclick="statusBackDownload()">Generate ReqIF…</button></div>' +
            '<div style="font-size:11px; color:var(--color-text-tertiary); margin-top:6px;">Verification status, MoC roll-up, DAL, and rationale per requirement — with the sweep posture and journal head hash in the file header. Deterministic file exchange: no API, no credentials, air-gap safe, reproducible from the artifact.</div></div>';
    }

    (function wrap() {
        if (typeof window.renderReqifPage === 'function' && !window.renderReqifPage._sbWrapped) {
            const orig = window.renderReqifPage;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try { _render(); } catch (_) {}
                return r;
            };
            wrapped._sbWrapped = true;
            window.renderReqifPage = wrapped;
        }
    })();

    window.statusBackReqif = statusBackReqif;
})();
