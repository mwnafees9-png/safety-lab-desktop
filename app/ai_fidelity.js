// ai_fidelity.js — Phase E2: the AI fidelity layer.
//
// Principle: AI is never a source of truth, only a source of drafts the
// deterministic core can check; everything it asserts is either verified or
// logged as an assumption. AI never fills a computed lane.
//
// E2.1 Closed-world context contract — per-section scoping + clause library +
//      truncation manifest (omissions shown, never silent).
// E2.2 Narrative-only drafting — token-referenced facts, unknown-token lint.
// E2.3 Deterministic claim checker + tone lint.
// E2.4 Adversarial review pass (optional slot).
// E2.5 Provenance → assumptions machinery + draft state machine + hand-off gate.
// E2.6 Function-extraction abstraction linter.
// E2.7 Golden-prompt regression suite lives in the harness; this module keeps
//      every check pure & callable headlessly.
//
// Loaded after safety_lab.js + ai_assistant.js, before reports.js consumers
// run. Every global read is typeof-guarded; every public function is safe to
// call on any project state.

const AiFidelity = (function () {
    'use strict';

    // ------------------------------------------------------------------ util
    function _fnv(str) {
        let h = 0x811c9dc5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return ('0000000' + (h >>> 0).toString(16)).slice(-8);
    }
    function _pc() { return (typeof projectConfig !== 'undefined' && projectConfig) ? projectConfig : null; }
    function _now() { return new Date().toISOString(); }
    function _signName() {
        try { if (typeof _signoffReviewerName === 'function') return _signoffReviewerName() || ''; } catch (_) {}
        return '';
    }

    // ==================================================================
    // E2.1 — CLAUSE LIBRARY (structured references, original one-line
    // paraphrases — never standard text) + per-section context scoping.
    // ==================================================================
    const CLAUSES = {
        _generic: [
            { ref: 'ARP 4761A §3', note: 'safety assessment process overview — FHA→PASA/PSSA→SSA/ASA spine with CCA in parallel' },
            { ref: 'ARP 4754B §5.1', note: 'safety program planning — methods declared per objective, tailoring recorded' },
        ],
        AFHA: [
            { ref: 'ARP 4761A App A', note: 'AFHA process — identify aircraft functions, postulate failure conditions, classify severity, set objectives' },
            { ref: 'ARP 4761A Table A7', note: 'prescribed AFHA worksheet columns' },
            { ref: 'AC 25.1309-1B', note: 'severity definitions and quantitative probability guidance per hazard class' },
        ],
        PASA: [
            { ref: 'ARP 4761A App B', note: 'PASA process — architecture evaluation, interdependence, combined effects, budget apportionment' },
            { ref: 'ARP 4761A B.3 / Table B1', note: 'functional interdependence identification per failure condition' },
            { ref: 'ARP 4761A B.4.3.1 / Table B2', note: 'combined functional failure effects (CoFFE) case evaluation' },
            { ref: 'ARP 4761A B.4.3.2 / Table B3', note: 'common resource analysis per failure condition' },
            { ref: 'ARP 4754B §5.4', note: 'FDAL assignment and independence-based allocation options' },
        ],
        SFHA: [
            { ref: 'ARP 4761A App C', note: 'SFHA process — system failure conditions consistent with aircraft-level allocations' },
            { ref: 'ARP 4761A Table C5', note: 'prescribed SFHA worksheet columns' },
        ],
        PSSA: [
            { ref: 'ARP 4761A App D', note: 'PSSA process — architecture to satisfy SFHA objectives, IDAL allocation, derived requirements' },
            { ref: 'ARP 4761A D.4.2.1.1', note: 'latent failure exposure-interval bounding' },
        ],
        SSA: [
            { ref: 'ARP 4761A App E', note: 'SSA process — verify objectives with as-built data' },
            { ref: 'ARP 4761A E.3.2.4', note: 'candidate certification maintenance requirements from significant latents' },
            { ref: 'ARP 4761A E.3.2.5', note: 'wear-out and non-constant failure-rate consideration' },
        ],
        ASA: [
            { ref: 'ARP 4761A App F', note: 'ASA process — aircraft-level closure rolling up SSA and CCA evidence' },
        ],
        ZSA: [{ ref: 'ARP 4761A App K', note: 'zonal safety analysis — installation, interference, maintenance-error hazards per zone' }],
        PRA: [{ ref: 'ARP 4761A App L', note: 'particular risk analysis — external threats striking multiple systems' }],
        CMA: [{ ref: 'ARP 4761A App M / Table M2', note: 'common mode analysis — independence-claim challenge worksheet' }],
        GTT: [],
    };
    function clausesFor(reportType) {
        return (CLAUSES._generic || []).concat(CLAUSES[reportType] || []);
    }

    // Heading-keyword → table-token relevance map (E2.1 scoping).
    const KEYMAP = [
        [/interdepend/i,                          ['interdep_table']],
        [/resource/i,                             ['common_resource_table']],
        [/minimum acceptable|\bmac\b/i,           ['mac_table']],
        [/mf&ms|malfunction|fault tree/i,         ['mfms_table', 'fta_summary', 'fta_summary_grid']],
        [/coffe|combined functional/i,            ['coffe_table']],
        [/independen/i,                           ['ip_ledger_table']],
        [/maintenance|latent|ccmr/i,              ['ccmr_table', 'wearout_table']],
        [/fmes|failure modes/i,                   ['fmes_table']],
        [/checklist|completion/i,                 ['checklist_table']],
        [/tailor/i,                               ['tailoring_table']],
        [/hazard|failure condition|classification|inventory/i, ['fha_table', 'afha_worksheet', 'sfha_worksheet', 'fc_evaluations']],
        [/requirement|validation|verification/i,  ['requirements_table', 'validation_matrix', 'verification_matrix']],
        [/assumption/i,                           ['assumptions_list']],
        [/zone|zonal/i,                           ['zsa_table']],
        [/particular risk/i,                      ['pra_table']],
        [/common.?mode|\bcma\b/i,                 ['cma_table', 'cma_grid']],
        [/item|lru|component/i,                   ['component_list']],
        [/gap|open item/i,                        ['gaps_table']],
        [/compliance|posture/i,                   ['compliance_posture']],
        [/quantitative|probability|budget|evidence|summary/i, ['fta_summary_grid', 'fta_summary']],
        [/method/i,                               []],
    ];
    const CORE_TABLES = ['fha_table'];   // always present (small cap) — the FC list anchors everything

    // sectionContext(reportType, data, section, baseCtx) → { ctx, manifest, clauses }
    // Filters baseCtx (the renderer-equivalent extract) down to what THIS
    // section needs; whatever is dropped or truncated is declared in the
    // manifest, which itself travels inside the context — the model is told
    // what it cannot see.
    function sectionContext(reportType, data, section, baseCtx) {
        const heading = (section && section.heading) || '';
        const prose = (section && section.prose) || '';
        const relevant = new Set(CORE_TABLES);
        KEYMAP.forEach(([re, keys]) => { if (re.test(heading)) keys.forEach(k => relevant.add(k)); });
        // Any table token the template prose references is by definition relevant.
        (prose.match(/\{\{([a-z_]+)\}\}/g) || []).forEach(t => relevant.add(t.slice(2, -2)));

        const ctx = {};
        const manifest = { truncated: {}, omitted: [] };
        Object.keys(baseCtx || {}).forEach(k => {
            const v = baseCtx[k];
            if (!Array.isArray(v)) { ctx[k] = v; return; }               // scalars + derived digest pass through
            const full = Array.isArray(data && data[k]) ? data[k].length : v.length;
            if (!relevant.has(k)) { manifest.omitted.push(k + ' (' + full + ' rows)'); return; }
            const cap = 40;
            const rows = (Array.isArray(data && data[k]) ? data[k] : v).slice(0, cap);
            ctx[k] = rows;
            if (full > rows.length) manifest.truncated[k] = rows.length + ' of ' + full + ' rows sent';
        });
        ctx.context_manifest = {
            note: 'Closed world: tables listed as omitted/truncated exist in the report but are not in this context. Do not describe their contents; refer to the table.',
            omitted_tables: manifest.omitted,
            truncated_tables: manifest.truncated,
        };
        return { ctx, manifest, clauses: clausesFor(reportType) };
    }

    // ==================================================================
    // E2.3 — DETERMINISTIC CLAIM CHECKER + TONE LINT (pure functions).
    // ==================================================================
    const _STD_PREFIX = /^(ARP|DO|ED|CS|AC|FAR|CFR|MIL|AS|SAE|NSWC|RTCA|EUROCAE|TSO|ETSO|IEC|ISO|PART|TABLE|APP|FIG)[-\s]/i;

    function _harvestKnownIds(data) {
        const ids = new Set();
        const add = v => { if (v != null && String(v).trim()) ids.add(String(v).trim()); };
        try {
            (typeof acFhaData !== 'undefined' ? acFhaData : []).forEach(f => { add(f.fcId); add(f.subId); });
            (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).forEach(f => { add(f.subId); add(f.funcId); });
            (typeof acReqData !== 'undefined' ? acReqData : []).forEach(r => { add(r.id); add(r.traceId); });
            (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []).forEach(a => add(a.asmId));
            (typeof systemsData !== 'undefined' ? systemsData : []).forEach(s => {
                add(s.id);
                (s.fha || []).forEach(f => { add(f.fcId); add(f.subId); });
                (s.req || []).forEach(r => { add(r.id); add(r.traceId); });
                (s.asm || []).forEach(a => add(a.asmId));
                (s.functions || []).forEach(f => { add(f.subId); add(f.funcId); });
            });
            (typeof itemsData !== 'undefined' ? itemsData : []).forEach(i => add(i.itemId));
            (typeof cmaData !== 'undefined' ? cmaData : []).forEach(c => add(c.cmaId));
            (typeof praData !== 'undefined' ? praData : []).forEach(p => add(p.praId));
            (typeof zsaData !== 'undefined' ? zsaData : []).forEach(z => add(z.zoneId));
        } catch (_) {}
        // Plus any ID-shaped token already present in the context strings — the
        // closed world includes exactly what the model was shown.
        try {
            const flat = JSON.stringify(data, (k, v) => (k && k.charAt && k.charAt(0) === '_') ? undefined : v);
            (flat.match(/[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]*\d[A-Za-z0-9-]*/g) || []).forEach(t => ids.add(t));
        } catch (_) {}
        return ids;
    }

    function _harvestKnownNumbers(data) {
        const nums = new Set();
        try {
            const flat = JSON.stringify(data, (k, v) => (k && k.charAt && k.charAt(0) === '_') ? undefined : v);
            (flat.match(/\d+(?:\.\d+)?[eE][-+]?\d+/g) || []).forEach(t => { const n = parseFloat(t); if (isFinite(n)) nums.add(n.toExponential(1)); });
        } catch (_) {}
        try {   // certification targets are always legitimate citations
            ['Catastrophic', 'Hazardous', 'Major', 'Minor'].forEach(sev => {
                if (typeof getSafetyTarget === 'function') { const t = getSafetyTarget(sev); if (t && t.prob) nums.add(Number(t.prob).toExponential(1)); }
            });
        } catch (_) {}
        return nums;
    }

    // checkClaims(text, data) → array of flags {kind, token, why}
    function checkClaims(text, data) {
        const flags = [];
        const t = String(text || '');
        const knownIds = _harvestKnownIds(data);
        // (a) ID-shaped tokens (must contain a digit) not in the model
        (t.match(/\b[A-Z][A-Za-z0-9]*-[A-Za-z0-9-]*\d[A-Za-z0-9-]*\b/g) || []).forEach(tok => {
            if (_STD_PREFIX.test(tok + ' ') || /^(ARP|DO|ED|CS|AC|FAR|CFR|MIL|AS|SAE|NSWC|RTCA|TSO|ETSO|IEC|ISO)-?\d/i.test(tok)) return;
            if (!knownIds.has(tok)) flags.push({ kind: 'id', token: tok, why: 'identifier not found in the project model' });
        });
        // (b) scientific-notation / ×10 probabilities not present in the data
        const knownNums = _harvestKnownNumbers(data);
        const numRe = /\b(\d+(?:\.\d+)?)\s*(?:[eE]\s*([-+]?\d+)|[×x]\s*10\s*(?:\^|⁻)?\s*([-+−]?\d+))\b/g;
        let m;
        while ((m = numRe.exec(t)) !== null) {
            const exp = m[2] != null ? m[2] : String(m[3] || '').replace('−', '-');
            const n = parseFloat(m[1] + 'e' + exp);
            if (isFinite(n) && !knownNums.has(n.toExponential(1))) {
                flags.push({ kind: 'number', token: m[0], why: 'quantitative value not present in the project data' });
            }
        }
        // (c) DAL letters claimed but absent from the model's DAL vocabulary
        const dalRe = /\b(?:FDAL|IDAL|DAL|Level)\s+([A-E])\b/g;
        const knownDals = new Set();
        try {
            const flat = JSON.stringify(data, (k, v) => (k && k.charAt && k.charAt(0) === '_') ? undefined : v);
            let d; const dr = /\b(?:FDAL|IDAL|DAL|Level)\s*:?\s*\/?\s*([A-E])\b/g;
            while ((d = dr.exec(flat)) !== null) knownDals.add(d[1]);
            (flat.match(/"DAL"\s*:\s*"([A-E])"/g) || []).forEach(x => knownDals.add(x.slice(-2, -1)));
        } catch (_) {}
        while ((m = dalRe.exec(t)) !== null) {
            if (!knownDals.has(m[1])) flags.push({ kind: 'dal', token: m[0], why: 'DAL letter not found in any allocation in the data' });
        }
        return flags;
    }

    // toneLint(text) → flags for compliance-asserting language (advisory only).
    const _TONE = [
        [/\b(?:is|are|remains?|be)\s+(?:fully\s+)?compliant\b/i, 'asserts compliance — advisory posture only; the authority decides'],
        [/\bmeets?\s+all\s+(?:applicable\s+)?requirements\b/i, 'blanket satisfaction claim — cite the specific objective instead'],
        [/\b(?:is|are)\s+certified\b/i, 'certification is granted by the authority, never asserted by the report'],
        [/\bdemonstrates?\s+(?:full\s+)?compliance\b/i, 'compliance determination belongs to the DER/authority'],
        [/\bguarantee[sd]?\b/i, 'no guarantees in a safety assessment — state posture and evidence'],
        [/\bcompletely\s+safe\b|\babsolutely\s+safe\b/i, 'absolute safety claims are never appropriate'],
        [/\bno\s+further\s+(?:action|analysis|work)\s+(?:is\s+)?(?:required|needed)\b/i, 'closure is the authority\'s call — phrase as "no open items identified (advisory)"'],
    ];
    function toneLint(text) {
        const flags = [];
        _TONE.forEach(([re, why]) => { const m = String(text || '').match(re); if (m) flags.push({ kind: 'tone', token: m[0], why }); });
        return flags;
    }

    // tokenLint(text, data) — E2.2: every {{token}} the AI writes must resolve.
    function tokenLint(text, data) {
        const flags = [];
        (String(text || '').match(/\{\{([a-z_]+)\}\}/g) || []).forEach(tok => {
            const k = tok.slice(2, -2);
            if (!(data && k in data)) flags.push({ kind: 'token', token: tok, why: 'references a token that does not exist — it would render literally' });
        });
        return flags;
    }

    // reviewDraft(text, data) — the full deterministic pass.
    function reviewDraft(text, data) {
        const claims = checkClaims(text, data);
        const tone = toneLint(text);
        const tokens = tokenLint(text, data);
        return { claims, tone, tokens, total: claims.length + tone.length + tokens.length, clean: !(claims.length + tone.length + tokens.length) };
    }

    // ==================================================================
    // E2.5 — PROVENANCE LEDGER + DRAFT STATE MACHINE + HAND-OFF GATE.
    // ==================================================================
    function _provStore() {
        const pc = _pc(); if (!pc) return [];
        if (!Array.isArray(pc.aiProvenance)) pc.aiProvenance = [];
        return pc.aiProvenance;
    }
    function recordProvenance(rec) {
        try {
            const store = _provStore();
            store.push(Object.assign({ at: _now() }, rec));
            if (store.length > 500) store.splice(0, store.length - 500);
            try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        } catch (_) {}
    }

    function _draftStore() {
        const pc = _pc(); if (!pc) return {};
        if (!pc.aiDrafts) pc.aiDrafts = {};
        return pc.aiDrafts;
    }
    function draftKey(reportType, systemId, sectionId) {
        return String(reportType) + (systemId ? ':' + systemId : '') + ':' + String(sectionId);
    }
    // drafted → (accepted | edited | discarded). Only 'drafted' and
    // flagged-accepts-without-override block the hand-off gate.
    function noteDrafted(key, meta) {
        try {
            _draftStore()[key] = Object.assign({ state: 'drafted', at: _now() }, meta || {});
            try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        } catch (_) {}
    }
    function setDraftState(key, state, extra) {
        try {
            const s = _draftStore();
            s[key] = Object.assign(s[key] || {}, extra || {}, { state, stateAt: _now() });
            try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
        } catch (_) {}
    }
    // Abandoned drafting session: unaccepted proposals never reached a document,
    // so they must not poison the gate. Accepted/edited/discarded records persist.
    function clearUnaccepted(reportType) {
        try {
            const s = _draftStore();
            Object.keys(s).forEach(k => {
                if (k.indexOf(String(reportType) + ':') === 0 && s[k].state === 'drafted') delete s[k];
            });
        } catch (_) {}
    }

    // Accept with provenance: flags require a signed override rationale; every
    // acceptance writes one assumption row — the AI act is logged in the same
    // register every other engineering assumption lives in.
    function _nextAiAsmId() {
        const pc = _pc();
        const n = ((pc && pc.aiAsmCounter) || 0) + 1;
        if (pc) pc.aiAsmCounter = n;
        return 'ASM-AI-' + String(n).padStart(3, '0');
    }
    function acceptDraft(key, opts) {
        opts = opts || {};
        const rec = _draftStore()[key] || {};
        setDraftState(key, opts.edited ? 'edited' : 'accepted', {
            by: opts.by || '', overrideNote: opts.overrideNote || '',
        });
        try {
            if (typeof acAssumptionsData !== 'undefined' && Array.isArray(acAssumptionsData)) {
                const asmId = _nextAiAsmId();
                acAssumptionsData.push({
                    asmId,
                    text: 'AI-drafted narrative ' + (opts.edited ? '(engineer-edited) ' : '') + 'accepted for ' + key.split(':')[0] +
                          ' §"' + (rec.heading || key) + '" — model ' + (rec.model || '?') + ', prompt ' + (rec.promptHash || '?') +
                          ', inputs ' + (rec.inputFp || '?') +
                          (rec.flags ? ', ' + rec.flags + ' checker flag(s)' + (opts.overrideNote ? ' overridden: ' + opts.overrideNote : '') : ', checker clean') +
                          '. Accepted by ' + (opts.by || '?') + '.',
                    state: 'Validated', valStrategy: 'Engineer review of AI draft (E2)', valArtifact: '', verArtifact: '',
                    origin: 'AI provenance',
                });
                try { if (typeof renderACAssumptions === 'function') renderACAssumptions(); } catch (_) {}
            }
        } catch (_) {}
        recordProvenance({
            kind: 'accept', key, heading: rec.heading || '', model: rec.model || '',
            promptHash: rec.promptHash || '', inputFp: rec.inputFp || '',
            flags: rec.flags || 0, overrideNote: opts.overrideNote || '', by: opts.by || '', edited: !!opts.edited,
        });
        try { if (typeof commitSaveChanges === 'function') commitSaveChanges(); } catch (_) {}
    }

    // Hand-off gate eval — plugged into every completion checklist.
    function gateEval(assessKey) {
        try {
            const s = _draftStore();
            let drafted = 0, accepted = 0, edited = 0, badOverride = 0;
            Object.keys(s).forEach(k => {
                if (k.split(':')[0] !== assessKey) return;
                const r = s[k];
                if (r.state === 'drafted') drafted++;
                else if (r.state === 'accepted') { accepted++; if ((r.flags || 0) > 0 && !r.overrideNote) badOverride++; }
                else if (r.state === 'edited') edited++;
            });
            if (!drafted && !accepted && !edited) return { pass: true, detail: 'none drafted' };
            if (drafted) return { pass: false, detail: drafted + ' AI draft(s) awaiting review' };
            if (badOverride) return { pass: false, detail: badOverride + ' accepted with unresolved checker flags' };
            return { pass: true, detail: accepted + ' accepted · ' + edited + ' edited, provenance logged' };
        } catch (_) { return { pass: true, detail: 'n/a' }; }
    }

    // ==================================================================
    // E2.6 — FUNCTION-EXTRACTION ABSTRACTION LINTER.
    // ==================================================================
    const FUNCTION_VERBS = [
        'control', 'provide', 'generate', 'maintain', 'decelerate', 'accelerate', 'indicate', 'display',
        'communicate', 'navigate', 'aviate', 'sense', 'detect', 'measure', 'store', 'distribute', 'supply',
        'protect', 'contain', 'extinguish', 'pressurize', 'ventilate', 'cool', 'heat', 'steer', 'absorb',
        'transmit', 'receive', 'alert', 'warn', 'record', 'isolate', 'separate', 'sequence', 'convert',
        'regulate', 'stabilize', 'trim', 'hold', 'capture', 'avoid', 'prevent', 'mitigate', 'manage',
        'deliver', 'retract', 'extend', 'deploy', 'stow', 'illuminate', 'lift', 'propel', 'stop',
        'evacuate', 'restrain', 'support', 'enable', 'annunciate', 'monitor',
    ];
    const EQUIP_NOUNS = [
        'elevator', 'aileron', 'rudder', 'flap', 'flaps', 'slat', 'slats', 'spoiler', 'spoilers', 'stabilizer',
        'actuator', 'servo', 'pump', 'valve', 'battery', 'generator', 'alternator', 'busbar', 'wire', 'harness',
        'relay', 'breaker', 'inverter', 'transformer', 'gearbox', 'shaft', 'bearing', 'motor', 'propeller',
        'rotor', 'turbine', 'compressor', 'duct', 'manifold', 'reservoir', 'accumulator', 'strut', 'tire',
        'wheel', 'caliper', 'transducer', 'antenna', 'transponder', 'processor', 'lru', 'ecu', 'fadec',
        'lever', 'pedal', 'yoke', 'stick', 'pushrod', 'linkage', 'hinge',
    ];
    function _projectNouns() {
        const nouns = new Set(EQUIP_NOUNS);
        const verbSet = new Set(FUNCTION_VERBS);
        // Stoplist: states, qualities and generic words that appear in LRU names
        // but are NOT equipment (an item called "Standby attitude module" must
        // not turn "attitude" into a forbidden noun for "Control pitch attitude").
        const STOP = /^(system|systems|control|controls|flight|aircraft|power|left|right|main|upper|lower|attitude|airspeed|altitude|heading|position|pressure|temperature|data|air|fuel|ice|thrust|standby|primary|secondary|module|unit|channel|assembly)$/;
        const feed = (name) => String(name || '').toLowerCase().split(/[^a-z0-9&-]+/)
            .filter(w => w.length > 3 && !verbSet.has(w) && !STOP.test(w))
            .forEach(w => nouns.add(w));
        try {
            (typeof itemsData !== 'undefined' ? itemsData : []).forEach(i => feed(i.name));
            (typeof resourcesData !== 'undefined' ? resourcesData : []).forEach(r => { /* resource NAMES stay legal in provide-phrases */ });
        } catch (_) {}
        return nouns;
    }
    // lintFunctionName(name) → { ok, flags:[{rule, why}] }
    function lintFunctionName(name) {
        const flags = [];
        const raw = String(name || '').trim();
        const words = raw.toLowerCase().split(/[^a-z0-9&-]+/).filter(Boolean);
        if (!words.length) return { ok: false, flags: [{ rule: 'empty', why: 'no name' }] };
        const verbs = new Set(FUNCTION_VERBS.concat((_pc() && _pc().functionVerbs) || []));
        const first = words[0].replace(/e?s$/, m => (verbs.has(words[0]) ? '' : m));   // tolerate 3rd-person s
        if (!verbs.has(words[0]) && !verbs.has(first)) {
            flags.push({ rule: 'verb-object', why: '"' + raw + '" does not start with a function verb (control, provide, decelerate, …) — functions are behaviors, not things' });
        }
        if (words.length < 2) flags.push({ rule: 'needs-object', why: 'a function needs an object — what is being ' + words[0] + 'ed?' });
        const nouns = _projectNouns();
        words.slice(1).forEach(w => {
            if (nouns.has(w)) flags.push({ rule: 'implementation-noun', why: '"' + w + '" is equipment, not behavior — state WHAT is accomplished, not the part that does it ("control pitch", not "move ' + w + '")' });
        });
        return { ok: flags.length === 0, flags };
    }
    // lintFunctions(groups) — decompose-proposal shape { funcName, subs:[{subName}] }.
    function lintFunctions(groups) {
        let flagged = 0;
        (groups || []).forEach(g => {
            g._lint = lintFunctionName(g.funcName);
            if (!g._lint.ok) flagged++;
            (g.subs || []).forEach(s => { s._lint = lintFunctionName(s.subName); if (!s._lint.ok) flagged++; });
        });
        return flagged;
    }

    // ==================================================================
    // E2.4 — ADVERSARIAL REVIEW PASS (optional slot).
    // ==================================================================
    async function adversarialReview(opts) {
        const P = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
        if (!(P && typeof P.complete === 'function')) throw new Error('AI backend not available.');
        const sys = [
            'You are an adversarial auditor for a certification document section. You are NOT the author.',
            'Your ONLY job: list every claim in the prose that is NOT directly supported by the JSON data provided.',
            'A claim is unsupported if it names an entity, value, relationship, or conclusion absent from the data.',
            'Do NOT rewrite, praise, or summarize. Respond ONLY with JSON: {"unsupported":[{"quote":"…","reason":"…"}]}.',
            'If everything is supported, respond {"unsupported":[]}.',
        ].join('\n');
        const user = 'SECTION: ' + (opts.heading || '') + '\n\nPROSE:\n"""\n' + (opts.prose || '') + '\n"""\n\nDATA:\n' + JSON.stringify(opts.ctx || {}, null, 1).slice(0, 24000);
        const r = await P.complete({ feature: 'report.section.audit', system: sys, messages: [{ role: 'user', content: user }], maxTokens: 1500, temperature: 0 });
        const txt = (r && (r.text || (r.raw && r.raw.content && r.raw.content[0] && r.raw.content[0].text))) || '';
        let items = [];
        try {
            const j = JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]);
            items = Array.isArray(j.unsupported) ? j.unsupported.filter(x => x && x.quote) : [];
        } catch (_) { items = txt.trim() ? [{ quote: '(unparseable audit response)', reason: txt.slice(0, 200) }] : []; }
        recordProvenance({ kind: 'audit', feature: 'report.section.audit', heading: opts.heading || '', model: (r && r.model) || '', findings: items.length });
        return items;
    }

    // ==================================================================
    // Universal call ledger — wrap the exported provider once so every AI
    // call through window.SafetyLabAI.complete leaves a provenance record.
    // ==================================================================
    function _wrapProvider() {
        try {
            const P = (typeof window !== 'undefined') ? window.SafetyLabAI : null;
            if (!P || typeof P.complete !== 'function' || P.complete._afWrapped) return;
            const orig = P.complete.bind(P);
            const wrapped = async function (req) {
                const t0 = Date.now();
                let model = '', ok = true;
                try { const r = await orig(req); model = (r && r.model) || ''; return r; }
                catch (e) { ok = false; throw e; }
                finally {
                    try {
                        recordProvenance({
                            kind: 'call', feature: (req && req.feature) || '?', model, ok, ms: Date.now() - t0,
                            promptHash: _fnv(JSON.stringify([(req && req.system) || '', (req && req.messages) || ''])),
                        });
                    } catch (_) {}
                }
            };
            wrapped._afWrapped = true;
            P.complete = wrapped;
        } catch (_) {}
    }
    if (typeof window !== 'undefined') { _wrapProvider(); if (typeof setTimeout === 'function') setTimeout(_wrapProvider, 0); }

    // ------------------------------------------------------------------ API
    return {
        fnv: _fnv,
        clausesFor, sectionContext,
        checkClaims, toneLint, tokenLint, reviewDraft,
        recordProvenance, provStore: _provStore,
        draftKey, draftStore: _draftStore, noteDrafted, setDraftState, clearUnaccepted, acceptDraft, gateEval,
        FUNCTION_VERBS, lintFunctionName, lintFunctions,
        adversarialReview,
    };
})();
if (typeof window !== 'undefined') window.AiFidelity = AiFidelity;
