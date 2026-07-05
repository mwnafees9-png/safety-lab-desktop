// reports.js — Reports module (v1 namespace + v2 §56.9 section editor + v3 §56.10 AI
// bulk-draft), extracted verbatim from safety_lab.js (Phase 76). Classic script, loaded
// AFTER safety_lab.js so v1 reads the real SEVERITY_RANK/DAL_RANK_MAP (typeof-guarded) and
// v2/v3 then patch window.Reports. The monolith references window.Reports only at runtime
// (guarded). The Paywall (§56.13) and markdown→docx helper stay in the monolith. Byte-identical.

const Reports = (function() {
    'use strict';

    // ------------------------------------------------------------------------
    // REPORT_DEFS — the 9 ARP 4761A artifacts.
    // scope: 'aircraft' (uses top-level data) or 'system' (needs a systemId pick).
    // allowedAppendices: which auxiliary analyses can be attached as appendices.
    // ------------------------------------------------------------------------
    const REPORT_DEFS = {
        AFHA: { name: 'Aircraft Functional Hazard Assessment',          scope: 'aircraft', allowedAppendices: ['fta'] },
        PASA: { name: 'Preliminary Aircraft Safety Assessment',         scope: 'aircraft', allowedAppendices: ['fta','zsa','pra','cma'] },
        ASA:  { name: 'Aircraft Safety Assessment',                     scope: 'aircraft', allowedAppendices: ['fta','zsa','pra','cma'] },
        SFHA: { name: 'System Functional Hazard Assessment',            scope: 'system',   allowedAppendices: ['fta'] },
        PSSA: { name: 'Preliminary System Safety Assessment',           scope: 'system',   allowedAppendices: ['fta','cma'] },
        SSA:  { name: 'System Safety Assessment',                       scope: 'system',   allowedAppendices: ['fta','cma'] },
        ZSA:  { name: 'Zonal Safety Analysis',                          scope: 'aircraft', allowedAppendices: [] },
        PRA:  { name: 'Particular Risk Analysis',                       scope: 'aircraft', allowedAppendices: [] },
        CMA:  { name: 'Common Mode Analysis',                           scope: 'aircraft', allowedAppendices: [] },
        GTT:  { name: 'Golden Thread Trace Report',                     scope: 'aircraft', allowedAppendices: [] },
    };

    // ------------------------------------------------------------------------
    // DEFAULT_TEMPLATES — ARP 4761A-aligned section structure with {{tokens}}.
    // Tables are referenced as {{x_table}} placeholders; the renderer expands
    // them into proper docx Table / jsPDF autoTable structures.
    // ------------------------------------------------------------------------
    const DEFAULT_TEMPLATES = {
        GTT: [
            '# Golden Thread Trace Report',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Scope:** {{gt_scope}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This report lays out the golden thread for {{gt_scope}} — tracing each failure condition from its aircraft function and system, through the fault tree, the common-cause analyses (PRA / ZSA / CMA) that test its independence, the derived safety requirement, and its verification. Each row is one failure-condition thread; every analysis and requirement named is one linked in the project model at the time of generation.',
            '',
            '## 2. Trace matrix',
            '{{goldenthread_table}}',
            '',
            '## 3. Open items',
            '{{goldenthread_gaps}}',
            '',
            '*Generated from the Safety Lab project model. AI-assisted drafts in this project are engineer-accepted; the links shown are those recorded in the model. Evidence, not enthusiasm.*',
        ].join('\n'),
        AFHA: [
            '# Aircraft Functional Hazard Assessment',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Aircraft Functional Hazard Assessment (AFHA) identifies aircraft-level functions, postulates their failure conditions, classifies the severity of resulting hazards, and assigns aircraft-level safety objectives in accordance with ARP 4761A and AC 25.1309-1B (or the equivalent Part 23/27/29/SC-VTOL guidance per the certification basis).',
            '',
            '## 2. Scope',
            'Aircraft-level functions are decomposed top-down. Each functional failure condition is classified using the FAA hazard categories (Catastrophic, Hazardous, Major, Minor, No Safety Effect) and the corresponding quantitative probability budget per FAR §xx.1309. System-level allocation is deferred to the SFHA.',
            '',
            '## 3. Functional Hazard Inventory',
            '{{fha_table}}',
            '',
            '## 4. Aircraft-Level Safety Requirements',
            '{{requirements_table}}',
            '',
            '## 5. Validation Assumptions',
            '{{assumptions_list}}',
                    '',
            '## 6. Completion Checklist (ARP 4761A §A.9)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),

        PASA: [
            '# Preliminary Aircraft Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Preliminary Aircraft Safety Assessment (PASA) develops the aircraft-level safety architecture necessary to satisfy the AFHA-derived safety objectives. It establishes the development assurance levels (DAL) for functions per ARP 4754B §5.4 and apportions quantitative budgets across systems.',
            '',
            '## 2. Top-Level Failure Conditions',
            '{{fha_table}}',
            '',
            '## 3. Architectural Considerations',
            'Aircraft-level architectural choices are described, including redundancy, independence claims (Option 1), dissimilarity, and integrated common-cause defenses (zonal, particular-risk, common-mode).',
            '',
            '## 4. Allocated Requirements',
            '{{requirements_table}}',
            '',
            '## 5. Development Assurance Allocation',
            'FDAL is allocated to aircraft functions; IDAL is allocated to items as they are identified. The carrier-child Option 1 claim is documented per top-down allocation rules.',
            '',
            '## 6. Common-Cause Coverage',
            'See appendices for the Zonal Safety, Particular Risk, and Common Mode analyses.',
            '',
            '## 7. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 8. Linked Fault Trees',
            '{{fta_summary}}',
            '',
            '## 9. Appendices',
            '{{appendix:fta}}',
            '{{appendix:zsa}}',
            '{{appendix:pra}}',
            '{{appendix:cma}}',
                    '',
            '## 10. Functional Interdependence (ARP 4761A Table B1)',
            'Contributing systems per aircraft failure condition. Marks are derived from function traces, resource provide/consume mappings, and SFHA trace-backs, or asserted with signature; cleared cells record a signed review. Derived facts cannot be suppressed by manual clears.',
            '{{interdep_table}}',
            '',
            '## 11. Common Resource Analysis (ARP 4761A Table B3)',
            'Recorded effects of resource loss or malfunction on each failure condition’s contributing systems, with the combined aircraft-level effect (B.4.3.2 step d).',
            '{{common_resource_table}}',
            '',
            '## 12. Minimum Acceptable Control Model',
            'Minimum-equipment floors per aircraft function. Each rule is recorded as an assumption routed to design until substantiated against the SDD. Minimal breach combinations are enumerated exactly and drive the compiled MF&MS trees.',
            '{{mac_table}}',
            '',
            '## 13. Malfunction & Failure Mode Summary Trees (B.4.1)',
            'Compiled trees are proven equivalent to the MAC model by BDD minimal-cut-set comparison; authored trees are cross-checked against the model and the locked CoFFE constraints. Authored malfunction grafts sit outside the equivalence theorem by design.',
            '{{mfms_table}}',
            '',
            '## 14. Combined Functional Failure Effects — CoFFE (ARP 4761A Table B2)',
            'Dual-lane worksheet: signed engineering verdicts (elicited) against the compiled MAC model (computed). Agreement between lanes is verification; disagreement is a finding — elicited-yes / computed-no flags a missing tree branch, elicited-no / computed-yes challenges the MAC model.',
            '{{coffe_table}}',
            '',
            '## 15. Independence Principles',
            'Deduplicated registry of every independence claim in the aircraft-level model — failure independence from minimal cut sets, error independence from DAL-allocation gates — with CMA evidence, derived requirements, and evaluation state.',
            '{{ip_ledger_table}}',
            '',
            '## 16. Methodology (Safety Program Plan)',
            '{{spp_summary}}',
            '',
            '## 17. Completion Checklist (ARP 4761A B.5)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
            '',
            '## 18. Tailoring Register',
            'Every completion-checklist objective tailored out of this program, with its signed rationale. Opting out is an act, not an absence.',
            '{{tailoring_table}}',
        ].join('\n'),

        ASA: [
            '# Aircraft Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Aircraft Safety Assessment (ASA) closes the safety case by demonstrating that the as-built aircraft satisfies the AFHA-derived safety objectives. Quantitative claims roll up from SSA evidence; qualitative claims roll up from architectural verification.',
            '',
            '## 2. Compliance to AFHA Objectives',
            '{{fha_table}}',
            '',
            '## 3. Verified Aircraft-Level Requirements',
            '{{requirements_table}}',
            '',
            '## 4. Rolled-Up Quantitative Evidence',
            '{{fta_summary}}',
            '',
            '## 5. Common-Cause Verification',
            'Evidence from ZSA, PRA, and CMA is summarized; full analyses appear in appendices.',
            '',
            '## 6. Residual Assumptions',
            '{{assumptions_list}}',
            '',
            '## 7. Component / Item Inventory',
            '{{component_list}}',
            '',
            '## 8. Appendices',
            '{{appendix:fta}}',
            '{{appendix:zsa}}',
            '{{appendix:pra}}',
            '{{appendix:cma}}',
                    '',
            '## 9. Independence Principle Verification',
            'Final state of every independence principle claimed by the model. Compromised or unevaluated principles block the ASA gate.',
            '{{ip_ledger_table}}',
            '',
            '## 10. Candidate Certification Maintenance Requirements (E.3.2.4 Roll-Up)',
            'Aircraft-level roll-up of latent failures with their not-to-exceed exposure intervals, computed through the live fault-tree engine.',
            '{{ccmr_table}}',
            '',
            '## 11. Completion Checklist (ARP 4761A F.4)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
            '',
            '## 12. Tailoring Register',
            '{{tailoring_table}}',
        ].join('\n'),

        SFHA: [
            '# System Functional Hazard Assessment',
            '**Project:** {{project_name}}  ',
            '**System:** {{system_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This System Functional Hazard Assessment (SFHA) decomposes aircraft-level functions allocated to the {{system_name}} system, identifies system-level failure conditions, and establishes system safety objectives consistent with the aircraft-level allocations.',
            '',
            '## 2. System Functions and Failure Conditions',
            '{{fha_table}}',
            '',
            '## 3. System Safety Requirements',
            '{{requirements_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
                    '',
            '## 5. Completion Checklist (ARP 4761A C.9)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),

        PSSA: [
            '# Preliminary System Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**System:** {{system_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Preliminary System Safety Assessment (PSSA) develops the {{system_name}} system safety architecture necessary to satisfy SFHA-derived objectives. It allocates IDAL to items, derives lower-level safety requirements, and identifies common-mode hazards requiring CMA treatment.',
            '',
            '## 2. System Failure Conditions',
            '{{fha_table}}',
            '',
            '## 3. Architectural Decisions',
            'Redundancy schemes, independence claims, dissimilarity strategies, and CCF defenses (β-factor / α-factor / MGL) are documented per gate. Common-mode candidates are flagged for CMA.',
            '',
            '## 4. Allocated Item Requirements',
            '{{requirements_table}}',
            '',
            '## 5. Common-Mode Considerations',
            'Linked common-mode subjects are described; full evaluation appears in the CMA appendix.',
            '',
            '## 6. Items / LRUs',
            '{{component_list}}',
            '',
            '## 7. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 8. Linked Fault Trees',
            '{{fta_summary}}',
            '',
            '## 9. Appendices',
            '{{appendix:fta}}',
            '{{appendix:cma}}',
                    '',
            '## 10. Latent Failure Bounds (D.4.2.1.1)',
            'Latent events in this system’s trees with their exposure intervals and not-to-exceed bounds.',
            '{{ccmr_table}}',
            '',
            '## 11. Completion Checklist (ARP 4761A D.5)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),

        SSA: [
            '# System Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**System:** {{system_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This System Safety Assessment (SSA) closes the {{system_name}} system safety case. Quantitative top-event probabilities are evaluated using as-built component failure data, BDD-exact P(top), and uncertainty bounds. Qualitative claims (DAL, independence, common-cause) are verified.',
            '',
            '## 2. Compliance to SFHA Objectives',
            '{{fha_table}}',
            '',
            '## 3. Verified System Requirements',
            '{{requirements_table}}',
            '',
            '## 4. Quantitative Evidence',
            '{{fta_summary}}',
            '',
            '## 5. Common-Mode Verification',
            'Each CMA subject linked to this system has been evaluated and dispositioned. See the CMA appendix for details.',
            '',
            '## 6. Items / LRUs',
            '{{component_list}}',
            '',
            '## 7. Residual Assumptions',
            '{{assumptions_list}}',
            '',
            '## 8. Appendices',
            '{{appendix:fta}}',
            '{{appendix:cma}}',
                    '',
            '## 9. Failure Modes & Effects Summary (FMES)',
            'Derived grouping of FMEA rows by (end effect, detection) — the summary is generated from the live FMEA, never maintained by hand, so it cannot drift from its source.',
            '{{fmes_table}}',
            '',
            '## 10. Candidate Certification Maintenance Requirements (E.3.2.4)',
            'Latent failures with not-to-exceed exposure intervals, computed by bisection through the live BDD engine.',
            '{{ccmr_table}}',
            'Wear-out candidates (E.3.2.5) — events sourced from mechanical component-library entries where the constant-failure-rate assumption requires substantiation:',
            '{{wearout_table}}',
            '',
            '## 11. Independence Principles (E.3.1.1)',
            '{{ip_ledger_table}}',
            '',
            '## 12. Completion Checklist (ARP 4761A E.4)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),

        ZSA: [
            '# Zonal Safety Analysis',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'The Zonal Safety Analysis (ZSA) inspects each aircraft zone to identify hazards arising from co-located equipment, installation defects, and maintenance-induced damage that single-system analyses cannot detect.',
            '',
            '## 2. Methodology',
            'Each zone is walked top-down: housed equipment is enumerated, postulated failure modes are evaluated for interference with adjacent equipment, and mitigations are documented. Findings flowing into AutoReq generate housed-function separation requirements.',
            '',
            '## 3. Zone-by-Zone Findings',
            '{{zsa_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
                    '',
            '## 5. Completion Checklist',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),

        PRA: [
            '# Particular Risk Analysis',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'The Particular Risk Analysis (PRA) evaluates external threats that can damage multiple systems simultaneously: bird strike, lightning, HIRF, tire burst, uncontained engine failure, fire, fluid leakage, hail, and ice.',
            '',
            '## 2. Methodology',
            'Each particular risk is characterized by its threat source, affected systems, credible failure modes, and required mitigations. Zonal adjacencies feed system-impact propagation.',
            '',
            '## 3. Particular Risk Catalog',
            '{{pra_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
                    '',
            '## 5. Completion Checklist',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),

        CMA: [
            '# Common Mode Analysis',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'The Common Mode Analysis (CMA) identifies common-cause failures that can defeat redundancy, dissimilarity, and architectural independence claims. CMA subjects originate from PSSA architectural decisions and are dispositioned in the SSA.',
            '',
            '## 2. Methodology',
            'Each CMA subject documents the claim being protected, the candidate common-mode source, findings from analysis or test, and the disposition. Linked FTA gates are referenced where the claim originates.',
            '',
            '## 3. Common-Mode Subjects',
            '{{cma_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
                    '',
            '## 5. Completion Checklist (ARP 4761A M.3)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
    };

    // ------------------------------------------------------------------------
    // _certBasisLabel — friendly cert-basis string from projectConfig.
    // ------------------------------------------------------------------------
    function _certBasisLabel() {
        try {
            const pc = (typeof projectConfig !== 'undefined') ? projectConfig : {};
            if (pc.customCertBasis) return pc.customCertBasis;
            const reg = pc.regulation || '';
            if (reg === 'part-25')   return 'FAA 14 CFR Part 25 / AC 25.1309-1B';
            if (reg === 'part-23')   return 'FAA 14 CFR Part 23 / AC 23.1309-1E (Class ' + (pc.part23Class || 'I') + ')';
            if (reg === 'part-27')   return 'FAA 14 CFR Part 27 (Normal Category Rotorcraft)';
            if (reg === 'part-29')   return 'FAA 14 CFR Part 29 (Transport Category Rotorcraft)';
            if (reg === 'part-33')   return 'FAA 14 CFR Part 33 (Engines)';
            if (reg === 'part-35')   return 'FAA 14 CFR Part 35 (Propellers)';
            if (reg === 'part-450')  return 'FAA 14 CFR Part 450 (Launch & Reentry)';
            if (reg === 'part-107')  return 'FAA 14 CFR Part 107 (sUAS)';
            if (reg === 'sc-vtol')   return 'EASA SC-VTOL (' + (pc.scvtolCategory || 'Enhanced') + ')';
            return reg || 'Unspecified';
        } catch (_) { return 'Unspecified'; }
    }

    function _aircraftName() {
        try { return (typeof projectName !== 'undefined' && projectName) || 'Aircraft'; } catch (_) { return 'Aircraft'; }
    }
    function _projectName() {
        try { return (typeof projectName !== 'undefined' && projectName) || 'Untitled Project'; } catch (_) { return 'Untitled Project'; }
    }
    function _todayISO() { return new Date().toISOString().slice(0, 10); }

    // ------------------------------------------------------------------------
    // _resolveSystem — given an explicit systemId or current sys-workspace
    // context, returns the systemsData record (or null).
    // ------------------------------------------------------------------------
    function _resolveSystem(systemId) {
        try {
            if (!Array.isArray(systemsData)) return null;
            if (systemId) return systemsData.find(s => s.id === systemId) || null;
            const activeSys = (typeof activeSystemId !== 'undefined') ? activeSystemId : null;
            if (activeSys) return systemsData.find(s => s.id === activeSys) || null;
        } catch (_) {}
        return null;
    }

    // ------------------------------------------------------------------------
    // extractData(reportType, opts) — pulls the data dictionary that drives
    // token substitution. Returns POJOs (not strings) for table tokens so
    // renderers can build proper tables.
    // ------------------------------------------------------------------------
    function extractData(reportType, opts) {
        opts = opts || {};
        const def = REPORT_DEFS[reportType];
        if (!def) throw new Error('Unknown report type: ' + reportType);

        const sys = def.scope === 'system' ? _resolveSystem(opts.systemId) : null;
        if (def.scope === 'system' && !sys) throw new Error('System scope report requires a systemId.');

        const fhaSource = sys ? (sys.fha || []) : (typeof acFhaData !== 'undefined' ? acFhaData : []);
        const reqSource = sys ? (sys.req || []) : (typeof acReqData !== 'undefined' ? acReqData : []);
        const asmSource = sys ? (sys.asm || []) : (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []);
        const funcSource = sys ? (sys.functions || []) : (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []);

        // Items: aircraft-level + system-level. For system-scope reports, filter to this system.
        const allItems = (typeof itemsData !== 'undefined' && Array.isArray(itemsData)) ? itemsData : [];
        const items = sys ? allItems.filter(it => it.owningSystemId === sys.id) : allItems.filter(it => !it.owningSystemId);

        // FTA pages: for system-scope, filter to this system; otherwise aircraft-level + standalone.
        const allFta = (typeof ftaPages !== 'undefined' && Array.isArray(ftaPages)) ? ftaPages : [];
        const ftaPagesScoped = sys
            ? allFta.filter(p => p.systemId === sys.id || (p.treeLevel === 'system' && p.systemId === sys.id))
            : allFta.filter(p => p.treeLevel !== 'system');

        // PRA / ZSA — aircraft-scope only in the registry.
        const pra = (typeof praData !== 'undefined' && Array.isArray(praData)) ? praData : [];
        const zsa = (typeof zsaData !== 'undefined' && Array.isArray(zsaData)) ? zsaData : [];

        // CMA — filter by scope when system-scope. Aircraft-scope CMA has scope='aircraft' (or undefined).
        const cmaAll = (typeof cmaData !== 'undefined' && Array.isArray(cmaData)) ? cmaData : [];
        const cma = sys
            ? cmaAll.filter(c => c.scope === 'system' && c.owningSystemId === sys.id)
            : cmaAll.filter(c => c.scope !== 'system');

        return {
            // Golden Thread Trace Report tokens (REPORT_DEFS.GTT). Cheap, ignored by other types.
            gt_scope: (function(){ try { if(opts && opts.functionSubId){ const f = (typeof acFunctionsData !== 'undefined' ? acFunctionsData : []).find(x => x.subId === opts.functionSubId); return f ? (f.subId + ' · ' + (f.subName || '')) : opts.functionSubId; } } catch(e){} return 'all aircraft functions'; })(),
            goldenthread_table: (function(){ try { return _gtvReportRows(opts ? opts.functionSubId : null); } catch(e){ return []; } })(),
            goldenthread_gaps:  (function(){ try { return _gtvReportGaps(opts ? opts.functionSubId : null); } catch(e){ return 'No open items detected.'; } })(),

            // Scalars
            project_name:  _projectName(),
            aircraft_name: _aircraftName(),
            system_name:   sys ? (sys.name || sys.id || '—') : '',
            cert_basis:    _certBasisLabel(),
            date:          _todayISO(),

            // Tables (POJOs; renderers format them)
            fha_table: fhaSource.map(f => ({
                'FC ID':    f.fcId || '',
                'Function': (function() {
                    const fid = f.subId || (Array.isArray(f.subIds) && f.subIds[0]) || '';
                    const fn = funcSource.find(x => (x.subId === fid) || (x.funcId === fid));
                    return fn ? (fn.subName || fn.funcName || fid) : fid;
                })(),
                'Failure Condition': f.fcDesc || '',
                'Severity': f.severity || '',
                'Effect (Aircraft)': f.effAc || '',
                'Effect (Crew)':     f.effCrew || '',
                'Effect (Pax)':      f.effPax || '',
                'Phases': Array.isArray(f.phases) ? f.phases.join(', ') : (f.phases || ''),
            })),

            requirements_table: reqSource.map(r => ({
                'Req ID':     r.id || ('REQ-' + (r.internalId || '')),
                'Level':      r.level || '',
                'Type':       r.type || '',
                'Requirement': r.text || '',
                'Rationale':  r.rat || '',
                'Verification': r.verifStatus || r.vvStatus || 'Pending',
            })),

            assumptions_list: asmSource.map(a => ({
                'ID':       a.asmId || '',
                'Statement': a.text || a.statement || '',
                'State':    a.state || '',
                'Strategy': a.valStrategy || '',
            })),

            component_list: items.map(it => ({
                'Item ID': it.itemId || '',
                'Name':    it.name || '',
                'Type':    it.type || '',
                'DAL':     it.dal || '',
                'DA Kind': it.daType || '',
                'Description': it.description || '',
            })),

            fta_summary: ftaPagesScoped.map(p => ({
                'Tree':   p.name || p.id,
                'Level':  p.treeLevel || 'standalone',
                'Mode':   p.mode || 'top-down',
                'Top Event': (p.root && p.root.name) ? p.root.name : '(empty)',
                'Linked Failure Condition(s)': Array.isArray(p.linkedFhaIds) ? p.linkedFhaIds.join(', ') : (p.linkedFhaId || ''),
            })),

            pra_table: pra.map(p => ({
                'ID':        p.praId || '',
                'Threat':    p.threat || '',
                'Description': p.desc || '',
                'Affected Systems': Array.isArray(p.systems) ? p.systems.join(', ') : (p.systems || ''),
                'CSFL':      p.csfl || '',
                'Mitigation': p.mitigation || '',
            })),

            zsa_table: zsa.map(z => ({
                'Zone':     z.zoneId || '',
                'Description': z.desc || '',
                'Equipment': z.equip || '',
                'Severity': z.severity || '',
                'Interference': z.interference || '',
                'Mitigation': z.mitigation || '',
            })),

            cma_table: cma.map(c => ({
                'ID':       c.cmaId || '',
                'Subject':  c.subject || '',
                'Claim':    c.claim || '',
                'Status':   c.status || '',
                'Findings': c.findings || '',
                'Mitigation': c.mitigation || '',
            })),

            // Appendix metadata — drives renderFTAAppendix() and similar
            _ftaPagesForAppendix: ftaPagesScoped,
            _praForAppendix: pra,
            _zsaForAppendix: zsa,
            _cmaForAppendix: cma,

            // ----------------------------------------------------------------
            // DERIVED / ADVISORY tokens (builds #144 / #145 / #146 / #147).
            // All additive. Table tokens are POJO arrays (rendered by the same
            // table machinery); the *_summary / *_narrative scalars are strings
            // (rendered via the scalar substitution path). Computed lazily-ish
            // here so every report has them available without changing callers.
            // ----------------------------------------------------------------
            ...(function() {
                const scope = def.scope;
                try {
                    // #146 compliance posture (wired into every report).
                    const posture = complianceRiskForReport(reportType, scope, { sys: sys });
                    // #144 gap surfacing.
                    const gaps = surfaceGaps(reportType, scope, { sys: sys });
                    // #147 per-FC evaluations (advisory; used by PASA + PSSA esp.).
                    const fcEvals = (fhaSource || []).map(f => evaluateFcQualitative(f, scope, { sys: sys, asmSource: asmSource }));

                    return {
                        // #145 prescribed grids
                        afha_worksheet:    _buildFhaWorksheet(fhaSource, funcSource),
                        sfha_worksheet:    _buildFhaWorksheet(fhaSource, funcSource),
                        fta_summary_grid:  _buildFtaSummaryGrid(fhaSource, scope, sys, asmSource),
                        cma_grid:          _buildCmaGrid(cma),
                        coffe_table:       _buildCoffeTableV2(fhaSource, scope, sys, asmSource),
                        validation_matrix: _buildValidationMatrix(reqSource, funcSource),
                        verification_matrix: _buildVerificationMatrix(reqSource),

                        // Phase E1 — Q-format artifact family (Phase C/D stores)
                        interdep_table:        scope === 'aircraft' ? _buildInterdepTable() : [],
                        common_resource_table: scope === 'aircraft' ? _buildCommonResourceTable() : [],
                        mac_table:             scope === 'aircraft' ? _buildMacTable() : [],
                        mfms_table:            scope === 'aircraft' ? _buildMfmsTable() : [],
                        ip_ledger_table:       _buildIpLedgerTable(),
                        ccmr_table:            _buildCcmrTable(sys),
                        wearout_table:         _buildWearoutTable(sys),
                        fmes_table:            _buildFmesTable(sys),
                        checklist_table:       _buildChecklistTable(reportType),
                        tailoring_table:       _buildTailoringTable(),
                        checklist_summary:     _checklistSummary(reportType),
                        spp_summary:           _sppSummary(),

                        // #146 compliance-risk + path roll-up
                        compliance_posture: _complianceRisksToRows(posture),
                        compliance_summary: posture.summary,

                        // #147 per-FC qualitative evaluation
                        fc_evaluations: _fcEvalToRows(fcEvals),
                        fc_eval_narrative: (fcEvals.length
                            ? ('Each failure condition below has been evaluated qualitatively against the linked fault tree(s): single-failure posture (order-1 cut sets), DAL adequacy (allocated vs cert-basis required), inferred protective strategy, open requirements, and the assumptions it rests on. This is an advisory engineering posture; final classification rests with the certifying authority.')
                            : 'No failure conditions are defined in this scope yet; the per-failure-condition evaluation will populate once the FHA is built.'),

                        // #144 gap / orphan / unconfirmed-assumption surfacing
                        gaps_table: gaps.rows,
                        gaps_summary: gaps.summary,

                        // Raw structured objects (for the AI context builder; not
                        // rendered directly — underscore-prefixed so the table
                        // machinery ignores them).
                        _compliancePosture: posture,
                        _fcEvaluations: fcEvals,
                        _gaps: gaps,
                    };
                } catch (e) {
                    // Defensive: a report must always render. On any failure in
                    // the advisory layer, emit empty tokens + a note rather than
                    // throwing out of extractData.
                    try { if (typeof console !== 'undefined') console.warn('Reports advisory layer failed (non-fatal):', e); } catch (_) {}
                    return {
                        afha_worksheet: [], sfha_worksheet: [], fta_summary_grid: [], cma_grid: [],
                        coffe_table: [], validation_matrix: [], verification_matrix: [],
                        interdep_table: [], common_resource_table: [], mac_table: [], mfms_table: [],
                        ip_ledger_table: [], ccmr_table: [], wearout_table: [], fmes_table: [],
                        checklist_table: [], tailoring_table: [], checklist_summary: '', spp_summary: '',
                        compliance_posture: [], compliance_summary: 'Compliance posture unavailable (advisory layer error); see model directly.',
                        fc_evaluations: [], fc_eval_narrative: 'Per-failure-condition evaluation unavailable (advisory layer error).',
                        gaps_table: [], gaps_summary: 'Gap surfacing unavailable (advisory layer error).',
                        _compliancePosture: null, _fcEvaluations: [], _gaps: null,
                    };
                }
            })(),
        };
    }

    // ========================================================================
    // ADVISORY ANALYSIS ENGINES (Phase 56.x — builds #145/#146/#147)
    // ------------------------------------------------------------------------
    // These functions READ the live model + CALL existing compute primitives
    // (getCutsets, getReferrers/Traceability, getSafetyTarget /
    // getNormalizedSafetyTarget, expandCCFCutsets). They NEVER mutate the tree,
    // never re-run allocateDAL on live nodes, and never assert final regulatory
    // compliance. Output is posture + risk + path; the DER/authority decides.
    // Everything is defensive: every primitive call is try/guarded so a report
    // can always render even on a partially-built project.
    // ========================================================================

    // Severity / DAL ranking — read module-scope constants when present, else
    // fall back to a local copy so Reports never throws if load order shifts.
    const _SEV_RANK = (typeof SEVERITY_RANK !== 'undefined') ? SEVERITY_RANK
        : { Catastrophic: 5, Hazardous: 4, Major: 3, Minor: 2, Negligible: 1 };
    const _DAL_RANK = (typeof DAL_RANK_MAP !== 'undefined') ? DAL_RANK_MAP
        : { A: 5, B: 4, C: 3, D: 2, E: 1 };

    function _sevRank(s) { return _SEV_RANK[s] || 0; }
    function _safeCall(fn, fallback) { try { return fn(); } catch (_) { return fallback; } }

    // Resolve every fault-tree page linked to one failure-condition row.
    // FC→tree is via page.linkedFhaIds[] (legacy linkedFhaId), matched on the
    // FHA internalId. Returns the page objects (read-only).
    function _treesForFc(fcRow) {
        if (!fcRow || typeof ftaPages === 'undefined' || !Array.isArray(ftaPages)) return [];
        const iid = fcRow.internalId;
        if (iid == null) return [];
        return ftaPages.filter(p => {
            const links = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length)
                ? p.linkedFhaIds : (p.linkedFhaId != null ? [p.linkedFhaId] : []);
            return links.indexOf(iid) !== -1;
        });
    }

    // Read the most-stringent allocatedDAL already present on a tree's events
    // (the live reactive allocator populates node.allocatedDAL). READ-ONLY — we
    // do NOT call allocateDAL here, to avoid mutating shared-event instances.
    function _achievedDalForTree(page) {
        let best = null; // strictest letter seen (A beats B …)
        if (!page || !page.root) return best;
        const rank = (d) => _DAL_RANK[d] || 0;
        (function walk(n, seen) {
            if (!n || seen.has(n)) return; seen.add(n);
            if (n.allocatedDAL && (!best || rank(n.allocatedDAL) > rank(best))) best = n.allocatedDAL;
            const kids = n.children || n._children;
            if (kids) kids.forEach(c => walk(c, seen));
        })(page.root, new Set());
        return best;
    }

    // Order-1 (single-event) cut sets across a tree — the authoritative
    // structural single-point-failure signal. CALLS getCutsets (read-only).
    function _order1Cutsets(page) {
        if (!page || !page.root || typeof getCutsets !== 'function') return [];
        const raw = _safeCall(() => getCutsets(page.root), []);
        const singles = (raw || []).filter(cs => Array.isArray(cs) && cs.length === 1);
        // De-dup on logicalId so repeated events collapse to one SPF finding.
        const seen = new Set(); const out = [];
        singles.forEach(cs => {
            const ev = cs[0]; if (!ev) return;
            const key = (ev.logicalId != null ? ev.logicalId : ev.id);
            if (seen.has(key)) return; seen.add(key);
            out.push(ev);
        });
        return out;
    }

    // Read-only mirror of the public "OR-family structural SPF" concept used by
    // the engine's checkORCompromise (which lives private to the AutoReq
    // closure and is not reachable from Reports). We do NOT call or modify it;
    // we re-derive the same advisory signal from the tree shape: a top OR-family
    // gate on a >=Hazardous tree means every direct child is structurally a SPF.
    function _topOrSpfNote(page, severity) {
        if (!page || !page.root) return null;
        if (_sevRank(severity) < 4) return null; // only Catastrophic / Hazardous
        const root = page.root;
        const isOrFamily = root.type === 'gate' && (root.gateType === 'OR' || root.gateType === 'XOR');
        if (!isOrFamily) return null;
        const kids = (root.children || root._children || []);
        if (!kids.length) return null;
        return 'Top gate is OR-family on a ' + severity + ' tree — each direct input is structurally a single point of failure (advisory; confirm against the design intent).';
    }

    // Independence / shared-event note from the order-1 + full cut sets:
    // surfaces repeated logicalIds (shared events) and CCF-group members that
    // appear inside cut sets. CALLS getCutsets + expandCCFCutsets (read-only).
    function _independenceNote(page) {
        const notes = [];
        if (!page || !page.root || typeof getCutsets !== 'function') return notes;
        const raw = _safeCall(() => getCutsets(page.root), []);
        // Repeated/shared events: same logicalId appearing in 2+ cut sets.
        const lidCounts = new Map();
        (raw || []).forEach(cs => {
            const seenInCs = new Set();
            (cs || []).forEach(ev => {
                const lid = (ev && ev.logicalId != null) ? ev.logicalId : (ev && ev.id);
                if (lid == null || seenInCs.has(lid)) return; seenInCs.add(lid);
                lidCounts.set(lid, (lidCounts.get(lid) || 0) + 1);
                if (!lidCounts._names) lidCounts._names = {};
                lidCounts._names[lid] = (ev && (ev.name || ev.displayId)) || String(lid);
            });
        });
        lidCounts.forEach((count, lid) => {
            if (count >= 2) {
                const nm = (lidCounts._names && lidCounts._names[lid]) || String(lid);
                notes.push('Shared/repeated event "' + nm + '" appears in ' + count + ' cut sets — it spans multiple paths and can defeat the independence those paths claim.');
            }
        });
        // CCF-group members present in any cut set.
        const ccfGroups = new Set();
        (raw || []).forEach(cs => (cs || []).forEach(ev => { if (ev && ev.ccfGroup && (ev.beta > 0)) ccfGroups.add(ev.ccfGroup); }));
        ccfGroups.forEach(g => notes.push('Cut sets include members of CCF group "' + g + '" (β > 0) — common-cause coupling is modeled; verify the CCF defense in the CMA.'));
        return notes;
    }

    // Protective-strategy inference from gate structure: presence of AND/VOTING
    // (redundancy) and INHIBIT (conditional/monitor) gates. Purely structural,
    // qualitative — no numbers.
    function _protectiveStrategy(page) {
        const found = { redundancy: false, voting: false, monitor: false, gates: 0 };
        if (!page || !page.root) return found;
        (function walk(n, seen) {
            if (!n || seen.has(n)) return; seen.add(n);
            if (n.type === 'gate') {
                found.gates++;
                if (n.gateType === 'AND') found.redundancy = true;
                if (n.gateType === 'VOTING') found.voting = true;
                if (n.gateType === 'INHIBIT' || n.gateType === 'PAND') found.monitor = true;
            }
            const kids = n.children || n._children;
            if (kids) kids.forEach(c => walk(c, seen));
        })(page.root, new Set());
        return found;
    }

    // Map an FHA row (AC or system) to a Traceability target descriptor so we
    // can pull its requirements via getReferrers.
    function _fcReferrerTarget(fcRow, scope, sys) {
        if (!fcRow) return null;
        if (scope === 'system' && sys) return { kind: 'sysFha', id: fcRow.internalId, systemId: sys.id };
        return { kind: 'acFha', id: fcRow.internalId };
    }

    // Requirement-by-requirement met/open for one FC. CALLS Traceability
    // .getReferrers (read-only), then rolls up each requirement's mocEntries.
    function _requirementStatusForFc(fcRow, scope, sys) {
        const out = [];
        if (typeof Traceability === 'undefined' || !Traceability.getReferrers) return out;
        const target = _fcReferrerTarget(fcRow, scope, sys);
        if (!target) return out;
        const refs = _safeCall(() => Traceability.getReferrers(target), []) || [];
        const reqRefs = refs.filter(r => r.kind === 'acReq' || r.kind === 'sysReq');
        // Resolve each ref back to the requirement object to read mocEntries.
        const acReqs = (typeof acReqData !== 'undefined' && Array.isArray(acReqData)) ? acReqData : [];
        reqRefs.forEach(r => {
            let reqObj = null;
            if (r.kind === 'acReq') reqObj = acReqs.find(x => x.internalId === r.id);
            else if (r.kind === 'sysReq' && typeof systemsData !== 'undefined') {
                (systemsData || []).some(s => { const f = (s.req || []).find(x => x.internalId === r.id); if (f) { reqObj = f; return true; } return false; });
            }
            const moc = (reqObj && Array.isArray(reqObj.mocEntries)) ? reqObj.mocEntries : [];
            const status = _rollupMocStatus(moc);
            out.push({
                reqId: (reqObj && (reqObj.traceId || reqObj.id)) || ('#' + r.id),
                text: r.label || (reqObj && reqObj.text) || '',
                status: status.label,
                open: status.open,
                mocCount: moc.length,
            });
        });
        return out;
    }

    // Roll a requirement's mocEntries[] into one advisory status.
    //   Compliant / N/A  → satisfied for that paragraph
    //   anything else (Pending / In Progress / Partial / Non-Compliant) → open
    //   no entries        → "No MoC credit recorded" (open)
    function _rollupMocStatus(mocEntries) {
        if (!Array.isArray(mocEntries) || !mocEntries.length) {
            return { label: 'No MoC credit recorded', open: true };
        }
        const norm = s => String(s || '').trim().toLowerCase();
        const anyRisk = mocEntries.some(e => {
            const st = norm(e.status);
            return st === 'pending' || st === 'in progress' || st === 'partial' || st === 'non-compliant';
        });
        const allOk = mocEntries.every(e => { const st = norm(e.status); return st === 'compliant' || st === 'n/a'; });
        if (allOk) return { label: 'MoC credit recorded (Compliant / N/A)', open: false };
        if (anyRisk) return { label: 'MoC credit incomplete', open: true };
        return { label: 'MoC status mixed', open: true };
    }

    // Assumptions an FC rests on: FHA.assumptionIds[] joined to the asm source,
    // plus asm.state (Proposed / Validated / Verified).
    function _assumptionsForFc(fcRow, asmSource) {
        const out = [];
        if (!fcRow) return out;
        const ids = Array.isArray(fcRow.assumptionIds) ? fcRow.assumptionIds : [];
        const src = Array.isArray(asmSource) ? asmSource : [];
        ids.forEach(aid => {
            const a = src.find(x => x.asmId === aid || x.internalId === aid);
            out.push({
                asmId: aid,
                statement: (a && (a.text || a.statement)) || '',
                state: (a && a.state) || 'Unknown',
                confirmed: !!(a && (a.state === 'Validated' || a.state === 'Verified')),
            });
        });
        return out;
    }

    // ------------------------------------------------------------------------
    // #147 — evaluateFcQualitative(fcRow, scope, opts)
    // Deterministic per-failure-condition qualitative evaluation. Returns a
    // structured object (no fabricated numbers). ADVISORY only.
    //   scope: 'aircraft' | 'system' ; opts.sys = systemsData record (sys scope)
    //          opts.asmSource = assumption array for the scope.
    // ------------------------------------------------------------------------
    function evaluateFcQualitative(fcRow, scope, opts) {
        opts = opts || {};
        const sys = opts.sys || null;
        const asmSource = opts.asmSource || (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []);
        const severity = fcRow ? (fcRow.severity || '') : '';
        const phasesStr = fcRow ? (Array.isArray(fcRow.phases) ? fcRow.phases.join(', ') : (fcRow.phases || '')) : '';

        const trees = _treesForFc(fcRow);

        // Required DAL + max-allowable probability budget from the cert basis.
        const tgt = _safeCall(() => (typeof getSafetyTarget === 'function') ? getSafetyTarget(severity) : null, null);
        const normTgt = _safeCall(() => (typeof getNormalizedSafetyTarget === 'function') ? getNormalizedSafetyTarget(severity, phasesStr) : null, null);
        const requiredDal = tgt ? tgt.dal : null;

        // Single-failure judgment — order-1 cut sets + top-OR structural note.
        const spfEvents = [];
        const structuralNotes = [];
        const independenceNotes = [];
        let achievedDal = null;
        const protective = { redundancy: false, voting: false, monitor: false };

        trees.forEach(p => {
            _order1Cutsets(p).forEach(ev => spfEvents.push({
                tree: p.name || p.id,
                event: (ev && (ev.name || ev.displayId)) || '(unnamed)',
                id: ev && ev.displayId,
            }));
            const orNote = _topOrSpfNote(p, severity);
            if (orNote) structuralNotes.push({ tree: p.name || p.id, note: orNote });
            _independenceNote(p).forEach(n => independenceNotes.push({ tree: p.name || p.id, note: n }));
            const ad = _achievedDalForTree(p);
            if (ad && (!achievedDal || (_DAL_RANK[ad] || 0) > (_DAL_RANK[achievedDal] || 0))) achievedDal = ad;
            const ps = _protectiveStrategy(p);
            protective.redundancy = protective.redundancy || ps.redundancy || ps.voting;
            protective.voting = protective.voting || ps.voting;
            protective.monitor = protective.monitor || ps.monitor;
        });

        const singleFailure = (function() {
            if (!trees.length) return { judgment: 'no-tree', detail: 'No fault tree is linked to this failure condition — single-failure posture cannot be evaluated from the model.' };
            if (spfEvents.length) return { judgment: 'spf-present', detail: spfEvents.length + ' order-1 (single-event) cut set(s) found — at least one single failure propagates to the top event.', events: spfEvents };
            if (structuralNotes.length) return { judgment: 'structural-spf', detail: 'Structural single-point-failure exposure at an OR-family top on a high-severity tree.', notes: structuralNotes };
            return { judgment: 'no-spf-found', detail: 'No order-1 cut sets detected — no single modeled failure reaches the top event (advisory; depends on tree completeness).' };
        })();

        // DAL adequacy: achieved (read off the tree) vs required (cert basis).
        const dalAdequacy = (function() {
            if (!requiredDal) return { judgment: 'no-target', detail: 'No DAL target is defined for severity "' + (severity || '—') + '" under the active certification basis.' };
            if (!achievedDal) return { judgment: 'not-allocated', required: requiredDal, detail: 'Required DAL for a ' + severity + ' condition is ' + requiredDal + ', but no allocated DAL is present on the linked tree(s). Run DAL allocation to establish the posture.' };
            const ok = (_DAL_RANK[achievedDal] || 0) >= (_DAL_RANK[requiredDal] || 0);
            return {
                judgment: ok ? 'meets' : 'short',
                required: requiredDal,
                achieved: achievedDal,
                detail: ok
                    ? 'Allocated DAL ' + achievedDal + ' meets or exceeds the ' + requiredDal + ' required for a ' + severity + ' condition.'
                    : 'Allocated DAL ' + achievedDal + ' is LESS stringent than the ' + requiredDal + ' required for a ' + severity + ' condition — allocation gap to close.',
            };
        })();

        const protectiveStrategy = (function() {
            const parts = [];
            if (protective.redundancy) parts.push('redundancy (AND/voting structure present)');
            if (protective.monitor) parts.push('monitoring / conditional gating (INHIBIT/PAND present)');
            if (!parts.length) return { judgment: 'none-inferred', detail: 'No redundancy or monitoring structure is inferable from the linked tree(s) — protective strategy not evident in the model.' };
            return { judgment: 'present', detail: 'Inferred protective strategy: ' + parts.join('; ') + '.' };
        })();

        const requirements = _requirementStatusForFc(fcRow, scope, sys);
        const openRequirements = requirements.filter(r => r.open);
        const assumptions = _assumptionsForFc(fcRow, asmSource);
        const unconfirmedAssumptions = assumptions.filter(a => !a.confirmed);

        return {
            fcId: fcRow ? (fcRow.fcId || '') : '',
            fcDesc: fcRow ? (fcRow.fcDesc || '') : '',
            severity: severity,
            phases: phasesStr,
            linkedTreeCount: trees.length,
            linkedTrees: trees.map(p => p.name || p.id),
            maxAllowableProb: (normTgt && normTgt.prob != null) ? normTgt.prob : (tgt && tgt.prob != null ? tgt.prob : null),
            requiredDal: requiredDal,
            achievedDal: achievedDal,
            singleFailure: singleFailure,
            independence: independenceNotes,
            dalAdequacy: dalAdequacy,
            protectiveStrategy: protectiveStrategy,
            requirements: requirements,
            openRequirements: openRequirements,
            assumptions: assumptions,
            unconfirmedAssumptions: unconfirmedAssumptions,
        };
    }

    // Flatten an FC evaluation into table rows for the report grids. ADVISORY
    // wording only — never "compliant".
    function _fcEvalToRows(evals) {
        return (evals || []).map(e => ({
            'FC ID': e.fcId,
            'Severity': e.severity,
            'Linked Trees': e.linkedTreeCount,
            'Single-Failure Posture': e.singleFailure ? e.singleFailure.detail : '',
            'DAL (req → alloc)': (e.requiredDal || '—') + ' → ' + (e.achievedDal || 'none'),
            'Protective Strategy': e.protectiveStrategy ? e.protectiveStrategy.detail : '',
            'Open Requirements': e.openRequirements ? e.openRequirements.length : 0,
            'Unconfirmed Assumptions': e.unconfirmedAssumptions ? e.unconfirmedAssumptions.length : 0,
        }));
    }

    // ------------------------------------------------------------------------
    // #146 — complianceRiskForReport(reportType, scope, opts)
    // Filters applicable regulatory items (COMPLIANCE_CATALOGUE.appliesTo vs
    // projectConfig.regulation), rolls up requirement mocEntries into risk, adds
    // model-state risks (FCs without trees, orphan traces, unconfirmed
    // assumptions), and attaches a MoC-method PATH to each risk. ADVISORY:
    // presents risk + path; never declares compliance achieved.
    // ------------------------------------------------------------------------
    function complianceRiskForReport(reportType, scope, opts) {
        opts = opts || {};
        const sys = opts.sys || null;
        const risks = [];

        // --- Regulatory applicability (read projectConfig.regulation) ---
        const reg = _safeCall(() => (typeof projectConfig !== 'undefined' && projectConfig.regulation) || null, null);
        const catalogue = (typeof COMPLIANCE_CATALOGUE !== 'undefined' && Array.isArray(COMPLIANCE_CATALOGUE)) ? COMPLIANCE_CATALOGUE : [];
        const applicable = catalogue.filter(e => {
            const at = Array.isArray(e.appliesTo) ? e.appliesTo : [];
            return reg ? at.indexOf(reg) >= 0 : true;
        });

        // --- Requirement MoC roll-up (the substantive compliance signal) ---
        // Gather requirements in scope: system-scope → that system's req;
        // aircraft-scope → AC-level req. Each requirement with MoC entries that
        // are not all Compliant/N/A is a compliance RISK with a method-tied path.
        const reqs = [];
        if (scope === 'system' && sys) (sys.req || []).forEach(r => reqs.push(r));
        else if (typeof acReqData !== 'undefined' && Array.isArray(acReqData)) acReqData.forEach(r => reqs.push(r));

        reqs.forEach(r => {
            const moc = Array.isArray(r.mocEntries) ? r.mocEntries : [];
            if (!moc.length) return; // requirements with no MoC credit surface in the model-state pass below if traced to a gap
            const roll = _rollupMocStatus(moc);
            if (roll.open) {
                // Pick the first non-satisfied entry to anchor the path + paragraph.
                const norm = s => String(s || '').trim().toLowerCase();
                const open = moc.find(e => norm(e.status) !== 'compliant' && norm(e.status) !== 'n/a') || moc[0];
                risks.push({
                    item: (r.traceId || r.id || ('REQ-' + r.internalId)) + ' — ' + ((r.text || '').slice(0, 90)),
                    paragraph: ((open.regulation || '') + ' ' + (open.paragraph || '')).trim() || '(unmapped)',
                    status: open.status || 'Pending',
                    path: 'Close via ' + (open.method || 'an appropriate MoC method') + ' (MoC ' + (open.status || 'Pending') + '); record evidence and update the MoC entry to Compliant.',
                    source: 'requirement-moc',
                });
            }
        });

        // --- Model-state risks ---
        // (a) FCs with no linked tree (cat/haz first — highest exposure).
        const fhaSource = (scope === 'system' && sys) ? (sys.fha || [])
            : (typeof acFhaData !== 'undefined' ? acFhaData : []);
        (fhaSource || []).forEach(f => {
            const trees = _treesForFc(f);
            if (!trees.length && _sevRank(f.severity) >= 4) {
                risks.push({
                    item: (f.fcId || '#' + f.internalId) + ' — ' + ((f.fcDesc || '').slice(0, 80)),
                    paragraph: reg ? (reg + ' §x.1309 (quantitative substantiation)') : 'xx.1309',
                    status: 'No fault tree linked',
                    path: 'Build/link a fault tree for this ' + (f.severity || 'severe') + ' condition (MoC method: Analysis) to substantiate the safety objective.',
                    source: 'model-fc-no-tree',
                });
            }
        });

        // (b) Orphan traces — surfaced from Traceability descriptors whose label
        // marks them as an orphan / no-longer-exists trace target.
        if (typeof Traceability !== 'undefined' && Traceability.getReferrers) {
            (fhaSource || []).forEach(f => {
                const target = _fcReferrerTarget(f, scope, sys);
                const refs = _safeCall(() => Traceability.getReferrers(target), []) || [];
                refs.forEach(r => {
                    const isOrphan = /orphan trace/i.test(r.label || '') || /no longer exist/i.test(r.detail || '');
                    if (isOrphan) {
                        risks.push({
                            item: (f.fcId || '#' + f.internalId) + ' → ' + (r.label || 'orphan trace'),
                            paragraph: 'ARP 4754B §5.4 (requirement traceability)',
                            status: 'Orphan trace',
                            path: 'Repair the trace target or remove the stale reference (MoC method: Inspection of the trace data).',
                            source: 'model-orphan-trace',
                        });
                    }
                });
            });
        }

        // (c) Unconfirmed assumptions (asmSource state not Validated/Verified).
        const asmSource = (scope === 'system' && sys) ? (sys.asm || [])
            : (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []);
        (asmSource || []).forEach(a => {
            const st = a.state || 'Proposed';
            if (st !== 'Validated' && st !== 'Verified') {
                risks.push({
                    item: (a.asmId || '#' + a.internalId) + ' — ' + ((a.text || a.statement || '').slice(0, 90)),
                    paragraph: 'ARP 4761A (assumption management)',
                    status: 'Assumption ' + st,
                    path: 'Validate then verify this assumption (MoC method: Analysis / Demonstration); update its state to Validated/Verified.',
                    source: 'model-assumption',
                });
            }
        });

        // Summary — advisory posture, NOT a pass/fail verdict.
        const counts = { requirement: 0, model: 0 };
        risks.forEach(r => { if (r.source === 'requirement-moc') counts.requirement++; else counts.model++; });
        const summary = risks.length
            ? ('This assessment identifies ' + risks.length + ' open compliance-risk item(s) (' + counts.requirement + ' from requirement MoC status, ' + counts.model + ' from model state) across ' + applicable.length + ' applicable regulatory item(s) for the ' + (reg || 'selected') + ' basis. Each carries a proposed path to closure. This is an advisory safety posture: it does not assert regulatory compliance — the Designated Engineering Representative / authority makes that determination.')
            : ('No open compliance-risk items were identified from the current model state and requirement MoC status across ' + applicable.length + ' applicable regulatory item(s) for the ' + (reg || 'selected') + ' basis. This is an advisory posture and does not by itself constitute a finding of compliance; the Designated Engineering Representative / authority makes that determination.');

        return {
            regulation: reg,
            applicableCount: applicable.length,
            applicable: applicable.map(e => ({ regulation: e.regulation, paragraph: e.paragraph, title: e.title })),
            risks: risks,
            summary: summary,
        };
    }

    // Compliance-posture risk rows for the report grids.
    function _complianceRisksToRows(posture) {
        return ((posture && posture.risks) || []).map(r => ({
            'Item': r.item,
            'Regulatory Ref': r.paragraph,
            'Posture / Status': r.status,
            'Path to Closure': r.path,
            'Source': r.source,
        }));
    }

    // ------------------------------------------------------------------------
    // #144 — surfaceGaps(reportType, scope, opts)
    // Surfaces gaps / orphans / unconfirmed assumptions for a report:
    //   • FCs with no linked fault tree
    //   • orphan trace targets (Traceability "orphan trace" descriptors)
    //   • unconfirmed assumptions (asmSource.state)
    // READ-ONLY; CALLS Traceability.getReferrers + _treesForFc. Returns rows +
    // a short summary. This is the SURFACING surface for #144 — it makes gaps
    // explicit rather than letting prose bury them.
    // ------------------------------------------------------------------------
    function surfaceGaps(reportType, scope, opts) {
        opts = opts || {};
        const sys = opts.sys || null;
        const rows = [];

        const fhaSource = (scope === 'system' && sys) ? (sys.fha || [])
            : (typeof acFhaData !== 'undefined' ? acFhaData : []);
        (fhaSource || []).forEach(f => {
            if (!_treesForFc(f).length) {
                rows.push({
                    'Kind': 'FC without fault tree',
                    'Subject': (f.fcId || '#' + f.internalId) + ' — ' + ((f.fcDesc || '').slice(0, 70)),
                    'Severity / State': f.severity || '—',
                    'Recommended Action': 'Link or build a fault tree to substantiate this failure condition.',
                });
            }
        });

        if (typeof Traceability !== 'undefined' && Traceability.getReferrers) {
            (fhaSource || []).forEach(f => {
                const target = _fcReferrerTarget(f, scope, sys);
                const refs = _safeCall(() => Traceability.getReferrers(target), []) || [];
                refs.forEach(r => {
                    if (/orphan trace/i.test(r.label || '') || /no longer exist/i.test(r.detail || '')) {
                        rows.push({
                            'Kind': 'Orphan trace',
                            'Subject': (f.fcId || '#' + f.internalId) + ' → ' + (r.label || ''),
                            'Severity / State': r.detail || 'stale reference',
                            'Recommended Action': 'Repair or remove the dangling trace target.',
                        });
                    }
                });
            });
        }

        const asmSource = (scope === 'system' && sys) ? (sys.asm || [])
            : (typeof acAssumptionsData !== 'undefined' ? acAssumptionsData : []);
        (asmSource || []).forEach(a => {
            const st = a.state || 'Proposed';
            if (st !== 'Validated' && st !== 'Verified') {
                rows.push({
                    'Kind': 'Unconfirmed assumption',
                    'Subject': (a.asmId || '#' + a.internalId) + ' — ' + ((a.text || a.statement || '').slice(0, 70)),
                    'Severity / State': st,
                    'Recommended Action': 'Validate then verify; update the assumption state.',
                });
            }
        });

        const summary = rows.length
            ? (rows.length + ' open gap(s) surfaced from the current model (failure conditions without trees, orphan traces, and unconfirmed assumptions). These are tracked items, not findings of non-compliance; each must be dispositioned before the safety case is closed.')
            : 'No open model gaps were surfaced: every failure condition in scope has a linked fault tree, no orphan traces were detected, and all in-scope assumptions are Validated or Verified.';

        return { rows: rows, summary: summary };
    }

    // ========================================================================
    // PRESCRIBED-GRID BUILDERS (build #145)
    // Each returns a POJO array shaped to the standard's worksheet columns.
    // Values come from the model + the advisory engines above. Numbers are
    // only emitted where the model actually carries them; otherwise a neutral
    // placeholder ("—" / "to be substantiated") is used — never fabricated.
    // ========================================================================

    // AFHA / SFHA worksheet — ARP 4761A Table A7 / C6 (6 columns).
    function _buildFhaWorksheet(fhaSource, funcSource) {
        return (fhaSource || []).map(f => {
            const fid = f.subId || (Array.isArray(f.subIds) && f.subIds[0]) || '';
            const fn = (funcSource || []).find(x => (x.subId === fid) || (x.funcId === fid));
            const fnName = fn ? (fn.subName || fn.funcName || fid) : fid;
            const effects = [f.effAc, f.effCrew, f.effPax].filter(Boolean).join(' / ');
            return {
                'ID #': f.fcId || ('#' + f.internalId),
                'Failure Condition': (fnName ? (fnName + ': ') : '') + (f.fcDesc || ''),
                'Flight Phase': Array.isArray(f.phases) ? f.phases.join(', ') : (f.phases || ''),
                'Effects of Failure Condition on Aircraft, Crew, Occupants': effects,
                'Severity Classification': f.severity || '',
                'Assumptions, Comments, Rationale or Reference to Supporting Material': f.comments || '',
            };
        });
    }

    // FTA data-summary chart — ARP 4761A Table G9 / G10 (system / LRU).
    // "Maximum Allowable Probability" derives from the FC severity (engine
    // owns the achieved probability). Allocated-vs-achieved DAL + an ADVISORY
    // posture column (never a bare regulatory "compliant" assertion).
    function _buildFtaSummaryGrid(fhaSource, scope, sys, asmSource) {
        const out = [];
        (fhaSource || []).forEach(f => {
            const trees = _treesForFc(f);
            const ev = evaluateFcQualitative(f, scope, { sys: sys, asmSource: asmSource });
            const maxAllow = ev.maxAllowableProb != null ? ev.maxAllowableProb.toExponential(1) + ' /FH' : '—';
            // Achieved probability is owned by the engine and shown on the FTA
            // toolbar / appendix; we present the qualitative posture here and
            // defer the exact figure to the FTA appendix to avoid duplicating
            // (and possibly desyncing) the compute output.
            const posture = (function() {
                if (!trees.length) return 'No tree linked — to be substantiated';
                const bits = [];
                if (ev.singleFailure && ev.singleFailure.judgment === 'spf-present') bits.push('SPF present');
                if (ev.dalAdequacy && ev.dalAdequacy.judgment === 'short') bits.push('DAL short');
                if (ev.dalAdequacy && ev.dalAdequacy.judgment === 'meets') bits.push('DAL meets');
                if (ev.openRequirements && ev.openRequirements.length) bits.push(ev.openRequirements.length + ' open req');
                return bits.length ? bits.join('; ') : 'No structural gap flagged (advisory)';
            })();
            out.push({
                'Function #': f.fcId || ('#' + f.internalId),
                'Description': f.fcDesc || '',
                'Corresponding Maximum Allowable Probability': maxAllow,
                'Allocated / Achieved DAL': (ev.requiredDal || '—') + ' / ' + (ev.achievedDal || 'none'),
                'Advisory Posture': posture,
                'Corrective Action / Path': (ev.openRequirements && ev.openRequirements.length)
                    ? 'Close ' + ev.openRequirements.length + ' open requirement(s); see compliance posture.'
                    : (trees.length ? '' : 'Build/link fault tree.'),
            });
        });
        return out;
    }

    // CMA evaluation worksheet — ARP 4761A Table M2 (3 columns).
    function _buildCmaGrid(cmaRows) {
        return (cmaRows || []).map(c => ({
            'Common Failure or Error Source Concern': c.subject || c.cmaId || '',
            'Description of Effect on Principle': c.claim || c.findings || '',
            'Description of Mitigating Factors or Lack of Independence': c.mitigation || (c.status ? ('Status: ' + c.status) : ''),
        }));
    }

    // PASA CoFFE — ARP 4761A Table B2 (Combined Functional Failure Effects).
    // Project-specific contributing-function columns can't be inferred safely
    // from the generic model, so we present a CoFFE scaffold keyed to the
    // cat/haz aircraft FCs: each row is a case, the FC is the capability
    // result, and the engine's single-failure posture fills the "results in
    // FC event?" column advisorily.
    function _buildCoffeTable(fhaSource, scope, sys, asmSource) {
        const crit = (fhaSource || []).filter(f => _sevRank(f.severity) >= 4);
        return crit.map((f, i) => {
            const ev = evaluateFcQualitative(f, scope, { sys: sys, asmSource: asmSource });
            const results = ev.singleFailure && ev.singleFailure.judgment === 'spf-present'
                ? 'Yes — single-failure path exists (advisory)'
                : (ev.linkedTreeCount ? 'Combination required (no order-1 cut set found)' : 'To be determined (no tree linked)');
            return {
                'Case #': 'C' + (i + 1),
                'Contributing Function(s) / Capability': (f.fcId || '') + ' · ' + (f.fcDesc || ''),
                'Capability Result': f.severity || '',
                'Does It Result in Failure Condition Event?': results,
            };
        });
    }

    // ARP 4754B §5.4.7 validation tracking matrix.
    function _buildValidationMatrix(reqSource, funcSource) {
        return (reqSource || []).map(r => ({
            'Requirement': (r.traceId || r.id || ('REQ-' + r.internalId)) + ' — ' + (r.text || ''),
            'Source of the requirement': (r.reqSource && r.reqSource.generator) ? ('auto: ' + r.reqSource.generator) : (r.origin || 'manual'),
            'Associated function(s)': Array.isArray(r.traceIds) ? r.traceIds.join(', ') : (r.traceId || r.traceTo || ''),
            'Development assurance level': r.dal || r.level || '',
            'Validation method(s) applied': r.valMethod || (Array.isArray(r.mocEntries) ? r.mocEntries.map(m => m.method).filter(Boolean).join(', ') : ''),
            'Validation supporting evidence reference(s)': r.valArtifact || '',
            'Validation conclusion (valid / not valid)': r.valConclusion || 'open',
        }));
    }

    // ARP 4754B §5.5.6 verification tracking matrix.
    function _buildVerificationMatrix(reqSource) {
        return (reqSource || []).map(r => ({
            'Requirement': (r.traceId || r.id || ('REQ-' + r.internalId)) + ' — ' + (r.text || ''),
            'Associated function': Array.isArray(r.traceIds) ? r.traceIds.join(', ') : (r.traceId || r.traceTo || ''),
            'Verification method(s) applied': r.verifMethod || r.verMethod || (Array.isArray(r.mocEntries) ? r.mocEntries.map(m => m.method).filter(Boolean).join(', ') : ''),
            'Verification procedure & results reference(s)': r.verArtifact || '',
            'Verification conclusion (pass/fail, coverage)': r.verifStatus || r.vvStatus || 'Pending',
        }));
    }

    // ========================================================================
    // Q-FORMAT BUILDERS (Phase E1) — the Appendix Q artifact family. These
    // pull the deterministic Phase C/D stores (interdependence, common
    // resources, MAC, MF&MS, CoFFE, principle ledger, CCMR, FMES, completion
    // checklists, tailoring register, method slots) into the prescribed
    // ARP 4761A table shapes. Every read is typeof-guarded so a report
    // renders on any project state and any load order; empty stores yield
    // empty tables, never throws.
    // ========================================================================

    function _e1SysName(id) {
        try { const s = (systemsData || []).find(x => x.id === id); return s ? (s.name || String(id)) : String(id); } catch (_) { return String(id); }
    }
    function _e1FuncLabel(subId) {
        try {
            const f = (acFunctionsData || []).find(x => x.subId === subId);
            return f ? (subId + ' — ' + (f.subName || '')) : String(subId || '—');
        } catch (_) { return String(subId || '—'); }
    }

    // Table B1 — functional interdependence: aircraft FCs × systems.
    function _buildInterdepTable() {
        try {
            if (typeof idpCell !== 'function') return [];
            const fcs = (typeof acFhaData !== 'undefined' ? acFhaData : []) || [];
            const syss = (typeof systemsData !== 'undefined' ? systemsData : []) || [];
            if (!fcs.length || !syss.length) return [];
            const KIND = { implements: 'implements', resource: 'resource', sfha: 'SFHA trace', asserted: 'asserted' };
            return fcs.map(fc => {
                const row = { 'FC ID': fc.fcId || '', 'Failure Condition': fc.fcDesc || '', 'Severity': fc.severity || '' };
                syss.forEach(s => {
                    const c = idpCell(fc, s.id);
                    row[s.name || s.id] =
                        c.state === 'contributes' ? ('X — ' + (KIND[c.kind] || c.kind || '') + (c.conflict ? ' (⚠ manual clear overridden)' : ''))
                      : c.state === 'cleared' ? ('cleared · ' + (c.by || ''))
                      : 'unreviewed';
                });
                return row;
            });
        } catch (_) { return []; }
    }

    // Table B3 — common resource analysis, flattened: one row per recorded
    // FC × resource × mode entry (recorded effects only; the live matrix is
    // the working surface, the report carries the evidence).
    function _buildCommonResourceTable() {
        try {
            if (typeof idpContributors !== 'function' || typeof _idpStore !== 'function') return [];
            const fcs = ((typeof acFhaData !== 'undefined' ? acFhaData : []) || []).filter(fc => idpContributors(fc).length >= 1);
            const res = (typeof resourcesData !== 'undefined' ? resourcesData : []) || [];
            if (!fcs.length || !res.length) return [];
            const store = _idpStore();
            const MODES = (typeof _CRA_MODES !== 'undefined') ? _CRA_MODES : ['Total loss', 'Partial loss', 'Degraded'];
            const out = [];
            fcs.forEach(fc => {
                const cols = idpContributors(fc);
                res.forEach(r => MODES.forEach(mode => {
                    const resKey = (r.internalId || r.resId) + '·' + mode;
                    const effects = cols.map(sysId => {
                        const txt = store.cra[String(fc.internalId) + '§' + resKey + '§' + String(sysId)];
                        return txt ? (_e1SysName(sysId) + ': ' + txt) : null;
                    }).filter(Boolean);
                    const acEff = store.cra[String(fc.internalId) + '§' + resKey + '§'] || store.cra[String(fc.internalId) + '§' + resKey] || '';
                    if (!effects.length && !acEff) return;
                    out.push({
                        'Failure Condition': fc.fcId || '',
                        'Resource — Mode': (r.name || r.resId) + ' — ' + mode,
                        'Effect per Contributing System': effects.join(' · '),
                        'Aircraft-Level Effect': acEff,
                    });
                }));
            });
            return out;
        } catch (_) { return []; }
    }

    // MAC model register — floors, substantiation, exact minimal breach sets.
    function _buildMacTable() {
        try {
            if (typeof _macStore !== 'function' || typeof macBreachSets !== 'function') return [];
            return _macStore().map(r => {
                const clauses = (r.clauses || []).map(c => '≥' + (c.min || 1) + ' of {' + (c.of || []).map(_e1SysName).join(', ') + '}').join(' AND ');
                const breach = macBreachSets(r);
                const bTxt = breach.slice(0, 8).map(b => b.map(_e1SysName).join(' + ')).join(' ; ') + (breach.length > 8 ? ' ; … (' + breach.length + ' total)' : '');
                const sub = r.substantiation || {};
                const tree = (typeof macTreeStatus === 'function') ? macTreeStatus(r) : '—';
                return {
                    'Function': _e1FuncLabel(r.subId),
                    'Phase': r.phase || 'All phases',
                    'Minimum Acceptable Configuration': clauses,
                    'Substantiation': sub.kind === 'sdd'
                        ? ('SDD — ' + (sub.ref || '') + (sub.by ? ' · ' + sub.by : ''))
                        : ('Assumption — signed ' + (sub.by || '?') + (sub.at ? ' · ' + String(sub.at).slice(0, 10) : '')),
                    'Minimal Breach Combinations': breach.length ? bTxt : '(none — rule cannot be violated)',
                    'Compiled Tree': tree === 'fresh' ? 'Fresh (matches rule)' : tree === 'stale' ? 'STALE — recompile' : 'Not compiled',
                };
            });
        } catch (_) { return []; }
    }

    // MF&MS status — compiled trees (equivalence-proven) + authored trees
    // (cross-checked against the MAC model and locked CoFFE constraints).
    function _buildMfmsTable() {
        const out = [];
        try {
            if (typeof _macStore === 'function' && typeof _macCompiledStore === 'function') {
                const C = _macCompiledStore();
                _macStore().forEach(r => {
                    const rec = C[r.id];
                    if (!rec) return;
                    const page = ((typeof ftaPages !== 'undefined' ? ftaPages : []) || []).find(p => p.id === rec.pageId);
                    const status = (typeof macTreeStatus === 'function') ? macTreeStatus(r) : '—';
                    out.push({
                        'Tree': page ? (page.name || rec.pageId) : (rec.pageId + ' (deleted)'),
                        'Origin': 'Compiled from MAC model',
                        'Function / FC': _e1FuncLabel(r.subId),
                        'Verification': rec.verified ? 'BDD equivalence PROVEN (cut sets ≡ breach sets)' : 'EQUIVALENCE CHECK FAILED',
                        'Model Agreement': ((rec.breach ? rec.breach.length + ' breach combination(s)' : '') +
                            (rec.grafts && rec.grafts.length ? ' · ' + rec.grafts.length + ' authored graft(s) outside the theorem' : '')) || '—',
                        'Currency': status === 'fresh' ? 'Fresh' : status === 'stale' ? 'STALE vs rule' : 'Missing',
                    });
                });
            }
            if (typeof _mfmsAuthoredPages === 'function' && typeof mfmsCrossCheck === 'function') {
                _mfmsAuthoredPages().forEach(p => {
                    const x = mfmsCrossCheck(p);
                    if (!x) return;
                    const md = x.macDiff;
                    out.push({
                        'Tree': p.name || p.id,
                        'Origin': 'Authored (manual MF&MS)',
                        'Function / FC': (x.fc && x.fc.fcId) || '',
                        'Verification': x.totalEvents
                            ? ('Event→system mapping ' + x.mappedEvents + '/' + x.totalEvents + (x.undecidable ? ' · ' + x.undecidable + ' cut set(s) undecidable' : ''))
                            : 'No events',
                        'Model Agreement': md
                            ? ((md.missing.length ? md.missing.length + ' MAC breach(es) NOT reached — anti-conservative' : 'covers all MAC breaches') +
                               (md.extra.length ? ' · ' + md.extra.length + ' combination(s) beyond the MAC' : ''))
                            : 'No MAC model to compare',
                        'Currency': x.constraints.length
                            ? (x.constraints.filter(c => c.contained).length + '/' + x.constraints.length + ' locked CoFFE constraints contained')
                            : '—',
                    });
                });
            }
        } catch (_) {}
        return out;
    }

    // Table B2 — CoFFE from the dual-lane store (real cases + signed verdicts
    // vs the computed MAC lane). Falls back to the qualitative scaffold when
    // the method slot has no data yet.
    function _buildCoffeTableV2(fhaSource, scope, sys, asmSource) {
        try {
            if (scope !== 'system' && typeof coffeCases === 'function' && typeof coffeComputed === 'function' && typeof _coffeStore === 'function') {
                const store = _coffeStore();
                const V = store.verdicts || {}, R = store.results || {};
                const rows = [];
                let n = 0;
                (fhaSource || []).filter(f => _sevRank(f.severity) >= 4).forEach(fc => {
                    coffeCases(fc).forEach(k => {
                        n++;
                        const v = V[fc.internalId + '§' + k.key];
                        const comp = coffeComputed(fc, k);
                        let disp = '';
                        if (v && comp && v.verdict !== comp) disp = (v.verdict === 'yes')
                            ? 'FINDING — missing tree branch (elicited yes, computed no)'
                            : 'FINDING — challenges MAC model (elicited no, computed yes)';
                        else if (v && comp && v.verdict === comp) disp = 'Verified — both lanes agree';
                        else if (v && v.verdict === 'yes') disp = 'Locked constraint — tree must contain this combination';
                        rows.push({
                            'Case #': 'C' + n,
                            'Failure Condition': fc.fcId || '',
                            'Combination': k.parts.map(p => _e1SysName(p.sysId) + ' = ' + p.state).join(' ∧ '),
                            'Capability Result': R[fc.internalId + '§' + k.key] || '',
                            'Results in FC Event? (Elicited)': v ? (String(v.verdict).toUpperCase() + ' — signed ' + (v.by || '')) : 'open',
                            'Computed (MAC lane)': comp === null
                                ? (k.parts.some(p => p.state === 'malfunction') ? 'residue — judgment only' : 'no MAC model')
                                : String(comp).toUpperCase(),
                            'Disposition': disp,
                        });
                    });
                });
                if (rows.length) return rows;
            }
        } catch (_) {}
        return _buildCoffeTable(fhaSource, scope, sys, asmSource);
    }

    // Independence principle ledger — deduped claim registry with state machine.
    function _buildIpLedgerTable() {
        try {
            if (typeof ipLedger !== 'function') return [];
            return ipLedger().map(p => ({
                'Independence Principle': (p.members || []).map(m => m.label).join(' ⊥ '),
                'Claim Type(s)': Array.from(p.claims || []).join(', '),
                'Sources': (p.sources || []).length + ' (' + Array.from(new Set((p.sources || []).map(s => s.type))).join(', ') + ')',
                'CMA Evidence': (p.cma || []).length ? p.cma.map(c => c.cmaId + ' — ' + (c.status || '')).join('; ') : '—',
                'Requirements': (p.reqs || []).length ? p.reqs.map(r => r.id || r.traceId || ('REQ-' + r.internalId)).join(', ') : '—',
                'State': String(p.state || '').toUpperCase() + (p.contradiction ? ' — CCF-group contradiction' : ''),
                'Disposition': p.disposition ? (((p.disposition.text || p.disposition.note || p.disposition.rationale || '') + ' · ' + (p.disposition.by || '')).replace(/^ · /, '')) : '',
            }));
        } catch (_) { return []; }
    }

    // CCMR candidates (E.3.2.4) — latent events with not-to-exceed intervals.
    function _buildCcmrTable(sys) {
        try {
            if (typeof ccmrLatentSweep !== 'function') return [];
            let rows = ccmrLatentSweep();
            if (sys) rows = rows.filter(r => r.system === (sys.name || sys.id));
            return rows.map(r => ({
                'System': r.system || 'Aircraft',
                'Tree': r.pageName || '',
                'Latent Event': r.event || '',
                'FC / Severity': (r.fcId || '') + ' / ' + (r.severity || ''),
                'Detection': r.detection || '',
                'Exposure Interval (FH)': String(r.interval),
                'λ (/FH)': (r.lambda > 0) ? r.lambda.toExponential(2) : '—',
                'Not-to-Exceed (FH)': (r.nte != null && isFinite(r.nte)) ? String(Math.round(r.nte)) : '—',
                'Status': r.exceeds ? 'EXCEEDS — reduce interval or λ' : (r.note || 'within bound'),
            }));
        } catch (_) { return []; }
    }

    // Wear-out candidates (E.3.2.5) — mechanical library-sourced events.
    function _buildWearoutTable(sys) {
        try {
            if (typeof ccmrWearoutList !== 'function') return [];
            let rows = ccmrWearoutList();
            if (sys) rows = rows.filter(r => r.system === (sys.name || sys.id));
            return rows.map(r => ({
                'System': r.system || 'Aircraft',
                'Tree': r.pageName || '',
                'Event': r.event || '',
                'Library Entry': r.libraryKey || '',
                'Group': r.group || '',
                'Consideration': 'Wear-out candidate — constant-rate assumption to be substantiated (E.3.2.5)',
            }));
        } catch (_) { return []; }
    }

    // FMES — the derived failure-mode grouping (Phase B2 view, report form).
    function _buildFmesTable(sys) {
        try {
            if (typeof fmesGroups !== 'function') return [];
            const g = fmesGroups();
            const groups = sys ? g.groups.filter(x => String(x.systemId) === String(sys.id)) : g.groups;
            return groups.map(x => ({
                'System': x.system || 'Aircraft',
                'End Effect': x.effect || '',
                'Detection': x.detection || '',
                'Failure Modes Summarized': x.rows.length + (x.modes && x.modes.length ? ' — ' + x.modes.slice(0, 4).join('; ') + (x.modes.length > 4 ? ' …' : '') : ''),
                'Σλ (/FH)': (x.sumRate > 0) ? x.sumRate.toExponential(2) : '—',
                'Worst Severity': x.worstSev || '—',
                'Linked Basic Events': (x.beIds && x.beIds.size) ? Array.from(x.beIds).join(', ') : 'unlinked',
            }));
        } catch (_) { return []; }
    }

    // Completion checklist — the assessment's B.5/C.9/D.5/E.4/F.4 gate with
    // live states (pass / fail / attested / open / planned / tailored).
    function _buildChecklistTable(key) {
        try {
            if (typeof evalCkptChecklist !== 'function' || typeof computePhaseStatus !== 'function') return [];
            const cl = evalCkptChecklist(key, computePhaseStatus());
            const LBL = { pass: 'PASS', fail: 'OPEN — fails', attested: 'ATTESTED', open: 'OPEN — attest required', planned: 'PLANNED (roadmap)', tailored: 'TAILORED OUT' };
            return (cl.items || []).map(i => ({
                'Ref': i.ref || '', 'Objective': i.label || '',
                'State': LBL[i.state] || i.state, 'Evidence / Detail': i.detail || '',
            }));
        } catch (_) { return []; }
    }
    function _checklistSummary(key) {
        try {
            if (typeof evalCkptChecklist !== 'function' || typeof computePhaseStatus !== 'function') return '';
            const phases = (typeof applyCockpitStatuses === 'function') ? applyCockpitStatuses(computePhaseStatus()) : computePhaseStatus();
            const ph = phases[key] || {};
            const cl = ph.checklist || evalCkptChecklist(key, phases);
            const items = cl.items || [];
            const done = items.filter(i => i.state !== 'fail' && i.state !== 'open').length;
            let line = 'Completion gate: ' + done + ' of ' + items.length + ' objectives satisfied — ' + (cl.ready ? 'READY to baseline and hand off.' : 'not yet ready.');
            if (ph.status === 'handed-off' && ph.handoff) line += ' Handed off by ' + (ph.handoff.by || '?') + ' on ' + String(ph.handoff.at || '').slice(0, 10) + '.';
            else if (ph.status === 'reopened') line += ' REOPENED — inputs have drifted since the last hand-off.';
            return line;
        } catch (_) { return ''; }
    }

    // Tailoring register — every signed checklist opt-out, permanently visible.
    function _buildTailoringTable() {
        try {
            const T = (typeof projectConfig !== 'undefined' && projectConfig.ckptTailored) || {};
            const defs = (typeof CKPT_CHECKLISTS !== 'undefined') ? CKPT_CHECKLISTS : {};
            return Object.keys(T).map(k => {
                const at = k.indexOf(':');
                const assess = k.slice(0, at), id = k.slice(at + 1);
                const d = (defs[assess] || []).find(x => x.id === id);
                const t = T[k] || {};
                return {
                    'Assessment': assess,
                    'Objective': d ? (d.ref + ' — ' + d.label) : id,
                    'Rationale': t.rationale || '',
                    'Signed': (t.by || '') + (t.at ? ' · ' + String(t.at).slice(0, 10) : ''),
                };
            });
        } catch (_) { return []; }
    }

    // Safety Program Plan — method-slot declarations + intake line.
    function _sppSummary() {
        try {
            if (typeof _sppStore !== 'function' || typeof SPP_SLOTS === 'undefined') return '';
            const spp = _sppStore();
            const parts = SPP_SLOTS.map(s => {
                const idx = (spp.slots && spp.slots[s.id] != null) ? spp.slots[s.id] : s.dflt;
                return s.label + ': ' + (s.options[idx] || s.options[s.dflt]);
            });
            let line = 'Methods per the Safety Program Plan — ' + parts.join(' · ') + '.';
            if (spp.intake) line += ' Project intake ' + String(spp.intake.at || '').slice(0, 10) + ' (basis: ' + (spp.intake.basis || '—') + ' · route: ' + (spp.intake.route || '—') + ').';
            return line;
        } catch (_) { return ''; }
    }

    // ------------------------------------------------------------------------
    // _parseTemplate — splits a markdown template into ordered blocks:
    //   { kind: 'h', level, text }   heading
    //   { kind: 'p', text }          paragraph
    //   { kind: 'tableToken', name } table placeholder (e.g. fha_table)
    //   { kind: 'listToken', name }  list placeholder (e.g. assumptions_list)
    //   { kind: 'appendix', name }   appendix anchor (fta, zsa, pra, cma)
    // ------------------------------------------------------------------------
    function _parseTemplate(tpl) {
        const blocks = [];
        const lines = tpl.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            const tab = ln.match(/^\{\{(fha_table|requirements_table|component_list|pra_table|zsa_table|cma_table|fta_summary|afha_worksheet|sfha_worksheet|fta_summary_grid|cma_grid|coffe_table|validation_matrix|verification_matrix|compliance_posture|fc_evaluations|gaps_table|goldenthread_table|interdep_table|common_resource_table|mac_table|mfms_table|ip_ledger_table|ccmr_table|wearout_table|fmes_table|checklist_table|tailoring_table)\}\}$/);
            const list = ln.match(/^\{\{(assumptions_list)\}\}$/);
            const appx = ln.match(/^\{\{appendix:(fta|zsa|pra|cma)\}\}$/);
            const h    = ln.match(/^(#{1,4})\s+(.*)$/);
            if (tab)       blocks.push({ kind: 'tableToken', name: tab[1] });
            else if (list) blocks.push({ kind: 'listToken',  name: list[1] });
            else if (appx) blocks.push({ kind: 'appendix',   name: appx[1] });
            else if (h)    blocks.push({ kind: 'h', level: h[1].length, text: h[2] });
            else if (ln.trim() !== '') blocks.push({ kind: 'p', text: ln });
            else blocks.push({ kind: 'blank' });
        }
        return blocks;
    }

    // ------------------------------------------------------------------------
    // _substituteScalars — replaces inline {{token}} in a string with values.
    // ------------------------------------------------------------------------
    function _substituteScalars(text, data) {
        return text.replace(/\{\{([a-z_]+)\}\}/g, (m, k) => {
            const v = data[k];
            if (v == null) return '';
            if (typeof v === 'string' || typeof v === 'number') return String(v);
            return ''; // table tokens / appendix tokens get rendered separately
        });
    }

    // ------------------------------------------------------------------------
    // renderToDocx(reportType, data, opts) — builds a Word document from the
    // chosen template via the loaded docx-js library. Returns a Blob.
    // ------------------------------------------------------------------------
    async function renderToDocx(reportType, data, opts) {
        opts = opts || {};
        const docxLib = await _loadDocxLib();
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
                Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
                PageNumber } = docxLib;

        const tpl = (opts.customTemplateMarkdown && typeof opts.customTemplateMarkdown === 'string')
                    ? opts.customTemplateMarkdown
                    : DEFAULT_TEMPLATES[reportType];
        const blocks = _parseTemplate(tpl);
        const children = [];

        const border = { style: BorderStyle.SINGLE, size: 6, color: '888888' };
        const borders = { top: border, bottom: border, left: border, right: border };

        function _inline(text) {
            // Honor **bold** spans in template strings.
            const parts = []; let i = 0;
            while (i < text.length) {
                if (text[i] === '*' && text[i+1] === '*') {
                    const end = text.indexOf('**', i+2);
                    if (end !== -1) { parts.push(new TextRun({ text: text.slice(i+2, end), bold: true })); i = end + 2; continue; }
                }
                let next = text.indexOf('**', i); if (next === -1) next = text.length;
                parts.push(new TextRun(text.slice(i, next))); i = next;
            }
            return parts.length ? parts : [new TextRun('')];
        }

        function _renderTable(rows, headers) {
            const headerRow = new TableRow({
                tableHeader: true,
                children: headers.map(h => new TableCell({
                    borders,
                    shading: { fill: 'D5E8F0' },
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                })),
            });
            const dataRows = rows.map(r => new TableRow({
                children: headers.map(h => new TableCell({
                    borders,
                    children: [new Paragraph({ children: [new TextRun(String(r[h] == null ? '' : r[h]))] })],
                })),
            }));
            return new Table({ width: { size: 9360, type: WidthType.DXA }, rows: [headerRow, ...dataRows] });
        }

        for (const b of blocks) {
            if (b.kind === 'h') {
                const heading = b.level === 1 ? HeadingLevel.HEADING_1
                              : b.level === 2 ? HeadingLevel.HEADING_2
                              : HeadingLevel.HEADING_3;
                children.push(new Paragraph({
                    heading,
                    spacing: { before: b.level === 1 ? 320 : 200, after: 120 },
                    children: [new TextRun({ text: _substituteScalars(b.text, data), bold: true })],
                }));
            } else if (b.kind === 'p') {
                children.push(new Paragraph({
                    spacing: { after: 120, line: 300 },
                    children: _inline(_substituteScalars(b.text, data)),
                }));
            } else if (b.kind === 'tableToken') {
                const rows = data[b.name] || [];
                if (rows.length === 0) {
                    children.push(new Paragraph({ children: [new TextRun({ text: '(No entries)', italics: true, color: '888888' })] }));
                } else {
                    const headers = Object.keys(rows[0]);
                    children.push(_renderTable(rows, headers));
                    children.push(new Paragraph({ children: [new TextRun('')] }));
                }
            } else if (b.kind === 'listToken') {
                const rows = data[b.name] || [];
                if (rows.length === 0) {
                    children.push(new Paragraph({ children: [new TextRun({ text: '(No entries)', italics: true, color: '888888' })] }));
                } else {
                    const headers = Object.keys(rows[0]);
                    children.push(_renderTable(rows, headers));
                    children.push(new Paragraph({ children: [new TextRun('')] }));
                }
            } else if (b.kind === 'appendix') {
                // Honor user toggle in opts.appendices
                const wanted = (opts.appendices || {})[b.name];
                if (!wanted) continue;
                children.push(new Paragraph({
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 320, after: 120 },
                    children: [new TextRun({ text: 'Appendix — ' + b.name.toUpperCase(), bold: true })],
                }));
                if (b.name === 'fta') {
                    const ftaImages = await _renderFTAAppendixImages(data._ftaPagesForAppendix || []);
                    for (const img of ftaImages) {
                        children.push(new Paragraph({
                            spacing: { before: 200, after: 80 },
                            children: [new TextRun({ text: img.title, bold: true })],
                        }));
                        if (img.dataUrl) {
                            children.push(new Paragraph({
                                children: [new docxLib.ImageRun({
                                    data: img.dataUrl.replace(/^data:image\/png;base64,/, ''),
                                    transformation: { width: img.width, height: img.height },
                                })],
                            }));
                        } else {
                            children.push(new Paragraph({ children: [new TextRun({ text: '(' + img.title + ' — render unavailable. Switch to this page and regenerate to embed the canvas.)', italics: true })] }));
                        }
                    }
                } else if (b.name === 'zsa') {
                    const t = data.zsa_table || data._zsaForAppendix && data._zsaForAppendix.map(z => ({
                        'Zone': z.zoneId, 'Description': z.desc, 'Equipment': z.equip,
                        'Severity': z.severity, 'Interference': z.interference, 'Mitigation': z.mitigation,
                    })) || [];
                    if (t.length) { children.push(_renderTable(t, Object.keys(t[0]))); children.push(new Paragraph({ children: [new TextRun('')] })); }
                } else if (b.name === 'pra') {
                    const t = data.pra_table || [];
                    if (t.length) { children.push(_renderTable(t, Object.keys(t[0]))); children.push(new Paragraph({ children: [new TextRun('')] })); }
                } else if (b.name === 'cma') {
                    const t = data.cma_table || [];
                    if (t.length) { children.push(_renderTable(t, Object.keys(t[0]))); children.push(new Paragraph({ children: [new TextRun('')] })); }
                }
            } else if (b.kind === 'blank') {
                children.push(new Paragraph({ children: [new TextRun('')] }));
            }
        }

        const doc = new Document({
            creator: 'Safety Lab Aero, Inc.',
            title: REPORT_DEFS[reportType].name,
            description: REPORT_DEFS[reportType].name + ' for ' + _projectName(),
            styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
            sections: [{
                properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
                headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: REPORT_DEFS[reportType].name + ' — ' + _projectName(), size: 18, color: '666666' })] })] }) },
                footers: { default: new Footer({ children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: 'Generated by Safety Lab Aero, Inc. · ', size: 18, color: '666666' }),
                        new TextRun({ text: 'Page ', size: 18, color: '666666' }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
                        new TextRun({ text: ' of ', size: 18, color: '666666' }),
                        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '666666' }),
                    ],
                })] }) },
                children,
            }],
        });

        const blob = await Packer.toBlob(doc);
        return blob;
    }

    // ------------------------------------------------------------------------
    // renderToPdf(reportType, data, opts) — builds a PDF via jsPDF.
    // Uses direct doc.text + manual table layout (no autoTable dependency).
    // Returns a jsPDF doc instance; caller saves via _savePdf().
    // ------------------------------------------------------------------------
    async function renderToPdf(reportType, data, opts) {
        opts = opts || {};
        const { jsPDF } = await _loadJsPDF();
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const M = 50;
        let y = M;

        const tpl = (opts.customTemplateMarkdown && typeof opts.customTemplateMarkdown === 'string')
                    ? opts.customTemplateMarkdown
                    : DEFAULT_TEMPLATES[reportType];
        const blocks = _parseTemplate(tpl);

        function _wrap(t, maxW, fontSize) {
            doc.setFontSize(fontSize);
            return doc.splitTextToSize(String(t || ''), maxW);
        }
        function _need(h) { if (y + h > H - M) { doc.addPage(); y = M; } }

        function _drawTable(rows, headers) {
            if (!rows.length) {
                doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
                _need(14); doc.text('(No entries)', M, y); y += 14;
                doc.setTextColor(0); doc.setFont('helvetica', 'normal');
                return;
            }
            const colCount = headers.length;
            const colW = (W - 2*M) / colCount;
            const rowH = 16;
            const hdrH = 18;

            // Header
            _need(hdrH + 4);
            doc.setFillColor(213, 232, 240); doc.rect(M, y, W - 2*M, hdrH, 'F');
            doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
            headers.forEach((h, i) => { doc.text(String(h).slice(0, 30), M + i*colW + 4, y + 13); });
            y += hdrH;

            // Rows
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            rows.forEach(r => {
                // Pre-compute row height based on tallest cell
                const cellLines = headers.map(h => _wrap(r[h], colW - 6, 8));
                const maxLines = Math.max(1, ...cellLines.map(l => l.length));
                const thisH = Math.max(rowH, maxLines * 10 + 4);
                _need(thisH);
                doc.setDrawColor(180);
                doc.rect(M, y, W - 2*M, thisH);
                headers.forEach((h, i) => {
                    cellLines[i].forEach((ln, li) => {
                        doc.text(ln, M + i*colW + 4, y + 11 + li*10);
                    });
                    if (i > 0) doc.line(M + i*colW, y, M + i*colW, y + thisH);
                });
                y += thisH;
            });
            y += 8;
        }

        // Title / header
        doc.setFontSize(20); doc.setFont('helvetica', 'bold');
        doc.text(REPORT_DEFS[reportType].name, M, y); y += 28;

        for (const b of blocks) {
            if (b.kind === 'h') {
                const fs = b.level === 1 ? 18 : b.level === 2 ? 14 : 12;
                _need(fs + 12);
                doc.setFontSize(fs); doc.setFont('helvetica', 'bold');
                doc.text(_substituteScalars(b.text, data), M, y);
                y += fs + 8;
            } else if (b.kind === 'p') {
                doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                const lines = _wrap(_substituteScalars(b.text, data).replace(/\*\*/g, ''), W - 2*M, 10);
                lines.forEach(ln => { _need(13); doc.text(ln, M, y); y += 13; });
                y += 4;
            } else if (b.kind === 'tableToken' || b.kind === 'listToken') {
                const rows = data[b.name] || [];
                const headers = rows.length ? Object.keys(rows[0]) : [];
                _drawTable(rows, headers);
            } else if (b.kind === 'appendix') {
                const wanted = (opts.appendices || {})[b.name];
                if (!wanted) continue;
                doc.addPage(); y = M;
                doc.setFontSize(16); doc.setFont('helvetica', 'bold');
                doc.text('Appendix — ' + b.name.toUpperCase(), M, y); y += 22;
                if (b.name === 'fta') {
                    const ftaImages = await _renderFTAAppendixImages(data._ftaPagesForAppendix || []);
                    for (const img of ftaImages) {
                        if (!img.dataUrl) {
                            doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
                            doc.text('(' + img.title + ' — switch to this page and regenerate to embed.)', M, y); y += 16;
                            doc.setTextColor(0); doc.setFont('helvetica', 'normal');
                            continue;
                        }
                        _need(40);
                        doc.setFontSize(12); doc.setFont('helvetica', 'bold');
                        doc.text(img.title, M, y); y += 16;
                        const maxW = W - 2*M, maxH = H - y - M;
                        const ratio = img.width / img.height;
                        let drawW = maxW, drawH = drawW / ratio;
                        if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
                        doc.addImage(img.dataUrl, 'PNG', M, y, drawW, drawH);
                        y += drawH + 16;
                    }
                } else if (b.name === 'zsa') _drawTable(data.zsa_table || [], data.zsa_table && data.zsa_table.length ? Object.keys(data.zsa_table[0]) : []);
                  else if (b.name === 'pra') _drawTable(data.pra_table || [], data.pra_table && data.pra_table.length ? Object.keys(data.pra_table[0]) : []);
                  else if (b.name === 'cma') _drawTable(data.cma_table || [], data.cma_table && data.cma_table.length ? Object.keys(data.cma_table[0]) : []);
            } else if (b.kind === 'blank') {
                y += 6;
            }
        }

        // Page numbers
        const total = doc.internal.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            doc.setPage(p);
            doc.setFontSize(9); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
            doc.text('Generated by Safety Lab Aero, Inc. · Page ' + p + ' of ' + total, W/2, H - 24, { align: 'center' });
            doc.text(_projectName(), W - M, H - 24, { align: 'right' });
        }
        return doc;
    }

    // ------------------------------------------------------------------------
    // renderFromCustomDocx(file, reportType, data, opts) — accepts a .docx
    // file uploaded by the user; performs token substitution against the
    // template's document.xml, preserving styling. Table tokens are replaced
    // with line-by-line text representations (custom .docx upload doesn't
    // support full table injection — power users should keep tables in
    // their template and reference them via standard {{tokens}}).
    // ------------------------------------------------------------------------
    async function renderFromCustomDocx(file, reportType, data) {
        const JSZip = await _loadJSZip();
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const docXmlFile = zip.file('word/document.xml');
        if (!docXmlFile) throw new Error('Uploaded file does not appear to be a .docx (missing word/document.xml).');
        let xml = await docXmlFile.async('string');

        // Substitute scalar tokens first.
        Object.keys(data).forEach(k => {
            if (typeof data[k] === 'string' || typeof data[k] === 'number') {
                const safe = String(data[k])
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
                xml = xml.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), safe);
            }
        });

        // Substitute table tokens with simple "one row per paragraph" text.
        const tableTokens = ['fha_table','requirements_table','assumptions_list','component_list','fta_summary','pra_table','zsa_table','cma_table',
            'afha_worksheet','sfha_worksheet','fta_summary_grid','cma_grid','coffe_table','validation_matrix','verification_matrix','compliance_posture','fc_evaluations','gaps_table','goldenthread_table',
            'interdep_table','common_resource_table','mac_table','mfms_table','ip_ledger_table','ccmr_table','wearout_table','fmes_table','checklist_table','tailoring_table'];
        tableTokens.forEach(name => {
            const rows = data[name] || [];
            const text = rows.length === 0
                ? '(No entries.)'
                : rows.map(r => Object.entries(r).map(([k,v]) => k + ': ' + (v||'')).join(' · ')).join('\u2028');
            // \u2028 = Unicode line separator; Word renders this as a line break inside the paragraph.
            const safe = text
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            xml = xml.replace(new RegExp('\\{\\{' + name + '\\}\\}', 'g'), safe);
        });

        // Appendix tokens: strip them (custom docx assumes user has their own structure).
        xml = xml.replace(/\{\{appendix:[a-z]+\}\}/g, '');

        zip.file('word/document.xml', xml);
        return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }

    // ------------------------------------------------------------------------
    // _renderFTAAppendixImages — converts each linked FTA page to a PNG data
    // URL. Active page renders from the live SVG; inactive pages return
    // null dataUrl with a placeholder note (rendering hidden trees would
    // require duplicating the d3 layout — out of scope for v1).
    // ------------------------------------------------------------------------
    async function _renderFTAAppendixImages(pages) {
        const out = [];
        if (!Array.isArray(pages) || !pages.length) return out;
        for (const p of pages) {
            if (!p.root) { out.push({ title: p.name || p.id, dataUrl: null, note: 'empty' }); continue; }
            const isActive = (typeof activeFTAPageId !== 'undefined') && p.id === activeFTAPageId;
            if (!isActive) { out.push({ title: p.name || p.id, dataUrl: null, note: 'inactive' }); continue; }
            try {
                const svgEl = document.getElementById('fta-svg');
                const svgStr = new XMLSerializer().serializeToString(svgEl);
                const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
                const canvas = document.createElement('canvas');
                const scale = 2;
                canvas.width = (img.width || 1000) * scale;
                canvas.height = (img.height || 700) * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                const dataUrl = canvas.toDataURL('image/png');
                // docx ImageRun expects pixel dimensions; cap at letter width minus margins.
                const targetW = 540;
                const targetH = Math.min(700, targetW * (canvas.height / canvas.width));
                out.push({ title: p.name || p.id, dataUrl, width: targetW, height: targetH });
            } catch (e) {
                console.warn('FTA appendix render failed:', e);
                out.push({ title: p.name || p.id, dataUrl: null, note: 'error' });
            }
        }
        return out;
    }

    // ------------------------------------------------------------------------
    // generate(args) — programmatic entry point. args:
    //   { reportType, format ('docx'|'pdf'), systemId?, appendices: {fta,zsa,pra,cma},
    //     customDocxFile? }
    // Returns Promise<{ ok: true, name }>.
    // ------------------------------------------------------------------------
    async function generate(args) {
        const { reportType, format } = args;
        if (!REPORT_DEFS[reportType]) throw new Error('Unknown report type: ' + reportType);
        const data = extractData(reportType, { systemId: args.systemId, functionSubId: args.functionSubId });
        const baseName = REPORT_DEFS[reportType].name.replace(/[^A-Za-z0-9_-]+/g, '_')
                        + (args.systemId ? '_' + (data.system_name.replace(/[^A-Za-z0-9_-]+/g, '_')) : '')
                        + (args.functionSubId ? '_' + String(args.functionSubId).replace(/[^A-Za-z0-9_-]+/g, '_') : '')
                        + '_' + _todayISO();

        if (args.customDocxFile && format === 'docx') {
            const blob = await renderFromCustomDocx(args.customDocxFile, reportType, data);
            const fileName = baseName + '.docx';
            if (typeof SaveFs !== 'undefined' && SaveFs.saveBlob) await SaveFs.saveBlob(blob, fileName);
            else _downloadBlob(blob, fileName);
            return { ok: true, name: fileName };
        }
        if (format === 'docx') {
            const blob = await renderToDocx(reportType, data, { appendices: args.appendices || {} });
            const fileName = baseName + '.docx';
            if (typeof SaveFs !== 'undefined' && SaveFs.saveBlob) await SaveFs.saveBlob(blob, fileName);
            else _downloadBlob(blob, fileName);
            return { ok: true, name: fileName };
        }
        if (format === 'pdf') {
            const doc = await renderToPdf(reportType, data, { appendices: args.appendices || {} });
            const fileName = baseName + '.pdf';
            if (typeof _savePdf === 'function') await _savePdf(doc, fileName);
            else doc.save(fileName);
            return { ok: true, name: fileName };
        }
        throw new Error('Unknown format: ' + format);
    }

    function _downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ------------------------------------------------------------------------
    // open(reportType) — show the generation modal pre-selected to the given
    // report type. The modal markup is appended on first open.
    // ------------------------------------------------------------------------
    function _ensureModal() {
        if (document.getElementById('report-gen-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'report-gen-modal';
        modal.className = 'sl-modal-overlay';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:10000;backdrop-filter:blur(2px);';
        modal.innerHTML = [
            '<div class="sl-modal-card" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(680px,calc(100vw - 48px));max-height:calc(100vh - 80px);overflow-y:auto;background:var(--color-surface-1);border:1px solid var(--color-border-thin);border-radius:var(--r-lg);box-shadow:0 28px 72px rgba(0,0,0,0.32);padding:24px;">',
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
            '    <h3 style="margin:0;">Generate Report</h3>',
            '    <button type="button" class="node-modal-close" onclick="Reports.close()" aria-label="Close">×</button>',
            '  </div>',
            '  <div style="display:flex;flex-direction:column;gap:14px;">',
            '    <div><label>Report Type</label><select id="rpt-type" style="width:100%;margin-bottom:0;"></select></div>',
            '    <div id="rpt-system-row" style="display:none;"><label>System</label><select id="rpt-system" style="width:100%;margin-bottom:0;"></select></div>',
            '    <div><label>Output Format</label>',
            '      <div style="display:flex;gap:12px;">',
            '        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="radio" name="rpt-format" value="docx" checked style="width:auto;margin:0;"> Word (.docx)</label>',
            '        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="radio" name="rpt-format" value="pdf" style="width:auto;margin:0;"> PDF</label>',
            '      </div>',
            '    </div>',
            '    <div id="rpt-appendix-row"><label>Appendices</label>',
            '      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px;">',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="fta"><input type="checkbox" id="rpt-appx-fta"  style="width:auto;margin:0;"> Linked FTAs</label>',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="zsa"><input type="checkbox" id="rpt-appx-zsa"  style="width:auto;margin:0;"> ZSA</label>',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="pra"><input type="checkbox" id="rpt-appx-pra"  style="width:auto;margin:0;"> PRA</label>',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="cma"><input type="checkbox" id="rpt-appx-cma"  style="width:auto;margin:0;"> CMA</label>',
            '      </div>',
            '    </div>',
            '    <div><label>Custom Template (.docx, optional)</label>',
            '      <input type="file" id="rpt-custom-template" accept=".docx" style="width:100%;margin-bottom:0;">',
            '      <p style="font-size:11px;color:var(--color-text-tertiary);margin:4px 0 0 0;">Upload a customer-branded .docx with <code>{{tokens}}</code> to use it as the template. Leave blank to use the built-in default. Custom .docx only supports Word format (PDF falls back to default).</p>',
            '    </div>',
            '    <div id="rpt-status" style="font-size:12px;color:var(--color-text-secondary);min-height:18px;"></div>',
            '    <div style="display:flex;justify-content:flex-end;gap:8px;">',
            '      <button class="btn-ghost" onclick="Reports.close()">Cancel</button>',
            '      <button class="btn-green" onclick="Reports._submit()">Generate</button>',
            '    </div>',
            '  </div>',
            '</div>',
        ].join('');
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    function open(reportType, opts) {
        _ensureModal();
        opts = opts || {};
        const modal = document.getElementById('report-gen-modal');
        const typeSel = document.getElementById('rpt-type');
        // Populate report types
        typeSel.innerHTML = Object.entries(REPORT_DEFS).map(([k, v]) => '<option value="' + k + '">' + k + ' — ' + v.name + '</option>').join('');
        if (reportType && REPORT_DEFS[reportType]) typeSel.value = reportType;

        // Populate system dropdown
        const sysSel = document.getElementById('rpt-system');
        if (Array.isArray(systemsData)) {
            sysSel.innerHTML = '<option value="">-- Select a system --</option>' + systemsData.map(s => '<option value="' + s.id + '">' + (s.name || s.id) + '</option>').join('');
        }
        if (opts.systemId) sysSel.value = opts.systemId;

        _refreshModalRows();
        typeSel.onchange = _refreshModalRows;

        // Reset custom file picker + status
        const fileInput = document.getElementById('rpt-custom-template');
        if (fileInput) fileInput.value = '';
        const status = document.getElementById('rpt-status'); if (status) status.textContent = '';

        modal.style.display = 'block';
    }

    function close() {
        const modal = document.getElementById('report-gen-modal');
        if (modal) modal.style.display = 'none';
    }

    function _refreshModalRows() {
        const type = document.getElementById('rpt-type').value;
        const def = REPORT_DEFS[type];
        document.getElementById('rpt-system-row').style.display = (def && def.scope === 'system') ? 'block' : 'none';
        // Toggle appendix checkboxes by allowedAppendices
        ['fta','zsa','pra','cma'].forEach(name => {
            const lbl = document.querySelector('label[data-appx="' + name + '"]');
            if (lbl) lbl.style.display = (def && def.allowedAppendices.includes(name)) ? 'inline-flex' : 'none';
            const cb = document.getElementById('rpt-appx-' + name);
            if (cb) cb.checked = false;
        });
        document.getElementById('rpt-appendix-row').style.display = (def && def.allowedAppendices.length) ? 'block' : 'none';
    }

    async function _submit() {
        if (!(await window.SafetyLabAssumptionsGate('generate this report'))) return;   // #260
        const status = document.getElementById('rpt-status');
        try {
            const type = document.getElementById('rpt-type').value;
            const format = document.querySelector('input[name="rpt-format"]:checked').value;
            const def = REPORT_DEFS[type];
            const systemId = (def.scope === 'system') ? document.getElementById('rpt-system').value : null;
            if (def.scope === 'system' && !systemId) { status.textContent = 'Select a system first.'; status.style.color = 'var(--color-danger, #dc2626)'; return; }
            const appendices = {};
            ['fta','zsa','pra','cma'].forEach(n => { const cb = document.getElementById('rpt-appx-' + n); appendices[n] = cb && cb.checked; });
            const fileInput = document.getElementById('rpt-custom-template');
            const customFile = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
            if (customFile && format !== 'docx') {
                status.textContent = 'Custom .docx template requires Word format. Switch to Word or remove the template.';
                status.style.color = 'var(--color-danger, #dc2626)';
                return;
            }
            status.style.color = 'var(--color-text-secondary)';
            status.textContent = 'Generating…';
            await generate({ reportType: type, format, systemId, appendices, customDocxFile: customFile });
            status.style.color = 'var(--color-success, #16a34a)';
            status.textContent = 'Report saved.';
            setTimeout(() => { close(); }, 1200);
        } catch (e) {
            console.error('Report generation failed:', e);
            status.style.color = 'var(--color-danger, #dc2626)';
            status.textContent = 'Failed: ' + (e.message || e);
        }
    }

    return { open, close, generate, extractData, _submit, REPORT_DEFS,
             // Advisory analysis engines (builds #144/#146/#147) — READ-ONLY
             // consumers of the FTA/engine compute. Exposed for the section
             // path, tests, and future wiring. None mutate the model.
             evaluateFcQualitative, complianceRiskForReport, surfaceGaps };
})();
window.Reports = Reports;

/* ============================================================================
 * Phase 56.9 — Reports v2: Section-level editable modules
 * ----------------------------------------------------------------------------
 * Extends the Phase 56 Reports module so both built-in markdown templates AND
 * uploaded customer .docx files parse into per-section editable text blocks.
 * The modal becomes two-step: (1) pick type / format / appendices / upload,
 * (2) edit each heading's prose in the form, (3) Generate.
 *
 * Edits persist on the project via window.projectReportEdits, keyed by
 * [reportType][sectionId]. _snapshotProject() includes it; loadProject()
 * restores it. Each section has a "Reset to template default" link.
 *
 * For uploaded .docx templates we do OOXML surgery: locate paragraphs with
 * Heading1/2/3 styles, group the runs between successive headings as the
 * section body, and on Generate rewrite the run text using the user's edits.
 * Heading styles + page setup + headers / footers / chrome are untouched.
 *
 * If an uploaded .docx has no detectable Heading styles, we fall back to the
 * Phase 56 token-only substitution path and surface a banner in the editor.
 * ========================================================================= */
(function() {
    'use strict';
    if (typeof window === 'undefined' || !window.Reports) return; // not in browser, or v1 not loaded

    // ------------------------------------------------------------------------
    // State — per-project section edits, keyed [reportType][sectionId] = prose.
    // Persistence hooks wire into _snapshotProject() + loadProject() so edits
    // survive save / reload (see safety_lab.js for the wiring).
    // ------------------------------------------------------------------------
    if (typeof window.projectReportEdits === 'undefined') window.projectReportEdits = {};
    // Per-open modal state — preserved across step 1 → step 2 transitions.
    let _modalState = null; // { reportType, format, systemId, appendices, customDocxFile, sections, customDocxInfo }

    // ------------------------------------------------------------------------
    // parseMarkdownToSections(md) — splits a markdown template into ordered
    // sections. A "section" is { id, level (1..6), heading, prose }.
    //   - The first H1 becomes the document title (heading kept, prose = '').
    //   - Subsequent H1/H2/H3 start new sections.
    //   - Everything between a heading and the next heading is that section's
    //     prose. {{table tokens}} and {{appendix:xxx}} markers stay verbatim
    //     in the prose; the renderer expands them at render time.
    // ------------------------------------------------------------------------
    function parseMarkdownToSections(md) {
        const lines = (md || '').split(/\r?\n/);
        const sections = [];
        let cur = null;
        let counter = 0;
        for (const ln of lines) {
            const h = ln.match(/^(#{1,6})\s+(.*)$/);
            if (h) {
                if (cur) sections.push(cur);
                counter++;
                cur = { id: 'sec_' + counter, level: h[1].length, heading: h[2].trim(), prose: '' };
            } else if (cur) {
                cur.prose += (cur.prose ? '\n' : '') + ln;
            } else {
                // Pre-amble before any heading — wrap as a synthetic untitled section.
                counter++;
                cur = { id: 'sec_' + counter, level: 0, heading: '(Preamble)', prose: ln };
            }
        }
        if (cur) sections.push(cur);
        // Trim trailing whitespace on each section's prose
        sections.forEach(s => { s.prose = (s.prose || '').replace(/\s+$/, ''); });
        return sections;
    }

    // ------------------------------------------------------------------------
    // resolveScalarTokens — substitutes the simple {{scalar}} tokens in a
    // string against the data dict. Table/appendix tokens are left intact
    // so the renderer can position them properly.
    // ------------------------------------------------------------------------
    function resolveScalarTokens(text, data) {
        if (!text) return '';
        return String(text).replace(/\{\{([a-z_]+)\}\}/g, (m, k) => {
            const v = data[k];
            if (v == null) return m;
            if (typeof v === 'string' || typeof v === 'number') return String(v);
            return m; // table token — leave for renderer
        });
    }

    // ------------------------------------------------------------------------
    // parseDocxToSections(file) — async; unzips an uploaded .docx, walks the
    // <w:p> paragraphs in document.xml, identifies headings by their pStyle
    // (Heading1 / Heading2 / Heading3 / Title), and groups paragraphs into
    // sections. Returns { sections: [...], headingsDetected: bool, raw }.
    //   - sections: same shape as parseMarkdownToSections result, plus a
    //     headingParaIdx + bodyParaIdxs[] used by the OOXML rewriter.
    //   - headingsDetected: false → caller should fall back to token-only.
    //   - raw: { zip, xml, paragraphs, doc } reserved for the surgical rewrite.
    // ------------------------------------------------------------------------
    async function parseDocxToSections(file) {
        const JSZip = await _ensureJSZip();
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const docXmlFile = zip.file('word/document.xml');
        if (!docXmlFile) throw new Error('Uploaded file does not appear to be a .docx (missing word/document.xml).');
        const xml = await docXmlFile.async('string');

        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'application/xml');
        const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
        const paragraphs = Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));

        function _styleOf(p) {
            const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
            if (!pPr) return '';
            const pStyle = pPr.getElementsByTagNameNS(W_NS, 'pStyle')[0];
            if (!pStyle) return '';
            return pStyle.getAttribute('w:val') || pStyle.getAttributeNS(W_NS, 'val') || '';
        }
        function _textOf(p) {
            const texts = Array.from(p.getElementsByTagNameNS(W_NS, 't'));
            return texts.map(t => t.textContent || '').join('');
        }
        function _headingLevel(style) {
            if (!style) return 0;
            if (/^Title$/i.test(style)) return 1;
            const m = style.match(/^Heading(\d)$/i);
            return m ? parseInt(m[1], 10) : 0;
        }

        const sections = [];
        let cur = null;
        let counter = 0;
        paragraphs.forEach((p, idx) => {
            const style = _styleOf(p);
            const level = _headingLevel(style);
            if (level > 0) {
                if (cur) sections.push(cur);
                counter++;
                cur = {
                    id: 'sec_' + counter,
                    level,
                    heading: _textOf(p).trim() || '(Untitled heading)',
                    prose: '',
                    headingParaIdx: idx,
                    bodyParaIdxs: [],
                };
            } else if (cur) {
                cur.bodyParaIdxs.push(idx);
                const t = _textOf(p);
                if (t) cur.prose += (cur.prose ? '\n' : '') + t;
            } else {
                // Pre-heading paragraphs — collect into a synthetic preamble section.
                counter++;
                cur = {
                    id: 'sec_' + counter,
                    level: 0,
                    heading: '(Preamble)',
                    prose: _textOf(p),
                    headingParaIdx: -1,
                    bodyParaIdxs: [idx],
                };
            }
        });
        if (cur) sections.push(cur);

        // headingsDetected: at least one real heading (level > 0) found.
        const headingsDetected = sections.some(s => s.headingParaIdx !== -1 && s.level > 0);

        return {
            sections,
            headingsDetected,
            raw: { zip, xml, paragraphs, doc, W_NS },
        };
    }

    function _ensureJSZip() {
        // Reuse the v1 loader if available.
        if (window.JSZip) return Promise.resolve(window.JSZip);
        if (typeof _loadJSZip === 'function') return _loadJSZip();
        return Promise.reject(new Error('JSZip loader not available.'));
    }

    // ------------------------------------------------------------------------
    // _getSavedEdit / _setSavedEdit — convenience accessors over
    // projectReportEdits. Edits are keyed by [reportType][sectionId].
    // ------------------------------------------------------------------------
    function _getSavedEdit(reportType, sectionId) {
        const r = window.projectReportEdits || {};
        return (r[reportType] && r[reportType][sectionId]) || null;
    }
    function _setSavedEdit(reportType, sectionId, value) {
        const r = window.projectReportEdits || (window.projectReportEdits = {});
        if (!r[reportType]) r[reportType] = {};
        if (value == null || value === '') delete r[reportType][sectionId];
        else r[reportType][sectionId] = value;
        // Best-effort autosave hook — _writeAutosave is defined in safety_lab.js
        try { if (typeof _writeAutosave === 'function') _writeAutosave(); } catch (_) {}
    }
    function _resetSavedEdit(reportType, sectionId) { _setSavedEdit(reportType, sectionId, null); }

    // ------------------------------------------------------------------------
    // openV2(reportType, opts) — replaces the v1 modal flow. Step 1 stays
    // structurally similar to v1 (pick type / format / appendices / upload),
    // but the primary action becomes "Continue →" which advances to the
    // section editor instead of generating directly.
    // ------------------------------------------------------------------------
    function openV2(reportType, opts) {
        opts = opts || {};
        _ensureModalV2();
        _modalState = null;
        const modal = document.getElementById('report-gen-modal');

        // Populate report-type dropdown.
        const typeSel = document.getElementById('rpt-type');
        const REPORT_DEFS = window.Reports.REPORT_DEFS;
        typeSel.innerHTML = Object.entries(REPORT_DEFS)
            .map(([k, v]) => '<option value="' + k + '">' + k + ' — ' + v.name + '</option>').join('');
        if (reportType && REPORT_DEFS[reportType]) typeSel.value = reportType;

        // Populate system dropdown.
        const sysSel = document.getElementById('rpt-system');
        if (typeof systemsData !== 'undefined' && Array.isArray(systemsData)) {
            sysSel.innerHTML = '<option value="">-- Select a system --</option>'
                + systemsData.map(s => '<option value="' + s.id + '">' + (s.name || s.id) + '</option>').join('');
        }
        if (opts.systemId) sysSel.value = opts.systemId;

        // Reset file picker + step display.
        const fileInput = document.getElementById('rpt-custom-template');
        if (fileInput) fileInput.value = '';
        const status = document.getElementById('rpt-status'); if (status) status.textContent = '';

        _showStep(1);
        _refreshStepOneRows();
        typeSel.onchange = _refreshStepOneRows;
        modal.style.display = 'block';
    }

    function _refreshStepOneRows() {
        const type = document.getElementById('rpt-type').value;
        const def = window.Reports.REPORT_DEFS[type];
        document.getElementById('rpt-system-row').style.display = (def && def.scope === 'system') ? 'block' : 'none';
        ['fta','zsa','pra','cma'].forEach(name => {
            const lbl = document.querySelector('label[data-appx="' + name + '"]');
            if (lbl) lbl.style.display = (def && def.allowedAppendices.includes(name)) ? 'inline-flex' : 'none';
            const cb = document.getElementById('rpt-appx-' + name);
            if (cb) cb.checked = false;
        });
        document.getElementById('rpt-appendix-row').style.display = (def && def.allowedAppendices.length) ? 'block' : 'none';
    }

    function _showStep(n) {
        const s1 = document.getElementById('rpt-step1');
        const s2 = document.getElementById('rpt-step2');
        if (s1) s1.style.display = (n === 1) ? 'block' : 'none';
        if (s2) s2.style.display = (n === 2) ? 'block' : 'none';
    }

    // ------------------------------------------------------------------------
    // _continueToSectionEditor — step 1's primary action. Validates inputs,
    // parses the template into sections, builds the editor form, and switches
    // to step 2.
    // ------------------------------------------------------------------------
    async function _continueToSectionEditor() {
        const status = document.getElementById('rpt-status');
        status.style.color = 'var(--color-text-secondary)';
        status.textContent = '';
        try {
            const reportType = document.getElementById('rpt-type').value;
            const format = document.querySelector('input[name="rpt-format"]:checked').value;
            const def = window.Reports.REPORT_DEFS[reportType];
            const systemId = (def.scope === 'system') ? document.getElementById('rpt-system').value : null;
            if (def.scope === 'system' && !systemId) { status.textContent = 'Select a system first.'; status.style.color = 'var(--color-danger, #dc2626)'; return; }
            const appendices = {};
            ['fta','zsa','pra','cma'].forEach(n => { const cb = document.getElementById('rpt-appx-' + n); appendices[n] = !!(cb && cb.checked); });
            const fileInput = document.getElementById('rpt-custom-template');
            const customFile = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
            if (customFile && format !== 'docx') {
                status.textContent = 'Custom .docx template requires Word format. Switch to Word or remove the template.';
                status.style.color = 'var(--color-danger, #dc2626)';
                return;
            }

            // Extract project data once — used to resolve scalar tokens in the editor preview.
            const data = window.Reports.extractData(reportType, { systemId });

            // Parse the template (custom upload OR built-in) into sections.
            let sections, customDocxInfo = null;
            if (customFile) {
                status.textContent = 'Parsing uploaded template…';
                const parsed = await parseDocxToSections(customFile);
                if (!parsed.headingsDetected) {
                    customDocxInfo = { mode: 'token-only', file: customFile, banner: 'No Heading1/2/3 styles detected in the uploaded template. Section editor falls back to token-only substitution — your template is used as-is and only {{scalar}} / {{table}} tokens are filled in.' };
                    // Build a single synthetic "all sections" textarea so the user still sees something.
                    sections = [{ id: 'sec_doc', level: 0, heading: '(Template used as-is — token substitution only)', prose: '' }];
                } else {
                    sections = parsed.sections;
                    customDocxInfo = { mode: 'sectioned', file: customFile, parsed };
                }
            } else {
                const defaultMd = window.Reports.DEFAULT_TEMPLATES ? window.Reports.DEFAULT_TEMPLATES[reportType] : null;
                // The v1 closure holds DEFAULT_TEMPLATES privately. We exported them onto Reports
                // in the monkey-patch below.
                sections = parseMarkdownToSections(defaultMd || ('# ' + def.name));
            }

            _modalState = { reportType, format, systemId, appendices, customDocxFile: customFile, sections, customDocxInfo, data };
            _buildSectionEditor();
            _showStep(2);
            status.textContent = '';
        } catch (e) {
            console.error('Step 1 → step 2 failed:', e);
            status.style.color = 'var(--color-danger, #dc2626)';
            status.textContent = 'Failed: ' + (e.message || e);
        }
    }

    // ------------------------------------------------------------------------
    // _buildSectionEditor — renders one card per parsed section. The textarea
    // is prefilled with the saved edit (if any) OR the token-resolved
    // template prose. A "Reset to template default" link clears the saved
    // edit and restores the template version.
    // ------------------------------------------------------------------------
    function _buildSectionEditor() {
        const host = document.getElementById('rpt-section-editor');
        const st = _modalState;
        host.innerHTML = '';

        // Banner for special cases (token-only fallback).
        if (st.customDocxInfo && st.customDocxInfo.banner) {
            const banner = document.createElement('div');
            banner.style.cssText = 'padding:10px 12px;background:rgba(255,149,0,0.08);border:1px solid rgba(255,149,0,0.35);border-radius:var(--r-md);font-size:12px;color:var(--color-text-secondary);margin-bottom:12px;';
            banner.textContent = st.customDocxInfo.banner;
            host.appendChild(banner);
        }

        st.sections.forEach((sec, idx) => {
            const card = document.createElement('div');
            card.style.cssText = 'border:1px solid var(--color-border-hair);border-radius:var(--r-md);padding:12px 14px;margin-bottom:10px;background:var(--color-surface-2);';
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;';
            const title = document.createElement('label');
            const prefix = sec.level > 0 ? ('H' + sec.level + ' · ') : '';
            title.textContent = prefix + (sec.heading || '(Untitled)');
            title.style.cssText = 'font-size:13px;font-weight:600;color:var(--color-text-primary);margin:0;text-transform:none;letter-spacing:0;';
            head.appendChild(title);
            const resetBtn = document.createElement('button');
            resetBtn.type = 'button';
            resetBtn.textContent = '↺ Reset to template default';
            resetBtn.style.cssText = 'background:transparent;border:none;color:var(--color-accent);font-size:11px;cursor:pointer;padding:2px 6px;';
            resetBtn.onclick = () => {
                _resetSavedEdit(st.reportType, sec.id);
                ta.value = _initialProseForSection(sec, st.reportType, st.data);
                ta.style.height = 'auto'; ta.style.height = Math.max(60, ta.scrollHeight + 4) + 'px';
            };
            head.appendChild(resetBtn);
            card.appendChild(head);

            const ta = document.createElement('textarea');
            ta.style.cssText = 'width:100%;min-height:60px;padding:8px 10px;font-family:var(--font-system);font-size:13px;line-height:1.5;border:1px solid var(--color-border-hair);border-radius:var(--r-sm);background:var(--color-surface-1);color:var(--color-text-primary);resize:vertical;';
            ta.value = _initialProseForSection(sec, st.reportType, st.data);
            ta.dataset.sectionId = sec.id;
            ta.oninput = function() {
                _setSavedEdit(st.reportType, sec.id, this.value);
                this.style.height = 'auto'; this.style.height = Math.max(60, this.scrollHeight + 4) + 'px';
            };
            // Initial autosize after layout.
            setTimeout(() => { ta.style.height = 'auto'; ta.style.height = Math.max(60, ta.scrollHeight + 4) + 'px'; }, 10);
            card.appendChild(ta);

            // Token hint — tells the user which tokens are still active in this section.
            const tokens = (sec.prose || '').match(/\{\{[a-z_:]+\}\}/g) || [];
            if (tokens.length) {
                const hint = document.createElement('div');
                hint.style.cssText = 'font-size:11px;color:var(--color-text-tertiary);margin-top:6px;';
                hint.textContent = 'Active tokens in this section: ' + tokens.join(', ') + ' — these expand at render time.';
                card.appendChild(hint);
            }

            host.appendChild(card);
        });
    }

    // Returns the initial textarea content for a section:
    //   - Saved edit (if present), otherwise
    //   - The template's prose with scalar tokens resolved (table tokens left intact).
    function _initialProseForSection(sec, reportType, data) {
        const saved = _getSavedEdit(reportType, sec.id);
        if (saved != null) return saved;
        return resolveScalarTokens(sec.prose || '', data);
    }

    // ------------------------------------------------------------------------
    // _generateFinal — step 2's primary action. Collects the edited prose
    // from each textarea, picks the right renderer (built-in docx, PDF, or
    // OOXML-surgical custom docx), and saves the result.
    // ------------------------------------------------------------------------
    async function _generateFinal() {
        if (!(await window.SafetyLabAssumptionsGate('generate this report'))) return;   // #260
        const status = document.getElementById('rpt-status2');
        try {
            const st = _modalState;
            if (!st) throw new Error('Modal state missing — re-open the dialog.');
            // Collect current edits from each textarea (these are already auto-saved as the user types).
            const editedSections = {};
            document.querySelectorAll('#rpt-section-editor textarea[data-section-id]').forEach(ta => {
                editedSections[ta.dataset.sectionId] = ta.value;
            });

            status.style.color = 'var(--color-text-secondary)';
            status.textContent = 'Generating…';

            const REPORT_DEFS = window.Reports.REPORT_DEFS;
            const baseName = REPORT_DEFS[st.reportType].name.replace(/[^A-Za-z0-9_-]+/g, '_')
                            + (st.systemId ? '_' + ((st.data.system_name || '').replace(/[^A-Za-z0-9_-]+/g, '_')) : '')
                            + '_' + new Date().toISOString().slice(0, 10);

            if (st.customDocxFile && st.format === 'docx') {
                let blob;
                if (st.customDocxInfo && st.customDocxInfo.mode === 'sectioned') {
                    blob = await renderCustomDocxSectioned(st.customDocxInfo.parsed, st.data, editedSections, { appendices: st.appendices });
                } else {
                    // Fallback: token-only path (Phase 56 v1 behavior).
                    blob = await window.Reports.renderFromCustomDocxRaw(st.customDocxFile, st.reportType, st.data);
                }
                const fileName = baseName + '.docx';
                await _saveBlob(blob, fileName);
                status.style.color = 'var(--color-success, #16a34a)';
                status.textContent = 'Report saved: ' + fileName;
                setTimeout(() => closeV2(), 1200);
                return;
            }
            if (st.format === 'docx') {
                const blob = await renderDocxFromSections(st.reportType, st.data, st.sections, editedSections, { appendices: st.appendices });
                const fileName = baseName + '.docx';
                await _saveBlob(blob, fileName);
                status.style.color = 'var(--color-success, #16a34a)';
                status.textContent = 'Report saved: ' + fileName;
                setTimeout(() => closeV2(), 1200);
                return;
            }
            if (st.format === 'pdf') {
                const docInstance = await renderPdfFromSections(st.reportType, st.data, st.sections, editedSections, { appendices: st.appendices });
                const fileName = baseName + '.pdf';
                if (typeof _savePdf === 'function') await _savePdf(docInstance, fileName);
                else docInstance.save(fileName);
                status.style.color = 'var(--color-success, #16a34a)';
                status.textContent = 'Report saved: ' + fileName;
                setTimeout(() => closeV2(), 1200);
                return;
            }
            throw new Error('Unknown format: ' + st.format);
        } catch (e) {
            console.error('Report generation failed:', e);
            status.style.color = 'var(--color-danger, #dc2626)';
            status.textContent = 'Failed: ' + (e.message || e);
        }
    }

    async function _saveBlob(blob, name) {
        if (typeof SaveFs !== 'undefined' && SaveFs.saveBlob) return SaveFs.saveBlob(blob, name);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { ok: true, mode: 'download', name };
    }

    function closeV2() {
        const modal = document.getElementById('report-gen-modal');
        if (modal) modal.style.display = 'none';
        _modalState = null;
    }

    // ------------------------------------------------------------------------
    // renderDocxFromSections — replacement for the v1 renderToDocx() that
    // honors user-edited section prose. Iterates sections in order, emits
    // a heading paragraph for each (level → docx HeadingLevel), then the
    // edited prose, expanding {{table_*}} and {{appendix:*}} tokens as
    // tables and appendix blocks at their original positions.
    // ------------------------------------------------------------------------
    async function renderDocxFromSections(reportType, data, sections, editedSections, opts) {
        opts = opts || {};
        const docxLib = await _ensureDocxLib();
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
                Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
                PageNumber, ImageRun } = docxLib;

        const REPORT_DEFS = window.Reports.REPORT_DEFS;
        const children = [];
        const border = { style: BorderStyle.SINGLE, size: 6, color: '888888' };
        const borders = { top: border, bottom: border, left: border, right: border };

        function _renderTable(rows, headers) {
            const headerRow = new TableRow({
                tableHeader: true,
                children: headers.map(h => new TableCell({
                    borders, shading: { fill: 'D5E8F0' },
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                })),
            });
            const dataRows = rows.map(r => new TableRow({
                children: headers.map(h => new TableCell({
                    borders,
                    children: [new Paragraph({ children: [new TextRun(String(r[h] == null ? '' : r[h]))] })],
                })),
            }));
            return new Table({ width: { size: 9360, type: WidthType.DXA }, rows: [headerRow, ...dataRows] });
        }

        function _emitProse(text) {
            // Split prose by table / appendix tokens; render text as paragraphs and tokens as their content.
            const re = /\{\{(fha_table|requirements_table|component_list|pra_table|zsa_table|cma_table|fta_summary|assumptions_list|afha_worksheet|sfha_worksheet|fta_summary_grid|cma_grid|coffe_table|validation_matrix|verification_matrix|compliance_posture|fc_evaluations|gaps_table|interdep_table|common_resource_table|mac_table|mfms_table|ip_ledger_table|ccmr_table|wearout_table|fmes_table|checklist_table|tailoring_table|appendix:fta|appendix:zsa|appendix:pra|appendix:cma)\}\}/g;
            let lastIdx = 0; let m;
            const out = [];
            while ((m = re.exec(text)) !== null) {
                if (m.index > lastIdx) out.push({ kind: 'text', text: text.slice(lastIdx, m.index) });
                out.push({ kind: 'token', name: m[1] });
                lastIdx = m.index + m[0].length;
            }
            if (lastIdx < text.length) out.push({ kind: 'text', text: text.slice(lastIdx) });
            return out;
        }

        for (const sec of sections) {
            const edited = (editedSections && editedSections[sec.id] != null) ? editedSections[sec.id] : _initialProseForSection(sec, reportType, data);
            // Emit heading
            if (sec.heading && sec.heading !== '(Preamble)') {
                const heading = sec.level === 1 ? HeadingLevel.HEADING_1
                              : sec.level === 2 ? HeadingLevel.HEADING_2
                              : HeadingLevel.HEADING_3;
                children.push(new Paragraph({
                    heading,
                    spacing: { before: sec.level === 1 ? 320 : 200, after: 120 },
                    children: [new TextRun({ text: sec.heading, bold: true })],
                }));
            }
            // Emit prose, splitting on token markers
            const pieces = _emitProse(edited || '');
            for (const piece of pieces) {
                if (piece.kind === 'text') {
                    piece.text.split(/\r?\n/).forEach(ln => {
                        if (ln.trim() === '') children.push(new Paragraph({ children: [new TextRun('')] }));
                        else children.push(new Paragraph({ spacing: { after: 100, line: 300 }, children: [new TextRun(ln)] }));
                    });
                } else if (piece.kind === 'token') {
                    if (piece.name.startsWith('appendix:')) {
                        const ap = piece.name.split(':')[1];
                        if (!(opts.appendices || {})[ap]) continue;
                        children.push(new Paragraph({
                            heading: HeadingLevel.HEADING_2,
                            spacing: { before: 320, after: 120 },
                            children: [new TextRun({ text: 'Appendix — ' + ap.toUpperCase(), bold: true })],
                        }));
                        if (ap === 'fta') {
                            const imgs = await _renderFTAImagesV2(data._ftaPagesForAppendix || []);
                            for (const img of imgs) {
                                children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: img.title, bold: true })] }));
                                if (img.dataUrl) {
                                    children.push(new Paragraph({ children: [new ImageRun({
                                        data: img.dataUrl.replace(/^data:image\/png;base64,/, ''),
                                        transformation: { width: img.width, height: img.height },
                                    })] }));
                                } else {
                                    children.push(new Paragraph({ children: [new TextRun({ text: '(' + img.title + ' — switch to this page and regenerate to embed.)', italics: true })] }));
                                }
                            }
                        } else {
                            const tableName = ap + '_table';
                            const rows = data[tableName] || [];
                            if (rows.length) { children.push(_renderTable(rows, Object.keys(rows[0]))); children.push(new Paragraph({ children: [new TextRun('')] })); }
                        }
                    } else {
                        const rows = data[piece.name] || [];
                        if (rows.length) { children.push(_renderTable(rows, Object.keys(rows[0]))); children.push(new Paragraph({ children: [new TextRun('')] })); }
                        else children.push(new Paragraph({ children: [new TextRun({ text: '(No entries)', italics: true, color: '888888' })] }));
                    }
                }
            }
        }

        const doc = new Document({
            creator: 'Safety Lab Aero, Inc.',
            title: REPORT_DEFS[reportType].name,
            description: REPORT_DEFS[reportType].name + ' for ' + (data.project_name || ''),
            styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
            sections: [{
                properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
                headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: REPORT_DEFS[reportType].name + ' — ' + (data.project_name || ''), size: 18, color: '666666' })] })] }) },
                footers: { default: new Footer({ children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: 'Generated by Safety Lab Aero, Inc. · ', size: 18, color: '666666' }),
                        new TextRun({ text: 'Page ', size: 18, color: '666666' }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
                        new TextRun({ text: ' of ', size: 18, color: '666666' }),
                        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '666666' }),
                    ],
                })] }) },
                children,
            }],
        });
        return await Packer.toBlob(doc);
    }

    // ------------------------------------------------------------------------
    // renderPdfFromSections — PDF counterpart that consumes edited sections.
    // ------------------------------------------------------------------------
    async function renderPdfFromSections(reportType, data, sections, editedSections, opts) {
        opts = opts || {};
        const { jsPDF } = await _loadJsPDF();
        const doc = new jsPDF({ unit: 'pt', format: 'letter' });
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const M = 50;
        let y = M;
        const REPORT_DEFS = window.Reports.REPORT_DEFS;

        function _wrap(t, maxW, fs) { doc.setFontSize(fs); return doc.splitTextToSize(String(t || ''), maxW); }
        function _need(h) { if (y + h > H - M) { doc.addPage(); y = M; } }
        function _drawTable(rows, headers) {
            if (!rows.length) {
                doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
                _need(14); doc.text('(No entries)', M, y); y += 14;
                doc.setTextColor(0); doc.setFont('helvetica', 'normal');
                return;
            }
            const colCount = headers.length;
            const colW = (W - 2*M) / colCount;
            _need(20);
            doc.setFillColor(213, 232, 240); doc.rect(M, y, W - 2*M, 18, 'F');
            doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
            headers.forEach((h, i) => { doc.text(String(h).slice(0, 30), M + i*colW + 4, y + 13); });
            y += 18;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
            rows.forEach(r => {
                const cellLines = headers.map(h => _wrap(r[h], colW - 6, 8));
                const maxLines = Math.max(1, ...cellLines.map(l => l.length));
                const thisH = Math.max(16, maxLines * 10 + 4);
                _need(thisH);
                doc.setDrawColor(180);
                doc.rect(M, y, W - 2*M, thisH);
                headers.forEach((h, i) => {
                    cellLines[i].forEach((ln, li) => { doc.text(ln, M + i*colW + 4, y + 11 + li*10); });
                    if (i > 0) doc.line(M + i*colW, y, M + i*colW, y + thisH);
                });
                y += thisH;
            });
            y += 8;
        }

        // Title
        doc.setFontSize(20); doc.setFont('helvetica', 'bold');
        doc.text(REPORT_DEFS[reportType].name, M, y); y += 28;

        const tokenRe = /\{\{(fha_table|requirements_table|component_list|pra_table|zsa_table|cma_table|fta_summary|assumptions_list|afha_worksheet|sfha_worksheet|fta_summary_grid|cma_grid|coffe_table|validation_matrix|verification_matrix|compliance_posture|fc_evaluations|gaps_table|interdep_table|common_resource_table|mac_table|mfms_table|ip_ledger_table|ccmr_table|wearout_table|fmes_table|checklist_table|tailoring_table|appendix:fta|appendix:zsa|appendix:pra|appendix:cma)\}\}/g;

        for (const sec of sections) {
            const edited = (editedSections && editedSections[sec.id] != null) ? editedSections[sec.id] : _initialProseForSection(sec, reportType, data);
            if (sec.heading && sec.heading !== '(Preamble)') {
                const fs = sec.level === 1 ? 18 : sec.level === 2 ? 14 : 12;
                _need(fs + 12);
                doc.setFontSize(fs); doc.setFont('helvetica', 'bold');
                doc.text(sec.heading, M, y); y += fs + 6;
            }
            // Walk prose with token splits
            let lastIdx = 0; let m; tokenRe.lastIndex = 0;
            const text = edited || '';
            while ((m = tokenRe.exec(text)) !== null) {
                const pre = text.slice(lastIdx, m.index);
                if (pre.trim()) {
                    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                    _wrap(pre, W - 2*M, 10).forEach(ln => { _need(13); doc.text(ln, M, y); y += 13; });
                    y += 4;
                }
                const name = m[1];
                if (name.startsWith('appendix:')) {
                    const ap = name.split(':')[1];
                    if ((opts.appendices || {})[ap]) {
                        doc.addPage(); y = M;
                        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
                        doc.text('Appendix — ' + ap.toUpperCase(), M, y); y += 22;
                        if (ap === 'fta') {
                            const imgs = await _renderFTAImagesV2(data._ftaPagesForAppendix || []);
                            for (const img of imgs) {
                                if (!img.dataUrl) {
                                    doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(120);
                                    doc.text('(' + img.title + ' — switch to this page and regenerate to embed.)', M, y); y += 16;
                                    doc.setTextColor(0); doc.setFont('helvetica', 'normal');
                                    continue;
                                }
                                _need(40);
                                doc.setFontSize(12); doc.setFont('helvetica', 'bold');
                                doc.text(img.title, M, y); y += 16;
                                const maxW = W - 2*M, maxH = H - y - M;
                                const ratio = img.width / img.height;
                                let drawW = maxW, drawH = drawW / ratio;
                                if (drawH > maxH) { drawH = maxH; drawW = drawH * ratio; }
                                doc.addImage(img.dataUrl, 'PNG', M, y, drawW, drawH);
                                y += drawH + 16;
                            }
                        } else {
                            const tbl = data[ap + '_table'] || [];
                            _drawTable(tbl, tbl.length ? Object.keys(tbl[0]) : []);
                        }
                    }
                } else {
                    const rows = data[name] || [];
                    _drawTable(rows, rows.length ? Object.keys(rows[0]) : []);
                }
                lastIdx = m.index + m[0].length;
            }
            const tail = text.slice(lastIdx);
            if (tail.trim()) {
                doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                _wrap(tail, W - 2*M, 10).forEach(ln => { _need(13); doc.text(ln, M, y); y += 13; });
                y += 4;
            }
        }

        // Page numbers footer
        const total = doc.internal.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
            doc.setPage(p);
            doc.setFontSize(9); doc.setTextColor(120); doc.setFont('helvetica', 'normal');
            doc.text('Generated by Safety Lab Aero, Inc. · Page ' + p + ' of ' + total, W/2, H - 24, { align: 'center' });
            doc.text(data.project_name || '', W - M, H - 24, { align: 'right' });
        }
        return doc;
    }

    // ------------------------------------------------------------------------
    // renderCustomDocxSectioned — OOXML surgery for uploaded templates with
    // detected headings. For each section, replace the body paragraphs' run
    // text with the user-edited content. Heading paragraphs are left untouched
    // so the customer's styling carries through.
    //
    // Strategy per section:
    //   1. Find headingParaIdx (the <w:p> with Heading style).
    //   2. The body paragraphs are bodyParaIdxs[] (indices into paragraphs[]).
    //   3. Keep the FIRST body paragraph's <w:pPr> intact (preserves font /
    //      size / color). Replace its <w:r> children with one <w:r><w:t> per
    //      line of the user's edited text.
    //   4. Remove the rest of the body paragraphs from the document.
    //   5. Re-serialise and re-zip.
    // ------------------------------------------------------------------------
    async function renderCustomDocxSectioned(parsed, data, editedSections, opts) {
        const { zip, doc, paragraphs, W_NS } = parsed.raw;

        function _setParaTextPreservingStyle(paraEl, text) {
            // Keep <w:pPr> if present; remove all <w:r> children; append one <w:r><w:t> per line.
            const children = Array.from(paraEl.childNodes);
            const keep = children.filter(n => n.localName === 'pPr');
            // Wipe paraEl
            while (paraEl.firstChild) paraEl.removeChild(paraEl.firstChild);
            keep.forEach(k => paraEl.appendChild(k));
            const lines = String(text || '').split(/\r?\n/);
            lines.forEach((ln, i) => {
                const r = doc.createElementNS(W_NS, 'w:r');
                if (i > 0) {
                    const br = doc.createElementNS(W_NS, 'w:br');
                    r.appendChild(br);
                }
                const t = doc.createElementNS(W_NS, 'w:t');
                t.setAttribute('xml:space', 'preserve');
                t.textContent = ln;
                r.appendChild(t);
                paraEl.appendChild(r);
            });
        }

        // Build a quick reverse index: paragraph index → section id (if it's in a section's body).
        const paraToSection = new Map();
        parsed.sections.forEach(sec => {
            (sec.bodyParaIdxs || []).forEach(idx => paraToSection.set(idx, sec.id));
        });

        // Replace each section's body. Resolve token references against project data first.
        for (const sec of parsed.sections) {
            if (sec.headingParaIdx === -1) continue; // preamble; skip surgery
            const rawEdit = (editedSections && editedSections[sec.id] != null) ? editedSections[sec.id] : _initialProseForSection(sec, _modalState.reportType, data);
            // Resolve any remaining table / scalar tokens to plain text representations
            // for the OOXML body (full tables aren't supported in custom-template surgery v1).
            const text = _resolveAllTokensInline(rawEdit, data, opts);
            if (!sec.bodyParaIdxs || !sec.bodyParaIdxs.length) {
                // No body paragraphs existed in template; inject one right after the heading.
                const heading = paragraphs[sec.headingParaIdx];
                const newP = doc.createElementNS(W_NS, 'w:p');
                heading.parentNode.insertBefore(newP, heading.nextSibling);
                _setParaTextPreservingStyle(newP, text);
            } else {
                // Keep the first body paragraph; replace its content. Remove subsequent body paragraphs.
                const firstIdx = sec.bodyParaIdxs[0];
                const firstP = paragraphs[firstIdx];
                _setParaTextPreservingStyle(firstP, text);
                for (let i = 1; i < sec.bodyParaIdxs.length; i++) {
                    const p = paragraphs[sec.bodyParaIdxs[i]];
                    if (p && p.parentNode) p.parentNode.removeChild(p);
                }
            }
        }

        // Serialise the mutated XML back to document.xml and re-zip.
        const serializer = new XMLSerializer();
        const newXml = serializer.serializeToString(doc);
        zip.file('word/document.xml', newXml);
        return await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    }

    // _resolveAllTokensInline — flattens tokens (including table tokens) into
    // plain inline text for the OOXML body. Full table embedding inside the
    // uploaded template would require manipulating <w:tbl> structures; v1
    // emits a one-line-per-row summary instead. Customers who need rich tables
    // can leave the table tokens in their template (they'll be auto-formatted
    // by Word as plain text) or use the built-in defaults.
    function _resolveAllTokensInline(text, data, opts) {
        // First scalars
        let out = resolveScalarTokens(text, data);
        // Tables
        ['fha_table','requirements_table','assumptions_list','component_list','fta_summary','pra_table','zsa_table','cma_table',
         'afha_worksheet','sfha_worksheet','fta_summary_grid','cma_grid','coffe_table','validation_matrix','verification_matrix','compliance_posture','fc_evaluations','gaps_table',
         'interdep_table','common_resource_table','mac_table','mfms_table','ip_ledger_table','ccmr_table','wearout_table','fmes_table','checklist_table','tailoring_table'].forEach(name => {
            const rows = data[name] || [];
            const flat = rows.length === 0 ? '(No entries.)' :
                rows.map(r => Object.entries(r).map(([k,v]) => k + ': ' + (v == null ? '' : v)).join(' · ')).join('\n');
            out = out.replace(new RegExp('\\{\\{' + name + '\\}\\}', 'g'), flat);
        });
        // Appendices — drop the markers (custom templates handle their own structure)
        out = out.replace(/\{\{appendix:[a-z]+\}\}/g, '');
        return out;
    }

    // ------------------------------------------------------------------------
    // _renderFTAImagesV2 — copy of the v1 helper, kept local so this module is
    // self-contained even if v1 is refactored.
    // ------------------------------------------------------------------------
    async function _renderFTAImagesV2(pages) {
        const out = [];
        if (!Array.isArray(pages) || !pages.length) return out;
        for (const p of pages) {
            if (!p.root) { out.push({ title: p.name || p.id, dataUrl: null }); continue; }
            const isActive = (typeof activeFTAPageId !== 'undefined') && p.id === activeFTAPageId;
            if (!isActive) { out.push({ title: p.name || p.id, dataUrl: null }); continue; }
            try {
                const svgEl = document.getElementById('fta-svg');
                const svgStr = new XMLSerializer().serializeToString(svgEl);
                const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
                const canvas = document.createElement('canvas');
                const scale = 2;
                canvas.width = (img.width || 1000) * scale;
                canvas.height = (img.height || 700) * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                const dataUrl = canvas.toDataURL('image/png');
                const targetW = 540;
                const targetH = Math.min(700, targetW * (canvas.height / canvas.width));
                out.push({ title: p.name || p.id, dataUrl, width: targetW, height: targetH });
            } catch (e) {
                console.warn('FTA appendix render failed:', e);
                out.push({ title: p.name || p.id, dataUrl: null });
            }
        }
        return out;
    }

    function _ensureDocxLib() {
        if (window.docx) return Promise.resolve(window.docx);
        if (typeof _loadDocxLib === 'function') return _loadDocxLib();
        return Promise.reject(new Error('docx-js loader not available.'));
    }

    // ------------------------------------------------------------------------
    // _ensureModalV2 — rebuilds the modal markup with the two-step layout.
    // Replaces the v1 modal entirely if present.
    // ------------------------------------------------------------------------
    function _ensureModalV2() {
        let modal = document.getElementById('report-gen-modal');
        if (modal && modal.dataset.v === '2') return;
        if (modal) modal.remove();
        modal = document.createElement('div');
        modal.id = 'report-gen-modal';
        modal.dataset.v = '2';
        modal.className = 'sl-modal-overlay';
        modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:10000;backdrop-filter:blur(2px);';
        modal.innerHTML = [
            '<div class="sl-modal-card" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(820px,calc(100vw - 48px));max-height:calc(100vh - 80px);overflow-y:auto;background:var(--color-surface-1);border:1px solid var(--color-border-thin);border-radius:var(--r-lg);box-shadow:0 28px 72px rgba(0,0,0,0.32);padding:24px;">',
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">',
            '    <h3 id="rpt-step-title" style="margin:0;">Generate Report — Step 1 of 2</h3>',
            '    <button type="button" class="node-modal-close" onclick="Reports.close()" aria-label="Close">×</button>',
            '  </div>',
            // Step 1
            '  <div id="rpt-step1" style="display:flex;flex-direction:column;gap:14px;">',
            '    <div><label>Report Type</label><select id="rpt-type" style="width:100%;margin-bottom:0;"></select></div>',
            '    <div id="rpt-system-row" style="display:none;"><label>System</label><select id="rpt-system" style="width:100%;margin-bottom:0;"></select></div>',
            '    <div><label>Output Format</label>',
            '      <div style="display:flex;gap:12px;">',
            '        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="radio" name="rpt-format" value="docx" checked style="width:auto;margin:0;"> Word (.docx)</label>',
            '        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="radio" name="rpt-format" value="pdf" style="width:auto;margin:0;"> PDF</label>',
            '      </div>',
            '    </div>',
            '    <div id="rpt-appendix-row"><label>Appendices</label>',
            '      <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:13px;">',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="fta"><input type="checkbox" id="rpt-appx-fta"  style="width:auto;margin:0;"> Linked FTAs</label>',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="zsa"><input type="checkbox" id="rpt-appx-zsa"  style="width:auto;margin:0;"> ZSA</label>',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="pra"><input type="checkbox" id="rpt-appx-pra"  style="width:auto;margin:0;"> PRA</label>',
            '        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;" data-appx="cma"><input type="checkbox" id="rpt-appx-cma"  style="width:auto;margin:0;"> CMA</label>',
            '      </div>',
            '    </div>',
            '    <div><label>Custom Template (.docx, optional)</label>',
            '      <input type="file" id="rpt-custom-template" accept=".docx" style="width:100%;margin-bottom:0;">',
            '      <p style="font-size:11px;color:var(--color-text-tertiary);margin:4px 0 0 0;">Upload a customer-branded .docx with <code>{{tokens}}</code> to use it as the template. Heading1/2/3 paragraphs become editable sections in the next step. Leave blank to use the built-in default. Custom .docx only supports Word format.</p>',
            '    </div>',
            '    <div id="rpt-status" style="font-size:12px;color:var(--color-text-secondary);min-height:18px;"></div>',
            '    <div style="display:flex;justify-content:flex-end;gap:8px;">',
            '      <button class="btn-ghost" onclick="Reports.close()">Cancel</button>',
            '      <button class="btn-green" onclick="Reports._continue()">Continue →</button>',
            '    </div>',
            '  </div>',
            // Step 2
            '  <div id="rpt-step2" style="display:none;flex-direction:column;gap:14px;">',
            '    <p style="font-size:13px;color:var(--color-text-secondary);margin:0;">Edit each section\'s prose below. Tokens like <code>{{aircraft_name}}</code> have been resolved to your project data; table tokens (<code>{{fha_table}}</code>) and appendix anchors stay in place — they\'ll auto-fill at render time. Edits save automatically with your project.</p>',
            '    <div id="rpt-section-editor" style="display:flex;flex-direction:column;"></div>',
            '    <div id="rpt-status2" style="font-size:12px;color:var(--color-text-secondary);min-height:18px;"></div>',
            '    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">',
            '      <button class="btn-ghost" onclick="Reports._back()">← Back</button>',
            '      <div style="display:flex;gap:8px;">',
            '        <button class="btn-ghost" onclick="Reports.close()">Cancel</button>',
            '        <button class="btn-green" onclick="Reports._submit()">Generate</button>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>',
        ].join('');
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeV2(); });
    }

    function _back() {
        _showStep(1);
        const title = document.getElementById('rpt-step-title');
        if (title) title.textContent = 'Generate Report — Step 1 of 2';
    }

    function _showStep(n) {
        const s1 = document.getElementById('rpt-step1');
        const s2 = document.getElementById('rpt-step2');
        const title = document.getElementById('rpt-step-title');
        if (s1) s1.style.display = (n === 1) ? 'flex' : 'none';
        if (s2) s2.style.display = (n === 2) ? 'flex' : 'none';
        if (title) title.textContent = 'Generate Report — Step ' + n + ' of 2';
    }

    // ------------------------------------------------------------------------
    // Expose DEFAULT_TEMPLATES from the v1 module via a helper that re-reads
    // them from window.Reports (the v1 closure already has them; we just
    // need a public handle).
    // ------------------------------------------------------------------------
    function _expectDefaultTemplates() {
        // The v1 IIFE didn't expose DEFAULT_TEMPLATES on window.Reports. We
        // can either monkey-patch its return value (it was returned by the
        // IIFE), or duplicate the templates here. To keep v1 templates as the
        // single source of truth, we read them from the IIFE source if present;
        // otherwise we synthesize a minimal placeholder. In practice the v1
        // module exposes its REPORT_DEFS, and we exported DEFAULT_TEMPLATES
        // separately at file end (see attachDefaultTemplatesToReports below).
    }

    // ------------------------------------------------------------------------
    // Monkey-patch window.Reports with v2 entry points.
    // ------------------------------------------------------------------------
    const v1 = window.Reports;
    v1.openV1 = v1.open;
    v1.open = openV2;
    v1.close = closeV2;
    v1._continue = _continueToSectionEditor;
    v1._submit = _generateFinal;
    v1._back = _back;
    v1.parseMarkdownToSections = parseMarkdownToSections;
    v1.parseDocxToSections = parseDocxToSections;
    v1.renderDocxFromSections = renderDocxFromSections;
    v1.renderPdfFromSections = renderPdfFromSections;
    v1.renderCustomDocxSectioned = renderCustomDocxSectioned;
    // Hold on to v1's renderFromCustomDocx for the fallback path.
    if (typeof v1.renderFromCustomDocxRaw === 'undefined' && typeof v1.renderFromCustomDocx === 'function') {
        v1.renderFromCustomDocxRaw = v1.renderFromCustomDocx;
    }
})();

