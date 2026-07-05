// safety_targets.js — deterministic certification-basis safety targets (PROB_TARGETS,
// DAL_TARGETS, DAL_ORDER, SEVERITY_RANK, DAL_RANK_MAP, DO178C/DO254_DAL_CREDIT), extracted
// verbatim from safety_lab.js (Phase 76). Pure data, loaded FIRST so every bare-name
// reference (incl. the after-modules SEVERITY_RANK guard) resolves. Byte-identical.

const PROB_TARGETS = {
    'Part 25':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 23 I':          { Catastrophic: 1e-6, Hazardous: 1e-5, Major: 1e-4, Minor: 1e-3, Negligible: null },
    'Part 23 II':         { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 23 III':        { Catastrophic: 1e-8, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 23 IV':         { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // Rotorcraft — Part 27 normal category per AC 27-1B (less stringent than Part 25 for
    // small helicopters, similar in shape to Part 23 Class II/III). Part 29 transport
    // category per AC 29-2C aligns with Part 25 levels.
    'Part 27':            { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-4, Minor: 1e-3, Negligible: null },
    'Part 29':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // Engines — Part 33 §33.75 frames severity as "Hazardous Engine Effect" with
    // "extremely remote" probability target (≤ 1e-7 to 1e-8 per engine-flight-hour).
    // Propellers — Part 35 §35.15 follows the Part 25 severity ladder.
    'Part 33':            { Catastrophic: 1e-9, Hazardous: 1e-8, Major: 1e-5, Minor: 1e-3, Negligible: null },
    'Part 35':            { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // EASA SC-VTOL — two categories. Enhanced (CS&FL required, congested-area ops, commercial
    // pax) matches Part 25 stringency. Basic (no CS&FL, restricted to non-congested ops)
    // sits one to two orders less stringent.
    'SC-VTOL Basic':      { Catastrophic: 1e-7, Hazardous: 1e-6, Major: 1e-4, Minor: 1e-3, Negligible: null },
    'SC-VTOL Enhanced':   { Catastrophic: 1e-9, Hazardous: 1e-7, Major: 1e-5, Minor: 1e-3, Negligible: null },
    // Mission-based / SORA-based — no per-FH severity ladder. Targets are null so the
    // FTA toolbar shows "see Part 450 / SORA risk metrics" rather than a misleading number.
    'Part 450':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null },
    'Part 107':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null }
};

// DAL allocation is class-dependent under AC 23.1309-1E (Part 23 Classes I–III scale down from
// the Part 25 / Class IV baseline). ARP4754A defines the canonical Part 25 mapping; the Part 23
// entries follow the AC 23.1309-1E Table 2 convention used in industry practice.
//   Part 23 Class I:   Cat C, Haz D, Maj D, Min E
//   Part 23 Class II:  Cat C, Haz C, Maj D, Min E
//   Part 23 Class III: Cat B, Haz C, Maj C, Min E
//   Part 23 Class IV:  Cat A, Haz B, Maj C, Min D (matches Part 25)
//   Part 25:           Cat A, Haz B, Maj C, Min D
const DAL_TARGETS = {
    'Part 25':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 23 I':          { Catastrophic: 'C', Hazardous: 'D', Major: 'D', Minor: 'E', Negligible: 'E' },
    'Part 23 II':         { Catastrophic: 'C', Hazardous: 'C', Major: 'D', Minor: 'E', Negligible: 'E' },
    'Part 23 III':        { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'E', Negligible: 'E' },
    'Part 23 IV':         { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    // Phase 53.55 — added cert bases.
    'Part 27':            { Catastrophic: 'B', Hazardous: 'C', Major: 'C', Minor: 'E', Negligible: 'E' },
    'Part 29':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 33':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'Part 35':            { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    'SC-VTOL Basic':      { Catastrophic: 'C', Hazardous: 'C', Major: 'D', Minor: 'E', Negligible: 'E' },
    'SC-VTOL Enhanced':   { Catastrophic: 'A', Hazardous: 'B', Major: 'C', Minor: 'D', Negligible: 'E' },
    // Part 450 / Part 107 — mission-based / SORA-based, no per-FH DAL ladder. DAL is still
    // a useful concept for avionics inside the vehicle but the top-down seed comes from a
    // different model than the cert-basis severity ladder.
    'Part 450':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null },
    'Part 107':           { Catastrophic: null, Hazardous: null, Major: null, Minor: null, Negligible: null }
};

// ==========================================
// DALgebra autonomous top-down allocator
// Implements SAE ARP4754A Section 5.4.1:
//   - OR / XOR / VOTING (and any non-AND-like gate): every child inherits the parent DAL.
//   - AND / INHIBIT: per-gate option drives allocation.
//       Option 1 (with independence claim): one "carrier" child = parent DAL, others = parent − 2.
//       Option 2 (no independence claim):   all children = parent − 1.
//   - TRANSFER: the linked page's root inherits the parent DAL.
// Repeated events receive the max (most stringent) DAL across visits.
// ==========================================
const DAL_ORDER = ['A', 'B', 'C', 'D', 'E']; // A is most stringent, E least.
// Single source of truth for severity ranking (Phase 27 refactor B5). Higher number = more
// restrictive. Used by AutoReq, the FTA wizard, AC↔Sys FC linkage, dedup, and worklist code.
const SEVERITY_RANK = { 'Catastrophic': 5, 'Hazardous': 4, 'Major': 3, 'Minor': 2, 'Negligible': 1 };
// Single source of truth for DAL ranking (Phase 27 refactor B7). Higher = more restrictive.
const DAL_RANK_MAP = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'E': 1 };

