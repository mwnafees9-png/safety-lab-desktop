// config_data.js — template column schemas + AI token/pricing tables, extracted verbatim from
// safety_lab.js (Phase 76). Loaded FIRST so bare-name references resolve. Byte-identical.

const TEMPLATE_SCHEMAS = {
    acFunc: {
        name: 'Aircraft Functions',
        description: 'Top-level aircraft functions and their sub-functions.',
        columns: [
            { id: 'funcId',       label: 'Function ID',     type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'funcName',     label: 'Function',        type: 'text',     builtIn: true, required: true,  width: 200 },
            { id: 'subId',        label: 'Sub-Function ID', type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'subName',      label: 'Sub-Function',    type: 'text',     builtIn: true, required: true,  width: 220 },
            { id: 'description',  label: 'Description',     type: 'longtext', builtIn: true, required: false, width: 280 },
            { id: 'phases',       label: 'Phases',          type: 'multiselect', builtIn: true, required: false, width: 180 },
            { id: 'comments',     label: 'Comments',        type: 'longtext', builtIn: true, required: false, width: 220 }
        ]
    },
    acFcim: {
        name: 'Aircraft FCIM',
        description: 'Failure Conditions, Indications and Mitigations at aircraft level.',
        columns: [
            { id: 'subId',       label: 'Sub-Function',   type: 'reference', refKind: 'acFunc', builtIn: true, required: true,  width: 160 },
            { id: 'fcId',        label: 'FC ID',          type: 'text',      builtIn: true, required: true,  width: 110 },
            { id: 'fcDesc',      label: 'Failure Condition', type: 'longtext', builtIn: true, required: true,  width: 280 },
            { id: 'awareness',   label: 'Crew Awareness', type: 'text',      builtIn: true, required: false, width: 200 },
            { id: 'tl',          label: 'Time Limit',     type: 'text',      builtIn: true, required: false, width: 120 },
            { id: 'pl',          label: 'Performance Limit', type: 'text',   builtIn: true, required: false, width: 140 },
            { id: 'm',           label: 'Mitigation',     type: 'longtext',  builtIn: true, required: false, width: 240 },
            { id: 'comments',    label: 'Comments',       type: 'longtext',  builtIn: true, required: false, width: 200 }
        ]
    },
    acFha: {
        name: 'Aircraft FHA',
        description: 'Aircraft-level Functional Hazard Assessment. One document per project.',
        columns: [
            { id: 'subId',           label: 'Sub-Function',     type: 'reference', refKind: 'acFunc', builtIn: true, required: true,  width: 160 },
            { id: 'fcId',            label: 'FC ID',            type: 'text',      builtIn: true, required: true,  width: 110 },
            { id: 'fcDesc',          label: 'Failure Condition', type: 'longtext', builtIn: true, required: true,  width: 240 },
            { id: 'phases',          label: 'Phases',           type: 'multiselect', builtIn: true, required: false, width: 160 },
            { id: 'effects',         label: 'Effects (AC/Crew/Pax)', type: 'composite', builtIn: true, required: true, width: 220 },
            { id: 'severity',        label: 'Severity',         type: 'enum',      options: ['Catastrophic','Hazardous','Major','Minor','Negligible'], builtIn: true, required: true, width: 130 },
            { id: 'assumptionIds',   label: 'Assumptions',      type: 'multiselect', refKind: 'acAsm', builtIn: true, required: false, width: 160 },
            { id: 'comments',        label: 'Comments',         type: 'longtext',  builtIn: true, required: false, width: 180 }
        ]
    },
    acReq: {
        name: 'Aircraft Requirements',
        description: 'Aircraft-level safety / functional requirements.',
        columns: [
            { id: 'reqId',       label: 'Req ID',     type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'traceIds',    label: 'Trace',      type: 'multiselect', refKind: 'acFunc', builtIn: true, required: false, width: 160 },
            { id: 'text',        label: 'Requirement', type: 'longtext', builtIn: true, required: true,  width: 320 },
            { id: 'rationale',   label: 'Rationale',  type: 'longtext', builtIn: true, required: false, width: 220 },
            { id: 'verifMethod', label: 'V Method',   type: 'enum',     options: ['Analysis','Inspection','Test','Demonstration','Similarity'], builtIn: true, required: false, width: 130 },
            { id: 'verifStatus', label: 'V Status',   type: 'enum',     options: ['Planned','In Progress','Verified','Failed','N/A'], builtIn: true, required: false, width: 120 },
            { id: 'comments',    label: 'Comments',   type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    acAsm: {
        name: 'Aircraft Assumptions',
        description: 'Aircraft-level safety assumptions, linked to functions and FHAs.',
        columns: [
            { id: 'asmId',       label: 'Assumption ID', type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'statement',   label: 'Statement',     type: 'longtext', builtIn: true, required: true,  width: 320 },
            { id: 'rationale',   label: 'Rationale',     type: 'longtext', builtIn: true, required: false, width: 240 },
            { id: 'state',       label: 'State',         type: 'enum',     options: ['Open','Validated','Invalidated','Closed'], builtIn: true, required: false, width: 120 },
            { id: 'linkedFunctions', label: 'Linked Functions', type: 'multiselect', refKind: 'acFunc', builtIn: true, required: false, width: 200 },
            { id: 'comments',    label: 'Comments',      type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    sysFunc: {
        name: 'System Functions',
        description: 'Functions allocated to a specific system. One per system.',
        columns: [
            { id: 'funcId',       label: 'Function ID', type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'funcName',     label: 'Function',    type: 'text',     builtIn: true, required: true,  width: 220 },
            { id: 'description',  label: 'Description', type: 'longtext', builtIn: true, required: false, width: 280 },
            { id: 'traceIds',     label: 'AC Trace',    type: 'multiselect', refKind: 'acFunc', builtIn: true, required: false, width: 180 },
            { id: 'comments',     label: 'Comments',    type: 'longtext', builtIn: true, required: false, width: 200 }
        ]
    },
    sysFcim: {
        name: 'System FCIM',
        description: 'Per-system Failure Conditions, Indications and Mitigations.',
        columns: [
            { id: 'funcId',     label: 'Function',       type: 'reference', refKind: 'sysFunc', builtIn: true, required: true,  width: 160 },
            { id: 'fcId',       label: 'FC ID',          type: 'text',      builtIn: true, required: true,  width: 110 },
            { id: 'fcDesc',     label: 'Failure Condition', type: 'longtext', builtIn: true, required: true,  width: 280 },
            { id: 'awareness',  label: 'Awareness',      type: 'text',      builtIn: true, required: false, width: 200 },
            { id: 'tl',         label: 'Time Limit',     type: 'text',      builtIn: true, required: false, width: 120 },
            { id: 'pl',         label: 'Performance Limit', type: 'text',   builtIn: true, required: false, width: 140 },
            { id: 'm',          label: 'Mitigation',     type: 'longtext',  builtIn: true, required: false, width: 240 },
            { id: 'comments',   label: 'Comments',       type: 'longtext',  builtIn: true, required: false, width: 200 }
        ]
    },
    sysFha: {
        name: 'System FHA',
        description: 'Per-system Functional Hazard Assessment. One document per system.',
        columns: [
            { id: 'funcId',         label: 'Function',         type: 'reference', refKind: 'sysFunc', builtIn: true, required: true, width: 160 },
            { id: 'fcId',           label: 'FC ID',            type: 'text',      builtIn: true, required: true,  width: 110 },
            { id: 'fcDesc',         label: 'Failure Condition', type: 'longtext', builtIn: true, required: true,  width: 240 },
            { id: 'effects',        label: 'Effects (AC/Crew/Pax)', type: 'composite', builtIn: true, required: true, width: 220 },
            { id: 'severity',       label: 'Severity',         type: 'enum',      options: ['Catastrophic','Hazardous','Major','Minor','Negligible'], builtIn: true, required: true, width: 130 },
            { id: 'assumptionIds',  label: 'Assumptions',      type: 'multiselect', refKind: 'sysAsm', builtIn: true, required: false, width: 160 },
            { id: 'comments',       label: 'Comments',         type: 'longtext',  builtIn: true, required: false, width: 180 }
        ]
    },
    sysReq: {
        name: 'System Requirements',
        description: 'Per-system safety / functional requirements.',
        columns: [
            { id: 'reqId',       label: 'Req ID',     type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'traceIds',    label: 'Trace',      type: 'multiselect', refKind: 'sysFunc', builtIn: true, required: false, width: 160 },
            { id: 'text',        label: 'Requirement', type: 'longtext', builtIn: true, required: true,  width: 320 },
            { id: 'rationale',   label: 'Rationale',  type: 'longtext', builtIn: true, required: false, width: 220 },
            { id: 'verifMethod', label: 'V Method',   type: 'enum',     options: ['Analysis','Inspection','Test','Demonstration','Similarity'], builtIn: true, required: false, width: 130 },
            { id: 'verifStatus', label: 'V Status',   type: 'enum',     options: ['Planned','In Progress','Verified','Failed','N/A'], builtIn: true, required: false, width: 120 },
            { id: 'comments',    label: 'Comments',   type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    sysAsm: {
        name: 'System Assumptions',
        description: 'Per-system safety assumptions.',
        columns: [
            { id: 'asmId',       label: 'Assumption ID', type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'statement',   label: 'Statement',     type: 'longtext', builtIn: true, required: true,  width: 320 },
            { id: 'rationale',   label: 'Rationale',     type: 'longtext', builtIn: true, required: false, width: 240 },
            { id: 'state',       label: 'State',         type: 'enum',     options: ['Open','Validated','Invalidated','Closed'], builtIn: true, required: false, width: 120 },
            { id: 'comments',    label: 'Comments',      type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    pra: {
        name: 'Particular Risk Analysis',
        description: 'Particular Risk Analysis — 9 risk types covered (rotor burst, lightning, bird strike, etc.).',
        columns: [
            { id: 'praId',           label: 'PRA ID',       type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'riskType',        label: 'Risk Type',    type: 'enum',     options: ['Rotor Burst','Bird Strike','Lightning','HIRF','Tire Burst','Engine Burst','Hail','Ice','Cabin Fire'], builtIn: true, required: true, width: 160 },
            { id: 'description',     label: 'Description',  type: 'longtext', builtIn: true, required: true,  width: 280 },
            { id: 'affectedZones',   label: 'Affected Zones', type: 'multiselect', refKind: 'zsa', builtIn: true, required: false, width: 180 },
            { id: 'exposedFunctions', label: 'Exposed Functions', type: 'multiselect', refKind: 'acFunc', builtIn: true, required: false, width: 200 },
            { id: 'mitigation',      label: 'Mitigation',   type: 'longtext', builtIn: true, required: false, width: 240 },
            { id: 'comments',        label: 'Comments',     type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    zsa: {
        name: 'Zonal Safety Analysis',
        description: 'Zone definitions and housed-function tracking.',
        columns: [
            { id: 'zsaId',          label: 'Zone ID',       type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'zoneName',       label: 'Zone',          type: 'text',     builtIn: true, required: true,  width: 200 },
            { id: 'description',    label: 'Description',   type: 'longtext', builtIn: true, required: false, width: 240 },
            { id: 'housedFunctions', label: 'Housed Functions', type: 'multiselect', refKind: 'acFunc', builtIn: true, required: false, width: 200 },
            { id: 'interferences',  label: 'Interferences', type: 'longtext', builtIn: true, required: false, width: 240 },
            { id: 'comments',       label: 'Comments',      type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    cma: {
        name: 'Common Mode Analysis',
        description: 'Common Mode Analysis — independence claims and shared-resource tracking.',
        columns: [
            { id: 'cmaId',          label: 'CMA ID',       type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'description',    label: 'Description',  type: 'longtext', builtIn: true, required: true,  width: 280 },
            { id: 'sharedResource', label: 'Shared Resource', type: 'text',  builtIn: true, required: false, width: 200 },
            { id: 'linkedGates',    label: 'Linked Gates', type: 'multiselect', refKind: 'ftaGate', builtIn: true, required: false, width: 180 },
            { id: 'severity',       label: 'Severity',     type: 'enum',     options: ['Catastrophic','Hazardous','Major','Minor','Negligible'], builtIn: true, required: false, width: 120 },
            { id: 'mitigation',     label: 'Mitigation',   type: 'longtext', builtIn: true, required: false, width: 240 },
            { id: 'comments',       label: 'Comments',     type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    },
    fmea: {
        name: 'FMEA',
        description: 'Failure Modes and Effects Analysis (functional or piece-part).',
        columns: [
            { id: 'fmeaId',         label: 'FMEA ID',       type: 'text',     builtIn: true, required: true,  width: 110 },
            { id: 'item',           label: 'Item / Function', type: 'text',  builtIn: true, required: true,  width: 200 },
            { id: 'failureMode',    label: 'Failure Mode',  type: 'longtext', builtIn: true, required: true,  width: 240 },
            { id: 'effect',         label: 'Effect',        type: 'longtext', builtIn: true, required: true,  width: 240 },
            { id: 'detection',      label: 'Detection',     type: 'longtext', builtIn: true, required: false, width: 180 },
            { id: 'severity',       label: 'Severity',      type: 'enum',     options: ['Catastrophic','Hazardous','Major','Minor','Negligible'], builtIn: true, required: false, width: 120 },
            { id: 'lambda',         label: 'λ (/hr)',       type: 'number',   builtIn: true, required: false, width: 110 },
            { id: 'mitigation',     label: 'Mitigation',    type: 'longtext', builtIn: true, required: false, width: 220 },
            { id: 'comments',       label: 'Comments',      type: 'longtext', builtIn: true, required: false, width: 180 }
        ]
    }
};

const MODEL_TOKEN_WEIGHTS = {
    'claude-opus-4-8':           5.0,    // newest Opus — same premium tier as 4.6
    'claude-opus-4-6':           5.0,    // Opus is ~5× Sonnet cost
    'claude-sonnet-4-6':         1.0,    // baseline
    'claude-haiku-4-5-20251001': 0.3,    // Haiku is cheaper
    'voyage-3-large':            0.05,   // embeddings are nearly free
    'voyage-3':                  0.02,
    'voyage-code-3':             0.05
};

const AI_PRICES_USD_PER_MTOK = {
    'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
    'claude-opus-4-8':           { input: 15.00, output: 75.00 },   // estimate — mirror 4.6 until confirmed
    'claude-opus-4-6':           { input: 15.00, output: 75.00 },
    'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00 },
    'voyage-3-large':            { input: 0.18,  output: 0 },
    'voyage-3':                  { input: 0.06,  output: 0 },
    'voyage-code-3':             { input: 0.18,  output: 0 }
};