/* Attach DEFAULT_TEMPLATES to window.Reports so the v2 IIFE above can read
 * them. This block runs after the v1 IIFE has already returned — by the time
 * window.Reports is non-null, we know the v1 module ran. We rebuild the
 * default templates dictionary here so v2 has access without depending on
 * v1's closure. Keep these in sync with the v1 originals. */
(function() {
    if (typeof window === 'undefined' || !window.Reports) return;
    if (window.Reports.DEFAULT_TEMPLATES) return;
    window.Reports.DEFAULT_TEMPLATES = {
        AFHA: [
            '# Aircraft Functional Hazard Assessment',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Aircraft Functional Hazard Assessment (AFHA) identifies aircraft-level functions, postulates their failure conditions, classifies the severity of resulting hazards, and assigns aircraft-level safety objectives in accordance with ARP 4761A and AC 25.1309-1B (or the equivalent Part 23/27/29/SC-VTOL guidance per the certification basis).',
            '',
            '## 2. Scope',
            'Aircraft-level functions are decomposed top-down. Each functional failure condition is classified using the FAA hazard categories (Catastrophic, Hazardous, Major, Minor, No Safety Effect) and the corresponding quantitative probability budget per FAR §xx.1309. System-level allocation is deferred to the SFHA.',
            '',
            '## 3. Functional Hazard Inventory',
            '{{fha_table}}',
            '',
            '## 4. Aircraft-Level Safety Requirements',
            '{{requirements_table}}',
            '',
            '## 5. Validation Assumptions',
            '{{assumptions_list}}',
            '',
            '## 6. Functional Hazard Assessment Worksheet (ARP 4761A Table A7)',
            'The following worksheet presents each failure condition in the prescribed six-column AFHA format. It restates the inventory above in the standard grid for direct cross-reference during review.',
            '{{afha_worksheet}}',
            '',
            '## 7. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 8. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 9. Completion Checklist (ARP 4761A §A.9)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
        PASA: [
            '# Preliminary Aircraft Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Preliminary Aircraft Safety Assessment (PASA) develops the aircraft-level safety architecture necessary to satisfy the AFHA-derived safety objectives. It establishes the development assurance levels (DAL) for functions per ARP 4754B §5.4 and apportions quantitative budgets across systems.',
            '',
            '## 2. Top-Level Failure Conditions',
            '{{fha_table}}',
            '',
            '## 3. Architectural Considerations',
            'Aircraft-level architectural choices are described, including redundancy, independence claims (Option 1), dissimilarity, and integrated common-cause defenses (zonal, particular-risk, common-mode).',
            '',
            '## 4. Allocated Requirements',
            '{{requirements_table}}',
            '',
            '## 5. Development Assurance Allocation',
            'FDAL is allocated to aircraft functions; IDAL is allocated to items as they are identified. The carrier-child Option 1 claim is documented per top-down allocation rules.',
            '',
            '## 6. Common-Cause Coverage',
            'See appendices for the Zonal Safety, Particular Risk, and Common Mode analyses.',
            '',
            '## 7. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 8. Linked Fault Trees',
            '{{fta_summary}}',
            '',
            '## 9. Appendices',
            '{{appendix:fta}}',
            '{{appendix:zsa}}',
            '{{appendix:pra}}',
            '{{appendix:cma}}',
            '',
            '## 10. Combined Functional Failure Effects — CoFFE (ARP 4761A Table B2)',
            'The CoFFE table below scaffolds the combined effect of contributing functions for each catastrophic/hazardous aircraft failure condition. The "results in failure condition event?" column reflects the advisory single-failure posture derived from the linked fault tree(s); project-specific contributing-function columns should be refined by the analyst.',
            '{{coffe_table}}',
            '',
            '## 11. FTA Data Summary (ARP 4761A Table G9/G10)',
            'For each aircraft-level failure condition, the maximum allowable probability derives from its severity classification under the certification basis; the achieved probability is owned by the fault-tree engine and presented in the FTA appendix. Allocated-versus-required DAL and the advisory posture are summarized here.',
            '{{fta_summary_grid}}',
            '',
            '## 12. Per-Failure-Condition Qualitative Evaluation (Advisory)',
            '{{fc_eval_narrative}}',
            '{{fc_evaluations}}',
            '',
            '## 13. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 14. Validation & Verification Matrices (ARP 4754B §5.4.7 / §5.5.6)',
            'The validation and verification tracking matrices below cover the aircraft-level safety requirements developed by this PASA.',
            '{{validation_matrix}}',
            '{{verification_matrix}}',
            '',
            '## 15. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 16. Functional Interdependence (ARP 4761A Table B1)',
            'Contributing systems per aircraft failure condition. Marks are derived from function traces, resource provide/consume mappings, and SFHA trace-backs, or asserted with signature; cleared cells record a signed review. Derived facts cannot be suppressed by manual clears.',
            '{{interdep_table}}',
            '',
            '## 17. Common Resource Analysis (ARP 4761A Table B3)',
            'Recorded effects of resource loss or malfunction on each failure condition’s contributing systems, with the combined aircraft-level effect (B.4.3.2 step d).',
            '{{common_resource_table}}',
            '',
            '## 18. Minimum Acceptable Control Model',
            'Minimum-equipment floors per aircraft function. Each rule is recorded as an assumption routed to design until substantiated against the SDD. Minimal breach combinations are enumerated exactly and drive the compiled MF&MS trees.',
            '{{mac_table}}',
            '',
            '## 19. Malfunction & Failure Mode Summary Trees (B.4.1)',
            'Compiled trees are proven equivalent to the MAC model by BDD minimal-cut-set comparison; authored trees are cross-checked against the model and the locked CoFFE constraints. Authored malfunction grafts sit outside the equivalence theorem by design.',
            '{{mfms_table}}',
            '',
            '## 20. Independence Principles',
            'Deduplicated registry of every independence claim in the aircraft-level model — failure independence from minimal cut sets, error independence from DAL-allocation gates — with CMA evidence, derived requirements, and evaluation state.',
            '{{ip_ledger_table}}',
            '',
            '## 21. Methodology (Safety Program Plan)',
            '{{spp_summary}}',
            '',
            '## 22. Completion Checklist (ARP 4761A B.5)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
            '',
            '## 23. Tailoring Register',
            'Every completion-checklist objective tailored out of this program, with its signed rationale. Opting out is an act, not an absence.',
            '{{tailoring_table}}',
        ].join('\n'),
        ASA: [
            '# Aircraft Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Aircraft Safety Assessment (ASA) closes the safety case by demonstrating that the as-built aircraft satisfies the AFHA-derived safety objectives. Quantitative claims roll up from SSA evidence; qualitative claims roll up from architectural verification.',
            '',
            '## 2. Compliance to AFHA Objectives',
            '{{fha_table}}',
            '',
            '## 3. Verified Aircraft-Level Requirements',
            '{{requirements_table}}',
            '',
            '## 4. Rolled-Up Quantitative Evidence',
            '{{fta_summary}}',
            '',
            '## 5. Common-Cause Verification',
            'Evidence from ZSA, PRA, and CMA is summarized; full analyses appear in appendices.',
            '',
            '## 6. Residual Assumptions',
            '{{assumptions_list}}',
            '',
            '## 7. Component / Item Inventory',
            '{{component_list}}',
            '',
            '## 8. Appendices',
            '{{appendix:fta}}',
            '{{appendix:zsa}}',
            '{{appendix:pra}}',
            '{{appendix:cma}}',
            '',
            '## 9. Final Failure-Condition List with Evidence (ARP 4761A App F)',
            'The final aircraft failure-condition list is presented in the FTA data-summary form, pairing each condition with its maximum allowable probability, allocated/achieved DAL, and the advisory posture rolled up from the supporting analyses. The Aircraft Safety Assessment is a traceability/confirmation report; the certifying authority makes the final compliance determination.',
            '{{fta_summary_grid}}',
            '',
            '## 10. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 11. Validation & Verification Status (ARP 4754B §5.4.7 / §5.5.6)',
            'V&V status for the aircraft-level safety requirements, including assigned development assurance levels and verification conclusions.',
            '{{validation_matrix}}',
            '{{verification_matrix}}',
            '',
            '## 12. Open Items and Deferred Problems (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 13. Independence Principle Verification',
            'Final state of every independence principle claimed by the model. Compromised or unevaluated principles block the ASA gate.',
            '{{ip_ledger_table}}',
            '',
            '## 14. Candidate Certification Maintenance Requirements (E.3.2.4 Roll-Up)',
            'Aircraft-level roll-up of latent failures with their not-to-exceed exposure intervals, computed through the live fault-tree engine.',
            '{{ccmr_table}}',
            '',
            '## 15. Completion Checklist (ARP 4761A F.4)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
            '',
            '## 16. Tailoring Register',
            '{{tailoring_table}}',
        ].join('\n'),
        SFHA: [
            '# System Functional Hazard Assessment',
            '**Project:** {{project_name}}  ',
            '**System:** {{system_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This System Functional Hazard Assessment (SFHA) decomposes aircraft-level functions allocated to the {{system_name}} system, identifies system-level failure conditions, and establishes system safety objectives consistent with the aircraft-level allocations.',
            '',
            '## 2. System Functions and Failure Conditions',
            '{{fha_table}}',
            '',
            '## 3. System Safety Requirements',
            '{{requirements_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 5. System Functional Hazard Assessment Worksheet (ARP 4761A Table C6)',
            'The following worksheet presents each system failure condition in the prescribed six-column SFHA format, identical in shape to the AFHA worksheet, with the up-thread reference to the parent aircraft failure condition carried in the assumptions/references column.',
            '{{sfha_worksheet}}',
            '',
            '## 6. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 7. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 8. Completion Checklist (ARP 4761A C.9)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
        PSSA: [
            '# Preliminary System Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**System:** {{system_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This Preliminary System Safety Assessment (PSSA) develops the {{system_name}} system safety architecture necessary to satisfy SFHA-derived objectives. It allocates IDAL to items, derives lower-level safety requirements, and identifies common-mode hazards requiring CMA treatment.',
            '',
            '## 2. System Failure Conditions',
            '{{fha_table}}',
            '',
            '## 3. Architectural Decisions',
            'Redundancy schemes, independence claims, dissimilarity strategies, and CCF defenses (β-factor / α-factor / MGL) are documented per gate. Common-mode candidates are flagged for CMA.',
            '',
            '## 4. Allocated Item Requirements',
            '{{requirements_table}}',
            '',
            '## 5. Common-Mode Considerations',
            'Linked common-mode subjects are described; full evaluation appears in the CMA appendix.',
            '',
            '## 6. Items / LRUs',
            '{{component_list}}',
            '',
            '## 7. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 8. Linked Fault Trees',
            '{{fta_summary}}',
            '',
            '## 9. Appendices',
            '{{appendix:fta}}',
            '{{appendix:cma}}',
            '',
            '## 10. Per-Failure-Condition Qualitative Evaluation (Advisory)',
            '{{fc_eval_narrative}}',
            '{{fc_evaluations}}',
            '',
            '## 11. FTA Data Summary (ARP 4761A Table G9/G10)',
            'For each system failure condition, the maximum allowable probability derives from its severity classification; achieved probabilities are owned by the fault-tree engine and shown in the FTA appendix. Allocated-versus-required DAL and the advisory posture are summarized here.',
            '{{fta_summary_grid}}',
            '',
            '## 12. Common Mode Evaluation Worksheet (ARP 4761A Table M2)',
            'Common-mode subjects linked to this system are presented in the prescribed three-column Independence-Principle evaluation format.',
            '{{cma_grid}}',
            '',
            '## 13. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 14. Validation & Verification Matrices (ARP 4754B §5.4.7 / §5.5.6)',
            'V&V tracking matrices for the system-level safety requirements produced by this PSSA.',
            '{{validation_matrix}}',
            '{{verification_matrix}}',
            '',
            '## 15. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 16. Latent Failure Bounds (D.4.2.1.1)',
            'Latent events in this system’s trees with their exposure intervals and not-to-exceed bounds.',
            '{{ccmr_table}}',
            '',
            '## 17. Completion Checklist (ARP 4761A D.5)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
        SSA: [
            '# System Safety Assessment',
            '**Project:** {{project_name}}  ',
            '**System:** {{system_name}}  ',
            '**Certification Basis:** {{cert_basis}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'This System Safety Assessment (SSA) closes the {{system_name}} system safety case. Quantitative top-event probabilities are evaluated using as-built component failure data, BDD-exact P(top), and uncertainty bounds. Qualitative claims (DAL, independence, common-cause) are verified.',
            '',
            '## 2. Compliance to SFHA Objectives',
            '{{fha_table}}',
            '',
            '## 3. Verified System Requirements',
            '{{requirements_table}}',
            '',
            '## 4. Quantitative Evidence',
            '{{fta_summary}}',
            '',
            '## 5. Common-Mode Verification',
            'Each CMA subject linked to this system has been evaluated and dispositioned. See the CMA appendix for details.',
            '',
            '## 6. Items / LRUs',
            '{{component_list}}',
            '',
            '## 7. Residual Assumptions',
            '{{assumptions_list}}',
            '',
            '## 8. Appendices',
            '{{appendix:fta}}',
            '{{appendix:cma}}',
            '',
            '## 9. Failure-Condition Quantitative Result Summary (ARP 4761A Table G9/G10)',
            'System failure conditions are presented against their maximum allowable probability and allocated/achieved DAL. Achieved top-event probabilities are owned by the fault-tree engine and shown in the FTA appendix; this summary carries the advisory posture and corrective-action path.',
            '{{fta_summary_grid}}',
            '',
            '## 10. Per-Failure-Condition Qualitative Assessment (Advisory)',
            '{{fc_eval_narrative}}',
            '{{fc_evaluations}}',
            '',
            '## 11. Common Mode Evaluation Worksheet (ARP 4761A Table M2)',
            'Common-mode subjects evaluated and dispositioned for this system, in the prescribed Independence-Principle format.',
            '{{cma_grid}}',
            '',
            '## 12. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 13. Validation & Verification Matrices (ARP 4754B §5.4.7 / §5.5.6)',
            'Final V&V status for the system-level safety requirements.',
            '{{validation_matrix}}',
            '{{verification_matrix}}',
            '',
            '## 14. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 15. Failure Modes & Effects Summary (FMES)',
            'Derived grouping of FMEA rows by (end effect, detection) — the summary is generated from the live FMEA, never maintained by hand, so it cannot drift from its source.',
            '{{fmes_table}}',
            '',
            '## 16. Candidate Certification Maintenance Requirements (E.3.2.4)',
            'Latent failures with not-to-exceed exposure intervals, computed by bisection through the live BDD engine.',
            '{{ccmr_table}}',
            'Wear-out candidates (E.3.2.5) — events sourced from mechanical component-library entries where the constant-failure-rate assumption requires substantiation:',
            '{{wearout_table}}',
            '',
            '## 17. Independence Principles (E.3.1.1)',
            '{{ip_ledger_table}}',
            '',
            '## 18. Completion Checklist (ARP 4761A E.4)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
        ZSA: [
            '# Zonal Safety Analysis',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'The Zonal Safety Analysis (ZSA) inspects each aircraft zone to identify hazards arising from co-located equipment, installation defects, and maintenance-induced damage that single-system analyses cannot detect.',
            '',
            '## 2. Methodology',
            'Each zone is walked top-down: housed equipment is enumerated, postulated failure modes are evaluated for interference with adjacent equipment, and mitigations are documented. Findings flowing into AutoReq generate housed-function separation requirements.',
            '',
            '## 3. Zone-by-Zone Findings',
            '{{zsa_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 5. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 6. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 7. Completion Checklist',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
        PRA: [
            '# Particular Risk Analysis',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'The Particular Risk Analysis (PRA) evaluates external threats that can damage multiple systems simultaneously: bird strike, lightning, HIRF, tire burst, uncontained engine failure, fire, fluid leakage, hail, and ice.',
            '',
            '## 2. Methodology',
            'Each particular risk is characterized by its threat source, affected systems, credible failure modes, and required mitigations. Zonal adjacencies feed system-impact propagation.',
            '',
            '## 3. Particular Risk Catalog',
            '{{pra_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 5. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 6. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 7. Completion Checklist',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
        CMA: [
            '# Common Mode Analysis',
            '**Project:** {{project_name}}  ',
            '**Aircraft:** {{aircraft_name}}  ',
            '**Date:** {{date}}',
            '',
            '## 1. Purpose',
            'The Common Mode Analysis (CMA) identifies common-cause failures that can defeat redundancy, dissimilarity, and architectural independence claims. CMA subjects originate from PSSA architectural decisions and are dispositioned in the SSA.',
            '',
            '## 2. Methodology',
            'Each CMA subject documents the claim being protected, the candidate common-mode source, findings from analysis or test, and the disposition. Linked FTA gates are referenced where the claim originates.',
            '',
            '## 3. Common-Mode Subjects',
            '{{cma_table}}',
            '',
            '## 4. Assumptions',
            '{{assumptions_list}}',
            '',
            '## 5. Common Mode Evaluation Worksheet (ARP 4761A Table M2)',
            'Each common-mode subject is presented in the prescribed three-column Independence-Principle evaluation format, restating the subjects above against the principle under analysis.',
            '{{cma_grid}}',
            '',
            '## 6. Compliance Posture (Advisory)',
            '{{compliance_summary}}',
            '{{compliance_posture}}',
            '',
            '## 7. Gaps and Open Items (Advisory)',
            '{{gaps_summary}}',
            '{{gaps_table}}',
                    '',
            '## 8. Completion Checklist (ARP 4761A M.3)',
            '{{checklist_summary}}',
            '{{checklist_table}}',
        ].join('\n'),
    };
})();

/* ============================================================================
 * Phase 56.10 — Reports v3: AI bulk-draft + per-section review
 * ----------------------------------------------------------------------------
 * Layers an AI assistance flow over the Phase 56.9 section editor. Step 1 of
 * the Generate Report modal grows a new checkbox: "✨ AI-draft sections for
 * review". When ticked, clicking Continue → triggers a sequential pass over
 * every section: AiClient.messages() is invoked with project-data context and
 * a tightly-constrained system prompt, and the returned prose lands in a
 * per-section "AI proposal" slot.
 *
 * Step 2 then renders sections side-by-side (template default | AI proposal)
 * with three per-section actions: ✓ Accept · ✎ Edit & Accept · ✗ Discard.
 * Generate stays disabled until every AI-drafted section has been
 * dispositioned. "Skip remaining (use template default)" forces all pending
 * sections to Discard.
 *
 * Constraints:
 *   - No audit trail (per user decision Phase 56.10). Once accepted, prose
 *     becomes the section's content with no aiGenerated flag.
 *   - No bulk Accept All button. Per-section disposition is mandatory.
 *   - ITAR + Pro+ tier gating delegated to AiClient.messages() — errors are
 *     caught and surfaced in the modal status line.
 *   - System prompt forbids invention of facts; constrains to project data.
 *   - Sequential calls (not parallel) — keeps token meter accurate and lets
 *     us update the "Drafting section N of M" progress in real time.
 * ========================================================================= */
(function() {
    'use strict';
    if (typeof window === 'undefined' || !window.Reports) return;
    if (typeof window.AiClient === 'undefined') {
        // AI infrastructure not loaded yet (e.g. licensed library bundle hasn't
        // initialized). The checkbox will surface a "configure AI in Settings"
        // error if the user tries to use it before AiClient is available.
    }

    // ------------------------------------------------------------------------
    // Per-modal-open state. Cleared on close. Holds the AI proposals and the
    // disposition decisions so they survive textarea edits within Step 2.
    //   aiDrafts:     { [sectionId]: { prose, model, generatedAt, error? } }
    //   dispositions: { [sectionId]: 'pending'|'accepted'|'edited'|'discarded' }
    // ------------------------------------------------------------------------
    const R = window.Reports;
    R._aiState = null;

    function _resetAiState() { R._aiState = null; }

    // Phase E2.5 — abandoning a drafting session must not poison the hand-off
    // gate: proposals that never reached a document are dropped from the draft
    // state machine on close. Accepted / edited / discarded records persist.
    (function () {
        const _origClose = R.close;
        R.close = function () {
            try {
                if (window.AiFidelity && R._modalState && R._modalState.reportType) {
                    window.AiFidelity.clearUnaccepted(R._modalState.reportType);
                }
            } catch (_) {}
            return _origClose.apply(this, arguments);
        };
    })();

    // ------------------------------------------------------------------------
    // _buildContextForAI(reportType, data, section) — assembles the JSON
    // context blob passed to Claude. We keep it focused (~3-8KB) by including
    // only the data the AI legitimately needs to draft this particular
    // section. Aircraft / project metadata is always included; tables are
    // included only when the section is likely to need them.
    // ------------------------------------------------------------------------
    function _buildContextForAI(reportType, data, section) {
        // Heuristic: pass everything except internal _* keys; AI sees the same
        // facts a renderer would. Keep tables but cap row counts to avoid
        // ballooning input tokens on huge projects.
        const ctx = {};
        Object.keys(data).forEach(k => {
            if (k.startsWith('_')) return;
            const v = data[k];
            if (Array.isArray(v)) ctx[k] = v.slice(0, 30); // cap at 30 rows per table
            else ctx[k] = v;
        });

        // Build #144 — GROUND the AI in the REAL derived analysis, not just flat
        // rows. We attach a focused "derived_analysis" digest distilled from the
        // structured advisory objects (cut-set/DAL/logic via #147, mocEntries
        // roll-up via #146, and the surfaced gaps). Capped + summarized so it
        // stays token-cheap. This makes gaps explicit so the model surfaces
        // rather than buries them.
        try {
            const digest = {};
            const posture = data._compliancePosture;
            if (posture) {
                digest.compliance = {
                    regulation: posture.regulation,
                    applicable_count: posture.applicableCount,
                    open_risk_count: (posture.risks || []).length,
                    risks: (posture.risks || []).slice(0, 20).map(r => ({
                        item: r.item, ref: r.paragraph, status: r.status, path: r.path, source: r.source,
                    })),
                    note: 'ADVISORY posture — does not assert regulatory compliance; the DER/authority decides.',
                };
            }
            const fcEvals = data._fcEvaluations;
            if (Array.isArray(fcEvals) && fcEvals.length) {
                digest.failure_condition_evaluations = fcEvals.slice(0, 20).map(e => ({
                    fc: e.fcId, severity: e.severity, linked_trees: e.linkedTreeCount,
                    single_failure: e.singleFailure ? e.singleFailure.judgment : null,
                    single_failure_detail: e.singleFailure ? e.singleFailure.detail : null,
                    dal_required: e.requiredDal, dal_achieved: e.achievedDal,
                    dal_judgment: e.dalAdequacy ? e.dalAdequacy.judgment : null,
                    protective_strategy: e.protectiveStrategy ? e.protectiveStrategy.detail : null,
                    independence_notes: (e.independence || []).map(n => n.note).slice(0, 5),
                    open_requirements: (e.openRequirements || []).length,
                    unconfirmed_assumptions: (e.unconfirmedAssumptions || []).map(a => a.asmId).slice(0, 8),
                }));
            }
            const gaps = data._gaps;
            if (gaps) {
                digest.gaps = {
                    count: (gaps.rows || []).length,
                    summary: gaps.summary,
                    items: (gaps.rows || []).slice(0, 20),
                };
            }
            if (Object.keys(digest).length) ctx.derived_analysis = digest;
        } catch (_) { /* non-fatal: AI still gets the flat-row context */ }

        return ctx;
    }

    // ------------------------------------------------------------------------
    // _systemPromptForSection(section, reportType, headingPath) — builds the
    // system prompt. Heavily constrained: no fabrication, no quantitative
    // claims beyond what's in the data, certification-appropriate tone.
    // ------------------------------------------------------------------------
    function _systemPromptForSection(section, reportType, def) {
        return [
            'You are drafting prose for the "' + section.heading + '" section of an ' + def.name + ' (' + reportType + ').',
            'This document is a CERTIFICATION artifact reviewed by a Designated Engineering Representative (DER) or Authorized Representative (AR). Accuracy matters.',
            '',
            'STRICT CONSTRAINTS:',
            '1. Use ONLY the project data provided below. Do NOT invent failure conditions, hazard classifications, DAL allocations, system architectures, or quantitative reliability claims that are not present in the data.',
            '2. If the section concerns a topic for which the data is empty or insufficient, write 1 paragraph acknowledging that and noting "[Data to be added in subsequent revisions]" — do not fabricate.',
            '3. Match ARP 4761A / AC 25.1309-1B / equivalent terminology for the certification basis given in the data.',
            '4. Do not include the section heading in your response — only the prose body.',
            '5. Do not include markdown headers (#, ##), bullet lists, or numbered lists unless the source data explicitly contains a list. Prose paragraphs only.',
            '6. Preserve any {{table_token}} or {{appendix:xxx}} markers that appear in the template prose by inserting them at appropriate positions. Tokens like {{fha_table}} indicate a table will be inserted at render time — write prose leading into the table.',
            '7. 2-4 paragraphs, ~80-200 words total. Match the level of detail expected for this section.',
            '8. Tone: formal, technical, factual. No marketing language. No "we", "our" — use third-person "the aircraft / the system".',
            '',
            'GROUNDING IN THE DERIVED ANALYSIS (build #144):',
            '9. The JSON includes a "derived_analysis" object distilled from the actual safety model — per-failure-condition evaluations (single-failure / order-1 cut-set posture, required-vs-allocated DAL, inferred protective strategy, open requirements, unconfirmed assumptions), the compliance-risk roll-up, and a list of surfaced gaps. When it is present and relevant to this section, GROUND your prose in it: cite the specific posture (e.g. an order-1 cut set indicating a single point of failure, a DAL allocation that is short of the required level, an open requirement, an orphan trace, or an unconfirmed assumption).',
            '10. SURFACE gaps; never bury them. If derived_analysis.gaps or open compliance risks exist for the topic of this section, state them plainly as open/tracked items with the recommended path — do not smooth them over or imply they are resolved.',
            '',
            'ADVISORY — NEVER DETERMINATIVE (hard rule):',
            '11. This report is ADVISORY. It presents safety POSTURE + RISK + PATH. It must NEVER assert final regulatory compliance or state that a failure condition "is compliant", "meets all requirements", or "is certified". Where the data shows an objective is satisfied, phrase it as "the model indicates …", "the allocated DAL meets the required level", or "no structural single point of failure was identified (advisory)". The Designated Engineering Representative / certifying authority makes the compliance determination — say so where a section would otherwise read as a compliance conclusion.',
            '',
            'TEMPLATE DEFAULT PROSE (for tone and structural reference; you may improve clarity but stay on-topic):',
            '"""',
            section.prose || '(empty)',
            '"""',
            '',
            'Project data follows in the user message as JSON.',
        ].join('\n');
    }

    // ------------------------------------------------------------------------
    // _draftSectionWithAI(section, reportType, data, def) — single AI call.
    // Returns { prose, model, generatedAt } on success or { error } on failure.
    // ------------------------------------------------------------------------
    async function _draftSectionWithAI(section, reportType, data, def) {
        const AF = (typeof window !== 'undefined' && window.AiFidelity) || null;
        let systemPrompt = _systemPromptForSection(section, reportType, def);
        let ctx = _buildContextForAI(reportType, data, section);
        let manifest = null;
        if (AF && AF.sectionContext) {
            // Phase E2.1 — closed-world context contract: per-section scoping with
            // a truncation manifest (the model is told what it cannot see), plus
            // the clause library as the ONLY permitted external references.
            const sc = AF.sectionContext(reportType, data, section, ctx);
            ctx = sc.ctx; manifest = sc.manifest;
            if (sc.clauses && sc.clauses.length) {
                systemPrompt += '\n\nSTANDARD CLAUSE REFERENCES — the ONLY external references you may cite:\n' +
                    sc.clauses.map(c => '- ' + c.ref + ' — ' + c.note).join('\n');
            }
            systemPrompt += [
                '', '',
                'CLOSED-WORLD CONTRACT (Phase E2 — enforced by a deterministic checker):',
                '12. Every sentence must be supported by the JSON data or the clause references above. Nothing else exists.',
                '13. Prefer {{token}} references for scalar facts that have tokens (e.g. {{cert_basis}}, {{system_name}}, {{checklist_summary}}) — the engine resolves them; never write out an ID, probability, or DAL letter that does not appear verbatim in the data.',
                '14. context_manifest inside the JSON lists tables omitted or truncated for token budget. If a topic falls in omitted data, refer the reader to the corresponding table — do not describe contents you were not shown.',
                '15. A deterministic claim checker parses every ID, number, and DAL letter in your prose and flags anything unmatched to the model. Unverifiable prose is rejected.',
            ].join('\n');
        }
        const userMsg = 'Draft the "' + section.heading + '" section prose. Project data:\n\n' + JSON.stringify(ctx, null, 2);
        // Route through the AI module's Provider so report drafting honors the active
        // backend (cloud / itar-cloud / self-hosted local). This is the path the rest of
        // the AI features use; falling back to the raw client only if the module is absent.
        let out;
        if (window.SafetyLabAI && typeof window.SafetyLabAI.complete === 'function') {
            const r = await window.SafetyLabAI.complete({
                feature: 'report.section.draft',
                system: systemPrompt,
                messages: [{ role: 'user', content: userMsg }],
                maxTokens: 800
            });
            const txt = (r && (r.text || (r.raw && r.raw.content && r.raw.content[0] && r.raw.content[0].text))) || '';
            out = { prose: String(txt).trim(), model: (r && r.model) || 'local', generatedAt: new Date().toISOString() };
        } else {
            if (!window.AiClient) throw new Error('AI assistant not available — configure in Settings.');
            const r = await window.AiClient.messages({
                feature: 'report.section.draft',
                system: systemPrompt,
                messages: [{ role: 'user', content: userMsg }],
                maxTokens: 800,
            });
            const txt = (r.content && r.content[0] && r.content[0].text) || '';
            out = { prose: txt.trim(), model: (r.model || 'claude-sonnet-4-6'), generatedAt: new Date().toISOString() };
        }
        // Phase E2.3/E2.5 — deterministic review of the returned prose + a
        // provenance record + a 'drafted' entry in the draft state machine.
        if (AF) {
            try {
                out.review = AF.reviewDraft(out.prose, data);
                out.promptHash = AF.fnv(systemPrompt + ' ' + userMsg);
                out.inputFp = AF.fnv(JSON.stringify(ctx));
                out.manifest = manifest;
                const systemId = (R._modalState && R._modalState.systemId) || '';
                const key = AF.draftKey(reportType, systemId, section.id);
                out._afKey = key;
                AF.noteDrafted(key, {
                    heading: section.heading, model: out.model,
                    promptHash: out.promptHash, inputFp: out.inputFp, flags: out.review.total,
                });
                AF.recordProvenance({
                    kind: 'draft', feature: 'report.section.draft', reportType,
                    section: section.heading, model: out.model,
                    promptHash: out.promptHash, inputFp: out.inputFp, flags: out.review.total,
                });
            } catch (_) { /* fidelity layer must never break drafting */ }
        }
        return out;
    }

    // ------------------------------------------------------------------------
    // _runAiDraftPass(sections, reportType, data, def, progressCb) —
    // sequential pass over every section. progressCb(idx, total, sectionId)
    // is called BEFORE each call so the UI can update the status line.
    // Returns { aiDrafts: { [id]: result }, errors: [{sectionId, error}] }.
    // ------------------------------------------------------------------------
    async function _runAiDraftPass(sections, reportType, data, def, progressCb) {
        const aiDrafts = {};
        const errors = [];
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            // Skip the preamble synthetic section — it has no real heading.
            if (sec.heading === '(Preamble)' || !sec.heading) continue;
            try { progressCb(i + 1, sections.length, sec.id, sec.heading); } catch (_) {}
            try {
                const result = await _draftSectionWithAI(sec, reportType, data, def);
                aiDrafts[sec.id] = result;
            } catch (e) {
                errors.push({ sectionId: sec.id, heading: sec.heading, error: (e && e.message) || String(e) });
                aiDrafts[sec.id] = { error: (e && e.message) || String(e) };
                // If the first call fails for credential / ITAR reasons, abort
                // the whole pass — every subsequent call would fail with the
                // same error and waste the user's time.
                const fatal = /credential|configure|allowance|ITAR|cost cap/i.test(errors[errors.length - 1].error);
                if (fatal) break;
            }
        }
        return { aiDrafts, errors };
    }

    // ------------------------------------------------------------------------
    // Step-1 hook — inject the new checkbox into the rendered modal once.
    // The v2 modal builder produces an HTML string; we append our checkbox row
    // after it builds. Idempotent.
    // ------------------------------------------------------------------------
    function _ensureAiCheckbox() {
        const step1 = document.getElementById('rpt-step1');
        if (!step1 || document.getElementById('rpt-ai-draft-row')) return;
        // Insert AFTER the appendix row, BEFORE the file picker.
        const fileRow = step1.querySelector('input#rpt-custom-template');
        const fileBlock = fileRow ? fileRow.closest('div') : null;
        const row = document.createElement('div');
        row.id = 'rpt-ai-draft-row';
        row.style.cssText = 'padding:10px 12px;border:1px solid var(--color-border-hair);border-radius:var(--r-md);background:var(--color-surface-2);';
        row.innerHTML = [
            '<label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;cursor:pointer;margin:0;">',
            '  <input type="checkbox" id="rpt-ai-draft" style="width:auto;margin:2px 0 0 0;flex-shrink:0;">',
            '  <span><strong>✨ AI-draft sections for review</strong>',
            '    <div style="font-size:11px;color:var(--color-text-tertiary);margin-top:3px;font-weight:400;">Claude drafts each section\'s prose from your project data. You review and accept / edit / discard each one individually before generating. Requires Pro+ or BYO Anthropic key.</div>',
            '  </span>',
            '</label>',
        ].join('');
        if (fileBlock && fileBlock.parentNode) fileBlock.parentNode.insertBefore(row, fileBlock);
        else step1.appendChild(row);
    }

    // ------------------------------------------------------------------------
    // Wrap _continueToSectionEditor to intercept the AI checkbox state. If
    // ticked, we run the AI pass BEFORE switching to Step 2, then build the
    // editor with the review UI active.
    // ------------------------------------------------------------------------
    const _origContinue = R._continue;
    R._continue = async function() {
        _ensureAiCheckbox();
        const ai = document.getElementById('rpt-ai-draft');
        const useAI = !!(ai && ai.checked);
        if (!useAI) {
            // No-op: delegate to v2's _continueToSectionEditor.
            return _origContinue();
        }
        // Reproduce step 1's validation, parse template, then run AI before showing step 2.
        const status = document.getElementById('rpt-status');
        status.style.color = 'var(--color-text-secondary)';
        try {
            const reportType = document.getElementById('rpt-type').value;
            const format = document.querySelector('input[name="rpt-format"]:checked').value;
            const def = R.REPORT_DEFS[reportType];
            const systemId = (def.scope === 'system') ? document.getElementById('rpt-system').value : null;
            if (def.scope === 'system' && !systemId) {
                status.textContent = 'Select a system first.';
                status.style.color = 'var(--color-danger, #dc2626)';
                return;
            }
            const appendices = {};
            ['fta','zsa','pra','cma'].forEach(n => { const cb = document.getElementById('rpt-appx-' + n); appendices[n] = !!(cb && cb.checked); });
            const fileInput = document.getElementById('rpt-custom-template');
            const customFile = (fileInput && fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null;
            if (customFile && format !== 'docx') {
                status.textContent = 'Custom .docx template requires Word format.';
                status.style.color = 'var(--color-danger, #dc2626)';
                return;
            }
            status.textContent = 'Preparing project data…';
            const data = R.extractData(reportType, { systemId });

            // Parse the template into sections.
            let sections, customDocxInfo = null;
            if (customFile) {
                const parsed = await R.parseDocxToSections(customFile);
                if (!parsed.headingsDetected) {
                    customDocxInfo = { mode: 'token-only', file: customFile, banner: 'No Heading1/2/3 styles detected. AI bulk-draft requires sectioned templates — the file falls back to token-only substitution and no AI pass runs.' };
                    sections = [{ id: 'sec_doc', level: 0, heading: '(Template used as-is — AI drafting unavailable for non-sectioned templates)', prose: '' }];
                } else {
                    sections = parsed.sections;
                    customDocxInfo = { mode: 'sectioned', file: customFile, parsed };
                }
            } else {
                const md = (R.DEFAULT_TEMPLATES && R.DEFAULT_TEMPLATES[reportType]) || ('# ' + def.name);
                sections = R.parseMarkdownToSections(md);
            }

            // If we landed on the non-sectioned fallback, skip AI and just go to Step 2.
            R._modalState = R._modalState || {};
            R._modalState = { reportType, format, systemId, appendices, customDocxFile: customFile, sections, customDocxInfo, data };
            if (customDocxInfo && customDocxInfo.mode === 'token-only') {
                _showStepLocal(2);
                R._buildSectionEditor && R._buildSectionEditor();
                _buildOrUseSectionEditor();
                return;
            }

            // Run AI pass.
            const realSections = sections.filter(s => s.heading && s.heading !== '(Preamble)');
            if (!realSections.length) {
                status.textContent = 'No headings to draft. Falling back to manual edit.';
                _showStepLocal(2);
                _buildOrUseSectionEditor();
                return;
            }

            status.textContent = 'Drafting section 1 of ' + realSections.length + '…';
            const passResult = await _runAiDraftPass(realSections, reportType, data, def, (idx, total, secId, head) => {
                status.textContent = 'Drafting section ' + idx + ' of ' + total + ' — ' + (head || '');
            });

            // Initialize review state.
            const dispositions = {};
            sections.forEach(s => {
                if (s.heading && s.heading !== '(Preamble)' && passResult.aiDrafts[s.id] && !passResult.aiDrafts[s.id].error) {
                    dispositions[s.id] = 'pending';
                } else {
                    // No AI draft → no review needed; user edits the template default directly.
                    dispositions[s.id] = 'no-ai';
                }
            });
            R._aiState = { aiDrafts: passResult.aiDrafts, errors: passResult.errors, dispositions };

            // Build the review-mode editor and switch to step 2.
            _showStepLocal(2);
            _buildReviewEditor();
            status.textContent = '';
            if (passResult.errors.length) {
                status.style.color = 'var(--color-warning, #d97706)';
                status.textContent = passResult.errors.length + ' section(s) failed to draft (see review pane).';
            }
        } catch (e) {
            console.error('AI bulk-draft failed:', e);
            status.style.color = 'var(--color-danger, #dc2626)';
            status.textContent = 'AI drafting failed: ' + ((e && e.message) || e);
        }
    };

    function _showStepLocal(n) {
        const s1 = document.getElementById('rpt-step1');
        const s2 = document.getElementById('rpt-step2');
        const title = document.getElementById('rpt-step-title');
        if (s1) s1.style.display = (n === 1) ? 'flex' : 'none';
        if (s2) s2.style.display = (n === 2) ? 'flex' : 'none';
        if (title) title.textContent = 'Generate Report — Step ' + n + ' of 2';
    }

    function _buildOrUseSectionEditor() {
        // Fallback path: AI was skipped; defer to v2's _buildSectionEditor (if exposed),
        // otherwise rebuild the existing editor by calling the v2 helper through a
        // synthetic Continue. Simpler: just call the v2 Continue logic with AI off.
        // The v2 _continueToSectionEditor is now wrapped; we already have _modalState
        // populated, so we can build by hand.
        if (typeof R._buildSectionEditor === 'function') { R._buildSectionEditor(); return; }
        // If v2 didn't expose _buildSectionEditor, no-op — the user will see an empty
        // editor and can click Back. This shouldn't happen in practice because v2
        // builds the editor inline. To be safe we mirror v2's structure here:
        _buildReviewEditor(); // worst case: render review mode without drafts
    }

    // ------------------------------------------------------------------------
    // _buildReviewEditor — Step 2 review mode. Renders one card per section.
    // If an AI draft exists for the section, shows side-by-side template /
    // AI proposal with Accept / Edit & Accept / Discard. Pending sections
    // block Generate. Sections without AI drafts behave like v2 (single
    // textarea, no review).
    // ------------------------------------------------------------------------
    function _buildReviewEditor() {
        const host = document.getElementById('rpt-section-editor');
        if (!host) return;
        const st = R._modalState;
        const ai = R._aiState;
        host.innerHTML = '';

        // If no AI pass was run (e.g. token-only custom .docx fallback), still
        // render plain textareas via the no-draft branch below. The review-bar
        // counts will report 0 AI sections and Generate stays enabled.

        // Top status banner — pending count + skip remaining link.
        const bar = document.createElement('div');
        bar.id = 'rpt-review-bar';
        bar.style.cssText = 'position:sticky;top:0;background:var(--color-surface-1);padding:10px 12px;border:1px solid var(--color-border-thin);border-radius:var(--r-md);margin-bottom:12px;z-index:5;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;';
        bar.innerHTML = '<div id="rpt-review-counts" style="font-size:13px;font-weight:500;"></div>' +
                        '<div style="display:flex;gap:10px;align-items:center;">' +
                        '  <button type="button" id="rpt-skip-remaining" class="btn-ghost" style="font-size:12px;padding:4px 10px;">Skip remaining (use template default)</button>' +
                        '</div>';
        host.appendChild(bar);

        // Error banner if AI returned errors
        if (ai && ai.errors && ai.errors.length) {
            const errBanner = document.createElement('div');
            errBanner.style.cssText = 'padding:10px 12px;background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.35);border-radius:var(--r-md);font-size:12px;color:var(--color-danger, #b91c1c);margin-bottom:12px;';
            errBanner.innerHTML = '<strong>' + ai.errors.length + ' section(s) failed:</strong> ' + ai.errors.map(e => (e.heading || e.sectionId) + ' (' + e.error + ')').join('; ');
            host.appendChild(errBanner);
        }

        // Custom .docx token-only banner if applicable
        if (st.customDocxInfo && st.customDocxInfo.banner) {
            const banner = document.createElement('div');
            banner.style.cssText = 'padding:10px 12px;background:rgba(255,149,0,0.08);border:1px solid rgba(255,149,0,0.35);border-radius:var(--r-md);font-size:12px;color:var(--color-text-secondary);margin-bottom:12px;';
            banner.textContent = st.customDocxInfo.banner;
            host.appendChild(banner);
        }

        st.sections.forEach(sec => {
            if (sec.heading === '(Preamble)' || !sec.heading) return;
            const draft = ai && ai.aiDrafts ? ai.aiDrafts[sec.id] : null;
            const hasDraft = !!(draft && draft.prose && !draft.error);

            const card = document.createElement('div');
            card.dataset.sectionId = sec.id;
            card.style.cssText = 'border:1px solid var(--color-border-hair);border-radius:var(--r-md);padding:12px 14px;margin-bottom:10px;background:var(--color-surface-2);';

            // Header row with heading + status pill
            const headRow = document.createElement('div');
            headRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;';
            const titleEl = document.createElement('label');
            titleEl.textContent = (sec.level > 0 ? ('H' + sec.level + ' · ') : '') + (sec.heading || '(Untitled)');
            titleEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--color-text-primary);margin:0;text-transform:none;letter-spacing:0;';
            headRow.appendChild(titleEl);
            const pill = document.createElement('span');
            pill.className = 'rpt-status-pill';
            pill.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:999px;font-weight:600;';
            headRow.appendChild(pill);
            card.appendChild(headRow);

            if (!hasDraft) {
                // Section without an AI draft (failed or no heading) — single textarea
                const ta = document.createElement('textarea');
                ta.dataset.sectionId = sec.id;
                ta.dataset.role = 'final';
                ta.style.cssText = 'width:100%;min-height:60px;padding:8px 10px;font-family:var(--font-system);font-size:13px;line-height:1.5;border:1px solid var(--color-border-hair);border-radius:var(--r-sm);background:var(--color-surface-1);color:var(--color-text-primary);resize:vertical;';
                ta.value = _initialProse(sec, st.reportType, st.data);
                ta.oninput = function() { _saveEditAndRefresh(st.reportType, sec.id, this.value); _autosizeTextarea(this); };
                setTimeout(() => _autosizeTextarea(ta), 10);
                card.appendChild(ta);
                if (draft && draft.error) {
                    const errLine = document.createElement('div');
                    errLine.style.cssText = 'font-size:11px;color:var(--color-danger, #b91c1c);margin-top:4px;';
                    errLine.textContent = 'AI draft failed: ' + draft.error;
                    card.appendChild(errLine);
                }
            } else {
                // Side-by-side: template default | AI proposal
                const sidebySide = document.createElement('div');
                sidebySide.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';

                const tplCol = document.createElement('div');
                tplCol.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--color-text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Template Default</div>';
                const tplBox = document.createElement('div');
                tplBox.style.cssText = 'padding:8px 10px;font-size:12.5px;line-height:1.5;border:1px solid var(--color-border-hair);border-radius:var(--r-sm);background:var(--color-surface-1);color:var(--color-text-secondary);min-height:80px;white-space:pre-wrap;';
                tplBox.textContent = _initialProse(sec, st.reportType, st.data);
                tplCol.appendChild(tplBox);
                sidebySide.appendChild(tplCol);

                const aiCol = document.createElement('div');
                aiCol.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--color-accent);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">✨ AI Proposal</div>';
                const aiBox = document.createElement('div');
                aiBox.dataset.role = 'ai-proposal';
                aiBox.style.cssText = 'padding:8px 10px;font-size:12.5px;line-height:1.5;border:1px solid var(--color-accent-soft, rgba(0,122,255,0.3));border-radius:var(--r-sm);background:rgba(0,122,255,0.04);color:var(--color-text-primary);min-height:80px;white-space:pre-wrap;';
                aiBox.textContent = draft.prose;
                aiCol.appendChild(aiBox);
                sidebySide.appendChild(aiCol);
                card.appendChild(sidebySide);

                // Phase E2.3 — deterministic checker verdict, inline on the card.
                const rev = draft.review || null;
                if (rev) {
                    const box = document.createElement('div');
                    if (rev.total) {
                        box.style.cssText = 'margin-top:8px;padding:8px 10px;border:1px solid rgba(180,83,9,0.45);background:rgba(255,149,0,0.07);font-size:11.5px;line-height:1.5;color:var(--color-text-secondary);';
                        const all = [].concat(rev.claims, rev.tokens, rev.tone);
                        box.innerHTML = '<strong style="color:#B45309;">⚠ Checker: ' + rev.total + ' flag(s)</strong> — accepting requires a signed override.<br>' +
                            all.slice(0, 8).map(f => '· <span class="u-mono">' + String(f.token).replace(/</g, '&lt;') + '</span> — ' + String(f.why).replace(/</g, '&lt;')).join('<br>') +
                            (all.length > 8 ? '<br>· … ' + (all.length - 8) + ' more' : '');
                    } else {
                        box.style.cssText = 'margin-top:8px;font-size:11px;color:#1D9E75;';
                        box.textContent = '✓ Checker clean — every ID, number, and DAL in the prose matches the model; no compliance-asserting language.';
                    }
                    card.appendChild(box);
                }
                const auditHost = document.createElement('div');
                auditHost.className = 'rpt-audit-host';
                card.appendChild(auditHost);

                // Disposition row
                const actions = document.createElement('div');
                actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;';
                actions.innerHTML = [
                    '<button type="button" class="btn-ghost rpt-audit"     style="font-size:12px;padding:4px 12px;" title="Adversarial pass: a second AI call lists claims unsupported by the data (E2.4)">✦ Audit claims</button>',
                    '<button type="button" class="btn-ghost rpt-discard"   style="font-size:12px;padding:4px 12px;">✗ Discard (use template)</button>',
                    '<button type="button" class="btn-ghost rpt-edit"      style="font-size:12px;padding:4px 12px;">✎ Edit & Accept</button>',
                    '<button type="button" class="btn-green rpt-accept"    style="font-size:12px;padding:4px 12px;">✓ Accept AI Draft</button>',
                ].join('');
                card.appendChild(actions);

                // Wire buttons
                actions.querySelector('.rpt-accept').onclick = async () => {
                    // Phase E2.5 — acceptance is a signed act; checker flags demand
                    // an override rationale; every accept writes an assumption row.
                    const AF = window.AiFidelity || null;
                    if (AF && draft._afKey) {
                        let overrideNote = '';
                        const nf = (draft.review && draft.review.total) || 0;
                        const ask = (msg, dflt) => (typeof slPrompt === 'function') ? slPrompt(msg, dflt || '') : Promise.resolve(window.prompt(msg, dflt || ''));
                        if (nf) {
                            overrideNote = (await ask('The checker flagged ' + nf + ' claim(s) in this draft. Accepting anyway requires a rationale (recorded in the tailoring spirit — an act, not an absence):', '')) || '';
                            if (!overrideNote.trim()) return;
                        }
                        const by = (await ask('Sign the acceptance with your name:', '')) || '';
                        if (!by.trim()) return;
                        AF.acceptDraft(draft._afKey, { by: by.trim(), overrideNote: overrideNote.trim() });
                    }
                    R._aiState.dispositions[sec.id] = 'accepted';
                    _saveEdit(st.reportType, sec.id, draft.prose);
                    _refreshCard(card, sec, 'accepted', draft.prose, st);
                    _refreshReviewBar();
                };
                actions.querySelector('.rpt-discard').onclick = () => {
                    if (window.AiFidelity && draft._afKey) window.AiFidelity.setDraftState(draft._afKey, 'discarded');
                    R._aiState.dispositions[sec.id] = 'discarded';
                    _saveEdit(st.reportType, sec.id, null); // reset to template default
                    _refreshCard(card, sec, 'discarded', null, st);
                    _refreshReviewBar();
                };
                actions.querySelector('.rpt-edit').onclick = () => {
                    R._aiState.dispositions[sec.id] = 'editing';
                    _renderEditor(card, sec, draft.prose, st);
                    _refreshReviewBar();
                };
                actions.querySelector('.rpt-audit').onclick = async () => {
                    // Phase E2.4 — adversarial pass.
                    const AF = window.AiFidelity || null;
                    if (!AF) return;
                    const btn = actions.querySelector('.rpt-audit');
                    btn.disabled = true; btn.textContent = '✦ Auditing…';
                    try {
                        const curProse = (window.projectReportEdits && window.projectReportEdits[st.reportType] && window.projectReportEdits[st.reportType][sec.id]) || draft.prose;
                        const items = await AF.adversarialReview({ heading: sec.heading, prose: curProse, ctx: _buildContextForAI(st.reportType, st.data, sec) });
                        auditHost.innerHTML = items.length
                            ? '<div style="margin-top:6px;padding:8px 10px;border:1px solid rgba(220,38,38,0.4);background:rgba(220,38,38,0.06);font-size:11.5px;line-height:1.5;"><strong style="color:#b91c1c;">✦ Audit: ' + items.length + ' unsupported claim(s)</strong><br>' +
                              items.slice(0, 6).map(x => '· “' + String(x.quote).replace(/</g, '&lt;').slice(0, 120) + '” — ' + String(x.reason || '').replace(/</g, '&lt;').slice(0, 140)).join('<br>') + '</div>'
                            : '<div style="margin-top:6px;font-size:11px;color:#1D9E75;">✦ Audit clean — the auditor found no unsupported claims.</div>';
                    } catch (e) {
                        auditHost.innerHTML = '<div style="margin-top:6px;font-size:11px;color:#b91c1c;">Audit failed: ' + String((e && e.message) || e).replace(/</g, '&lt;') + '</div>';
                    } finally { btn.disabled = false; btn.textContent = '✦ Audit claims'; }
                };
            }

            _refreshPill(pill, R._aiState ? R._aiState.dispositions[sec.id] : 'no-ai');
            host.appendChild(card);
        });

        document.getElementById('rpt-skip-remaining').onclick = () => {
            const d = R._aiState && R._aiState.dispositions; if (!d) return;
            Object.keys(d).forEach(id => {
                if (d[id] !== 'pending') return;
                d[id] = 'discarded';
                try {   // Phase E2.5 — discards recorded in the draft state machine
                    const dr = R._aiState.aiDrafts && R._aiState.aiDrafts[id];
                    if (window.AiFidelity && dr && dr._afKey) window.AiFidelity.setDraftState(dr._afKey, 'discarded');
                } catch (_) {}
            });
            _buildReviewEditor();
        };
        _refreshReviewBar();
    }

    function _refreshPill(pill, status) {
        const m = {
            'pending':   { txt: '⌛ Pending Review', bg: 'rgba(255,149,0,0.15)', fg: '#b45309' },
            'accepted':  { txt: '✓ Accepted',       bg: 'rgba(22,163,74,0.15)', fg: '#15803d' },
            'edited':    { txt: '✎ Edited',         bg: 'rgba(0,122,255,0.15)', fg: '#1d4ed8' },
            'discarded': { txt: '✗ Discarded',      bg: 'rgba(100,116,139,0.15)', fg: '#475569' },
            'editing':   { txt: '✎ Editing',         bg: 'rgba(0,122,255,0.15)', fg: '#1d4ed8' },
            'no-ai':     { txt: '— Template',        bg: 'rgba(100,116,139,0.10)', fg: '#64748b' },
        };
        const e = m[status] || m['no-ai'];
        pill.textContent = e.txt;
        pill.style.background = e.bg;
        pill.style.color = e.fg;
    }

    function _refreshReviewBar() {
        const ai = R._aiState; if (!ai) return;
        const counts = { pending: 0, accepted: 0, edited: 0, discarded: 0, editing: 0, total: 0 };
        Object.keys(ai.dispositions).forEach(id => {
            const s = ai.dispositions[id]; if (s === 'no-ai') return;
            counts.total++; if (counts[s] != null) counts[s]++;
        });
        const html = '<strong>' + counts.total + ' AI-drafted sections</strong> · '
            + '<span style="color:#15803d;">' + counts.accepted + ' accepted</span> · '
            + '<span style="color:#1d4ed8;">' + (counts.edited + counts.editing) + ' edited</span> · '
            + '<span style="color:#475569;">' + counts.discarded + ' discarded</span> · '
            + '<span style="color:#b45309;">' + counts.pending + ' pending</span>';
        const el = document.getElementById('rpt-review-counts'); if (el) el.innerHTML = html;
        // Disable Generate until pending = 0
        const genBtn = document.querySelector('#rpt-step2 .btn-green');
        if (genBtn) {
            const blocked = counts.pending > 0;
            genBtn.disabled = blocked;
            genBtn.style.opacity = blocked ? '0.5' : '';
            genBtn.style.pointerEvents = blocked ? 'none' : '';
            genBtn.title = blocked ? 'Disposition all pending sections first (or click Skip remaining).' : '';
        }
    }

    function _refreshCard(card, sec, disposition, finalProse, st) {
        const pill = card.querySelector('.rpt-status-pill');
        if (pill) _refreshPill(pill, disposition);
        const accept = card.querySelector('.rpt-accept');
        const discard = card.querySelector('.rpt-discard');
        const edit = card.querySelector('.rpt-edit');
        // After accept/discard, dim the action row (still allow re-disposition).
        [accept, discard, edit].forEach(b => { if (b) b.style.opacity = '0.7'; });
    }

    function _renderEditor(card, sec, seedProse, st) {
        // Replace the side-by-side with a single editable textarea pre-filled with the AI proposal.
        // Keep the action row but swap labels.
        const grid = card.querySelector('div[style*="grid-template-columns"]');
        if (grid) grid.remove();
        const old = card.querySelector('textarea[data-role="final"]');
        if (old) old.remove();
        const ta = document.createElement('textarea');
        ta.dataset.sectionId = sec.id;
        ta.dataset.role = 'final';
        ta.style.cssText = 'width:100%;min-height:80px;padding:8px 10px;font-family:var(--font-system);font-size:13px;line-height:1.5;border:1px solid var(--color-accent);border-radius:var(--r-sm);background:var(--color-surface-1);color:var(--color-text-primary);resize:vertical;';
        ta.value = seedProse;
        ta.oninput = function() {
            _saveEditAndRefresh(st.reportType, sec.id, this.value);
            _autosizeTextarea(this);
            R._aiState.dispositions[sec.id] = 'edited';
            _refreshPill(card.querySelector('.rpt-status-pill'), 'edited');
            _refreshReviewBar();
        };
        // Insert above the actions row
        const actions = card.querySelector('div[style*="justify-content:flex-end"]');
        if (actions) card.insertBefore(ta, actions);
        else card.appendChild(ta);
        setTimeout(() => _autosizeTextarea(ta), 10);
        // Immediate save with seed prose
        _saveEdit(st.reportType, sec.id, seedProse);
        R._aiState.dispositions[sec.id] = 'edited';
        // Phase E2.5 — edited = human-owned prose; the gate passes it, the
        // provenance ledger still records that AI seeded it.
        try {
            const dr = R._aiState.aiDrafts && R._aiState.aiDrafts[sec.id];
            if (window.AiFidelity && dr && dr._afKey) {
                window.AiFidelity.setDraftState(dr._afKey, 'edited');
                window.AiFidelity.recordProvenance({ kind: 'edit', key: dr._afKey, heading: sec.heading, model: dr.model || '' });
            }
        } catch (_) {}
        _refreshPill(card.querySelector('.rpt-status-pill'), 'edited');
    }

    function _autosizeTextarea(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(60, ta.scrollHeight + 4) + 'px'; }

    function _initialProse(sec, reportType, data) {
        // Reuse v2's helper if available, otherwise inline.
        if (typeof R._initialProseForSection === 'function') return R._initialProseForSection(sec, reportType, data);
        const saved = (window.projectReportEdits && window.projectReportEdits[reportType] && window.projectReportEdits[reportType][sec.id]) || null;
        if (saved != null) return saved;
        // Resolve scalar tokens
        const t = sec.prose || '';
        return t.replace(/\{\{([a-z_]+)\}\}/g, (m, k) => {
            const v = data[k];
            if (v == null) return m;
            if (typeof v === 'string' || typeof v === 'number') return String(v);
            return m;
        });
    }

    function _saveEdit(reportType, sectionId, value) {
        const r = window.projectReportEdits || (window.projectReportEdits = {});
        if (!r[reportType]) r[reportType] = {};
        if (value == null || value === '') delete r[reportType][sectionId];
        else r[reportType][sectionId] = value;
        try { if (typeof _writeAutosave === 'function') _writeAutosave(); } catch (_) {}
    }
    function _saveEditAndRefresh(reportType, sectionId, value) { _saveEdit(reportType, sectionId, value); }

    // ------------------------------------------------------------------------
    // Inject the AI checkbox row on every modal open. The v2 _ensureModalV2()
    // rebuilds the modal with dataset.v=2; we mark our augmented version with
    // dataset.aiV3=true to avoid double-injection.
    // ------------------------------------------------------------------------
    const _origOpen = R.open;
    R.open = function(reportType, opts) {
        _resetAiState();
        const out = _origOpen(reportType, opts);
        // After v2's open finishes, ensure our AI checkbox is in place.
        setTimeout(() => {
            _ensureAiCheckbox();
            const ai = document.getElementById('rpt-ai-draft');
            if (ai) ai.checked = false; // reset per open
        }, 30);
        return out;
    };

    // ------------------------------------------------------------------------
    // _back hook — clear AI state when user goes back from Step 2 to Step 1
    // so they can re-tick / un-tick the AI checkbox without stale dispositions.
    // ------------------------------------------------------------------------
    const _origBack = R._back;
    R._back = function() {
        _resetAiState();
        return _origBack();
    };

    // ------------------------------------------------------------------------
    // close hook — also clear AI state.
    // ------------------------------------------------------------------------
    const _origClose = R.close;
    R.close = function() { _resetAiState(); return _origClose(); };
})();