// Phase 29.2 + Phase 53.51 — Qualitative DAL guidance per the RTCA/DO-178C (software) and
// RTCA/DO-254 (complex hardware) standards. The standards are copyrighted by RTCA Inc.; this
// tool intentionally does NOT reproduce their objective counts or table contents. Each entry
// describes the engineering intent of the DAL tier in plain language and points the analyst
// to the authoritative source. Users with a current RTCA standards license should consult the
// referenced annexes directly for the formal objective set, independence requirements and
// table references.
const DO178C_DAL_CREDIT = {
    'A': { coverage: 'Most-stringent assurance; structural coverage at the highest level; full independence of verification.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'B': { coverage: 'High assurance; structural coverage at the decision level; significant verification independence.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'C': { coverage: 'Moderate assurance; structural coverage at the statement level; limited verification independence.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'D': { coverage: 'Low assurance; basic requirements / design documentation; minimal independent verification.',
           tables: 'Refer to RTCA DO-178C Annex A for the applicable objective tables.' },
    'E': { coverage: 'No DO-178C objectives required.',
           tables: 'No certification credit required at DAL E.' }
};

const DO254_DAL_CREDIT = {
    'A': { ind: 'Full design assurance process across the complete hardware life-cycle, including independent verification & validation.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'B': { ind: 'Comprehensive process with verification independence on critical functions.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'C': { ind: 'Reduced process; basic V&V with limited independence.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'D': { ind: 'Minimal — basic requirements + design documentation; no formal V&V process.',
           tables: 'Refer to RTCA DO-254 Appendix A for the formal process objectives.' },
    'E': { ind: 'No DO-254 objectives required.',
           tables: 'No certification credit required at DAL E.' }
};

// ==========================================
// System Control Category (SC1/SC2) default map — ARP4754B §5.6.4 + Appendix A Table A1.
// SC1 = full configuration-management control (baseline + problem reporting + change tracking +
// protection + archive). SC2 = reduced subset (identification + protection + archive only).
// Transcribed EXACTLY from Table A1 (pp.77-83): each life-cycle data item's SC is assigned by
// (artifact type x FDAL). null = the objective is not required at that FDAL (no SC). This is the
// editable DEFAULT; per-project / per-artifact overrides layer on top (see deriveArtifactSC).
//   • FHA / safety objectives: SC1 at every level — "modulation based on FDAL does not apply".
//   • Safety analyses, requirements, FDAL/IDAL: A/B/C=SC1, D=SC2.
//   • Configuration index, verification procedures: A/B=SC1, C/D=SC2.
//   • Plans, V&V matrices/results, problem reports, process-assurance evidence: SC2 all levels.
const SC_DEFAULT_MAP = {
    // FHA — SC1 regardless of FDAL (Table A1 obj 3.1/3.2; modulation N/A)
    afha:                    { A:'SC1', B:'SC1', C:'SC1', D:'SC1', E:'SC1' },
    sfha:                    { A:'SC1', B:'SC1', C:'SC1', D:'SC1', E:'SC1' },
    safety_objectives:       { A:'SC1', B:'SC1', C:'SC1', D:'SC1', E:'SC1' },
    // Safety analyses + requirements + DAL assignments — A/B/C=SC1, D=SC2 (obj 2.x, 3.3-3.5)
    pasa_pssa:               { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    asa_ssa:                 { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    fta:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    fmea:                    { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    cma:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    zsa:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    pra:                     { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    markov:                  { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    requirements:            { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    functions:               { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },   // aircraft/system functions + functional requirements (Table A1 obj 2.1/2.3)
    fdal_idal:               { A:'SC1', B:'SC1', C:'SC1', D:'SC2', E:null },
    // Configuration index + verification procedures — A/B=SC1, C/D=SC2 (obj 5.x, 6.2)
    config_index:            { A:'SC1', B:'SC1', C:'SC2', D:'SC2', E:null },
    verification_procedures: { A:'SC1', B:'SC1', C:'SC2', D:'SC2', E:null },
    // Plans / V&V matrices+results / problem reports / process assurance — SC2 all levels (obj 1.x, 4.x, 5.x, 7.x)
    plan:                    { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    validation_matrix:       { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    verification_matrix:     { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    verification_results:    { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    problem_report:          { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null },
    process_assurance:       { A:'SC2', B:'SC2', C:'SC2', D:'SC2', E:null }
};

// Pure Table A1 lookup: (artifactType, fdal) -> 'SC1' | 'SC2' | null. Unknown artifact -> SC1
// (most conservative). FDAL is normalized to its first letter so 'FDAL B' / 'B' both resolve.
function scFromTableA1(artifactType, fdal) {
    const row = SC_DEFAULT_MAP[artifactType];
    if (!row) return 'SC1';
    // Extract the standalone FDAL letter so 'B', 'FDAL B', 'DAL: C' all resolve (don't pick up
    // the D/A inside the word "FDAL").
    const s = String(fdal == null ? 'A' : fdal).toUpperCase();
    const m = s.match(/(?:^|[^A-Z])([A-E])(?:[^A-Z]|$)/);
    const f = m ? m[1] : 'A';
    return (f in row) ? row[f] : 'SC1';
}
