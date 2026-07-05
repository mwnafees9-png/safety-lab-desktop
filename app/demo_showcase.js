// demo_showcase.js — Phase E3: the K350 Kestrel program showcase.
//
// One comprehensive worked example replacing the SV-7 / ES-9 demos. A Part 23
// Class III nine-seat twin-turboprop commuter threaded through EVERY feature:
// AFHA→PASA→SFHA→PSSA→SSA→ASA cockpits, interdependence + common resources,
// MAC model → compiled MF&MS (equivalence-proven at load), dual-lane CoFFE with
// a signed finding and an authored malfunction graft, the independence-principle
// ledger (including a deliberate CCF contradiction with its signed disposition),
// CCMR latents + wear-out, FMEA→FMES, requirements with V&V, assumptions routed
// and validated, PRA/ZSA/CMA, sign-offs on every artifact, method slots,
// tailoring register, SSPP intake, and Q-format reports over live data.
//
// All content is ORIGINAL. Formats follow ARP 4761A; no standard text is used.
// Fictional program, fictional engineers: R. Váldez (safety lead),
// J. Okafor (systems), M. Chen (DER liaison).

(function () {
    'use strict';

    function build() {
        let _nid = 5000;
        const id = () => _nid++;
        const NOW = '2026-07-02T09:00:00.000Z';
        const T0 = Date.parse('2026-06-20T10:00:00Z');

        // ---- node builders -------------------------------------------------
        const gate = (gateType, name, kids, opts) => Object.assign({
            id: id(), name, type: 'gate', gateType, probability: 0, children: kids || []
        }, opts || {});
        const be = (name, lambda, opts) => Object.assign({
            id: id(), name, type: 'basic', lambda: lambda || 0, probability: 0,
            inputMode: lambda ? 'lambda' : 'probability', children: []
        }, opts || {});
        const xfer = (linkedPageId, name) => ({
            id: id(), name, type: 'gate', gateType: 'TRANSFER', linkedPageId, probability: 0, children: []
        });
        const seal = (node) => {
            if (node.logicalId == null) node.logicalId = node.id;
            if (!node.displayId) node.displayId = (node.type === 'gate' ? 'G-' : 'BE-') + node.id;
            (node.children || []).forEach(seal);
            return node;
        };

        // ---- aircraft functions (all pass the E2.6 abstraction linter) -----
        const FN = [
            ['AF-01', 'Control the flight path', 'SF-01', 'Control pitch attitude', 'Command and sustain aircraft attitude and trajectory about the pitch axis throughout the envelope.'],
            ['AF-01', 'Control the flight path', 'SF-02', 'Control roll attitude', 'Command and sustain bank angle and lateral trajectory.'],
            ['AF-01', 'Control the flight path', 'SF-03', 'Control yaw and sideslip', 'Command directional trim and counter asymmetric moments.'],
            ['AF-02', 'Generate and manage thrust', 'SF-04', 'Generate forward thrust', 'Produce the propulsive force required by the performance envelope.'],
            ['AF-02', 'Generate and manage thrust', 'SF-05', 'Manage thrust symmetry', 'Detect and bound thrust asymmetry between the two powerplants.'],
            ['AF-03', 'Decelerate and steer on the ground', 'SF-06', 'Decelerate on the ground', 'Dissipate kinetic energy after touchdown or a rejected takeoff within the available distance.'],
            ['AF-03', 'Decelerate and steer on the ground', 'SF-07', 'Steer on the ground', 'Maintain directional control during taxi, takeoff and landing rollout.'],
            ['AF-04', 'Indicate flight parameters', 'SF-08', 'Display attitude and airspeed', 'Present primary attitude, airspeed and altitude to the flight crew.'],
            ['AF-04', 'Indicate flight parameters', 'SF-09', 'Alert the crew to hazardous states', 'Annunciate cautions and warnings for conditions requiring crew action.'],
            ['AF-05', 'Protect critical surfaces from ice', 'SF-10', 'Protect critical surfaces from ice', 'Prevent or shed ice accretion on lifting and sensing surfaces within the certified icing envelope.'],
            ['AF-06', 'Store and deliver fuel', 'SF-11', 'Deliver fuel under all attitudes', 'Feed both powerplants across the approved attitude and temperature envelope.'],
            ['AF-07', 'Extend and retract the landing gear', 'SF-12', 'Extend and retract the landing gear', 'Position and lock the gear for each flight phase.'],
            ['AF-08', 'Navigate along the intended route', 'SF-13', 'Navigate along the intended route', 'Determine position and guide the aircraft along the cleared trajectory.'],
        ];
        const acFunctionsData = FN.map(f => ({
            internalId: id(), funcId: f[0], funcName: f[1], subId: f[2], subName: f[3], subDef: f[4],
        }));

        // ---- aircraft FHA ---------------------------------------------------
        const ALLPH = 'Takeoff, Climb, Cruise, Descent, Approach, Landing';
        const F = (iid, fcId, subId, desc, sev, phases, effAc, effCrew, effPax, asm) => ({
            internalId: iid, fcId, subId, fcDesc: desc, severity: sev, phases,
            effAc, effCrew, effPax, assumptionIds: asm || [], comments: '',
        });
        const acFhaData = [
            F(1001, 'FC-01', 'SF-01', 'Loss of pitch attitude control', 'Catastrophic', ALLPH,
              'Departure from controlled flight; loss of the aircraft.', 'Unable to arrest flight-path divergence.', 'Multiple fatalities.', ['ASM-AC-001']),
            F(1002, 'FC-02', 'SF-01', 'Erroneous pitch response to crew command', 'Hazardous', 'Takeoff, Approach, Landing',
              'Large excursions from the intended flight path near the ground.', 'High workload; opposite-sense correction required.', 'Serious injuries possible.', ['ASM-AC-001']),
            F(1003, 'FC-03', 'SF-02', 'Loss of roll attitude control', 'Catastrophic', ALLPH,
              'Uncontrollable bank; departure from controlled flight.', 'Unable to level the wings.', 'Multiple fatalities.', []),
            F(1004, 'FC-04', 'SF-03', 'Loss of yaw and sideslip control', 'Hazardous', 'Takeoff, Approach, Landing',
              'Reduced crosswind capability; sideslip limits exceeded.', 'Rudder-free asymmetric handling.', 'Injuries in a hard landing.', []),
            F(1005, 'FC-05', 'SF-04', 'Total loss of forward thrust', 'Catastrophic', 'Takeoff, Climb, Cruise',
              'Forced landing off-airport beyond glide range of a runway.', 'Committed to an immediate forced landing.', 'Fatalities possible depending on terrain.', ['ASM-AC-006']),
            F(1006, 'FC-06', 'SF-05', 'Undetected thrust asymmetry', 'Hazardous', 'Takeoff, Climb',
              'Lateral-directional upset at high power and low speed.', 'Late recognition; near control limits.', 'Serious injuries possible.', []),
            F(1007, 'FC-07', 'SF-06', 'Loss of deceleration capability on landing', 'Hazardous', 'Landing',
              'High-speed overrun of the landing distance available.', 'Unable to stop within the paved surface.', 'Serious injuries in the overrun.', ['ASM-AC-004']),
            F(1008, 'FC-08', 'SF-08', 'Loss of attitude and airspeed display', 'Hazardous', ALLPH,
              'Continued flight on standby indication only.', 'Significant workload increase; IMC capability degraded.', 'None direct.', ['ASM-AC-005']),
            F(1009, 'FC-09', 'SF-08', 'Misleading attitude or airspeed display', 'Catastrophic', ALLPH,
              'Controlled flight into terrain or loss-of-control following undetected erroneous indication.', 'Erroneous inputs made in good faith.', 'Multiple fatalities.', ['ASM-AC-001']),
            F(1010, 'FC-10', 'SF-09', 'Failure to alert the crew to a hazardous state', 'Hazardous', ALLPH,
              'A protected-against condition progresses undetected.', 'No annunciation of the developing condition.', 'Dependent on the unannunciated condition.', []),
            F(1011, 'FC-11', 'SF-10', 'Loss of ice protection during icing exposure', 'Hazardous', 'Climb, Cruise, Descent, Approach',
              'Ice accretion degrades lift and control margins.', 'Exit of icing conditions required promptly.', 'Injuries possible in an upset.', ['ASM-AC-002', 'ASM-AC-003']),
            F(1012, 'FC-12', 'SF-11', 'Fuel starvation of both powerplants', 'Catastrophic', 'Climb, Cruise, Descent',
              'Total thrust loss from a common fuel-delivery cause.', 'Forced landing; restart unlikely.', 'Fatalities possible depending on terrain.', ['ASM-AC-006']),
            F(1013, 'FC-13', 'SF-12', 'Inadvertent gear retraction on the ground', 'Major', 'Standing, Taxi, Landing',
              'Fuselage and propeller contact with the surface.', 'Evacuation initiated.', 'Minor injuries possible.', []),
            F(1014, 'FC-14', 'SF-13', 'Loss of navigation capability', 'Major', 'Climb, Cruise, Descent, Approach',
              'Reversion to radio navigation and vectors.', 'Workload increase.', 'None direct.', []),
            F(1015, 'FC-15', 'SF-07', 'Loss of ground steering', 'Major', 'Taxi, Takeoff, Landing',
              'Directional control by differential braking and thrust only.', 'Increased workload during rollout.', 'None direct.', []),
        ];

        // ---- FCIM: the identification matrix the FHA rows were drawn from ----
        // Carried conditions reference the FHA FC ids; screened cells carry the
        // screening rationale in the description (the matrix must show the
        // conditions CONSIDERED, not only the ones carried forward).
        let _fcimId = 3001;   // fixed range — must NOT consume the shared id()
        const M = (subId, aw, tlId, tlDesc, plId, plDesc, mId, mDesc) => ({
            internalId: _fcimId++, subId, awareness: aw, tlId, tlDesc, plId, plDesc, mId, mDesc,
        });
        const acFcimData = [
            M('SF-01', 'Aware', 'FC-01', 'Loss of pitch attitude control', 'SF01-PL', 'Degraded pitch rate authority — Minor, screened: handling-quality margin per flight test', 'FC-02', 'Erroneous pitch response to crew command'),
            M('SF-02', 'Aware', 'FC-03', 'Loss of roll attitude control', 'SF02-PL', 'Reduced roll rate with one aileron segment — Minor, screened', 'SF02-M', 'Uncommanded roll input — bounded by FC-03 analysis (same architecture floor)'),
            M('SF-03', 'Aware', 'FC-04', 'Loss of yaw and sideslip control', 'SF03-PL', 'Rudder trim inoperative — Minor, screened', 'SF03-M', 'Rudder hardover — carried in the FC-04 tree as a contributing gate'),
            M('SF-04', 'Aware', 'FC-05', 'Total loss of forward thrust', 'SF04-PL', 'Single powerplant loss — Major, carried at system level (FC-PRL01 / FC-PRR01)', 'SF04-M', 'Thrust above commanded — screened: FADEC topping limits, qualification Q-ENG-114'),
            M('SF-05', 'Aware', 'FC-06', 'Undetected thrust asymmetry', 'SF05-PL', 'Delayed asymmetry annunciation — Minor, screened', 'SF05-M', 'False asymmetry alert — Minor, screened: crew cross-check procedure'),
            M('SF-06', 'Aware', 'FC-07', 'Loss of deceleration capability on landing', 'SF06-PL', 'Loss of one deceleration means — bounded by the SF-06 MAC floor (two of four)', 'SF06-M', 'Uncommanded deceleration device deployment in flight — carried as the CoFFE malfunction residue on the FC-07 tree'),
            M('SF-07', 'Aware', 'FC-15', 'Loss of ground steering', 'SF07-PL', 'Reduced steering authority — Minor, screened: differential braking retained', 'SF07-M', 'Uncommanded nosewheel deflection at speed — carried in the FC-15 assessment'),
            M('SF-08', 'Both', 'FC-08', 'Loss of attitude and airspeed display', 'SF08-PL', 'Single display unit loss — Minor, screened: standby + cross-side available', 'FC-09', 'Misleading attitude or airspeed display'),
            M('SF-09', 'Unaware', 'FC-10', 'Failure to alert the crew to a hazardous state', 'SF09-PL', 'Loss of a single aural channel — Minor, screened', 'SF09-M', 'False warning — Minor, screened: procedural cross-check, nuisance-rate requirement'),
            M('SF-10', 'Aware', 'FC-11', 'Loss of ice protection during icing exposure', 'SF10-PL', 'Loss of one protection channel — Major, carried via the MEL exposure limit (ASM-AC-003)', 'SF10-M', 'Ice protection runs without command — Minor, screened: thermal margin analysis'),
            M('SF-11', 'Unaware', 'FC-12', 'Fuel starvation of both powerplants', 'SF11-PL', 'Single feed-path interruption — Major, carried at system level (crossfeed available)', 'SF11-M', 'Fuel transfer misdirection — screened: gallery check valves, maintenance task 28-11-01'),
            M('SF-12', 'Aware', 'SF12-TL', 'Failure of the gear to extend — Major, carried at system level with the alternate extension', 'SF12-PL', 'Single door or lock failure — Minor, screened', 'FC-13', 'Inadvertent gear retraction on the ground'),
            M('SF-13', 'Aware', 'FC-14', 'Loss of navigation capability', 'SF13-PL', 'Degraded position accuracy — Minor, screened: crew procedures and ATC surveillance', 'SF13-M', 'Misleading navigation guidance — carried in the FC-14 assessment with display comparisons'),
        ];

        // ---- aircraft requirements ------------------------------------------
        const R = (iid, rid, traceId, level, type, text, rat, vm, vs) => ({
            internalId: iid, id: rid, traceId, level, type, text, rat,
            verifMethod: vm, verifStatus: vs, verifEvidence: '',
        });
        const acReqData = [
            R(1101, 'REQ-AC-001', 'FC-01', 'L1', 'Quantitative', 'The probability of loss of pitch attitude control shall not exceed 1E-9 per flight hour.', 'Catastrophic classification per AC 23.1309-1E Class III.', 'Analysis', 'Passed'),
            R(1102, 'REQ-AC-002', 'FC-09', 'L1', 'Quantitative', 'The probability of displaying misleading attitude or airspeed without annunciation shall not exceed 1E-9 per flight hour.', 'Catastrophic classification; integrity budget on the display chain.', 'Analysis', 'Pending'),
            R(1103, 'REQ-AC-003', 'FC-07', 'L1', 'Architecture', 'At least two independent deceleration means shall remain available after any single system failure on landing.', 'MAC floor for SF-06: minimum two of four deceleration means (wheel braking, reverse thrust L/R, lift dump).', 'Analysis', 'Passed'),
            R(1104, 'REQ-AC-004', 'FC-12', 'L1', 'Independence', 'Left and right fuel feed paths shall share no single component whose failure starves both powerplants.', 'Common-cause defense for the catastrophic dual-starvation condition.', 'Inspection', 'Passed'),
            R(1105, 'REQ-AC-005', 'FC-08', 'L1', 'Architecture', 'A standby attitude and airspeed indication, independent of the primary display chain and its power source, shall be provided.', 'MAC floor for SF-08: minimum one of {primary display chain, standby indication}.', 'Test', 'Passed'),
            R(1106, 'REQ-AC-006', 'FC-11', 'L1', 'Operational', 'Dispatch into known icing with one ice-protection channel inoperative shall be prohibited above the MEL exposure limit.', 'Bounds the exposure assumption ASM-AC-003.', 'Review', 'Pending'),
            R(1107, 'REQ-AC-007', 'FC-03', 'L1', 'Quantitative', 'The probability of loss of roll attitude control shall not exceed 1E-9 per flight hour.', 'Catastrophic classification per AC 23.1309-1E Class III.', 'Analysis', 'Pending'),
            R(1108, 'REQ-AC-008', 'FC-04', 'L1', 'Quantitative', 'The probability of loss of yaw and sideslip control shall not exceed 1E-7 per flight hour.', 'Hazardous classification; rudder and asymmetric-thrust margins.', 'Analysis', 'Pending'),
            R(1109, 'REQ-AC-009', 'FC-06', 'L1', 'Monitor', 'Thrust asymmetry exceeding the controllability threshold shall be annunciated within 2 seconds of onset.', 'Bounds the undetected-asymmetry exposure on takeoff and climb.', 'Test', 'Pending'),
            R(1110, 'REQ-AC-010', 'FC-10', 'L1', 'Architecture', 'Caution and warning annunciation shall be generated by a channel independent of the monitored function.', 'A failed function must not silence its own alert.', 'Analysis', 'Pending'),
            R(1111, 'REQ-AC-011', 'FC-14', 'L1', 'Functional', 'Loss of the primary navigation source shall be annunciated and reversion to the secondary source shall be available to the crew.', 'Bounds the Major navigation-loss condition with crew procedure.', 'Test', 'Pending'),
            R(1112, 'REQ-AC-012', 'FC-15', 'L1', 'Functional', 'Directional control on the ground shall remain available by differential braking after loss of nosewheel steering.', 'Alternate means for the Major steering-loss condition.', 'Analysis', 'Pending'),
            R(1113, 'REQ-AC-013', 'FC-02', 'L1', 'Quantitative', 'The probability of erroneous pitch response to crew command during Takeoff, Approach, Landing shall not exceed 1E-7 per flight hour.', 'Hazardous classification per AC 23.1309-1E Class III; phase-limited exposure.', 'Analysis', 'Pending'),
            R(1114, 'REQ-AC-014', 'FC-05', 'L1', 'Quantitative', 'The probability of total loss of forward thrust during Takeoff, Climb, Cruise shall not exceed 1E-9 per flight hour.', 'Catastrophic classification per AC 23.1309-1E Class III.', 'Analysis', 'Pending'),
        ];

        // ---- aircraft assumptions -------------------------------------------
        const A = (aid, text, state, strat, route) => ({
            asmId: aid, text, state, valStrategy: strat, valArtifact: '', verArtifact: '',
            origin: 'AC FHA', routeTo: route,
        });
        const acAssumptionsData = [
            A('ASM-AC-001', 'The flight crew recognizes and reacts to an annunciated pitch or display failure within 3 seconds in the landing configuration.', 'Validated', 'Simulator campaign K350-SIM-014, 12 crews.', 'Ops — AFM procedure'),
            A('ASM-AC-002', 'Icing exposure per encounter does not exceed 45 minutes within the App C envelope for the design mission.', 'Validated', 'Route and season analysis over the launch network.', 'Ops — route analysis'),
            A('ASM-AC-003', 'Dispatch with one ice-protection channel inoperative is limited by MEL to 25 flight hours of exposure.', 'Proposed', 'MEL rationale to be agreed with the authority.', 'Ops — MEL'),
            A('ASM-AC-004', 'Wet-runway braking coefficient is not less than 0.30 on the certified surfaces at the design landing weight.', 'Validated', 'Flight-test braking campaign K350-FT-BRK-02.', 'Design — performance'),
            A('ASM-AC-005', 'The standby instrument battery sustains indication for 45 minutes after total generation loss.', 'Verified', 'Qualification test report Q-SBY-011.', 'Design — SDD'),
            A('ASM-AC-006', 'Fuel contamination affecting both tanks simultaneously is precluded by separate fueling points and sump drains per the maintenance program.', 'Validated', 'Maintenance program task cards 28-11-01/02.', 'Maintenance program'),
        ];

        // ---- systems (roles drive the resources matrix) ----------------------
        const mkSys = (sid, name, role, fns, fha, req, asm) => ({
            id: sid, name, role, asmCounter: (asm || []).length + 1,
            functions: fns, fcim: [], extractedFCs: [], fha: fha || [], req: req || [], asm: asm || [],
        });
        const sf = (traces, fid, name) => ({ internalId: id(), traceIds: traces, funcId: fid, funcName: name, funcDef: '' });
        const sysFha = (iid, fcId, subId, desc, sev, acTrace, phases) => ({
            internalId: iid, subId, fcId, fcDesc: desc, severity: sev, acTrace,
            phases: phases || ALLPH, effAc: 'See traced aircraft failure condition.', effCrew: '', effPax: '',
            assumptionIds: [], comments: '',
        });
        const sysReq = (iid, traceId, type, text, rat, vs) => ({
            internalId: iid, traceId, level: 'L2', type, text, rat, verifMethod: 'Analysis', verifStatus: vs, verifEvidence: '',
        });
        const sysAsm = (aid, text, state, route) => ({
            asmId: aid, text, state, valStrategy: '', valArtifact: '', verArtifact: '', origin: 'Sys FHA', routeTo: route,
        });

        const systemsData = [
            mkSys('sys-fcs', 'Flight Control System', 'function',
                [sf(['SF-01'], 'SFN-FCS1', 'Control pitch attitude'), sf(['SF-02'], 'SFN-FCS2', 'Control roll attitude'),
                 sf(['SF-03'], 'SFN-FCS3', 'Control yaw and sideslip'), sf(['SF-06'], 'SFN-FCS4', 'Decelerate on the ground')],
                [sysFha(2001, 'FC-FCS01', 'SF-01', 'Loss of pitch control output', 'Catastrophic', 1001),
                 sysFha(2002, 'FC-FCS02', 'SF-01', 'Uncommanded or reversed pitch output', 'Hazardous', 1002, 'Takeoff, Approach, Landing'),
                 sysFha(2003, 'FC-FCS03', 'SF-06', 'Loss of lift-dump contribution to deceleration', 'Major', 1007, 'Landing')],
                [sysReq(2101, 'FC-FCS01', 'Independence', 'Elevator servo channels A and B shall be physically separated and powered from different buses.', 'Supports the AND-claim on the pitch loss gate.', 'Passed'),
                 sysReq(2102, 'FC-FCS02', 'Monitor', 'A command-vs-surface monitor shall annunciate pitch miscompare within 0.5 s.', 'Detects erroneous output before divergence near the ground.', 'Pending')],
                [sysAsm('ASM-FCS-001', 'Servo channel dissimilarity (vendor A / vendor B) is maintained through the production life.', 'Validated', 'Design — configuration control')]),
            mkSys('sys-prl', 'Left Powerplant', 'both',
                [sf(['SF-04'], 'SFN-PRL1', 'Generate forward thrust'), sf(['SF-05'], 'SFN-PRL2', 'Manage thrust symmetry'), sf(['SF-06'], 'SFN-PRL3', 'Decelerate on the ground')],
                [sysFha(2011, 'FC-PRL01', 'SF-04', 'Loss of left powerplant thrust', 'Major', 1005, 'Takeoff, Climb, Cruise'),
                 sysFha(2012, 'FC-PRL02', 'SF-06', 'Uncommanded reverse or beta transition in flight or rollout', 'Hazardous', 1007, 'Landing')],
                [sysReq(2111, 'FC-PRL02', 'Interlock', 'Beta and reverse transition shall be inhibited unless weight-on-wheels and throttle position agree.', 'Guards the malfunction case grafted in CoFFE.', 'Passed')],
                [sysAsm('ASM-PRL-001', 'Propeller autofeather is available and armed for every takeoff.', 'Validated', 'Ops — AFM procedure')]),
            mkSys('sys-prr', 'Right Powerplant', 'both',
                [sf(['SF-04'], 'SFN-PRR1', 'Generate forward thrust'), sf(['SF-05'], 'SFN-PRR2', 'Manage thrust symmetry'), sf(['SF-06'], 'SFN-PRR3', 'Decelerate on the ground')],
                [sysFha(2021, 'FC-PRR01', 'SF-04', 'Loss of right powerplant thrust', 'Major', 1005, 'Takeoff, Climb, Cruise')],
                [], []),
            mkSys('sys-eps', 'Electrical Power System', 'resource',
                [sf([], 'SFN-EPS1', 'Distribute electrical power')],
                [sysFha(2031, 'FC-EPS01', '', 'Loss of both generation channels', 'Hazardous', 1008),
                 sysFha(2032, 'FC-EPS02', '', 'Main bus voltage transient beyond equipment limits', 'Major', 1009)],
                [sysReq(2131, 'FC-EPS01', 'Capacity', 'Each generation channel shall carry the full essential-bus load with the other channel failed.', 'Single-channel dispatchability.', 'Passed')],
                [sysAsm('ASM-EPS-001', 'Battery-only endurance of 45 minutes covers diversion from any point on the launch network.', 'Validated', 'Ops — route analysis')]),
            mkSys('sys-hyd', 'Hydraulic Power System', 'resource',
                [sf([], 'SFN-HYD1', 'Distribute hydraulic power')],
                [sysFha(2041, 'FC-HYD01', '', 'Loss of hydraulic pressure', 'Major', 1007, 'Landing')],
                [], []),
            mkSys('sys-fue', 'Fuel System', 'both',
                [sf(['SF-11'], 'SFN-FUE1', 'Deliver fuel under all attitudes')],
                [sysFha(2051, 'FC-FUE01', 'SF-11', 'Starvation of both feed lines', 'Catastrophic', 1012, 'Climb, Cruise, Descent'),
                 sysFha(2052, 'FC-FUE02', 'SF-11', 'Starvation of one feed line', 'Major', 1005, 'Climb, Cruise, Descent')],
                [sysReq(2151, 'FC-FUE01', 'Independence', 'Left and right feed paths shall use separate tanks, pumps, lines and vents downstream of the refuel gallery.', 'Implements REQ-AC-004.', 'Passed')],
                [sysAsm('ASM-FUE-001', 'Crossfeed is a crew-selected abnormal configuration, closed in normal operation.', 'Validated', 'Ops — AFM procedure')]),
            mkSys('sys-avi', 'Avionics & Display', 'function',
                [sf(['SF-08'], 'SFN-AVI1', 'Display attitude and airspeed'), sf(['SF-09'], 'SFN-AVI2', 'Alert the crew to hazardous states'), sf(['SF-13'], 'SFN-AVI3', 'Navigate along the intended route')],
                [sysFha(2061, 'FC-AVI01', 'SF-08', 'Blank or frozen primary flight display', 'Hazardous', 1008),
                 sysFha(2062, 'FC-AVI02', 'SF-08', 'Misleading attitude or airspeed presentation', 'Catastrophic', 1009),
                 sysFha(2063, 'FC-AVI03', 'SF-09', 'Loss of caution and warning annunciation', 'Hazardous', 1010)],
                [sysReq(2161, 'FC-AVI02', 'Monitor', 'Attitude and air data shall be compared across two independent sources; a miscompare flag shall be presented within 1 s.', 'Integrity defense for the catastrophic misleading-display condition.', 'Pending'),
                 sysReq(2162, 'FC-AVI01', 'Architecture', 'Display reversion shall present attitude on the remaining display within 2 s of a display failure.', 'Availability defense.', 'Passed')],
                [sysAsm('ASM-AVI-001', 'The standby instrument uses a pitot-static source physically separate from the primary air-data probes.', 'Proposed', 'Design — SDD')]),
            mkSys('sys-sby', 'Standby Instruments', 'function',
                [sf(['SF-08'], 'SFN-SBY1', 'Display attitude and airspeed')],
                [sysFha(2071, 'FC-SBY01', 'SF-08', 'Loss of standby indication', 'Major', 1008)],
                [], []),
            mkSys('sys-ips', 'Ice Protection System', 'function',
                [sf(['SF-10'], 'SFN-IPS1', 'Protect critical surfaces from ice')],
                [sysFha(2081, 'FC-IPS01', 'SF-10', 'Loss of ice protection on lifting surfaces', 'Hazardous', 1011, 'Climb, Cruise, Descent, Approach')],
                [], []),
            mkSys('sys-ldg', 'Landing Gear & Braking', 'function',
                [sf(['SF-06'], 'SFN-LDG1', 'Decelerate on the ground'), sf(['SF-07'], 'SFN-LDG2', 'Steer on the ground'), sf(['SF-12'], 'SFN-LDG3', 'Extend and retract the landing gear')],
                [sysFha(2091, 'FC-LDG01', 'SF-06', 'Loss of wheel braking', 'Hazardous', 1007, 'Landing'),
                 sysFha(2092, 'FC-LDG02', 'SF-12', 'Inadvertent retraction command on the ground', 'Major', 1013, 'Standing, Taxi, Landing')],
                [sysReq(2191, 'FC-LDG01', 'Architecture', 'Wheel braking shall remain available from the accumulator after total hydraulic generation loss for at least six full brake applications.', 'Deceleration MAC floor support.', 'Passed')],
                [sysAsm('ASM-LDG-001', 'Six accumulator brake applications bound the certified landing rollout with reverse thrust available.', 'Validated', 'Design — performance')]),
        ];

        // ---- resources -------------------------------------------------------
        const resourcesData = [
            { internalId: id(), resId: 'RES-01', name: '28 VDC electrical power', type: 'Electrical',
              providedBy: ['sys-eps'], consumedBy: [], consumedBySystems: ['sys-fcs', 'sys-avi', 'sys-ips', 'sys-fue', 'sys-ldg'] },
            { internalId: id(), resId: 'RES-02', name: 'Hydraulic pressure (3000 psi)', type: 'Hydraulic',
              providedBy: ['sys-hyd'], consumedBy: [], consumedBySystems: ['sys-ldg'] },
            { internalId: id(), resId: 'RES-03', name: 'Fuel feed', type: 'Fuel',
              providedBy: ['sys-fue'], consumedBy: [], consumedBySystems: ['sys-prl', 'sys-prr'] },
            { internalId: id(), resId: 'RES-04', name: 'Engine bleed air', type: 'Pneumatic',
              providedBy: ['sys-prl', 'sys-prr'], consumedBy: [], consumedBySystems: ['sys-ips'] },
        ];

        // ---- items / LRUs ----------------------------------------------------
        const item = (itemId, name, type, dal, daType, sysId, desc, traces) => ({
            internalId: id(), itemId, name, type, dal, daType, owningSystemId: sysId, description: desc,
            traceIds: traces || [],
        });
        const itemsData = [
            item('LRU-FCS-01', 'Elevator servo channel A', 'Electromechanical', 'A', 'Hardware', 'sys-fcs', 'Vendor A rotary servo, left elevator segment.', ['SF-01']),
            item('LRU-FCS-02', 'Elevator servo channel B', 'Electromechanical', 'A', 'Hardware', 'sys-fcs', 'Vendor B linear servo, right elevator segment (dissimilar).', ['SF-01']),
            item('LRU-FCS-03', 'Flight control computer', 'Computing', 'A', 'Software', 'sys-fcs', 'Dual-lane command/monitor FCC.', ['SF-01', 'SF-02', 'SF-03']),
            item('LRU-PRL-01', 'Left FADEC', 'Computing', 'B', 'Software', 'sys-prl', 'Full-authority engine control, left.', ['SF-04', 'SF-05']),
            item('LRU-PRR-01', 'Right FADEC', 'Computing', 'B', 'Software', 'sys-prr', 'Full-authority engine control, right.', ['SF-04', 'SF-05']),
            item('LRU-EPS-01', 'Starter-generator 1', 'Electrical', 'C', 'Hardware', 'sys-eps', '300 A engine-driven starter-generator.'),
            item('LRU-EPS-02', 'Starter-generator 2', 'Electrical', 'C', 'Hardware', 'sys-eps', '300 A engine-driven starter-generator.'),
            item('LRU-EPS-03', 'Bus power control unit', 'Electrical', 'B', 'Hardware', 'sys-eps', 'Bus tie, load shed and protection logic.'),
            item('LRU-AVI-01', 'Primary flight display', 'Display', 'A', 'Software', 'sys-avi', 'Smart display with integral symbol generation.', ['SF-08', 'SF-09']),
            item('LRU-AVI-02', 'Air data computer 1', 'Sensor', 'A', 'Hardware', 'sys-avi', 'Primary air data source.', ['SF-08']),
            item('LRU-AVI-03', 'Air data computer 2', 'Sensor', 'A', 'Hardware', 'sys-avi', 'Secondary air data source for miscompare.', ['SF-08']),
            item('LRU-SBY-01', 'Standby attitude module', 'Display', 'B', 'Hardware', 'sys-sby', 'Self-contained battery-backed attitude/airspeed.', ['SF-08']),
            item('LRU-LDG-01', 'Brake control unit', 'Computing', 'B', 'Software', 'sys-ldg', 'Antiskid and brake-by-wire control.', ['SF-06']),
            item('LRU-LDG-02', 'Brake accumulator', 'Hydromechanical', 'C', 'Hardware', 'sys-ldg', 'Emergency braking energy store.', ['SF-06']),
        ];

        // ---- FTA pages -------------------------------------------------------
        const pages = [];
        const page = (pid, name, opts) => { const p = Object.assign({ id: pid, name, root: null }, opts || {}); pages.push(p); return p; };

        // == system PSSA trees (top-down) ==
        const fcsServoA = be('Elevator servo channel A fails', 0, { probability: 3e-5 });
        const fcsServoB = be('Elevator servo channel B fails', 0, { probability: 3e-5 });
        const fcsAnd = gate('AND', 'Loss of both elevator servo channels', [fcsServoA, fcsServoB], { dalIndependence: 'option-1' });
        const fcsColumn = be('Control path position sensing lost', 0, { probability: 1e-6 });
        page('pg-fcs-pitch', 'PSSA · FCS loss of pitch output', {
            treeLevel: 'system', systemId: 'sys-fcs', mode: 'top-down', linkedFhaIds: [2001],
            root: seal(gate('OR', 'Loss of pitch control output', [fcsAnd, fcsColumn], { allocatedDAL: 'A' })),
        });

        page('pg-prl-thrust', 'PSSA · Left powerplant thrust loss', {
            treeLevel: 'system', systemId: 'sys-prl', mode: 'top-down', linkedFhaIds: [2011],
            root: seal(gate('OR', 'Loss of left powerplant thrust', [
                be('Gas generator failure (left)', 0, { probability: 8e-5 }),
                be('Propeller governor failure (left)', 0, { probability: 2e-5 }),
                be('Left feed line starvation', 0, { probability: 1e-5 }),
            ], { allocatedDAL: 'C' })),
        });
        page('pg-prr-thrust', 'PSSA · Right powerplant thrust loss', {
            treeLevel: 'system', systemId: 'sys-prr', mode: 'top-down', linkedFhaIds: [2021],
            root: seal(gate('OR', 'Loss of right powerplant thrust', [
                be('Gas generator failure (right)', 0, { probability: 8e-5 }),
                be('Propeller governor failure (right)', 0, { probability: 2e-5 }),
                be('Right feed line starvation', 0, { probability: 1e-5 }),
            ], { allocatedDAL: 'C' })),
        });

        // Generation channels are realized by the starter-generator LRUs —
        // this puts the EPS servicing tasks (RAM-003/004) on the R&M thread
        // via item → BE → linked FC.
        const _epsItm = sid => { const it = itemsData.find(i => i.itemId === sid); return it ? it.internalId : undefined; };
        const epsGen1 = be('Generation channel 1 fails', 0, { probability: 1e-4, realizedByItemId: _epsItm('LRU-EPS-01') });
        const epsGen2 = be('Generation channel 2 fails', 0, { probability: 1e-4, realizedByItemId: _epsItm('LRU-EPS-02') });
        const epsAnd = gate('AND', 'Loss of both generation channels', [epsGen1, epsGen2], { dalIndependence: 'option-2' });
        const epsTie = be('Essential bus distribution fault', 0, { probability: 2e-6 });
        page('pg-eps-bus', 'PSSA · EPS loss of generation', {
            treeLevel: 'system', systemId: 'sys-eps', mode: 'top-down', linkedFhaIds: [2031],
            root: seal(gate('OR', 'Loss of both generation channels', [epsAnd, epsTie], { allocatedDAL: 'B' })),
        });

        // realizedByItemId links the channel events to their LRUs — the EWIS
        // lane (C3) joins these against the routing runs: both channels ride
        // RT-001 through Z-MLGW, a genuine co-routing finding by design.
        const ldgChA = be('Brake hydraulic channel A fails', 0, { probability: 5e-5, realizedByItemId: 'LRU-LDG-01' });
        const ldgChB = be('Brake hydraulic channel B fails', 0, { probability: 5e-5, realizedByItemId: 'LRU-LDG-02' });
        const ldgAnd = gate('AND', 'Loss of both brake channels', [ldgChA, ldgChB], { dalIndependence: 'option-1' });
        const ldgBcu = be('Brake control unit total failure', 0, { probability: 8e-6 });
        page('pg-ldg-brakes', 'PSSA · LDG loss of wheel braking', {
            treeLevel: 'system', systemId: 'sys-ldg', mode: 'top-down', linkedFhaIds: [2091],
            root: seal(gate('OR', 'Loss of wheel braking', [ldgAnd, ldgBcu], { allocatedDAL: 'B' })),
        });

        const aviAdc = be('Air data comparison fails to detect erroneous source', 0, { probability: 5e-6 });
        const aviSym = be('Display processor corrupts attitude symbology undetected', 0, { probability: 2e-6 });
        page('pg-avi-mislead', 'PSSA · AVI misleading display', {
            treeLevel: 'system', systemId: 'sys-avi', mode: 'top-down', linkedFhaIds: [2062],
            root: seal(gate('OR', 'Misleading attitude or airspeed presentation', [aviAdc, aviSym], { allocatedDAL: 'A' })),
        });

        const fueL = be('Left feed path blocked or unporting', 0, { probability: 3e-5 });
        const fueR = be('Right feed path blocked or unporting', 0, { probability: 3e-5 });
        const fueAnd = gate('AND', 'Independent starvation of both feed paths', [fueL, fueR], { dalIndependence: 'option-1' });
        const fueVent = be('Common vent icing blocks both tanks', 0, { probability: 1e-7 });
        page('pg-fue-starv', 'PSSA · FUE dual starvation', {
            treeLevel: 'system', systemId: 'sys-fue', mode: 'top-down', linkedFhaIds: [2051],
            root: seal(gate('OR', 'Starvation of both feed lines', [fueAnd, fueVent], { allocatedDAL: 'A' })),
        });

        // == aircraft PASA allocation trees (top-down) ==
        page('pg-ac-fc01', 'PASA · FC-01 loss of pitch control', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1001],
            root: seal(gate('OR', 'Loss of pitch attitude control', [
                xfer('pg-fcs-pitch', 'FCS fails to provide pitch control'),
                be('Pitch control structural path failure', 0, { probability: 1e-10 }),
            ], { allocatedDAL: 'A' })),
        });
        const acThrustAnd = gate('AND', 'Independent loss of both powerplants', [
            xfer('pg-prl-thrust', 'Left powerplant thrust loss'),
            xfer('pg-prr-thrust', 'Right powerplant thrust loss'),
        ], { dalIndependence: 'option-1' });
        page('pg-ac-fc05', 'PASA · FC-05 total thrust loss', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1005],
            root: seal(gate('OR', 'Total loss of forward thrust', [
                acThrustAnd,
                xfer('pg-fue-starv', 'Fuel starvation of both powerplants'),
            ], { allocatedDAL: 'A' })),
        });
        page('pg-ac-fc07', 'PASA · FC-07 loss of deceleration', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1007],
            root: seal(gate('AND', 'Loss of deceleration capability on landing', [
                xfer('pg-ldg-brakes', 'Wheel braking lost'),
                gate('AND', 'Reverse thrust unavailable on both powerplants', [
                    be('Left reverse/beta unavailable', 0, { probability: 1e-3 }),
                    be('Right reverse/beta unavailable', 0, { probability: 1e-3 }),
                ]),
            ], { allocatedDAL: 'B', dalIndependence: 'option-1' })),
        });
        const acDispAnd = gate('AND', 'Misleading primary indication with standby unavailable or not cross-checked', [
            xfer('pg-avi-mislead', 'Primary display chain misleading'),
            be('Standby indication unavailable or not consulted', 0, { probability: 1e-3 }),
        ], { dalIndependence: 'option-1' });
        const acDispCommon = be('Common air-data source error feeds primary and standby', 0, { probability: 1e-9 });
        page('pg-ac-fc09', 'PASA · FC-09 misleading display', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1009],
            root: seal(gate('OR', 'Misleading attitude or airspeed display', [acDispAnd, acDispCommon], { allocatedDAL: 'A' })),
        });
        // FC-03 tree — FIXED node ids (3301+): these nodes must NOT consume the
        // shared id() counter or every downstream BE displayId would shift.
        const fc03AilA = { id: 3301, name: 'Aileron actuation channel A fails', type: 'basic', lambda: 0, probability: 3e-5, inputMode: 'probability', children: [] };
        const fc03AilB = { id: 3302, name: 'Aileron actuation channel B fails', type: 'basic', lambda: 0, probability: 3e-5, inputMode: 'probability', children: [] };
        const fc03Struct = { id: 3303, name: 'Roll control structural path failure', type: 'basic', lambda: 0, probability: 1e-10, inputMode: 'probability', children: [] };
        const fc03And = { id: 3304, name: 'Independent loss of both aileron actuation channels', type: 'gate', gateType: 'AND', probability: 0, children: [fc03AilA, fc03AilB], dalIndependence: 'option-1' };
        page('pg-ac-fc03', 'PASA · FC-03 loss of roll control', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1003],
            root: seal({ id: 3305, name: 'Loss of roll attitude control', type: 'gate', gateType: 'OR', probability: 0, children: [fc03And, fc03Struct], allocatedDAL: 'A' }),
        });
        page('pg-ac-fc12', 'PASA · FC-12 dual fuel starvation', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1012],
            root: seal(gate('OR', 'Fuel starvation of both powerplants', [
                xfer('pg-fue-starv', 'Fuel system dual starvation'),
                be('Total fuel exhaustion (planning error not trapped)', 0, { probability: 1e-9 }),
            ], { allocatedDAL: 'A' })),
        });

        // == SSA verification mirrors (bottom-up, as-built λ) ==
        const vServoA = be('Elevator servo channel A fails', 2e-5, { ccfGroup: 'ccf-elev-servo', beta: 0.05 });
        const vServoB = be('Elevator servo channel B fails', 2e-5, { ccfGroup: 'ccf-elev-servo', beta: 0.05 });
        const vTrimLatent = be('Standby pitch trim channel dormant fault', 2e-6, { exposureMode: 'latent', dormancyInterval: 600 });
        const vFcsAnd = gate('AND', 'Loss of both elevator servo channels', [vServoA, vServoB]);
        page('pg-fcs-pitch-v', 'SSA · FCS pitch — as-built verification', {
            treeLevel: 'system', systemId: 'sys-fcs', mode: 'bottom-up', verifies: 'pg-fcs-pitch', linkedFhaIds: [2001],
            root: seal(gate('OR', 'Loss of pitch control output (as-built)', [
                vFcsAnd,
                gate('AND', 'Column sensing lost with trim standby dormant-failed', [
                    be('Control path position sensing lost', 8e-7),
                    vTrimLatent,
                ]),
            ])),
        });
        const vTieWeld = be('Bus tie contactor welded closed (undetected)', 3e-6, { repairModel: 'periodic', tau: 400 });
        page('pg-eps-bus-v', 'SSA · EPS generation — as-built verification', {
            treeLevel: 'system', systemId: 'sys-eps', mode: 'bottom-up', verifies: 'pg-eps-bus', linkedFhaIds: [2031],
            root: seal(gate('OR', 'Loss of both generation channels (as-built)', [
                gate('AND', 'Both starter-generators fail', [
                    be('Starter-generator 1 fails', 9e-5),
                    be('Starter-generator 2 fails', 9e-5),
                ]),
                gate('AND', 'Single generator failure with tie welded', [
                    be('Starter-generator 1 fails (with tie welded)', 9e-5),
                    vTieWeld,
                ]),
            ])),
        });
        const vShuttle = be('Brake shuttle valve internal leakage', 5e-6, { libraryKey: 'K350-BRK-VLV' });
        page('pg-ldg-brakes-v', 'SSA · LDG braking — as-built verification', {
            treeLevel: 'system', systemId: 'sys-ldg', mode: 'bottom-up', verifies: 'pg-ldg-brakes', linkedFhaIds: [2091],
            root: seal(gate('OR', 'Loss of wheel braking (as-built)', [
                gate('AND', 'Loss of both brake channels', [
                    be('Brake hydraulic channel A fails', 4e-5),
                    be('Brake hydraulic channel B fails', 4e-5),
                ]),
                be('Brake control unit total failure', 6e-6),
                vShuttle,
            ])),
        });

        // == authored MF&MS tree (cross-checked against the MAC model) ==
        const mAuthLdg = be('Landing gear braking unavailable', 0, { probability: 1e-4, externalSource: { systemId: 'sys-ldg' } });
        const mAuthPrl = be('Left powerplant reverse unavailable', 0, { probability: 1e-3, externalSource: { systemId: 'sys-prl' } });
        const mAuthPrr = be('Right powerplant reverse unavailable', 0, { probability: 1e-3, externalSource: { systemId: 'sys-prr' } });
        page('pg-mfms-auth-fc07', 'MF&MS (authored) · FC-07', {
            treeLevel: 'aircraft', mode: 'top-down', linkedFhaIds: [1007],
            root: seal(gate('AND', 'Deceleration below the MAC floor', [
                mAuthLdg,
                gate('OR', 'A reverse-thrust means lost', [mAuthPrl, mAuthPrr]),
            ])),
        });

        // ---- FMEA (piece-part, feeds the FMES derived view) -------------------
        const fmeaRow = (fid, sysId, part, mode, local, end, det, sev, rate, beId, comp) => ({
            internalId: id(), fmeaType: 'piece-part', scope: 'system', owningSystemId: sysId,
            fmeaId: fid, part, mode, localEffect: local, nextEffect: '', endEffect: end, detection: det,
            severity: sev, compensating: comp || '', remarks: '', beId: beId || 0, parentLibKey: '',
            rate, time: 1.5, prob: -Math.expm1(-rate * 1.5),
        });
        const fmeaData = [
            fmeaRow('FM-FCS-01', 'sys-fcs', 'Elevator servo A', 'Jam (mechanical seizure)', 'Channel A output frozen', 'Loss of channel A pitch authority', 'Miscompare monitor + surface position', 'Hazardous', 8e-6, vServoA.id, 'Channel B carries full authority'),
            fmeaRow('FM-FCS-02', 'sys-fcs', 'Elevator servo A', 'Hardover (runaway output)', 'Uncommanded surface deflection', 'Erroneous pitch response', 'Miscompare monitor within 0.5 s', 'Hazardous', 4e-6, vServoA.id, 'Monitor disengages faulty channel'),
            fmeaRow('FM-FCS-03', 'sys-fcs', 'Elevator servo B', 'Loss of output (electrical)', 'Channel B output absent', 'Loss of channel B pitch authority', 'Continuous wrap-around test', 'Hazardous', 8e-6, vServoB.id, 'Channel A carries full authority'),
            fmeaRow('FM-EPS-01', 'sys-eps', 'Starter-generator 1', 'Bearing seizure', 'Channel 1 generation lost', 'Loss of one generation channel', 'GEN 1 caution + load meter', 'Major', 6e-5, 0, 'Channel 2 carries essential load'),
            fmeaRow('FM-EPS-02', 'sys-eps', 'Bus tie contactor', 'Contacts welded closed', 'Bus isolation lost', 'Loss of channel independence', 'Periodic functional test (400 FH)', 'Major', 3e-6, vTieWeld.id, 'Detected at the 400 FH test'),
            fmeaRow('FM-LDG-01', 'sys-ldg', 'Brake shuttle valve', 'Internal leakage past the seat', 'Accumulator pressure decays', 'Loss of emergency braking reserve', 'Pre-flight accumulator pressure check', 'Major', 5e-6, vShuttle.id, 'Normal channel unaffected'),
            fmeaRow('FM-LDG-02', 'sys-ldg', 'Brake control unit', 'Processor halt', 'Antiskid and BBW commands cease', 'Loss of wheel braking', 'BRAKE FAIL warning', 'Hazardous', 6e-6, ldgBcu.id, 'Accumulator direct mode available'),
            fmeaRow('FM-AVI-01', 'sys-avi', 'Air data computer 1', 'Pitot line partial blockage', 'Airspeed under-reads', 'Misleading airspeed on PFD', 'ADC1/ADC2 miscompare', 'Catastrophic', 2e-6, aviAdc.id, 'Standby indication independent'),
            // One deliberately incomplete row — exercises the FMES completeness lint.
            { internalId: id(), fmeaType: 'piece-part', scope: 'system', owningSystemId: 'sys-avi',
              fmeaId: 'FM-AVI-02', part: 'Display processor', mode: 'Symbol memory corruption', localEffect: 'Frame buffer artefacts',
              nextEffect: '', endEffect: 'Misleading attitude symbology', detection: '', severity: 'Catastrophic',
              compensating: '', remarks: 'Detection means TBD — monitor design in work.', beId: aviSym.id, parentLibKey: '', rate: 1e-6, time: 1.5, prob: -Math.expm1(-1e-6 * 1.5) },
        ];

        // ---- CCA: PRA / ZSA / CMA ---------------------------------------------
        const praData = [
            { internalId: id(), praId: 'PRA-001', threat: 'Uncontained engine rotor burst', desc: 'High-energy debris across the rotor-burst zone', systems: 'Left Powerplant, Fuel System, Hydraulic Power System', csfl: 'Severing of both feed lines where they converge at the wing root', mitigation: 'Feed line separation outside the ±15° burst plane; shielding of the gallery', affectedZones: ['Z-NACL', 'Z-CWG'] },
            { internalId: id(), praId: 'PRA-002', threat: 'Bird strike (4 lb, VC)', desc: 'Impact on the nose and empennage leading edges', systems: 'Avionics & Display, Flight Control System', csfl: 'Loss of both primary air-data probes', mitigation: 'Probe longitudinal separation; standby probe under the fuselage', affectedZones: ['Z-NOSE'] },
            { internalId: id(), praId: 'PRA-003', threat: 'Lightning strike (Zone 1A)', desc: 'Direct attachment to the radome and wing tips', systems: 'Avionics & Display, Electrical Power System, Fuel System', csfl: 'Simultaneous transient on both generation channels', mitigation: 'Bonding, transient suppression at the bus power control unit; fuel vent flame arrestors', affectedZones: ['Z-NOSE', 'Z-CWG'] },
            { internalId: id(), praId: 'PRA-004', threat: 'Tire burst / tread throw', desc: 'Debris into the wheel well during retraction', systems: 'Landing Gear & Braking, Hydraulic Power System', csfl: 'Rupture of both brake hydraulic channels routed through the well', mitigation: 'Channel B rerouted forward of the well; deflector added', affectedZones: ['Z-MLGW'] },
        ];
        const zsaData = [
            { internalId: id(), zoneId: 'Z-NOSE', desc: 'Nose avionics bay', equip: 'PFD, ADC1, ADC2, bus power control unit', severity: 'Hazardous', interference: 'Air-data plumbing adjacent to display wiring', mitigation: 'Segregated routing; drip shield over the LRU rack', housedFunctions: ['SF-08', 'SF-09'] },
            { internalId: id(), zoneId: 'Z-CWG', desc: 'Center wing / fuel gallery', equip: 'Refuel gallery, crossfeed valve, vent lines', severity: 'Catastrophic', interference: 'Single gallery serves both tanks upstream of the feed split', mitigation: 'Feed independence begins at the tank outlets (REQ-AC-004)', housedFunctions: ['SF-11'] },
            { internalId: id(), zoneId: 'Z-MLGW', desc: 'Main landing gear wheel well', equip: 'Brake lines A/B, shuttle valve, squat switch harness', severity: 'Hazardous', interference: 'Tire burst trajectory crosses both brake channels', mitigation: 'Channel B rerouted (PRA-004); guards on the squat harness', housedFunctions: ['SF-06', 'SF-12'] },
            { internalId: id(), zoneId: 'Z-NACL', desc: 'Left nacelle', equip: 'FADEC L, fuel feed L, bleed duct L, fire loop', severity: 'Hazardous', interference: 'Bleed duct proximity to FADEC harness', mitigation: 'Thermal blanket + duct burst detection', housedFunctions: ['SF-04', 'SF-10'] },
        ];
        // ---- system FCIMs (per system function, referencing the SFHA ids) ----
        let _sfcimId = 3101;
        const SM = (subId, aw, tlId, tlDesc, plId, plDesc, mId, mDesc) => ({
            internalId: _sfcimId++, subId, awareness: aw, tlId, tlDesc, plId, plDesc, mId, mDesc,
        });
        const _fcimFor = {
            'sys-fcs': [SM('SFN-FCS1', 'Aware', 'FC-FCS01', 'Loss of pitch control output', 'FCS1-PL', 'Single servo channel loss — Minor, screened: dual-channel architecture', 'FC-FCS02', 'Uncommanded or reversed pitch output')],
            'sys-prl': [SM('SFN-PRL1', 'Aware', 'FC-PRL01', 'Loss of left powerplant thrust', 'PRL1-PL', 'Thrust limited below rating — Minor, screened', 'FC-PRL02', 'Uncommanded reverse or beta transition')],
            'sys-eps': [SM('SFN-EPS1', 'Both', 'FC-EPS01', 'Loss of both generation channels', 'EPS1-PL', 'Single generation channel loss — Minor, screened: full essential-bus capacity retained', 'FC-EPS02', 'Main bus voltage transient beyond equipment limits')],
            'sys-avi': [SM('SFN-AVI1', 'Both', 'FC-AVI01', 'Blank primary displays', 'AVI1-PL', 'Single sensor source loss — Minor, screened: miscompare monitoring retained', 'FC-AVI02', 'Misleading primary display data')],
            'sys-ldg': [SM('SFN-LDG1', 'Aware', 'FC-LDG01', 'Loss of normal wheel braking', 'LDG1-PL', 'Antiskid inoperative — Major, carried: dispatch analysis on the MMEL page', 'FC-LDG02', 'Asymmetric or uncommanded braking')],
            'sys-fue': [SM('SFN-FUE1', 'Unaware', 'FC-FUE01', 'Interruption of fuel feed', 'FUE1-PL', 'Boost pump loss — Minor, screened: suction feed within envelope', 'FUE1-M', 'Crossfeed valve uncommanded transfer — screened: valve position annunciated')],
        };
        // attach (systems without an entry keep an explicitly empty matrix and
        // that is the honest state: their conditions are carried at AC level)
        Object.keys(_fcimFor).forEach(sid => {
            const sysRow = systemsData.find(x => x.id === sid);
            if (sysRow) sysRow.fcim = _fcimFor[sid];
        });

        const cmaData = [
            { internalId: id(), cmaId: 'CMA-001', subject: 'Elevator servo channel dissimilarity', claim: 'Servo channels A and B fail independently (option-1 claim on the pitch AND gate).', modes: ['design-error', 'manufacturing'], linkedGateIds: ['pg-fcs-pitch:' + fcsAnd.id], findings: 'Dissimilar vendors and technologies; common installation torque procedure identified and revised.', mitigation: 'Separate installation task cards; β=5% residual commonality retained in the quantitative model.', status: 'Closed — Accepted', scope: 'system', owningSystemId: 'sys-fcs' },
            { internalId: id(), cmaId: 'CMA-002', subject: 'Shared pitot mast heritage between primary and standby air data', claim: 'Standby indication is independent of the primary display chain (AND claim on FC-09).', modes: ['shared-resource', 'environment'], linkedGateIds: ['pg-ac-fc09:' + acDispAnd.id], findings: 'Standby probe is a different part number but shares the heated-mast design; a common icing susceptibility cannot yet be excluded within the App C envelope. Owns the model block claim sys-avi → sys-fcs (erroneous lane): control-law air-data miscompare rejection.', mitigation: '', status: 'Open', scope: 'aircraft', owningSystemId: '' },
            { internalId: id(), cmaId: 'CMA-003', subject: 'Maintenance error — brake channel cross-connection', claim: 'Brake channels A and B remain independent through maintenance.', modes: ['maintenance'], linkedGateIds: ['pg-ldg-brakes:' + ldgAnd.id], findings: 'Fittings were size-identical; cross-connection was credible at wheel change.', mitigation: 'Different fitting sizes introduced on channel B (mod K350-32-017).', status: 'Mitigated', scope: 'system', owningSystemId: 'sys-ldg' },
        ];

        // ---- flight phases (1.5 FH design mission) -----------------------------
        const ph = (phase, dur) => ({ phase, altFrom: '', altFromUnit: 'AGL', altTo: '', altToUnit: 'AGL', duration: String(dur), durationUnit: 'hours' });
        const flightPhasesData = [
            ph('Standing', 0.05), ph('Taxi', 0.1), ph('Takeoff', 0.05), ph('Climb', 0.2),
            ph('Cruise', 0.6), ph('Descent', 0.2), ph('Approach', 0.2), ph('Landing', 0.1),
        ];

        // ---- projectConfig: MAC, CoFFE, interdependence, SPP, tailoring… -------
        const macModels = [
            // M1 L3 — typed deviation lanes on the flight-control rule: the
            // erroneous lane carries one BLOCK claim (control laws reject
            // miscompared air data) — a monitor claim CMA-002 owns (INV-17).
            { id: 'mac-sf01', level: 0, subId: 'SF-01', phase: 'All phases',
              clauses: [{ min: 1, of: ['sys-fcs'] }],
              lanes: ['loss', 'erroneous'],
              flows: [
                  { id: 'fl-mac-sf01-1', from: 'sys-avi', to: 'sys-fcs', lane: 'erroneous', transfer: 'block',
                    note: 'Control laws reject miscompared air data — monitor claim owned by CMA-002' },
              ],
              substantiation: { kind: 'assumption', ref: '', by: 'R. Váldez', at: NOW } },
            { id: 'mac-sf04', level: 0, subId: 'SF-04', phase: 'Cruise',
              clauses: [{ min: 1, of: ['sys-prl', 'sys-prr'] }],
              substantiation: { kind: 'sdd', ref: 'SDD-K350-70-002 §3.1 (single-engine ceiling above MEA on all routes)', by: 'J. Okafor', at: NOW } },
            // M1 L3 — inadvertent lane: uncommanded beta/reverse on rollout
            // defeats deceleration scheduling (the CoFFE malfunction-residue
            // story, now first-class in the model).
            { id: 'mac-sf06', level: 0, subId: 'SF-06', phase: 'Landing',
              clauses: [{ min: 2, of: ['sys-ldg', 'sys-prl', 'sys-prr', 'sys-fcs'] }],
              lanes: ['loss', 'inadvertent'],
              flows: [
                  { id: 'fl-mac-sf06-1', from: 'sys-prl', to: 'sys-ldg', lane: 'inadvertent', transfer: 'pass',
                    note: 'Uncommanded beta/reverse on rollout defeats deceleration scheduling' },
              ],
              substantiation: { kind: 'assumption', ref: '', by: 'R. Váldez', at: NOW } },
            // M1 L3 — erroneous lane: the defining catastrophic case from the
            // CoFFE worksheet ("misleading attitude presented as valid"),
            // typed as propagation instead of prose.
            { id: 'mac-sf08', level: 0, subId: 'SF-08', phase: 'All phases',
              clauses: [{ min: 1, of: ['sys-avi', 'sys-sby'] }],
              lanes: ['loss', 'erroneous'],
              flows: [
                  { id: 'fl-mac-sf08-1', from: 'sys-avi', to: 'sys-sby', lane: 'erroneous', transfer: 'pass',
                    note: 'Primary symbol generator feeds the standby comparator reference' },
              ],
              // M2 — the display chain as a reconfiguration story: primary EFIS,
              // automatic reversion to the dissimilar standby. Switching is a
              // named failure mode; γ and λ are the engineer's values (K350
              // reversion qualification), never derived by the tool.
              modes: [
                  { id: 'md-mac-sf08-1', name: 'Primary EFIS', active: ['sys-avi'],
                    entry: 'Normal operation', lambda: 2e-4 },
                  { id: 'md-mac-sf08-2', name: 'Standby reversion', active: ['sys-sby'],
                    entry: 'Automatic reversion on EFIS miscompare/loss',
                    switchP: 0.001, lambda: 2e-4 },
              ],
              substantiation: { kind: 'assumption', ref: '', by: 'R. Váldez', at: NOW } },
        ];

        // CoFFE — dual-lane verdicts over FC-07 (decel) and FC-09 (display).
        const coffe = {
            verdicts: {
                // agreement: pair loss ≠ breach under min-2-of-4 → both lanes NO → verified
                '1007§sys-ldg=total loss': { verdict: 'no', by: 'J. Okafor', at: NOW },
                '1007§sys-ldg=total loss∧sys-prl=total loss': { verdict: 'no', by: 'J. Okafor', at: NOW },
                // FINDING: elicited YES vs computed NO — wet-runway judgment says braking+lift-dump
                // loss already breaches; challenges the tree/MAC (missing-branch finding).
                '1007§sys-fcs=total loss∧sys-ldg=total loss': { verdict: 'yes', by: 'J. Okafor', at: NOW },
                // malfunction residue (no computed lane) — grafted onto the compiled tree at load
                '1007§sys-prl=malfunction': { verdict: 'yes', by: 'R. Váldez', at: NOW },
                // display FC: total-loss pair breaches MAC → both lanes YES → verified
                '1009§sys-avi=total loss∧sys-sby=total loss': { verdict: 'yes', by: 'R. Váldez', at: NOW },
                '1009§sys-avi=malfunction': { verdict: 'yes', by: 'R. Váldez', at: NOW },
            },
            results: {
                '1007§sys-ldg=total loss': 'Low-speed overrun risk only — reverse plus lift dump stops within LDA + 200 m on a dry runway.',
                '1007§sys-ldg=total loss∧sys-prl=total loss': 'Marginal but bounded — single reverse plus lift dump; crosswind limit reduced.',
                '1007§sys-fcs=total loss∧sys-ldg=total loss': 'High-speed overrun on a wet runway — reverse alone judged insufficient below µ=0.30.',
                '1007§sys-prl=malfunction': 'Uncommanded beta/reverse on rollout — directional departure before crew reaction.',
                '1009§sys-avi=total loss∧sys-sby=total loss': 'No attitude reference in IMC.',
                '1009§sys-avi=malfunction': 'Misleading attitude presented as valid — the defining catastrophic case.',
            },
        };

        // Interdependence — manual cells on top of the derived facts.
        const _cra = {};
        const RES_ELEC = resourcesData[0].internalId, RES_HYD = resourcesData[1].internalId;
        _cra['1007§' + RES_HYD + '·Total loss§sys-ldg'] = 'Normal braking lost; accumulator provides six applications (ASM-LDG-001).';
        _cra['1007§' + RES_HYD + '·Total loss§'] = 'Deceleration degrades to reverse + accumulator braking — remains above the MAC floor.';
        _cra['1007§' + RES_ELEC + '·Total loss§sys-ldg'] = 'Antiskid and brake-by-wire lost; direct accumulator mode retained.';
        _cra['1009§' + RES_ELEC + '·Partial loss§sys-avi'] = 'Display brownout with recovery; miscompare flag may drop during the transient.';
        _cra['1009§' + RES_ELEC + '·Partial loss§'] = 'Transient loss of comparison monitoring — standby indication unaffected (battery).';
        const interdep = {
            cells: {
                '1009§sys-eps': { state: 'asserted', by: 'J. Okafor', at: NOW,
                    note: 'Bus voltage transient can corrupt both ADC outputs before the comparator initializes (FC-EPS02).' },
                '1013§sys-ips': { state: 'cleared', by: 'J. Okafor', at: NOW },
            },
            cra: _cra,
        };

        // Independence-principle disposition — the deliberate CCF teaching case:
        // the as-built servo pair carries β=5% (shared installation environment),
        // which the ledger flags as contradicting a same-pair independence claim.
        const ipDispositions = {};
        ipDispositions[[String(vServoA.logicalId || vServoA.id), String(vServoB.logicalId || vServoB.id)].sort().join('∧')] = {
            by: 'R. Váldez', at: NOW, susceptible: 'yes — accepted',
            note: 'β=5% commonality is deliberately modeled (shared installation environment). Independence is claimed on the ALLOCATION gate only; the as-built pair carries the β contribution in the quantitative result. CMA-001 closed with the revised task cards.',
        };

        // ---- routing (wire/line runs through zones, carrying functions/items) --
        const routingData = [
            { internalId: 3201, routingId: 'RT-001', name: 'Brake hydraulic lines A/B', kind: 'HV', desc: 'Dual brake supply lines, wheel well to shuttle valve.', routesThroughZones: ['Z-MLGW'], carriesFunctions: ['SF-06'], carriesItems: ['LRU-LDG-01', 'LRU-LDG-02'] },
            { internalId: 3202, routingId: 'RT-002', name: 'Fuel feed gallery', kind: 'HV', desc: 'Tank outlets to engine feed split.', routesThroughZones: ['Z-CWG'], carriesFunctions: ['SF-11'], carriesItems: [] },
            { internalId: 3203, routingId: 'RT-003', name: 'Display data bus', kind: 'LV', desc: 'ADC/AHRS to PFD, dual-lane ARINC 429.', routesThroughZones: ['Z-NOSE'], carriesFunctions: ['SF-08', 'SF-09'], carriesItems: ['LRU-AVI-01', 'LRU-AVI-02', 'LRU-AVI-03'] },
            { internalId: 3204, routingId: 'RT-004', name: 'Left bleed duct', kind: 'HV', desc: 'Engine bleed to ice-protection manifold.', routesThroughZones: ['Z-NACL'], carriesFunctions: ['SF-10'], carriesItems: [] },
        ];

        // ---- declared system interfaces (lateral golden-thread edges) --------
        const _interfaces = [
            { fromSystemId: 'sys-avi', toSystemId: 'sys-fcs', kind: 'functional', direction: 'a_to_b', medium: 'Attitude/air data (ARINC 429)', icdRef: 'ICD-AVI-FCS-001' },
            { fromSystemId: 'sys-eps', toSystemId: 'sys-avi', kind: 'interface', direction: 'a_to_b', medium: '28 VDC essential bus', icdRef: 'ICD-EPS-AVI-002' },
            { fromSystemId: 'sys-fcs', toSystemId: 'sys-ldg', kind: 'functional', direction: 'bidirectional', medium: 'Weight-on-wheels / lift-dump interlock discretes', icdRef: 'ICD-FCS-LDG-003' },
        ];

        // ---- R&M program (Pro+ pages, all populated) --------------------------
        const _ram = {
            tasks: [
                { id: 'RAM-001', name: 'Replace brake shuttle valve', itemId: 'LRU-LDG-02', beRef: 'BE-5118', activeRepair: 1.5, logistics: 24, admin: 4, interval: 8000, demonstrated: null, by: '' },
                { id: 'RAM-002', name: 'FCC lane swap and retest', itemId: 'LRU-FCS-03', beRef: '', activeRepair: 2.5, logistics: 48, admin: 8, interval: null, demonstrated: 2.1, by: 'J. Okafor' },
                { id: 'RAM-003', name: 'Starter-generator brush inspection', itemId: 'LRU-EPS-01', beRef: '', activeRepair: 1.0, logistics: 12, admin: 2, interval: 1200, demonstrated: null, by: '' },
                { id: 'RAM-004', name: 'ADC-1 removal and bench check', itemId: 'LRU-AVI-02', beRef: '', activeRepair: 0.8, logistics: 36, admin: 4, interval: null, demonstrated: null, by: '' },
                { id: 'RAM-005', name: 'Standby module battery capacity check', itemId: 'LRU-SBY-01', beRef: '', activeRepair: 0.5, logistics: 6, admin: 1, interval: 2000, demonstrated: null, by: '' },
                { id: 'RAM-006', name: 'Starter-generator 2 brush inspection', itemId: 'LRU-EPS-02', beRef: '', activeRepair: 1.0, logistics: 12, admin: 2, interval: 1200, demonstrated: null, by: '' },
                { id: 'RAM-007', name: 'Bus tie contactor periodic transfer test', itemId: 'LRU-EPS-03', beRef: 'BE-5111', activeRepair: 0.3, logistics: 0, admin: 0.5, interval: 400, demonstrated: null, by: '' },
            ],
            field: [
                { id: 'FLD-001', beRef: 'BE-5118', hours: 600000, failures: 1 },
                { id: 'FLD-002', beRef: 'BE-5111', hours: 45000, failures: 0 },
                { id: 'FLD-003', beRef: 'BE-5106', observedMtbf: 900, hours: 0, failures: null },
            ],
            dispatch: {
                targets: [{ name: 'Dispatch reliability', target: 99.5 }],
                records: [
                    { month: '2026-03', cycles: 118, delays: 1, cancellations: 0 },
                    { month: '2026-04', cycles: 134, delays: 0, cancellations: 0 },
                    { month: '2026-05', cycles: 141, delays: 2, cancellations: 1 },
                    { month: '2026-06', cycles: 152, delays: 1, cancellations: 0 },
                ],
            },
        };
        const _relAnalytics = {
            lifeData: [{ id: 'LD-001', name: 'Brake shuttle valve — bench + field', failures: [95, 210, 320, 480, 620, 790], suspensions: [400, 700] }],
            growth: [{ id: 'GR-001', name: 'FCS integration rig — reliability growth', times: [40, 110, 260, 500, 900, 1400, 2100, 3000], T: 3500 }],
            alloc: null, spares: [], demo: null,
        };
        const _rbdMc = { cases: [{ id: 'MC-BRK-001', name: 'Brake accumulator standby — landing phase', phases: [{ name: 'landing', duration: 0.2, model: { type: 'standby', lambda: 5e-4, units: 2, switchP: 0.98, warmK: 0 } }], n: 100000, seed: 42, result: null }] };
        const _swrel = { cscis: [{ id: 'SW-001', name: 'Flight control computer OFP', times: [10, 28, 45, 70, 95, 130, 175, 230, 300, 390, 500, 640], T: 700 }] };
        const _sneak = { dispositions: { 'SNK-RF-RES-04': { verdict: 'examined', by: 'J. Okafor', note: 'Check valves verified on both bleed sources; drawings B-36-102 rev C.', at: NOW } } };
        const _msg3x = {
            ssis: [
                { id: 'SSI-001', name: 'Wing front spar lower cap, WS 40-180', material: 'metallic', ad: 'medium', ed: 'medium', fd: 'damage-tolerant', tasks: [] },
                { id: 'SSI-002', name: 'Composite winglet attachment fitting', material: 'composite', ad: 'high', ed: 'n/a', fd: 'n/a', tasks: [] },
            ],
            zonesDone: {},
            lhirf: [
                { id: 'LH-001', name: 'Elevator servo harness overbraid + backshell bonding', deg: 'vibration/chafing', protects: 'SF-01', interval: 6000, method: 'DET', accepted: { by: 'M. Chen', note: 'Chafe-margin analysis LH-K350-014; interval consistent with fleet-leader inspections.', at: NOW } },
                { id: 'LH-002', name: 'Radome lightning diverter strips + mesh', deg: 'aging', protects: 'SF-08', interval: 4000, method: 'GVI', accepted: null },
            ],
        };
        const _lcc = {
            params: { years: 20, discount: 0.05, laborRate: 120, downtimeRate: 2500, turnaroundDays: 30 },
            items: [
                { id: 'LCC-001', name: 'Brake shuttle valve (NSWC-11 mechanical)', lambda: 5e-6, mttr: 1.5, mdt: 29.5, acquisition: 18000, unitCost: 9500, materialCost: 2200 },
                { id: 'LCC-002', name: 'Flight control computer', lambda: 2e-5, mttr: 2.5, mdt: 58.5, acquisition: 240000, unitCost: 120000, materialCost: 15000 },
            ],
        };
        const _relFw = {
            entries: [{ id: 'FW-001', kind: 'duty', name: 'Standby battery heater (duty-composed)', lambdaOp: 8e-6, duty: 0.15, kNonop: 0.03 }],
            accel: [{ id: 'AC-001', name: 'FCC thermal accelerated life test', ea: 0.7, tUse: 40, tTest: 85, fieldHours: 100000 }],
        };
        const _ramSettings = { annualFH: 600, fleet: 6, confidence: 0.6, dutyDefault: 1, kNonopDefault: 0.03 };
        // thread-link bindings: the four PRA rows bound to system ids (keys use
        // the LIVE internalIds so the bindings survive regeneration)
        const _threadLinks = {};
        _threadLinks['pra:' + praData[0].internalId] = { systemIds: ['sys-prl', 'sys-fue', 'sys-hyd'] };
        _threadLinks['pra:' + praData[1].internalId] = { systemIds: ['sys-avi', 'sys-fcs'] };
        _threadLinks['pra:' + praData[2].internalId] = { systemIds: ['sys-avi', 'sys-eps', 'sys-fue'] };
        _threadLinks['pra:' + praData[3].internalId] = { systemIds: ['sys-ldg', 'sys-hyd'] };
        _threadLinks['lcc:LCC-001'] = { itemId: 'LRU-LDG-02', by: 'bound', at: NOW };
        _threadLinks['lcc:LCC-002'] = { itemId: 'LRU-FCS-03', by: 'bound', at: NOW };
        _threadLinks['swrel:SW-001'] = { itemId: 'LRU-FCS-03', by: 'bound', at: NOW };
        // problem reports: the loop from finding to disposition, one of each
        const _problemReports = [
            { id: 'PR-001', title: 'Bus tie contactor chatter during generator transfer', description: 'Ground test S/N 001: contactor chatter observed during channel transfer under 80% load.', safetyRelated: true, source: 'Ground test GT-EPS-007', linked: 'BE-5111', state: 'closed', raisedBy: 'J. Okafor', raisedAt: '2026-05-14T10:00:00.000Z', deferral: null, disposition: 'Contactor dwell timing revised (ECN-0142); retest clean over 40 transfer cycles.', history: [ { state: 'open', by: 'J. Okafor', at: '2026-05-14T10:00:00.000Z', note: 'raised' }, { state: 'analyzed', by: 'M. Chen', at: '2026-05-20T09:00:00.000Z', note: 'root cause: dwell timing' }, { state: 'corrective-action', by: 'M. Chen', at: '2026-05-28T09:00:00.000Z', note: 'ECN-0142' }, { state: 'verified', by: 'J. Okafor', at: '2026-06-10T09:00:00.000Z', note: 'retest clean' }, { state: 'closed', by: 'R. Váldez', at: '2026-06-12T09:00:00.000Z', note: 'closed with evidence' } ] },
            { id: 'PR-002', title: 'Trim channel dormant-fault detection gap at cold soak', description: 'Standby trim monitor start-up self-test can miss a dormant fault below -40C; detection restored after warm-up.', safetyRelated: true, source: 'Qualification Q-TRM-009', linked: 'BE-5106', state: 'deferred', raisedBy: 'M. Chen', raisedAt: '2026-06-18T10:00:00.000Z', deferral: { by: 'R. Váldez', at: '2026-06-25T09:00:00.000Z', until: '2026-09-30', rationale: 'Cold-soak exposure bounded by the 600 FH dormancy inspection (CCMR); monitor firmware fix scheduled with the B2 software drop.' }, disposition: '', history: [ { state: 'open', by: 'M. Chen', at: '2026-06-18T10:00:00.000Z', note: 'raised' }, { state: 'deferred', by: 'R. Váldez', at: '2026-06-25T09:00:00.000Z', note: 'signed deferral to B2 drop' } ] },
        ];
        // requirement validation attestations (P4) + App A attestations (P3)
        const _reqVal = {
            '1101': { by: 'M. Chen', at: NOW, independent: true },
            '1104': { by: 'M. Chen', at: NOW, independent: true },
        };
        const _appA = { attests: {
            'O-2.2': { by: 'R. Váldez', note: 'Program plan §3 — SPP intake record.', at: NOW },
            'O-5.1': { by: 'M. Chen', note: 'Validation matrix, aircraft set.', at: NOW },
        } };

        const projectConfig = {
            regulation: 'part-23', part23Class: 'III', missionDuration: 1.5, override: false,
            piQ: 1, piE: 1, markovModels: [],
            libraryStandard: 'MIL-HDBK-217F', libraryEnv: 'AIC', libraryQuality: 'B2',
            useStressPrediction: false, operatingTempC: 25, activationEnergyEv: 0.4,
            customLibrary: {
                'K350-BRK-VLV': { name: 'Brake shuttle valve (NSWC-11 mechanical)', lambda: 5e-6, group: 'NSWC-11 Mechanical', source: 'NSWC-11', category: 'valve' },
            },
            aiSettings: { anthropicModel: 'claude-fable-5', voyageModel: 'voyage-3-large', maxTokens: 4096, costCap: 40, topK: 5 },
            macModels, coffe, interdep, ipDispositions,
            interfaces: _interfaces,
            ram: _ram, relAnalytics: _relAnalytics, rbdMc: _rbdMc, swrel: _swrel,
            sneak: _sneak, msg3x: _msg3x, lcc: _lcc, relFw: _relFw, ramSettings: _ramSettings,
            mxAnalytics: { annualFH: 600, lora: [] },
            threadLinks: _threadLinks, problemReports: _problemReports,
            reqVal: _reqVal, appA: _appA,
            ckptAttest: {
                'AFHA:cmp': { by: 'R. Váldez', at: NOW }, 'AFHA:sub': { by: 'R. Váldez', at: NOW },
                'PASA:cerr': { by: 'M. Chen', at: NOW }, 'PASA:crew': { by: 'R. Váldez', at: NOW },
                'SFHA:cmp': { by: 'J. Okafor', at: NOW }, 'PSSA:acc': { by: 'J. Okafor', at: NOW },
                'PRA:thr': { by: 'J. Okafor', at: NOW }, 'CMA:tlr': { by: 'M. Chen', at: NOW },
            },
            ckptTailored: {
                'ZSA:ins': { rationale: 'Physical zonal inspection deferred to the conforming prototype (S/N 002); a desktop zonal review was completed on the digital mock-up and is recorded as ZSA rev B.', by: 'R. Váldez', at: NOW },
            },
            safetyProgramPlan: {
                slots: { combinedEffects: 2, aircraftTrees: 2, quantification: 0, independence: 0 },
                notes: 'MAC-first program: floors compiled to MF&MS trees, CoFFE retained for the malfunction residue.',
                intake: { at: NOW, basis: 'FAA 14 CFR Part 23 / AC 23.1309-1E (Class III)', route: 'sample' },
            },
            aiProvenance: [
                { at: '2026-06-28T14:02:11.000Z', kind: 'call', feature: 'arch.decompose', model: 'claude-fable-5', ok: true, ms: 21408, promptHash: '7d41c09a' },
                { at: '2026-06-28T14:06:40.000Z', kind: 'lint-override', feature: 'arch.decompose', group: 'Store and deliver fuel', flags: 1 },
                { at: '2026-06-30T09:31:05.000Z', kind: 'draft', feature: 'report.section.draft', reportType: 'PASA', section: 'Architectural Considerations', model: 'claude-fable-5', promptHash: 'a3f01b22', inputFp: '5c77e010', flags: 0 },
                { at: '2026-06-30T09:34:52.000Z', kind: 'accept', key: 'PASA:sec-3', heading: 'Architectural Considerations', model: 'claude-fable-5', promptHash: 'a3f01b22', inputFp: '5c77e010', flags: 0, by: 'R. Váldez' },
            ],
            aiDrafts: {
                'PASA:sec-3': { state: 'accepted', heading: 'Architectural Considerations', model: 'claude-fable-5', promptHash: 'a3f01b22', inputFp: '5c77e010', flags: 0, by: 'R. Váldez', at: '2026-06-30T09:31:05.000Z', stateAt: '2026-06-30T09:34:52.000Z' },
            },
        };

        // ---- sign-offs: approve the reviewed baseline ---------------------------
        const reviewApprovalsData = [];
        const approve = (kind, iid, systemId, who, daysAgo) => reviewApprovalsData.push({
            kind, id: iid, systemId: systemId || null, approvedBy: who,
            approvedAt: T0 + (12 - (daysAgo || 0)) * 86400000, note: '',
        });
        acFhaData.forEach(f => { if (f.internalId !== 1014 && f.internalId !== 1015) approve('acFha', f.internalId, null, 'R. Váldez', 10); });
        acReqData.forEach(r => { if (r.verifStatus === 'Passed') approve('acReq', r.internalId, null, 'M. Chen', 6); });
        systemsData.forEach(s => {
            (s.fha || []).forEach(f => approve('sysFha', f.internalId, s.id, 'J. Okafor', 8));
            (s.req || []).forEach(r => { if (r.verifStatus === 'Passed') approve('sysReq', r.internalId, s.id, 'M. Chen', 5); });
        });
        pages.forEach(p => { if (p.id !== 'pg-mfms-auth-fc07') approve('ftaPage', p.id, p.systemId || null, 'R. Váldez', 4); });
        praData.forEach(r => approve('pra', r.internalId, null, 'J. Okafor', 7));
        zsaData.forEach(r => approve('zsa', r.internalId, null, 'J. Okafor', 7));
        cmaData.forEach(r => { if (r.status !== 'Open') approve('cma', r.internalId, null, 'M. Chen', 3); });
        fmeaData.forEach(r => { if (r.detection) approve('fmea', r.internalId, r.owningSystemId, 'J. Okafor', 2); });

        return {
            projectName: 'K350 Kestrel · Program Showcase',
            acFunctionsData, acFcimData, acExtractedFCs: [],
            acFhaData, acReqData, acAssumptionsData, acAsmCounter: 7,
            systemsData, activeSystemId: null,
            praData, zsaData, cmaData, routingData,
            resourcesData, fmeaData, fmeaCounter: fmeaData.length + 1, itemsData,
            flightPhasesData,
            ftaPages: pages, activeFTAPageId: 'pg-ac-fc07',
            internalIdCounter: _nid + 500,
            typeCounters: { gate: 1, basic: 1, undeveloped: 1, conditioning: 1, house: 1 },
            ftaConfig: { mode: 'top-down', apportion: 'equal', targetP: 1e-5, linkedFhaId: '', exposureTime: 1.5, exposureSource: 'manual' },
            projectConfig,
            reviewApprovalsData, reviewCommentsData: [], reviewCounter: 1,
        };
    }

    // postLoad — run the real engines over the loaded model: compile the MAC
    // rules into equivalence-proven MF&MS trees, then graft the signed
    // malfunction case. Nothing here is precomputed content; it is the live
    // machinery exercising the showcase.
    function postLoad() {
        try { if (typeof macCompileAll === 'function') macCompileAll(); } catch (_) {}
        try { if (typeof coffeGraft === 'function') coffeGraft('1007', 'sys-prl=malfunction'); } catch (_) {}
        try { if (typeof calculateAllProbabilities === 'function') calculateAllProbabilities(); } catch (_) {}
        // ---- R&M: the deterministic derivation engines run over the model ----
        // (nothing precomputed — the F9 sweep, MMEL analyzer and Monte Carlo run
        // live, exactly as they would on a customer project)
        try { if (typeof deriveMaintTasks === 'function') deriveMaintTasks(true); } catch (_) {}
        try { if (typeof deriveSpares === 'function') deriveSpares(true); } catch (_) {}
        try { if (typeof deriveAlloc === 'function') deriveAlloc(true); } catch (_) {}
        try { if (typeof deriveRbdAll === 'function') deriveRbdAll(true); } catch (_) {}
        try { if (typeof deriveMsg3 === 'function') deriveMsg3(true); } catch (_) {}
        try { if (typeof mmelDerive === 'function') mmelDerive(true); } catch (_) {}
        try { if (typeof window !== 'undefined' && typeof window.rbdMcRun === 'function') window.rbdMcRun('MC-BRK-001'); } catch (_) {}
        // zonal pushes fire user-facing alerts — silence them for the load
        try {
            if (typeof window !== 'undefined' && typeof window.msg3xPushZone === 'function') {
                const _alert = window.alert;
                window.alert = function () {};
                try { window.msg3xPushZone('Z-MLGW'); window.msg3xPushZone('Z-NACL'); }
                finally { window.alert = _alert; }
            }
        } catch (_) {}
        // ---- M3/MC-03: reject the non-eligible derived MMEL candidate ------
        // P7 derives MMEL candidates from ledger-linked LRUs; the BDD residual
        // proof (MC-03) shows the brake shuttle valve is a SERIES SINGLE POINT
        // on the as-built tree — dispatching it inoperative reaches the
        // Hazardous braking loss alone, so dispatch relief is not MMEL-
        // eligible. The engineer rejects that candidate; the bus-tie item
        // (residual protection ≥ 1) remains. This is the P7-vs-MC-03
        // disagreement story told honestly in the seed.
        try {
            const mm = projectConfig.mmel && projectConfig.mmel.items;
            if (mm) for (let i = mm.length - 1; i >= 0; i--) if (mm[i] && mm[i].beRef === 'BE-5118') mm.splice(i, 1);
        } catch (_) {}

        // ---- M7: zonal single-event disposition ---------------------------
        // The spatial join proves a single zonal event in Z-CWG (fuel feed
        // gallery) cascades to both powerplants → FC-05 [Catastrophic]. That
        // is the rotor-burst vulnerability the PRA already carries with its
        // retention requirement — sign the acceptance so the finding and its
        // basis tell one story.
        try {
            if (typeof window.fsZonalFindings === 'function' && typeof window._fsZonalAccept === 'function') {
                window.fsZonalFindings().forEach(zf => {
                    if (zf.state !== 'open') return;
                    if (zf.zone === 'Z-CWG' && zf.fcId === 'FC-05')
                        window._fsZonalAccept(zf.key, 'R. Váldez', 'Rotor-burst threat into Z-CWG is carried in the PRA with its retention requirement; feed-gallery shielding and separation per RT-002 installation provisions. Residual risk accepted and tracked in the PRA row.');
                });
            }
        } catch (_) {}

        // ---- M3: single-failure dispositions for the known K350 singles ----
        // The BDD property check (MC-01) names every single-failure path to a
        // Cat top. The K350 carries four DELIBERATE singles, each with a real
        // engineering basis outside the fail-safe redundancy argument — seed
        // their signed acceptances so the showcase models the discipline, not
        // an unexplained green. Name-keyed (robust to id shifts).
        try {
            if (typeof window !== 'undefined' && typeof window.mcSpfList === 'function' && typeof window._mcAccept === 'function') {
                const KNOWN = [
                    [/structural path failure/i, 'R. Váldez', 'Structural single-load-path; substantiated by damage-tolerance evaluation (14 CFR 23.573 track), outside the 1309 fail-safe redundancy argument.'],
                    [/vent icing/i, 'R. Váldez', 'Common vent icing bounded by vent geometry and ice-protection coverage; carried as modeled common cause with a 1E-7 budget, CMA coverage recorded.'],
                    [/air-data source error/i, 'J. Okafor', 'Common-source air-data error carried as modeled CCF at 1E-9 with dissimilar standby pitot-static; disposition recorded in the CMA.'],
                    [/fuel exhaustion/i, 'R. Váldez', 'Planning-error exhaustion is an operational condition outside the system fail-safe argument; bounded by fuel-quantity indication and low-fuel alerting.'],
                    [/position sensing lost/i, 'R. Váldez', 'Allocation-level abstraction: the as-built pairing with the standby pitch-trim channel (dormant-monitored) is modeled on the SSA verification tree, which carries the pair within the allocated budget.'],
                    [/fails to detect erroneous source/i, 'J. Okafor', 'Monitor-coverage single at system level; the aircraft-level fail-safe — independent standby indication with crew cross-check — is modeled in PASA FC-09. Coverage substantiated by ADC miscompare qualification.'],
                    [/corrupts attitude symbology/i, 'J. Okafor', 'Undetected-corruption single at system level; protected at aircraft level by the dissimilar standby display path (PASA FC-09) and symbol-monitor qualification evidence.'],
                ];
                window.mcSpfList().forEach(s => {
                    if (s.state === 'accepted') return;
                    const k = KNOWN.find(([re]) => re.test(s.name));
                    if (k) window._mcAccept(s.key, k[1], k[2]);
                });
            }
        } catch (_) {}
        // ---- M1 phase 2: model-generated FMEA, signed --------------------
        // The L3 lanes on mac-sf01/sf06/sf08 generate functional-FMEA rows
        // (loss via clause arithmetic, erroneous/inadvertent via lane reach).
        // The demo engineer signs the apply — same two-lane discipline as
        // every other acceptance in the seed. Idempotent by sourceId.
        try {
            if (typeof window.l3FmeaApply === 'function') window.l3FmeaApply(null, 'J. Okafor');
        } catch (_) {}
        try { if (typeof updateDashboard === 'function') updateDashboard(); } catch (_) {}
        try { if (typeof updateD3 === 'function') updateD3(); } catch (_) {}
    }

    // ---- demo flourish: the AutoReq drumroll ------------------------------
    // Showcase project only. AutoReq is THE hook — deterministic requirement
    // authoring with no AI — so the reveal gets a beat. Real projects never
    // see this: the wrapper checks the project name on every call.
    (function drumroll() {
        if (typeof window === 'undefined') return;
        const install = () => {
            if (typeof window.autoReqPreview !== 'function' || window.autoReqPreview._drumWrapped) return;
            const orig = window.autoReqPreview;
            const wrapped = function () {
                const isShowcase = typeof projectName !== 'undefined' && /Showcase/i.test(projectName || '');
                if (!isShowcase) return orig.apply(this, arguments);
                // the beat
                const ov = document.createElement('div');
                ov.id = 'sl-drumroll';
                ov.style.cssText = 'position:fixed; inset:0; z-index:9500; display:flex; align-items:center; justify-content:center; background:var(--color-overlay, rgba(250,247,240,0.9)); backdrop-filter:blur(2px);';
                ov.innerHTML = '<div style="text-align:center; font-family:var(--font-mono);">' +
                    '<div style="font-size:44px; animation:sl-drum 0.28s ease-in-out infinite alternate;">🥁</div>' +
                    '<div style="font-size:14px; font-weight:700; margin-top:10px; color:var(--color-text-primary);">Deriving requirements from the model\u2019s own logic\u2026</div>' +
                    '<div style="font-size:11.5px; margin-top:4px; color:var(--color-text-tertiary);">No AI. No prompt. No hallucination surface \u2014 every word traceable to a rule.</div></div>' +
                    '<style>@keyframes sl-drum { from { transform: rotate(-8deg) scale(1); } to { transform: rotate(8deg) scale(1.15); } }</style>';
                document.body.appendChild(ov);
                const args = arguments, self = this;
                setTimeout(() => {
                    let r;
                    try { r = orig.apply(self, args); } finally { try { ov.remove(); } catch (_) {} }
                    // the reveal
                    try {
                        const m = window._autoReqPendingMerge;
                        const n = m && m.isNew ? m.isNew.length : null;
                        if (n != null && typeof showToast === 'function')
                            showToast('\uD83E\uDD41 ' + n + ' requirement candidates \u2014 derived deterministically from classifications, trees and independence claims. Zero AI involved.', 'success', 6000);
                    } catch (_) {}
                    return r;
                }, 1100);
            };
            wrapped._drumWrapped = true;
            window.autoReqPreview = wrapped;
        };
        // the monolith defines autoReqPreview before this module loads
        install();
        if (typeof window.autoReqPreview !== 'function') window.addEventListener('load', install);
    })();

    if (typeof window !== 'undefined') window.SL_SHOWCASE = { build, postLoad };
})();
