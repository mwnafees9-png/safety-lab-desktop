// catalogue_data.js — certification / MoC / particular-risk catalogue data, extracted verbatim
// from safety_lab.js (Phase 76). Pure data, loaded FIRST so bare-name references resolve. Byte-identical.

const COMPLIANCE_CATALOGUE = [
    // ----- 14 CFR Part 25 (US transport category) -----
    { regulation: '14 CFR Part 25', paragraph: '§25.1309(b)',     title: 'Equipment, systems, and installations — quantitative safety requirements (Cat ≤ 1e-9/FH, Haz ≤ 1e-7/FH, Maj ≤ 1e-5/FH)', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.1309(c)',     title: 'Independence requirements; warning to crew of unsafe operating conditions', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.671',         title: 'Flight control systems — control system jamming and disconnect provisions', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.672',         title: 'Stability augmentation and automatic and power-operated systems', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.901(c)',      title: 'Powerplant installation — single-failure hazard assessment', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.903(d)(1)',   title: 'Engine isolation — uncontained engine debris protection', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.1316',        title: 'Electrical and electronic system lightning protection', appliesTo: ['Part 25'] },
    { regulation: '14 CFR Part 25', paragraph: '§25.1317',        title: 'High-Intensity Radiated Fields (HIRF) protection', appliesTo: ['Part 25'] },
    // ----- AC 25.x (FAA advisory circulars for Part 25) -----
    { regulation: 'AC 25.1309-1B',  paragraph: '§9.b',            title: 'Probability terms (Probable, Remote, Extremely Remote, Extremely Improbable)', appliesTo: ['Part 25'] },
    { regulation: 'AC 25.1309-1B',  paragraph: '§10',             title: 'Quantitative analysis methods including FTA', appliesTo: ['Part 25'] },
    { regulation: 'AC 25.1309-1B',  paragraph: '§11.b',           title: 'System safety assessment process', appliesTo: ['Part 25'] },
    { regulation: 'AC 25.1309-1B',  paragraph: '§12',             title: 'Particular risks analysis', appliesTo: ['Part 25'] },
    // ----- EASA CS-25 / AMC 25 (transport — EU equivalent) -----
    { regulation: 'CS-25',          paragraph: 'CS 25.1309',      title: 'EASA equivalent — equipment, systems, and installations', appliesTo: ['Part 25'] },
    { regulation: 'CS-25',          paragraph: 'CS 25.671',       title: 'EASA — flight control system isolation and jamming', appliesTo: ['Part 25'] },
    { regulation: 'AMC 25.1309',    paragraph: 'AMC 25.1309 §6',  title: 'EASA Acceptable Means of Compliance — quantitative analysis', appliesTo: ['Part 25'] },
    { regulation: 'AMC 25.1309',    paragraph: 'AMC 25.1309 §8',  title: 'EASA AMC — common-cause analysis (PRA / ZSA / CMA)', appliesTo: ['Part 25'] },

    // ----- 14 CFR Part 23 (US normal category) -----
    { regulation: '14 CFR Part 23', paragraph: '§23.1309',        title: 'Equipment, systems, and installations — Part 23 Class I-IV graduated targets', appliesTo: ['Part 23'] },
    { regulation: '14 CFR Part 23', paragraph: '§23.2010',        title: 'Aircraft-level safety assessment (Amdt 23-64+; performance-based airworthiness)', appliesTo: ['Part 23'] },
    { regulation: '14 CFR Part 23', paragraph: '§23.2500',        title: 'Powerplant installation — Part 23 hazard assessment', appliesTo: ['Part 23'] },
    { regulation: '14 CFR Part 23', paragraph: '§23.2620',        title: 'Equipment, systems, and installations — failure-condition severity targets per Class', appliesTo: ['Part 23'] },
    { regulation: '14 CFR Part 23', paragraph: '§23.2625',        title: 'System power generation, storage, and distribution', appliesTo: ['Part 23'] },
    { regulation: '14 CFR Part 23', paragraph: '§23.1316',        title: 'Electrical and electronic system lightning protection (Part 23)', appliesTo: ['Part 23'] },
    { regulation: '14 CFR Part 23', paragraph: '§23.1317',        title: 'HIRF protection (Part 23)', appliesTo: ['Part 23'] },
    // ----- AC 23.x (FAA advisory circulars for Part 23) -----
    { regulation: 'AC 23.1309-1E',  paragraph: 'Table 2',         title: 'Severity-to-probability target ladder by Class (I/II/III/IV)', appliesTo: ['Part 23'] },
    { regulation: 'AC 23.1309-1E',  paragraph: '§17',             title: 'Acceptable analysis depth (qualitative for Classes I/II, quantitative for III/IV)', appliesTo: ['Part 23'] },
    { regulation: 'AC 23.2010-1',   paragraph: 'all',             title: 'Aircraft-level safety assessment — performance-based methodology', appliesTo: ['Part 23'] },
    // ----- EASA CS-23 / CM-23 (normal-category EU equivalent) -----
    { regulation: 'CS-23',          paragraph: 'CS 23.1309',      title: 'EASA equivalent — Part 23 systems & installations', appliesTo: ['Part 23'] },
    { regulation: 'CS-23',          paragraph: 'CS 23.2510',      title: 'EASA — equipment, systems and installations safety objectives', appliesTo: ['Part 23'] },
    { regulation: 'AMC 23.1309',    paragraph: 'AMC 23.1309',     title: 'EASA AMC — Part 23 system safety assessment methodology', appliesTo: ['Part 23'] },

    // Phase 53.55 — Part 27 / Part 29 (rotorcraft) entries
    { regulation: '14 CFR Part 27', paragraph: '§27.1309',        title: 'Equipment, systems and installations — Normal-Category Rotorcraft', appliesTo: ['Part 27'] },
    { regulation: '14 CFR Part 27', paragraph: '§27.901',         title: 'Powerplant installation — Normal-Category Rotorcraft', appliesTo: ['Part 27'] },
    { regulation: '14 CFR Part 27', paragraph: '§27.952',         title: 'Fuel system crashworthiness', appliesTo: ['Part 27'] },
    { regulation: 'AC 27-1B',       paragraph: 'all',             title: 'FAA Certification of Normal-Category Rotorcraft guidance', appliesTo: ['Part 27'] },
    { regulation: 'CS-27',          paragraph: 'CS 27.1309',      title: 'EASA equivalent — Normal-Category Rotorcraft systems & installations', appliesTo: ['Part 27'] },
    { regulation: '14 CFR Part 29', paragraph: '§29.1309',        title: 'Equipment, systems and installations — Transport-Category Rotorcraft', appliesTo: ['Part 29'] },
    { regulation: '14 CFR Part 29', paragraph: '§29.901',         title: 'Powerplant installation — Transport-Category Rotorcraft', appliesTo: ['Part 29'] },
    { regulation: '14 CFR Part 29', paragraph: '§29.952',         title: 'Fuel system crashworthiness — Transport-Category Rotorcraft', appliesTo: ['Part 29'] },
    { regulation: 'AC 29-2C',       paragraph: 'all',             title: 'FAA Certification of Transport-Category Rotorcraft guidance', appliesTo: ['Part 29'] },
    { regulation: 'CS-29',          paragraph: 'CS 29.1309',      title: 'EASA equivalent — Transport-Category Rotorcraft systems & installations', appliesTo: ['Part 29'] },

    // Phase 53.55 — Part 33 / Part 35 (engines + propellers)
    { regulation: '14 CFR Part 33', paragraph: '§33.75',          title: 'Safety analysis — turbine engines (Hazardous Engine Effects ≤ 1e-7 to 1e-8 /eng-FH)', appliesTo: ['Part 33'] },
    { regulation: '14 CFR Part 33', paragraph: '§33.28',          title: 'Engine control systems — FADEC and EEC integrity', appliesTo: ['Part 33'] },
    { regulation: '14 CFR Part 33', paragraph: '§33.91',          title: 'Engine system and component tests', appliesTo: ['Part 33'] },
    { regulation: 'CS-E',           paragraph: 'CS-E 510',        title: 'EASA — Safety analysis of engines (equivalent to §33.75)', appliesTo: ['Part 33'] },
    { regulation: '14 CFR Part 35', paragraph: '§35.15',          title: 'Safety analysis — propeller failure conditions', appliesTo: ['Part 35'] },
    { regulation: '14 CFR Part 35', paragraph: '§35.21',          title: 'Variable and reversible pitch propellers — failure modes', appliesTo: ['Part 35'] },
    { regulation: '14 CFR Part 35', paragraph: '§35.23',          title: 'Propeller control system requirements', appliesTo: ['Part 35'] },
    { regulation: 'CS-P',           paragraph: 'CS-P 70',         title: 'EASA — Propeller safety analysis (equivalent to §35.15)', appliesTo: ['Part 35'] },

    // Phase 53.55 — EASA SC-VTOL (eVTOL / AAM)
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2010',    title: 'Aircraft-level safety considerations', appliesTo: ['SC-VTOL'] },
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2300',    title: 'Equipment, systems and installations (eVTOL)', appliesTo: ['SC-VTOL'] },
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2305',    title: 'Safety assessment methodology', appliesTo: ['SC-VTOL'] },
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2510',    title: 'Continued Safe Flight and Landing (CS&FL) requirement — Enhanced category', appliesTo: ['SC-VTOL'] },
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2511',    title: 'Aircraft-level safety objectives (Basic vs Enhanced)', appliesTo: ['SC-VTOL'] },
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2521',    title: 'System safety analysis methodology — eVTOL-specific guidance', appliesTo: ['SC-VTOL'] },
    { regulation: 'SC-VTOL',        paragraph: 'SC-VTOL.2526',    title: 'Failure-condition severity classification — Basic & Enhanced ladders', appliesTo: ['SC-VTOL'] },
    { regulation: 'MOC SC-VTOL',    paragraph: 'MOC-2',           title: 'Means of Compliance #2 — powered-lift application', appliesTo: ['SC-VTOL'] },
    { regulation: 'AMC SC-VTOL',    paragraph: 'AMC SC-VTOL.2510', title: 'EASA AMC — Continued Safe Flight and Landing implementation', appliesTo: ['SC-VTOL'] },

    // Phase 53.55 — Part 450 (commercial space)
    { regulation: '14 CFR Part 450', paragraph: '§450.101',       title: 'Safety criteria — public risk thresholds (Eₓ ≤ 1×10⁻⁴ /mission)', appliesTo: ['Part 450'] },
    { regulation: '14 CFR Part 450', paragraph: '§450.103',       title: 'Vehicle safety — system safety program', appliesTo: ['Part 450'] },
    { regulation: '14 CFR Part 450', paragraph: '§450.107',       title: 'Flight safety analysis (FSA) — debris dispersion & casualty area modeling', appliesTo: ['Part 450'] },
    { regulation: '14 CFR Part 450', paragraph: '§450.108',       title: 'Flight termination system requirements', appliesTo: ['Part 450'] },
    { regulation: '14 CFR Part 450', paragraph: '§450.115',       title: 'Flight commit criteria', appliesTo: ['Part 450'] },
    { regulation: 'AC 21-101',       paragraph: 'all',            title: 'FAA Special Conditions application (used for per-applicant special conditions)', appliesTo: ['Part 450', 'SC-VTOL'] },

    // Phase 53.55 — Part 107 / SORA (UAS)
    { regulation: '14 CFR Part 107', paragraph: '§107.27',        title: 'Operating limitations — small UAS', appliesTo: ['Part 107'] },
    { regulation: '14 CFR Part 107', paragraph: '§107.49',        title: 'Pre-flight familiarisation, inspection, and other actions', appliesTo: ['Part 107'] },
    { regulation: 'JARUS SORA 2.5', paragraph: 'SAIL',             title: 'Specific Operations Risk Assessment (SORA) — risk-class / SAIL methodology', appliesTo: ['Part 107'] },
    { regulation: 'FAA AC 91-57B',  paragraph: 'all',             title: 'Model aircraft + recreational UAS operating guidance', appliesTo: ['Part 107'] },

    // ----- Cross-cutting standards (apply to ALL certification categories) -----
    { regulation: 'AC 20-174',      paragraph: '§5',              title: 'FAA acceptance of ARP4754A as means of compliance (systems development)', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] },
    { regulation: 'AC 20-115D',     paragraph: 'all',             title: 'FAA recognition of RTCA DO-178C for software development assurance', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] },
    { regulation: 'AC 20-152A',     paragraph: 'all',             title: 'FAA recognition of RTCA DO-254 for airborne electronic hardware', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] },
    { regulation: 'SAE ARP 4754B',  paragraph: 'all',             title: 'Guidelines for development of civil aircraft and systems (allocation, V&V, DAL)', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] },
    { regulation: 'SAE ARP 4761A',  paragraph: 'all',             title: 'Guidelines and methods for conducting the safety assessment process (FHA / PSSA / SSA, FTA, FMEA, PRA, ZSA, CMA)', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] },
    { regulation: 'RTCA DO-178C',   paragraph: 'Annex A',         title: 'Software considerations in airborne systems and equipment certification', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] },
    { regulation: 'RTCA DO-254',    paragraph: 'Appendix A',      title: 'Design assurance guidance for airborne electronic hardware', appliesTo: ['Part 25', 'Part 23', 'Part 27', 'Part 29', 'Part 33', 'Part 35', 'SC-VTOL', 'Part 450', 'Part 107'] }
];

const MOC_METHODS = ['Analysis', 'Test', 'Demonstration', 'Inspection', 'Similarity', 'Engineering Judgment'];

const MOC_STATUS  = ['Pending', 'In Progress', 'Compliant', 'Non-Compliant', 'Partial', 'N/A'];

const PARTICULAR_RISK_CATALOGUE = [
    { id: 'rotor-burst',
      name: 'Uncontained engine rotor burst',
      category: 'Engine',
      regulations: ['14 CFR §25.901(c)', '14 CFR §25.903(d)(1)', 'AC 20-128A', 'AC 25.901-1', 'CS 25.901', 'CS 25.903'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'],
      defaultDesc: 'Uncontained release of high-energy rotating engine debris (fan, compressor, turbine blade or disc fragments) outside the engine case. Industry-standard impact angle envelope: ±15° forward / ±5° aft of the plane of rotation, with fragments capable of penetrating fuselage skin, hydraulic lines, wire bundles, and adjacent engine cowlings.',
      defaultMitigation: 'Apply ±15° / ±5° debris cone segregation between redundant flight-critical channels (hydraulics, FBW wiring, fuel, electrical). Route at least one channel of every redundant pair outside the cone. Add Kevlar / armored shielding for items that must remain inside the cone. Demonstrate by zone-by-zone debris analysis per AC 20-128A.'
    },
    { id: 'blade-out',
      name: 'Fan blade-out / blade containment failure',
      category: 'Engine',
      regulations: ['14 CFR §33.94', '14 CFR §25.901(c)', 'AC 20-128A', 'CS-E 810', 'CS 25.901'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Climb', 'Cruise'],
      defaultDesc: 'Single fan-blade liberation with engine containment intact — induces high vibration and out-of-balance loads transmitted through engine mounts and pylon. Secondary effects include nacelle damage, accessory gearbox disruption, and potential collateral damage to wing leading edge or adjacent zones.',
      defaultMitigation: 'Demonstrate fan-blade-out containment per §33.94. Verify pylon, engine-mount, and FBW signal routing tolerate the induced vibration spectrum. Confirm safe shutdown of the affected engine and continued safe operation of remaining engines and systems.'
    },
    { id: 'lightning',
      name: 'Lightning strike',
      category: 'Environmental',
      regulations: ['14 CFR §25.581', '14 CFR §25.1316', 'AC 20-136B', 'AC 20-155A', 'CS 25.581', 'CS 25.1316'],
      typicalPhases: ['Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach'],
      defaultDesc: 'Direct lightning attachment to airframe with current sweeping along skin from entry point to exit point (typically nose/wingtip to opposite extremity). Induces conducted and radiated transients on internal wiring, with energy levels per SAE ARP 5412 / 5413 zone classifications.',
      defaultMitigation: 'Define lightning zones (1A/1B/2A/2B/3) per AC 20-136B. Demonstrate by zone-tested or analyzed protection on critical systems: bonding, shielding, fast-recovery transient suppression on signal lines. Maintain electrical continuity across composite structures and verify pin-injection tolerance.'
    },
    { id: 'hirf',
      name: 'High-Intensity Radiated Fields (HIRF)',
      category: 'Environmental',
      regulations: ['14 CFR §25.1317', 'AC 20-158A', 'CS 25.1317'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'],
      defaultDesc: 'Exposure to external electromagnetic fields from ground-based radars, airborne emitters, and high-power broadcast sources. HIRF Severe environment per AC 20-158A spans 10 kHz – 40 GHz with field strengths up to 7,200 V/m peak. Energy couples via cable harnesses, apertures, and inadequately shielded enclosures.',
      defaultMitigation: 'Categorize Level A/B/C functions per AC 20-158A. Demonstrate by HIRF test or similarity-plus-analysis. Apply cable shielding, filtered I/O, equipment-level enclosure shielding, and aperture controls. Maintain shielding continuity across LRU connectors.'
    },
    { id: 'bird-strike',
      name: 'Bird strike',
      category: 'Environmental',
      regulations: ['14 CFR §25.571(e)(1)', '14 CFR §25.631', '14 CFR §33.76', 'AC 25.571-1D', 'CS 25.631'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Approach', 'Landing'],
      defaultDesc: 'Impact of single 4-lb (windshield/forward fuselage) or medium 8-lb (engine inlet, tail) bird at cruise velocity at altitude ≤ 8,000 ft. Damages forward-facing structures (radome, windshield, leading edges, engine inlet, empennage) and may induce engine ingestion / multiple-engine power loss.',
      defaultMitigation: 'Demonstrate bird-strike tolerance per §25.571(e)(1) (forward structures), §25.631 (empennage), §33.76 (engine ingestion). Energy-absorbing leading-edge design; multi-pane windshield with structural ply rated to 4-lb impact. Engine inlet design / ingestion certification.'
    },
    { id: 'hail-ice',
      name: 'Hail and ice impact',
      category: 'Environmental',
      regulations: ['14 CFR §25.571(e)(2)', '14 CFR §33.78', 'AC 20-147A', 'CS 25.571'],
      typicalPhases: ['Climb', 'Cruise', 'Descent'],
      defaultDesc: 'Impact of hailstones (typical 1-2 inch diameter; up to 4 inch in severe convective storms) and engine-shed ice on radome, leading edges, windshield, and engine inlet. Includes ice crystal icing affecting pitot/static and engine performance.',
      defaultMitigation: 'Hail impact testing per §25.571(e)(2). Engine ice-ingestion certification per §33.78. Radome impact-tolerant design; leading-edge design margin; pitot-static heating; ice-crystal-tolerant engine bleed strategy.'
    },
    { id: 'tire-burst',
      name: 'Tire burst / flailing tread',
      category: 'Wheels/Tyres',
      regulations: ['14 CFR §25.729(f)', '14 CFR §25.734', 'AC 25.734-1', 'CS 25.729', 'CS 25.734'],
      typicalPhases: ['Takeoff', 'Landing'],
      defaultDesc: 'Pressure release and tread separation of a main-gear tire at high ground speed. Flailing tread strikes adjacent wheel-well structure, brake and hydraulic lines, wire bundles, and (on aft-gear configurations) wing/fuselage skin and flap surfaces.',
      defaultMitigation: 'Tire-debris envelope per AC 25.734-1 (typical 15° tread cone aft of wheel). Route hydraulic, fuel, and electrical service lines outside the envelope; armor or relocate items inside the envelope. Provide tire-burst shielding under wing pressurization-critical structure.'
    },
    { id: 'cargo-fire',
      name: 'Cargo compartment fire',
      category: 'Fire',
      regulations: ['14 CFR §25.855', '14 CFR §25.857', '14 CFR §25.858', 'AC 25-9A', 'CS 25.857', 'CS 25.858'],
      typicalPhases: ['Climb', 'Cruise', 'Descent'],
      defaultDesc: 'In-flight fire originating in a cargo compartment (Class C or E). Direct heat damage to overhead structure, wiring, hydraulics, and adjacent cabin. Smoke and toxic combustion products propagate via ECS / cabin pressurization vents.',
      defaultMitigation: 'Class C: continuous smoke detection + Halon/equivalent suppression for ≥ 180 minutes (single-engine extended ops). Class E: ventilation-controlled airflow + crew shutoff. Compartment lining FAA-burnthrough qualified. Demonstrate by full-scale fire test per AC 25-9A.'
    },
    { id: 'in-flight-fire',
      name: 'In-flight fire / smoke event (non-cargo)',
      category: 'Fire',
      regulations: ['14 CFR §25.831(c)', '14 CFR §25.869', 'AC 25-9A', 'AC 120-80B'],
      typicalPhases: ['Climb', 'Cruise', 'Descent', 'Approach'],
      defaultDesc: 'Fire originating in avionics bay, galley, lavatory, or hidden behind cabin lining due to wiring fault, lithium battery, or fluid leak. Smoke may infiltrate flight deck via ECS recirculation, compromising crew vision and breathing.',
      defaultMitigation: 'Smoke detection in avionics bays / lavatories / galleys; lithium-battery containment; smoke evacuation procedure; crew O2 + smoke goggles per §25.1439. Wiring separation + circuit protection per §25.1707. Demonstrate by smoke penetration testing.'
    },
    { id: 'engine-fire',
      name: 'Engine / APU compartment fire',
      category: 'Fire',
      regulations: ['14 CFR §25.1181', '14 CFR §25.1183', '14 CFR §25.1195', 'AC 20-135C', 'CS 25.1181', 'CS 25.1195'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'],
      defaultDesc: 'Fire within a designated fire zone (engine nacelle, APU compartment) due to fuel, hydraulic, or oil leak igniting on hot surfaces. Direct flame impingement on pylon structure, fuel lines, control cables, and engine mounts.',
      defaultMitigation: 'Firewall + fireproof / fire-resistant materials per §25.1181/1183. Fire-detection (dual-loop) + two-shot suppression system per §25.1195. Fuel/hyd line shutoff valves outside the fire zone.'
    },
    { id: 'rapid-decompression',
      name: 'Rapid / explosive decompression',
      category: 'Decompression',
      regulations: ['14 CFR §25.365', '14 CFR §25.571(d)', '14 CFR §25.841', 'AC 25-20', 'CS 25.365', 'CS 25.841'],
      typicalPhases: ['Climb', 'Cruise', 'Descent'],
      defaultDesc: 'Sudden loss of cabin pressurization due to structural breach (window blowout, door seal failure, fuselage rupture). Induces panel-blowout flailing parts, equipment migration, crew/passenger incapacitation if O2 not deployed promptly.',
      defaultMitigation: 'Damage-tolerant fuselage with crack-stopping per §25.571(d). Decompression vents in cabin floor / partitions per §25.365. Emergency O2 deployment ≤ 4 seconds. Demonstrate continued safe flight & landing with the largest probable opening.'
    },
    { id: 'flailing-shaft',
      name: 'Flailing engine / accessory shaft or belt',
      category: 'Engine',
      regulations: ['14 CFR §25.901(c)', 'AC 20-128A', 'CS 25.901'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'],
      defaultDesc: 'Failure of an engine accessory shaft, drive belt, or gearbox component causing high-energy flailing motion. May damage adjacent accessories, fluid lines, and electrical harnesses inside the nacelle.',
      defaultMitigation: 'Provide containment shielding around high-energy rotating accessories. Route critical channels outside the flail envelope. Verify accessory mounting torque margins and shaft fatigue life.'
    },
    { id: 'high-energy-stored',
      name: 'High-energy stored systems (pressurized bottles, hydraulic accumulators)',
      category: 'Structural',
      regulations: ['14 CFR §25.1438', 'AC 20-106', 'CS 25.1438'],
      typicalPhases: ['Takeoff', 'Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach', 'Landing'],
      defaultDesc: 'Rupture of pressurized container (O2 bottle, fire-suppression Halon bottle, hydraulic accumulator, nitrogen bottle) due to corrosion, impact, or overpressure. Fragments and high-pressure release may damage adjacent structure and systems.',
      defaultMitigation: 'Pressure-vessel qualification per §25.1438. Burst-disc / pressure-relief devices. Location away from flight-critical wiring and hydraulic services or behind containment shielding.'
    },
    { id: 'volcanic-ash',
      name: 'Volcanic ash encounter',
      category: 'Environmental',
      regulations: ['AC 91-79A', 'AMC 20-21'],
      typicalPhases: ['Climb', 'Cruise', 'Descent'],
      defaultDesc: 'Ingestion of volcanic ash into engines and APU; abrasion of forward-facing surfaces (windshield, leading edges, pitot probes). Ash glass-melts on hot turbine sections causing power loss; opacifies pitot/static causing erroneous airspeed.',
      defaultMitigation: 'ATC volcanic ash avoidance procedures. Engine ice-detection / ash-detection where fitted. Pitot heat + cross-monitoring for erroneous airspeed. Defined post-encounter inspection criteria.'
    },
    { id: 'ice-shedding',
      name: 'Ice shedding (engine, propeller, airframe)',
      category: 'Environmental',
      regulations: ['14 CFR §25.1419', '14 CFR §33.68', 'AC 20-73A', 'CS 25.1419'],
      typicalPhases: ['Initial Climb', 'Climb', 'Cruise', 'Descent', 'Approach'],
      defaultDesc: 'Shedding of accreted ice from engine spinner, propeller blades, wing leading edge, or empennage. Impacts fuselage skin, engine inlets (potential ingestion), and adjacent structures.',
      defaultMitigation: 'Anti-/de-ice system per §25.1419. Engine ice-ingestion qualification per §33.68. Sacrificial impact-tolerant areas on fuselage; clear ingestion path during anti-ice cycling.'
    }
];

const PR_CATEGORIES = ['Engine', 'Environmental', 'Fire', 'Structural', 'Decompression', 'Wheels/Tyres', 'Other'];

const PARTICULAR_RISK_APPLICABILITY = [
    {
        risk: 'Rotor Burst',
        appliesTo: (cfg, ctx) => { const c = _prDeriveCtx(cfg, ctx); return c.hasTurbine; },
        reason: (cfg, ctx) => {
            const c = _prDeriveCtx(cfg, ctx);
            return c.hasTurbine
                ? 'Turbine engine present — uncontained rotor (disc/blade) burst per §25.903(d)(1) / AC 20-128A applies.'
                : (c.isElectric ? 'All-electric propulsion — no turbine rotor to burst.'
                                : (c.isPiston ? 'Piston propulsion — no high-energy turbine rotor.' : 'No turbine engine identified.'));
        }
    },
    {
        risk: 'Engine Burst',
        appliesTo: (cfg, ctx) => { const c = _prDeriveCtx(cfg, ctx); return c.hasTurbine || c.engineCount > 0; },
        reason: (cfg, ctx) => {
            const c = _prDeriveCtx(cfg, ctx);
            return (c.hasTurbine || c.engineCount > 0)
                ? 'Engine(s) installed — high-energy engine/accessory burst & debris release per §25.901(c) applies.'
                : 'No engine items defined; engine-burst not applicable to this configuration.';
        }
    },
    {
        risk: 'Tire Burst',
        appliesTo: (cfg, ctx) => { const c = _prDeriveCtx(cfg, ctx); return !c.fixedGear; },
        reason: (cfg, ctx) => {
            const c = _prDeriveCtx(cfg, ctx);
            return c.fixedGear
                ? 'Fixed / skid gear — no high-speed retractable wheel to burst (tread-flail envelope not credible).'
                : (c.retractableGear
                    ? 'Retractable wheeled gear — tire burst / flailing tread per §25.734 / AC 25.734-1 applies.'
                    : 'Wheeled gear assumed (no fixed-gear signal) — tire burst applies pending gear configuration.');
        }
    },
    {
        risk: 'Bird Strike',
        appliesTo: () => true,
        reason: () => 'Bird strike is a broadly-applicable external threat (§25.571(e)(1)/§25.631/§33.76) for any aircraft.'
    },
    {
        risk: 'Lightning',
        appliesTo: () => true,
        reason: () => 'Lightning strike protection (§25.581/§25.1316, AC 20-136B) applies to all aircraft.'
    },
    {
        risk: 'HIRF',
        appliesTo: () => true,
        reason: () => 'High-Intensity Radiated Fields protection (§25.1317, AC 20-158A) applies to all aircraft with electrical/electronic systems.'
    },
    {
        risk: 'Hail',
        appliesTo: () => true,
        reason: () => 'Hail / ice impact (§25.571(e)(2)) is an environmental threat applicable to forward-facing structures broadly.'
    },
    {
        risk: 'Ice',
        appliesTo: () => true,
        reason: () => 'Icing / ice shedding (§25.1419, AC 20-73A) is broadly applicable; refine to the type design ice envelope.'
    },
    {
        risk: 'Cabin Fire',
        appliesTo: () => true,
        reason: () => 'In-flight / cabin / cargo fire (§25.831(c)/§25.855) applies to any occupied / cargo-carrying aircraft.'
    }
];

const PR_MODEL_SCHEMAS = {
    'rotor-burst': {
        label: 'Rotor Burst Analysis Model (AC 20-128A)',
        description: 'Uncontained rotor debris released through engine case. Industry standard ±15° forward / ±5° aft of the rotor plane of rotation. Energy depends on stage (fan / IPC / HPC / IPT / HPT) and fraction (1/3, 2/3, full).',
        params: [
            { id: 'engineItemId',       label: 'Source engine',                  type: 'item-ref', filter: { isEngine: true } },
            { id: 'rotorStage',         label: 'Rotor stage',                    type: 'select', options: ['Fan', 'LPC', 'IPC', 'HPC', 'HPT', 'IPT', 'LPT'], default: 'Fan' },
            { id: 'discFraction',       label: 'Disc fragment fraction',         type: 'select', options: ['1/3 disc', '2/3 disc', 'Full disc', 'Single blade', 'Multiple blade'], default: '1/3 disc' },
            { id: 'coneForwardDeg',     label: 'Trajectory cone forward',        type: 'number', unit: '°',   default: 15 },
            { id: 'coneAftDeg',         label: 'Trajectory cone aft',            type: 'number', unit: '°',   default:  5 },
            { id: 'energyMJ',           label: 'Fragment kinetic energy',        type: 'number', unit: 'MJ',  default: 10 },
            { id: 'fragmentCount',      label: 'Representative fragment count',  type: 'number', unit: 'frag', default: 3 }
        ]
    },
    'blade-out': {
        label: 'Fan Blade-Out Analysis Model (§33.94)',
        description: 'Single fan blade liberation with engine containment intact. Out-of-balance loads + vibration spectrum induced into pylon, engine mounts, and adjacent structures.',
        params: [
            { id: 'engineItemId',       label: 'Source engine',                  type: 'item-ref', filter: { isEngine: true } },
            { id: 'bladeMassKg',        label: 'Liberated blade mass',           type: 'number', unit: 'kg',  default: 2.5 },
            { id: 'imbalanceTorqueNm',  label: 'Resulting out-of-balance torque', type: 'number', unit: 'N·m', default: 50000 },
            { id: 'vibFreqHz',          label: 'Dominant vibration frequency',   type: 'number', unit: 'Hz',  default: 50 },
            { id: 'rundownTimeS',       label: 'Engine rundown time',            type: 'number', unit: 's',   default: 90 }
        ]
    },
    'lightning': {
        label: 'Lightning Strike Analysis Model (AC 20-136B)',
        description: 'Direct attachment with current sweep from entry to exit point. Conducted + radiated transients on internal wiring per SAE ARP 5412 / 5413 zone classifications.',
        params: [
            { id: 'attachmentZones',    label: 'Attachment zones (per SAE ARP 5414)', type: 'multiselect', options: ['1A', '1B', '1C', '2A', '2B', '3'], default: ['1A', '2A'] },
            { id: 'peakCurrentKA',      label: 'Peak current',                   type: 'number', unit: 'kA',  default: 200 },
            { id: 'actionIntegralA2s',  label: 'Action integral',                type: 'number', unit: 'A²·s', default: 2e6 },
            { id: 'sweepPath',          label: 'Sweep path description',         type: 'text',   default: 'nose radome to L wingtip via fuselage skin' }
        ]
    },
    'bird-strike': {
        label: 'Bird Strike Analysis Model (§25.571 / §25.775)',
        description: 'Impact on forward-facing surfaces. Mass × velocity² determines penetration capability. Flight phase determines representative bird mass and aircraft speed.',
        params: [
            { id: 'birdMassKg',         label: 'Representative bird mass',       type: 'number', unit: 'kg',  default: 1.8 },
            { id: 'aircraftSpeedKts',   label: 'Aircraft speed at impact',       type: 'number', unit: 'kt',  default: 250 },
            { id: 'flightPhase',        label: 'Flight phase',                   type: 'select', options: ['Takeoff', 'Initial Climb', 'Climb', 'Approach', 'Landing'], default: 'Initial Climb' },
            { id: 'impactArea',         label: 'Primary impact area',            type: 'select', options: ['Nose radome', 'Windshield', 'Wing leading edge', 'Empennage leading edge', 'Engine inlet', 'Pitot/static probe'], default: 'Nose radome' }
        ]
    },
    'fire-explosion': {
        label: 'Fire / Explosion Propagation Model (§25.853, §25.867)',
        description: 'Source zone fire + propagation vectors. Thermal load on adjacent zones, smoke + heat propagation through openings and ventilation.',
        params: [
            { id: 'sourceZoneId',       label: 'Source zone',                    type: 'text',   help: 'Zone identifier where fire originates' },
            { id: 'fuelLoadKg',         label: 'Fuel load',                      type: 'number', unit: 'kg',  default: 50 },
            { id: 'peakTempC',          label: 'Peak temperature',               type: 'number', unit: '°C',  default: 1100 },
            { id: 'propagationVectors', label: 'Propagation paths',              type: 'multiselect', options: ['Through firewall', 'Via ventilation', 'Via wiring duct', 'Via fuel line', 'Via hydraulic line', 'Radiative'], default: ['Via ventilation', 'Radiative'] }
        ]
    },
    'hail': {
        label: 'Hail Encounter Analysis Model (§25.775)',
        description: 'Hail stone impact on forward-facing surfaces during specific flight envelope (typically CB encounter at altitude).',
        params: [
            { id: 'stoneSizeMm',        label: 'Hail stone diameter',            type: 'number', unit: 'mm',  default: 50 },
            { id: 'flightPhase',        label: 'Flight phase',                   type: 'select', options: ['Climb', 'Cruise', 'Descent'], default: 'Cruise' },
            { id: 'aircraftSpeedKts',   label: 'Aircraft speed',                 type: 'number', unit: 'kt',  default: 280 },
            { id: 'encounterDurationS', label: 'Encounter duration',             type: 'number', unit: 's',   default: 30 }
        ]
    },
    'tire-burst': {
        label: 'Tire Burst / Tread Failure Analysis Model (AC 25-22)',
        description: 'Tread debris, tire fragment, or wheel disintegration. Debris envelope sweeps from tire tangentially.',
        params: [
            { id: 'gearStation',        label: 'Gear station',                   type: 'select', options: ['Nose', 'Main L', 'Main R', 'Centre Body'], default: 'Main L' },
            { id: 'failureMode',        label: 'Failure mode',                   type: 'select', options: ['Tread separation', 'Sidewall blowout', 'Wheel rim failure', 'Brake-induced'], default: 'Tread separation' },
            { id: 'debrisEnvelopeDeg',  label: 'Debris envelope angle',          type: 'number', unit: '°',   default: 90 },
            { id: 'phase',              label: 'Phase',                          type: 'select', options: ['Takeoff roll', 'Rejected takeoff', 'Landing roll', 'Taxi'], default: 'Takeoff roll' }
        ]
    },
    'hirf': {
        label: 'High-Intensity Radiated Fields Analysis (§25.1317, AC 20-158A)',
        description: 'External electromagnetic environment exposure across defined frequency bands. Susceptibility of avionics + signal lines.',
        params: [
            { id: 'environmentLevel',   label: 'HIRF environment',               type: 'select', options: ['Severe', 'Standard', 'Fixed-wing rotary', 'Certification', 'Normal'], default: 'Severe' },
            { id: 'freqBands',          label: 'Frequency bands of concern',     type: 'multiselect', options: ['10 kHz–500 kHz', '500 kHz–2 MHz', '2 MHz–30 MHz', '30 MHz–100 MHz', '100 MHz–400 MHz', '400 MHz–1 GHz', '1–2 GHz', '2–4 GHz', '4–6 GHz', '6–8 GHz', '8–12 GHz', '12–18 GHz', '18–40 GHz'], default: ['100 MHz–400 MHz', '1–2 GHz'] },
            { id: 'peakFieldVm',        label: 'Peak field strength',            type: 'number', unit: 'V/m', default: 7200 }
        ]
    },
    'rapid-decompression': {
        label: 'Rapid Decompression Analysis Model (§25.365, §25.571)',
        description: 'Loss of pressurization through hole(s) or door failure. Cabin altitude rise, airflow through cabin, item dislodgement risk.',
        params: [
            { id: 'sourceLocation',     label: 'Decompression source',           type: 'select', options: ['Door / hatch failure', 'Window failure', 'Skin penetration', 'Bulkhead rupture', 'Cargo bay decompression'], default: 'Door / hatch failure' },
            { id: 'holeAreaSqM',        label: 'Effective hole area',            type: 'number', unit: 'm²',  default: 0.5 },
            { id: 'cruiseAltFt',        label: 'Cruise altitude at event',       type: 'number', unit: 'ft',  default: 40000 },
            { id: 'depressTimeS',       label: 'Time to equalize',               type: 'number', unit: 's',   default: 4 }
        ]
    }
};

const PR_TO_MODEL_TYPE = {
    'rotor-burst': 'rotor-burst',
    'blade-out':   'blade-out',
    'lightning':   'lightning',
    'bird-strike': 'bird-strike',
    'fire':        'fire-explosion',
    'engine-fire': 'fire-explosion',
    'hail':        'hail',
    'tire-burst':  'tire-burst',
    'hirf':        'hirf',
    'rapid-decompression': 'rapid-decompression',
    'ice-shed':    'bird-strike'      // closest model for trajectory analysis
};
