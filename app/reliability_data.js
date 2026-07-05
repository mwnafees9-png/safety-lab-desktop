// reliability_data.js — MIL-HDBK / NUREG / NASA component reliability data
// (COMPONENT_LIBRARY, FAILURE_MODE_DISTRIBUTIONS, STANDARD_ENVIRONMENTS, STANDARD_QUALITIES),
// extracted verbatim from safety_lab.js (Phase 76). Pure data, classic script, loaded FIRST
// so every bare-name reference resolves in the shared lexical scope. Byte-identical.

const COMPONENT_LIBRARY = {
    // ============ MIL-HDBK-217F Notice 2 — Microcircuits (§5) ============
    'mil217_ic_linear':         { name: 'IC — Linear (op-amp, comparator)',          lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_dig_bipolar':    { name: 'IC — Digital bipolar (logic, μP)',          lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_dig_mos':        { name: 'IC — Digital MOS (logic, μP)',              lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_mem_bipolar':    { name: 'IC — Memory bipolar (RAM / ROM)',           lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_mem_mos':        { name: 'IC — Memory MOS (RAM / ROM / Flash)',       lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_microprocessor':    { name: 'IC — Microprocessor (8-32 bit)',             lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_microprocessor_64': { name: 'IC — Microprocessor (64-bit, FPU)',          lambda: 5.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_gaas_mmic':         { name: 'IC — GaAs MMIC',                              lambda: 5.0e-6, source: 'MIL-HDBK-217F N2 §5.4', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_vhsic':          { name: 'IC — VHSIC / VLSI (>10k gates)',              lambda: 3.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_pal':            { name: 'IC — PAL / PLA / GAL',                         lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_fpga':           { name: 'IC — FPGA (SRAM-based)',                       lambda: 1.5e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_adc':            { name: 'IC — ADC / DAC',                                lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_voltage_reg':    { name: 'IC — Voltage regulator (linear / switching)',   lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_hybrid':            { name: 'IC — Hybrid microcircuit',                     lambda: 5.0e-6, source: 'MIL-HDBK-217F N2 §5.5', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },

    // ============ MIL-HDBK-217F — Discrete Semiconductors (§6) ============
    'mil217_tx_si_npn':         { name: 'Transistor — Si NPN bipolar (low power)',    lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_tx_si_pnp':         { name: 'Transistor — Si PNP bipolar (low power)',    lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_tx_pwr':            { name: 'Transistor — Si power BJT',                   lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_tx_rf':             { name: 'Transistor — RF (Si / GaAs)',                  lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_mosfet':            { name: 'Transistor — MOSFET (signal)',                 lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §6.3', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_mosfet_pwr':        { name: 'Transistor — MOSFET (power)',                  lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §6.3', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_igbt':              { name: 'Transistor — IGBT',                            lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §6.3', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_gp':          { name: 'Diode — general purpose Si',                 lambda: 3.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_zener':       { name: 'Diode — Zener / voltage reference',           lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_schottky':    { name: 'Diode — Schottky',                            lambda: 3.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_rectifier':   { name: 'Diode — rectifier (power)',                   lambda: 6.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_tvs':         { name: 'Diode — TVS (transient suppression)',         lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_scr_triac':         { name: 'Thyristor / Triac / SCR',                     lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §6.2', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_optocoupler':       { name: 'Optocoupler',                                  lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_led':               { name: 'LED (indicator)',                              lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §6.4', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_laser_diode':       { name: 'Laser diode',                                  lambda: 2.0e-5, source: 'MIL-HDBK-217F N2 §6.5', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },

    // ============ MIL-HDBK-217F — Resistors (§9) ============
    'mil217_res_film':          { name: 'Resistor — film, fixed (RNR/RNC)',           lambda: 5.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_carbon_comp':   { name: 'Resistor — carbon composition (RCR)',        lambda: 1.9e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_carbon_film':   { name: 'Resistor — carbon film',                     lambda: 4.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_metal_film':    { name: 'Resistor — metal film (RNR)',                lambda: 5.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_wirewound':     { name: 'Resistor — wirewound, fixed',                lambda: 2.0e-8, source: 'MIL-HDBK-217F N2 §9.2', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_wirewound_pwr': { name: 'Resistor — wirewound, power (chassis-mt)',   lambda: 8.0e-8, source: 'MIL-HDBK-217F N2 §9.3', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_network':       { name: 'Resistor — network / array (SIP/DIP)',       lambda: 1.0e-8, source: 'MIL-HDBK-217F N2 §9.4', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_var_wirewound': { name: 'Resistor — variable wirewound (precision)',  lambda: 7.0e-7, source: 'MIL-HDBK-217F N2 §9.5', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_var_nonwound':  { name: 'Resistor — variable non-wirewound (pot)',    lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §9.6', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_thermistor':        { name: 'Thermistor (NTC/PTC)',                       lambda: 9.0e-9, source: 'MIL-HDBK-217F N2 §9.7', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },

    // ============ MIL-HDBK-217F — Capacitors (§10) ============
    'mil217_cap_paper':         { name: 'Capacitor — paper / oil-impregnated',        lambda: 2.0e-8, source: 'MIL-HDBK-217F N2 §10.1', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_film':          { name: 'Capacitor — plastic film',                   lambda: 2.0e-8, source: 'MIL-HDBK-217F N2 §10.2', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_ceramic':       { name: 'Capacitor — ceramic, fixed (Class I)',       lambda: 5.0e-9, source: 'MIL-HDBK-217F N2 §10.3', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_ceramic_chip':  { name: 'Capacitor — ceramic chip (MLCC)',            lambda: 3.0e-9, source: 'MIL-HDBK-217F N2 §10.3', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_tantalum':      { name: 'Capacitor — tantalum solid',                  lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §10.4', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_tantalum_wet':  { name: 'Capacitor — tantalum wet-slug',               lambda: 9.0e-8, source: 'MIL-HDBK-217F N2 §10.4', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_alum':          { name: 'Capacitor — aluminum electrolytic',          lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §10.5', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_glass':         { name: 'Capacitor — glass',                           lambda: 1.5e-8, source: 'MIL-HDBK-217F N2 §10.6', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_mica':          { name: 'Capacitor — mica',                            lambda: 1.0e-8, source: 'MIL-HDBK-217F N2 §10.6', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_var':           { name: 'Capacitor — variable / trimmer',              lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §10.7', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },

    // ============ MIL-HDBK-217F — Inductors / Transformers (§11) ============
    'mil217_inductor_rf':       { name: 'Inductor — RF coil',                          lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §11.1', group: 'MIL-HDBK-217F — Magnetics', category: 'Magnetic' },
    'mil217_inductor_pulse':    { name: 'Inductor — pulse',                            lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §11.1', group: 'MIL-HDBK-217F — Magnetics', category: 'Magnetic' },
    'mil217_xfmr_audio':        { name: 'Transformer — audio / line',                 lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §11.1', group: 'MIL-HDBK-217F — Magnetics', category: 'Magnetic' },
    'mil217_xfmr_pwr':          { name: 'Transformer — power',                         lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §11.1', group: 'MIL-HDBK-217F — Magnetics', category: 'Magnetic' },
    'mil217_xfmr_rf':           { name: 'Transformer — RF',                            lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §11.1', group: 'MIL-HDBK-217F — Magnetics', category: 'Magnetic' },

    // ============ MIL-HDBK-217F — Electromechanical (§12-15) ============
    'mil217_motor_dc':          { name: 'Motor — DC',                                  lambda: 1.0e-5, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_motor_ac':          { name: 'Motor — AC induction',                        lambda: 7.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_motor_stepper':     { name: 'Motor — stepper',                             lambda: 8.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_motor_brushless':   { name: 'Motor — brushless DC',                        lambda: 6.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_relay_mech':        { name: 'Relay — mechanical contact',                  lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §13.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Relay' },
    'mil217_relay_ss':          { name: 'Relay — solid state',                          lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §13.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Relay' },
    'mil217_relay_reed':        { name: 'Relay — reed (dry contact)',                  lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §13.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Relay' },
    'mil217_relay_contactor':   { name: 'Relay — contactor (high current)',            lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §13.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Relay' },
    'mil217_switch_toggle':     { name: 'Switch — toggle / pushbutton',                lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §14.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Switch' },
    'mil217_switch_rotary':     { name: 'Switch — rotary',                              lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §14.4', group: 'MIL-HDBK-217F — Electromechanical', category: 'Switch' },
    'mil217_switch_thermal':    { name: 'Switch — thermal / thermostat',               lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §14.2', group: 'MIL-HDBK-217F — Electromechanical', category: 'Switch' },
    'mil217_switch_keyboard':   { name: 'Switch — keyboard (per key)',                 lambda: 4.0e-8, source: 'MIL-HDBK-217F N2 §14.5', group: 'MIL-HDBK-217F — Electromechanical', category: 'Switch' },
    'mil217_conn_pcb':          { name: 'Connector — PCB edge',                         lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Electromechanical', category: 'Connector' },
    'mil217_conn_circ':         { name: 'Connector — circular (MIL-DTL-38999)',        lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Connector' },
    'mil217_conn_rectangular':  { name: 'Connector — rectangular (rack & panel)',      lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Connector' },
    'mil217_conn_rf':           { name: 'Connector — RF / coaxial (BNC/SMA)',          lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Connector' },
    'mil217_conn_ic_socket':    { name: 'Connector — IC socket',                       lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §15.3', group: 'MIL-HDBK-217F — Electromechanical', category: 'Connector' },
    'mil217_solder':            { name: 'Solder joint (per termination)',              lambda: 1.0e-8, source: 'MIL-HDBK-217F N2 §16.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Interconnect' },
    'mil217_pwb':               { name: 'Printed wiring board (PWB)',                  lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §17.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Interconnect' },
    'mil217_crystal':           { name: 'Quartz crystal',                                lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §18.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Other' },
    'mil217_filter_emi':        { name: 'Filter — EMI / line',                          lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §19.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Other' },
    'mil217_lamp':              { name: 'Lamp — incandescent indicator',                lambda: 1.5e-6, source: 'MIL-HDBK-217F N2 §20.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Other' },
    'mil217_fuse':              { name: 'Fuse',                                           lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §21.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Other' },
    'mil217_meter':             { name: 'Meter — analog panel',                          lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §22.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Other' },


    'nswc_bearing_ball':        { name: 'Bearing — ball, deep groove (NSWC-11)',        lambda: 8.0e-7, source: 'NSWC-11 §3',           group: 'NSWC-11 — Mechanical', category: 'Bearing' },
    'nswc_bearing_roller':      { name: 'Bearing — roller (NSWC-11)',                   lambda: 1.0e-6, source: 'NSWC-11 §3',           group: 'NSWC-11 — Mechanical', category: 'Bearing' },
    'nswc_bearing_thrust':      { name: 'Bearing — thrust (NSWC-11)',                   lambda: 1.5e-6, source: 'NSWC-11 §3',           group: 'NSWC-11 — Mechanical', category: 'Bearing' },
    'nswc_bearing_sleeve':      { name: 'Bearing — sleeve / plain (NSWC-11)',           lambda: 6.0e-7, source: 'NSWC-11 §3',           group: 'NSWC-11 — Mechanical', category: 'Bearing' },
    'nswc_spring_comp':         { name: 'Spring — compression / helical (NSWC-11)',     lambda: 1.0e-7, source: 'NSWC-11 §4',           group: 'NSWC-11 — Mechanical', category: 'Spring' },
    'nswc_spring_torsion':      { name: 'Spring — torsion (NSWC-11)',                   lambda: 1.5e-7, source: 'NSWC-11 §4',           group: 'NSWC-11 — Mechanical', category: 'Spring' },
    'nswc_spring_belleville':   { name: 'Spring — Belleville / disc (NSWC-11)',         lambda: 2.0e-7, source: 'NSWC-11 §4',           group: 'NSWC-11 — Mechanical', category: 'Spring' },
    'nswc_seal_static':         { name: 'Seal — static O-ring (NSWC-11)',               lambda: 3.0e-7, source: 'NSWC-11 §5',           group: 'NSWC-11 — Mechanical', category: 'Seal' },
    'nswc_seal_dynamic':        { name: 'Seal — dynamic (NSWC-11)',                     lambda: 1.5e-6, source: 'NSWC-11 §5',           group: 'NSWC-11 — Mechanical', category: 'Seal' },
    'nswc_seal_gasket':         { name: 'Seal — gasket (NSWC-11)',                      lambda: 4.0e-7, source: 'NSWC-11 §5',           group: 'NSWC-11 — Mechanical', category: 'Seal' },
    'nswc_pump_centrifugal':    { name: 'Pump — centrifugal (NSWC-11)',                 lambda: 1.5e-5, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_pump_piston':         { name: 'Pump — piston / axial (NSWC-11)',              lambda: 2.0e-5, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_pump_gear':           { name: 'Pump — gear / vane (NSWC-11)',                 lambda: 1.0e-5, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_valve_solenoid':      { name: 'Valve — solenoid (NSWC-11)',                   lambda: 4.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_check':         { name: 'Valve — check (NSWC-11)',                      lambda: 1.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_relief':        { name: 'Valve — relief / pressure (NSWC-11)',          lambda: 3.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_servo':         { name: 'Valve — hydraulic servo (NSWC-11)',            lambda: 7.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_actuator_linear_hyd': { name: 'Actuator — linear hydraulic (NSWC-11)',        lambda: 1.0e-5, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_actuator_rotary_hyd': { name: 'Actuator — rotary hydraulic (NSWC-11)',        lambda: 1.2e-5, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_actuator_em':         { name: 'Actuator — electromechanical (NSWC-11)',       lambda: 7.0e-6, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_actuator_pneumatic':  { name: 'Actuator — pneumatic (NSWC-11)',               lambda: 5.0e-6, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_gear':                { name: 'Gear — spur / helical (NSWC-11)',              lambda: 2.0e-7, source: 'NSWC-11 §9',           group: 'NSWC-11 — Mechanical', category: 'Gear' },
    'nswc_gear_bevel':          { name: 'Gear — bevel / worm (NSWC-11)',                lambda: 3.0e-7, source: 'NSWC-11 §9',           group: 'NSWC-11 — Mechanical', category: 'Gear' },
    'nswc_belt_drive':          { name: 'Belt drive (NSWC-11)',                          lambda: 5.0e-7, source: 'NSWC-11 §10',          group: 'NSWC-11 — Mechanical', category: 'Drive' },
    'nswc_chain_drive':         { name: 'Chain drive (NSWC-11)',                         lambda: 8.0e-7, source: 'NSWC-11 §10',          group: 'NSWC-11 — Mechanical', category: 'Drive' },
    'nswc_clutch_friction':     { name: 'Clutch — friction disc (NSWC-11)',             lambda: 4.0e-6, source: 'NSWC-11 §11',          group: 'NSWC-11 — Mechanical', category: 'Drive' },
    'nswc_clutch_electromag':   { name: 'Clutch — electromagnetic (NSWC-11)',           lambda: 5.0e-6, source: 'NSWC-11 §11',          group: 'NSWC-11 — Mechanical', category: 'Drive' },
    'nswc_brake_disc':          { name: 'Brake — disc (NSWC-11)',                       lambda: 3.0e-6, source: 'NSWC-11 §12',          group: 'NSWC-11 — Mechanical', category: 'Brake' },
    'nswc_brake_drum':          { name: 'Brake — drum (NSWC-11)',                       lambda: 3.5e-6, source: 'NSWC-11 §12',          group: 'NSWC-11 — Mechanical', category: 'Brake' },
    'nswc_compressor':          { name: 'Compressor — reciprocating (NSWC-11)',         lambda: 2.5e-5, source: 'NSWC-11 §13',          group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_filter_hydraulic':    { name: 'Filter — hydraulic (NSWC-11)',                 lambda: 1.5e-6, source: 'NSWC-11 §14',          group: 'NSWC-11 — Mechanical', category: 'Filter' },
    'nswc_filter_air':          { name: 'Filter — air / pneumatic (NSWC-11)',           lambda: 8.0e-7, source: 'NSWC-11 §14',          group: 'NSWC-11 — Mechanical', category: 'Filter' },
    'nswc_heat_exchanger':      { name: 'Heat exchanger (NSWC-11)',                     lambda: 4.0e-6, source: 'NSWC-11 §15',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_shaft_drive':         { name: 'Shaft — drive (NSWC-11)',                      lambda: 3.0e-7, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_coupling':            { name: 'Coupling — flexible (NSWC-11)',                lambda: 4.0e-7, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },




    // ============ Software ============
    'sw_dal_a':                 { name: 'Software — DAL A (DO-178C, qualified)',        lambda: 0,      source: 'DO-178C',               group: 'Software', category: 'Software' },
    'sw_dal_b':                 { name: 'Software — DAL B (DO-178C, qualified)',        lambda: 0,      source: 'DO-178C',               group: 'Software', category: 'Software' },
    'sw_dal_c':                 { name: 'Software — DAL C (typical defect rate)',      lambda: 1.0e-7, source: 'industry estimate',     group: 'Software', category: 'Software' },
    'sw_dal_d':                 { name: 'Software — DAL D (typical defect rate)',      lambda: 5.0e-7, source: 'industry estimate',     group: 'Software', category: 'Software' },
    'sw_dal_e':                 { name: 'Software — DAL E (no assurance)',              lambda: 1.0e-5, source: 'industry estimate',     group: 'Software', category: 'Software' },
    'sw_cots':                  { name: 'Software — COTS / commercial',                  lambda: 5.0e-6, source: 'industry estimate',     group: 'Software', category: 'Software' },

    // ============ MIL-HDBK-217F — Extended IC families ============
    'mil217_ic_logic_ttl_lo':    { name: 'IC — TTL (74xx) low complexity',              lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_logic_ttl_med':   { name: 'IC — TTL (74xx) medium complexity',           lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_logic_cmos_lo':   { name: 'IC — CMOS (4xxx/74HCxx) low complexity',      lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_logic_cmos_med':  { name: 'IC — CMOS medium complexity',                  lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_logic_ecl':       { name: 'IC — ECL (emitter-coupled logic)',             lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_logic_bicmos':    { name: 'IC — BiCMOS',                                  lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_opamp':           { name: 'IC — Op-amp (general purpose)',                lambda: 3.5e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_opamp_precision': { name: 'IC — Op-amp (precision / instrumentation)',    lambda: 4.5e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_comparator':      { name: 'IC — Comparator',                              lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_adc_8bit':        { name: 'IC — ADC, 8-bit',                              lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_adc_12bit':       { name: 'IC — ADC, 12-bit',                             lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_adc_16bit':       { name: 'IC — ADC, 16-bit',                             lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_adc_24bit':       { name: 'IC — ADC, 24-bit sigma-delta',                  lambda: 1.2e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_dac_8bit':        { name: 'IC — DAC, 8-bit',                              lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_dac_12bit':       { name: 'IC — DAC, 12-bit',                             lambda: 7.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_dac_16bit':       { name: 'IC — DAC, 16-bit',                             lambda: 9.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_vref':            { name: 'IC — Voltage reference (precision)',           lambda: 2.5e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_ldo':             { name: 'IC — LDO regulator',                            lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_switchreg':       { name: 'IC — Switching regulator controller',          lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_mosfet_driver':   { name: 'IC — MOSFET gate driver',                      lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_isolator_dig':    { name: 'IC — Digital isolator',                        lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_isolator_analog': { name: 'IC — Analog isolator',                          lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_pll':             { name: 'IC — Phase-locked loop',                       lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_rtc':             { name: 'IC — Real-time clock',                         lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_eeprom':          { name: 'IC — EEPROM (serial)',                          lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_flash_nand':      { name: 'IC — NAND Flash memory',                       lambda: 1.5e-6, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_flash_nor':       { name: 'IC — NOR Flash memory',                        lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_sram_async':      { name: 'IC — Async SRAM',                              lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_sdram':           { name: 'IC — SDRAM / DDR',                             lambda: 1.5e-6, source: 'MIL-HDBK-217F N2 §5.2', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_dsp':             { name: 'IC — Digital signal processor (DSP)',         lambda: 2.5e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_arm_mcu':         { name: 'IC — ARM Cortex-M microcontroller',            lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_arm_app':         { name: 'IC — ARM Cortex-A application processor',      lambda: 4.0e-6, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_ethernet_phy':    { name: 'IC — Ethernet PHY',                            lambda: 7.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_usb_phy':         { name: 'IC — USB PHY',                                 lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_can_xceiver':     { name: 'IC — CAN bus transceiver',                     lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_rs485':           { name: 'IC — RS-485 / RS-422 transceiver',             lambda: 3.5e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_1553':            { name: 'IC — MIL-STD-1553 transceiver',                lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },
    'mil217_ic_arinc429':        { name: 'IC — ARINC-429 transceiver',                   lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §5.1', group: 'MIL-HDBK-217F — Microcircuits', category: 'IC' },

    // ============ MIL-HDBK-217F — Extended discretes ============
    'mil217_tx_jfet':            { name: 'Transistor — JFET',                            lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_tx_darlington':      { name: 'Transistor — Darlington',                     lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_tx_gan':             { name: 'Transistor — GaN HEMT',                        lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §6.3', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_tx_sic':             { name: 'Transistor — SiC MOSFET',                      lambda: 4.5e-7, source: 'MIL-HDBK-217F N2 §6.3', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_pin':          { name: 'Diode — PIN (RF / switching)',                 lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_varactor':     { name: 'Diode — varactor (tuning)',                    lambda: 8.0e-8, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_tunnel':       { name: 'Diode — tunnel',                                lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_bridge':       { name: 'Diode — bridge rectifier (assy)',              lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_gunn':         { name: 'Diode — Gunn (microwave)',                     lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_impatt':       { name: 'Diode — IMPATT (microwave)',                   lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diode_step_recov':   { name: 'Diode — step recovery',                        lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_diac':               { name: 'Diac',                                          lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_photodiode':         { name: 'Photodiode',                                    lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },
    'mil217_phototransistor':    { name: 'Phototransistor',                              lambda: 1.2e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'MIL-HDBK-217F — Discrete Semiconductors', category: 'Semiconductor' },

    // ============ MIL-HDBK-217F — Extended resistors ============
    'mil217_res_smd_0402':       { name: 'Resistor — SMD 0402 thick film',              lambda: 4.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_smd_0603':       { name: 'Resistor — SMD 0603 thick film',              lambda: 4.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_smd_0805':       { name: 'Resistor — SMD 0805 thick film',              lambda: 5.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_smd_1206':       { name: 'Resistor — SMD 1206 thick film',              lambda: 6.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_smd_2010':       { name: 'Resistor — SMD 2010 thick film',              lambda: 7.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_smd_2512':       { name: 'Resistor — SMD 2512 power thick film',         lambda: 1.0e-8, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_thinfilm':       { name: 'Resistor — thin film (precision)',            lambda: 3.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_metal_oxide':    { name: 'Resistor — metal oxide film',                  lambda: 7.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_foil':           { name: 'Resistor — foil (precision low-TC)',           lambda: 2.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_chassis':        { name: 'Resistor — chassis-mount power (RH)',         lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §9.3', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_aluminum_clad':  { name: 'Resistor — aluminum-clad power',               lambda: 6.0e-8, source: 'MIL-HDBK-217F N2 §9.3', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_res_current_sense':  { name: 'Resistor — current-sense (low Ω)',             lambda: 4.0e-9, source: 'MIL-HDBK-217F N2 §9.1', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_varistor':           { name: 'Varistor (MOV) — transient absorber',         lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §9.8', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_thermistor_ntc':     { name: 'Thermistor — NTC (negative temp coef)',       lambda: 8.0e-9, source: 'MIL-HDBK-217F N2 §9.7', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },
    'mil217_thermistor_ptc':     { name: 'Thermistor — PTC (positive temp coef)',       lambda: 1.0e-8, source: 'MIL-HDBK-217F N2 §9.7', group: 'MIL-HDBK-217F — Resistors', category: 'Resistor' },

    // ============ MIL-HDBK-217F — Extended capacitors ============
    'mil217_cap_mlcc_c0g':       { name: 'Capacitor — MLCC C0G/NP0 (Class I)',          lambda: 2.0e-9, source: 'MIL-HDBK-217F N2 §10.3', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_mlcc_x7r':       { name: 'Capacitor — MLCC X7R (Class II)',             lambda: 4.0e-9, source: 'MIL-HDBK-217F N2 §10.3', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_mlcc_x5r':       { name: 'Capacitor — MLCC X5R (Class II)',             lambda: 5.0e-9, source: 'MIL-HDBK-217F N2 §10.3', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_mlcc_y5v':       { name: 'Capacitor — MLCC Y5V (Class III)',            lambda: 8.0e-9, source: 'MIL-HDBK-217F N2 §10.3', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_polymer_alum':   { name: 'Capacitor — polymer aluminum (low ESR)',      lambda: 4.0e-8, source: 'MIL-HDBK-217F N2 §10.5', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_polymer_tant':   { name: 'Capacitor — polymer tantalum',                 lambda: 3.0e-8, source: 'MIL-HDBK-217F N2 §10.4', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_hybrid':         { name: 'Capacitor — hybrid (polymer + electrolytic)', lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §10.5', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_supercap':       { name: 'Capacitor — supercapacitor / EDLC',           lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §10.5', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_pp_film':        { name: 'Capacitor — polypropylene film',               lambda: 1.5e-8, source: 'MIL-HDBK-217F N2 §10.2', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_pet_film':       { name: 'Capacitor — PET / polyester film',             lambda: 2.0e-8, source: 'MIL-HDBK-217F N2 §10.2', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_pps_film':       { name: 'Capacitor — PPS film',                         lambda: 1.5e-8, source: 'MIL-HDBK-217F N2 §10.2', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_x_class':        { name: 'Capacitor — X-class safety (across-line)',    lambda: 3.0e-8, source: 'MIL-HDBK-217F N2 §10.2', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },
    'mil217_cap_y_class':        { name: 'Capacitor — Y-class safety (line-to-ground)', lambda: 3.0e-8, source: 'MIL-HDBK-217F N2 §10.2', group: 'MIL-HDBK-217F — Capacitors', category: 'Capacitor' },

    // ============ MIL-HDBK-217F — Extended connectors ============
    'mil217_conn_dsub_9':         { name: 'Connector — D-Sub 9-pin',                     lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_dsub_15':        { name: 'Connector — D-Sub 15-pin',                    lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_dsub_25':        { name: 'Connector — D-Sub 25-pin',                    lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_dsub_37':        { name: 'Connector — D-Sub 37-pin',                    lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_38999_i':        { name: 'Connector — MIL-DTL-38999 Series I',          lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_38999_iii':      { name: 'Connector — MIL-DTL-38999 Series III',        lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_38999_iv':       { name: 'Connector — MIL-DTL-38999 Series IV',         lambda: 4.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_5015':           { name: 'Connector — MIL-DTL-5015 (legacy circular)',  lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_26482':          { name: 'Connector — MIL-DTL-26482',                   lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_m12':            { name: 'Connector — M12 industrial circular',         lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_arinc600':       { name: 'Connector — ARINC 600 (rack & panel)',       lambda: 4.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_arinc801':       { name: 'Connector — ARINC 801 (fiber)',              lambda: 5.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_n_rf':           { name: 'Connector — N-type RF coaxial',               lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_sma_rf':         { name: 'Connector — SMA RF',                          lambda: 2.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_tnc_rf':         { name: 'Connector — TNC RF',                          lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_bnc_rf':         { name: 'Connector — BNC RF',                          lambda: 1.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_qma':            { name: 'Connector — QMA push-pull RF',                lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_arinc801_lc':    { name: 'Connector — fiber LC (single-mode)',          lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_micro_d':        { name: 'Connector — Micro-D (MIL-DTL-83513)',         lambda: 3.5e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_nano_d':         { name: 'Connector — Nano-D (MIL-DTL-32139)',          lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §15.1', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_terminal_block': { name: 'Connector — terminal block (screw)',          lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_spring_cage':    { name: 'Connector — spring-cage terminal',            lambda: 4.0e-8, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_idc':            { name: 'Connector — IDC ribbon (insulation disp)',   lambda: 8.0e-8, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_zif':            { name: 'Connector — ZIF (zero insertion force)',     lambda: 6.0e-8, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_usb':            { name: 'Connector — USB A/B/C',                       lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },
    'mil217_conn_rj45':           { name: 'Connector — RJ45 / 8P8C Ethernet',            lambda: 8.0e-8, source: 'MIL-HDBK-217F N2 §15.2', group: 'MIL-HDBK-217F — Connectors', category: 'Connector' },

    // ============ MIL-HDBK-217F — Extended motors / electromechanical ============
    'mil217_motor_servo':         { name: 'Motor — servo (brushed)',                     lambda: 9.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_motor_torque':        { name: 'Motor — torque (limited rotation)',           lambda: 5.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_motor_blower':        { name: 'Motor — blower / fan',                        lambda: 8.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_motor_universal':     { name: 'Motor — universal AC/DC',                     lambda: 1.2e-5, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Motor' },
    'mil217_resolver':            { name: 'Resolver — angle sensor',                     lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Sensor' },
    'mil217_synchro':             { name: 'Synchro — angle sensor',                      lambda: 3.0e-6, source: 'MIL-HDBK-217F N2 §12.1', group: 'MIL-HDBK-217F — Electromechanical', category: 'Sensor' },


    'nswc_pump_screw':           { name: 'Pump — screw / lobe (NSWC-11)',                lambda: 1.2e-5, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_pump_jet':             { name: 'Pump — jet / ejector (NSWC-11)',              lambda: 8.0e-6, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_pump_diaphragm':       { name: 'Pump — diaphragm (NSWC-11)',                  lambda: 9.0e-6, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_pump_peristaltic':     { name: 'Pump — peristaltic (NSWC-11)',                lambda: 6.0e-6, source: 'NSWC-11 §6',           group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_valve_globe':          { name: 'Valve — globe (NSWC-11)',                     lambda: 2.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_gate':           { name: 'Valve — gate (NSWC-11)',                      lambda: 2.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_ball':           { name: 'Valve — ball (NSWC-11)',                      lambda: 1.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_butterfly':      { name: 'Valve — butterfly (NSWC-11)',                 lambda: 1.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_needle':         { name: 'Valve — needle (NSWC-11)',                    lambda: 1.8e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_diaphragm':      { name: 'Valve — diaphragm (NSWC-11)',                 lambda: 2.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_3way':           { name: 'Valve — 3-way solenoid (NSWC-11)',            lambda: 5.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_4way':           { name: 'Valve — 4-way directional (NSWC-11)',         lambda: 6.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_flow_control':   { name: 'Valve — flow control / metering (NSWC-11)',   lambda: 3.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_valve_pressure_reg':   { name: 'Valve — pressure regulating (NSWC-11)',       lambda: 4.0e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_actuator_pyro':        { name: 'Actuator — pyrotechnic / explosive (NSWC-11)',lambda: 5.0e-7, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_actuator_paraffin':    { name: 'Actuator — paraffin / phase-change (NSWC-11)',lambda: 4.0e-6, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_actuator_piezo':       { name: 'Actuator — piezo (NSWC-11)',                  lambda: 8.0e-7, source: 'NSWC-11 §8',           group: 'NSWC-11 — Mechanical', category: 'Actuator' },
    'nswc_gear_planetary':       { name: 'Gear — planetary set (NSWC-11)',              lambda: 1.0e-6, source: 'NSWC-11 §9',           group: 'NSWC-11 — Mechanical', category: 'Gear' },
    'nswc_gear_rack_pinion':     { name: 'Gear — rack & pinion (NSWC-11)',              lambda: 5.0e-7, source: 'NSWC-11 §9',           group: 'NSWC-11 — Mechanical', category: 'Gear' },
    'nswc_gear_ballscrew':       { name: 'Gear — ball screw (NSWC-11)',                  lambda: 6.0e-7, source: 'NSWC-11 §9',           group: 'NSWC-11 — Mechanical', category: 'Gear' },
    'nswc_gear_harmonic':        { name: 'Gear — harmonic / strain wave (NSWC-11)',     lambda: 4.0e-7, source: 'NSWC-11 §9',           group: 'NSWC-11 — Mechanical', category: 'Gear' },
    'nswc_clutch_jaw':           { name: 'Clutch — jaw / dog (NSWC-11)',                lambda: 3.0e-6, source: 'NSWC-11 §11',          group: 'NSWC-11 — Mechanical', category: 'Drive' },
    'nswc_clutch_centrifugal':   { name: 'Clutch — centrifugal (NSWC-11)',              lambda: 4.0e-6, source: 'NSWC-11 §11',          group: 'NSWC-11 — Mechanical', category: 'Drive' },
    'nswc_brake_band':           { name: 'Brake — band (NSWC-11)',                      lambda: 3.5e-6, source: 'NSWC-11 §12',          group: 'NSWC-11 — Mechanical', category: 'Brake' },
    'nswc_brake_electromag':     { name: 'Brake — electromagnetic (NSWC-11)',           lambda: 5.0e-6, source: 'NSWC-11 §12',          group: 'NSWC-11 — Mechanical', category: 'Brake' },
    'nswc_compressor_screw':     { name: 'Compressor — rotary screw (NSWC-11)',         lambda: 2.0e-5, source: 'NSWC-11 §13',          group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_compressor_centrifug': { name: 'Compressor — centrifugal (NSWC-11)',          lambda: 1.5e-5, source: 'NSWC-11 §13',          group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_compressor_axial':     { name: 'Compressor — axial flow (NSWC-11)',           lambda: 2.5e-5, source: 'NSWC-11 §13',          group: 'NSWC-11 — Mechanical', category: 'Pump' },
    'nswc_filter_oil':           { name: 'Filter — oil / lube (NSWC-11)',               lambda: 1.5e-6, source: 'NSWC-11 §14',          group: 'NSWC-11 — Mechanical', category: 'Filter' },
    'nswc_filter_fuel':          { name: 'Filter — fuel (NSWC-11)',                     lambda: 2.0e-6, source: 'NSWC-11 §14',          group: 'NSWC-11 — Mechanical', category: 'Filter' },
    'nswc_filter_water':         { name: 'Filter — water (NSWC-11)',                    lambda: 1.5e-6, source: 'NSWC-11 §14',          group: 'NSWC-11 — Mechanical', category: 'Filter' },
    'nswc_hex_plate':            { name: 'Heat exchanger — plate (NSWC-11)',            lambda: 3.5e-6, source: 'NSWC-11 §15',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_hex_shell_tube':       { name: 'Heat exchanger — shell & tube (NSWC-11)',     lambda: 5.0e-6, source: 'NSWC-11 §15',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_hex_finned':           { name: 'Heat exchanger — finned tube (NSWC-11)',      lambda: 4.0e-6, source: 'NSWC-11 §15',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_accumulator_hyd':      { name: 'Accumulator — hydraulic gas-charged (NSWC)',   lambda: 2.0e-6, source: 'NSWC-11 §17',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_reservoir':            { name: 'Reservoir — fluid (NSWC-11)',                  lambda: 5.0e-7, source: 'NSWC-11 §17',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_strainer':             { name: 'Strainer — coarse (NSWC-11)',                  lambda: 8.0e-7, source: 'NSWC-11 §14',          group: 'NSWC-11 — Mechanical', category: 'Filter' },
    'nswc_orifice':              { name: 'Orifice — restricting (NSWC-11)',              lambda: 3.0e-7, source: 'NSWC-11 §17',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_check_valve_swing':    { name: 'Check valve — swing type (NSWC-11)',          lambda: 1.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_check_valve_lift':     { name: 'Check valve — lift type (NSWC-11)',           lambda: 1.5e-6, source: 'NSWC-11 §7',           group: 'NSWC-11 — Mechanical', category: 'Valve' },
    'nswc_pipe_threaded':        { name: 'Pipe joint — threaded (NSWC-11)',              lambda: 1.0e-7, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_pipe_welded':          { name: 'Pipe joint — welded (NSWC-11)',                lambda: 5.0e-8, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_pipe_flanged':         { name: 'Pipe joint — flanged (NSWC-11)',               lambda: 2.0e-7, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_hose_flex':            { name: 'Hose — flexible (NSWC-11)',                    lambda: 1.5e-6, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_diaphragm_gas':        { name: 'Diaphragm — gas-tight (NSWC-11)',              lambda: 6.0e-7, source: 'NSWC-11 §18',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_bellows':              { name: 'Bellows — flexible (NSWC-11)',                 lambda: 8.0e-7, source: 'NSWC-11 §18',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_lubricant':            { name: 'Lubricant — degradation (NSWC-11)',            lambda: 1.0e-7, source: 'NSWC-11 §19',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_fastener':             { name: 'Fastener — bolt / screw (NSWC-11)',            lambda: 5.0e-8, source: 'NSWC-11 §20',          group: 'NSWC-11 — Mechanical', category: 'Other' },
    'nswc_weld_joint':           { name: 'Weld joint (NSWC-11)',                          lambda: 3.0e-8, source: 'NSWC-11 §16',          group: 'NSWC-11 — Mechanical', category: 'Other' },




    // ============ RF / Microwave components ============
    'rf_amplifier_lna':          { name: 'RF amplifier — LNA',                           lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §5.4', group: 'RF / Microwave', category: 'IC' },
    'rf_amplifier_pa':           { name: 'RF amplifier — power amp',                     lambda: 2.0e-6, source: 'MIL-HDBK-217F N2 §5.4', group: 'RF / Microwave', category: 'IC' },
    'rf_mixer':                  { name: 'RF mixer',                                      lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §5.4', group: 'RF / Microwave', category: 'IC' },
    'rf_synthesizer':            { name: 'RF synthesizer / VCO',                          lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §5.4', group: 'RF / Microwave', category: 'IC' },
    'rf_attenuator_fixed':       { name: 'RF attenuator — fixed',                         lambda: 1.0e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Other' },
    'rf_attenuator_var':         { name: 'RF attenuator — variable',                      lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Other' },
    'rf_filter_bandpass':        { name: 'RF filter — bandpass (cavity)',                 lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §19.1',group: 'RF / Microwave', category: 'Other' },
    'rf_filter_saw':             { name: 'RF filter — SAW',                              lambda: 5.0e-7, source: 'MIL-HDBK-217F N2 §19.1',group: 'RF / Microwave', category: 'Other' },
    'rf_filter_baw':             { name: 'RF filter — BAW',                              lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §19.1',group: 'RF / Microwave', category: 'Other' },
    'rf_circulator':             { name: 'RF circulator',                                lambda: 6.0e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Other' },
    'rf_isolator':               { name: 'RF isolator',                                  lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Other' },
    'rf_coupler':                { name: 'RF directional coupler',                       lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Other' },
    'rf_power_divider':          { name: 'RF power divider / combiner',                  lambda: 2.5e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Other' },
    'rf_coax_cable':             { name: 'RF coaxial cable (per meter)',                  lambda: 5.0e-8, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Cable' },
    'rf_waveguide_section':      { name: 'RF waveguide section (rigid)',                 lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §15.1',group: 'RF / Microwave', category: 'Cable' },
    'rf_switch_mech':            { name: 'RF switch — mechanical / coaxial',             lambda: 1.0e-6, source: 'MIL-HDBK-217F N2 §14.4',group: 'RF / Microwave', category: 'Switch' },
    'rf_switch_pin':             { name: 'RF switch — PIN diode',                        lambda: 4.0e-7, source: 'MIL-HDBK-217F N2 §14.4',group: 'RF / Microwave', category: 'Switch' },
    'rf_switch_mems':            { name: 'RF switch — MEMS',                             lambda: 2.0e-7, source: 'MIL-HDBK-217F N2 §14.4',group: 'RF / Microwave', category: 'Switch' },

    // ============ Power Electronics ============
    'pwr_inductor_smd':          { name: 'Power inductor — SMD',                          lambda: 6.0e-8, source: 'MIL-HDBK-217F N2 §11.1',group: 'Power Electronics', category: 'Magnetic' },
    'pwr_inductor_toroid':       { name: 'Power inductor — toroid',                       lambda: 8.0e-8, source: 'MIL-HDBK-217F N2 §11.1',group: 'Power Electronics', category: 'Magnetic' },
    'pwr_transformer_flyback':   { name: 'Transformer — flyback',                        lambda: 3.0e-7, source: 'MIL-HDBK-217F N2 §11.1',group: 'Power Electronics', category: 'Magnetic' },
    'pwr_transformer_forward':   { name: 'Transformer — forward (push-pull)',             lambda: 3.5e-7, source: 'MIL-HDBK-217F N2 §11.1',group: 'Power Electronics', category: 'Magnetic' },
    'pwr_transformer_planar':    { name: 'Transformer — planar',                          lambda: 2.5e-7, source: 'MIL-HDBK-217F N2 §11.1',group: 'Power Electronics', category: 'Magnetic' },
    'pwr_rectifier_3phase':      { name: 'Rectifier — 3-phase bridge',                    lambda: 8.0e-7, source: 'MIL-HDBK-217F N2 §6.1', group: 'Power Electronics', category: 'Subsystem' },

    // ============ Batteries — Extended ============

    // ============ Optical / Photonic ============
    'opt_laser_he_ne':           { name: 'Laser — He-Ne',                                 lambda: 8.0e-6, source: 'MIL-HDBK-217F N2 §6.5', group: 'Optical / Photonic', category: 'Optical' },
    'opt_laser_diode_pumped':    { name: 'Laser — diode-pumped solid state',              lambda: 1.5e-5, source: 'MIL-HDBK-217F N2 §6.5', group: 'Optical / Photonic', category: 'Optical' },
    'opt_laser_fiber':           { name: 'Laser — fiber laser',                            lambda: 1.0e-5, source: 'MIL-HDBK-217F N2 §6.5', group: 'Optical / Photonic', category: 'Optical' },
    'opt_photomultiplier':       { name: 'Photomultiplier tube (PMT)',                    lambda: 3.0e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'Optical / Photonic', category: 'Optical' },
    'opt_avalanche_photodiode':  { name: 'Avalanche photodiode (APD)',                    lambda: 1.5e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'Optical / Photonic', category: 'Optical' },
    'opt_ccd_imager':            { name: 'CCD imager',                                    lambda: 5.0e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'Optical / Photonic', category: 'Optical' },
    'opt_emccd':                 { name: 'EMCCD imager',                                  lambda: 7.0e-6, source: 'MIL-HDBK-217F N2 §6.4', group: 'Optical / Photonic', category: 'Optical' },

    // ============ Automotive ============

    // ============ Marine / Undersea ============
    'marine_thruster':           { name: 'Thruster — marine (electric)',                  lambda: 3.0e-5, source: 'NSWC-11 §6',           group: 'Marine / Undersea', category: 'Subsystem' },

    // ============ Pyrotechnic / EED ============

    // ============ Aerospace Structural ============

    // ============ Computers / Avionics LRUs ============


    // ============================================================================
    // Phase 53.57 — PUBLIC-DOMAIN expansion. All entries below are sourced from
    // US Government publications (DoD, FAA, NASA, NRC) that are not subject to
    // commercial copyright. Values are within published ranges from the cited
    // source and reflect typical / nominal use cases at GB env, normal quality.
    // ============================================================================

    // ============ MIL-HDBK-338B — System reliability rollups (DoD, public domain) ============
    'h338_lru_avionics_gen':    { name: 'LRU — Generic avionics computer',                lambda: 1.5e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_fcs_processor':   { name: 'LRU — Flight control processor',                 lambda: 2.5e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_air_data':        { name: 'LRU — Air-data computer (ADC)',                  lambda: 1.0e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_inertial':        { name: 'LRU — Inertial reference unit (IRU)',            lambda: 3.5e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_display':         { name: 'LRU — Multi-function display (MFD)',             lambda: 2.0e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_radio_vhf':       { name: 'LRU — VHF comm radio',                           lambda: 1.5e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_xpdr':            { name: 'LRU — ATC transponder',                          lambda: 1.2e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_gps':             { name: 'LRU — GPS receiver',                             lambda: 8.0e-6, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_radalt':          { name: 'LRU — Radar altimeter',                          lambda: 2.5e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_psu_dc':          { name: 'LRU — DC/DC power supply',                       lambda: 5.0e-6, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_psu_ac':          { name: 'LRU — AC power supply / inverter',               lambda: 1.0e-5, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_databus':         { name: 'LRU — Data-bus controller (ARINC 429 / MIL-1553)', lambda: 3.0e-6, source: 'MIL-HDBK-338B §7',     group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_io':              { name: 'LRU — Generic I/O concentrator',                 lambda: 4.0e-6, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_recorder':        { name: 'LRU — Flight data recorder (FDR)',               lambda: 6.0e-6, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },
    'h338_lru_warning':         { name: 'LRU — Crew alerting / warning computer',         lambda: 8.0e-6, source: 'MIL-HDBK-338B §7',       group: 'MIL-HDBK-338B — System Rollups',  category: 'Subsystem' },

    // ============ MIL-HDBK-756B — Generic LRU defaults (DoD, public domain) ============
    'h756_le_complex':          { name: 'LRU — Complex avionics LRE (>1000 parts)',       lambda: 3.0e-5, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Subsystem' },
    'h756_le_moderate':         { name: 'LRU — Moderate-complexity avionics LRE',         lambda: 1.5e-5, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Subsystem' },
    'h756_le_simple':           { name: 'LRU — Simple electronic LRE (<100 parts)',       lambda: 5.0e-6, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Subsystem' },
    'h756_em_actuator':         { name: 'Assembly — Electromechanical actuator',           lambda: 2.0e-5, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Actuator' },
    'h756_em_servo':            { name: 'Assembly — Electromechanical servo',              lambda: 1.5e-5, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Actuator' },
    'h756_em_motor_brushless':  { name: 'Assembly — Brushless DC motor (avionics)',         lambda: 8.0e-6, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Motor' },
    'h756_em_generator':        { name: 'Assembly — AC generator (constant-speed drive)',  lambda: 5.0e-5, source: 'MIL-HDBK-756B',          group: 'MIL-HDBK-756B — Generic LRU',     category: 'Subsystem' },

    // ============ DOT-FAA-CT-83-49 — FAA Failure Mode/Mechanism Distributions (FAA, public domain) ============
    'faa_hyd_pump_eng':         { name: 'Hydraulic pump — engine-driven (EDP)',             lambda: 8.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Pump' },
    'faa_hyd_pump_elec':        { name: 'Hydraulic pump — electric (EMDP)',                 lambda: 5.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Pump' },
    'faa_hyd_reservoir':        { name: 'Hydraulic reservoir',                              lambda: 2.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Subassembly' },
    'faa_hyd_accumulator':      { name: 'Hydraulic accumulator',                            lambda: 5.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Subassembly' },
    'faa_hyd_filter':           { name: 'Hydraulic filter (in-line)',                       lambda: 3.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Filter' },
    'faa_hyd_servo_valve':      { name: 'Hydraulic servo valve (electrohydraulic)',         lambda: 2.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Valve' },
    'faa_hyd_solenoid_valve':   { name: 'Hydraulic solenoid valve',                         lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Valve' },
    'faa_hyd_check_valve':      { name: 'Hydraulic check valve',                            lambda: 5.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Valve' },
    'faa_hyd_relief_valve':     { name: 'Hydraulic relief valve',                           lambda: 7.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Valve' },
    'faa_hyd_actuator':         { name: 'Hydraulic linear actuator',                        lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Actuator' },
    'faa_hyd_rotary_actuator':  { name: 'Hydraulic rotary actuator',                        lambda: 2.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Actuator' },
    'faa_hyd_line':             { name: 'Hydraulic line / fitting (per joint)',             lambda: 1.0e-7, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Hydraulics',   category: 'Subassembly' },

    'faa_pneu_valve':           { name: 'Pneumatic valve (bleed-air)',                       lambda: 2.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Pneumatics',  category: 'Valve' },
    'faa_pneu_duct':            { name: 'Pneumatic duct (per segment)',                      lambda: 5.0e-7, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Pneumatics',  category: 'Subassembly' },
    'faa_pneu_regulator':       { name: 'Pneumatic pressure regulator',                      lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Pneumatics',  category: 'Valve' },
    'faa_pneu_precooler':       { name: 'Bleed-air precooler',                               lambda: 3.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Pneumatics',  category: 'Subassembly' },

    'faa_fuel_pump_boost':      { name: 'Fuel boost pump (tank)',                            lambda: 3.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Fuel System', category: 'Pump' },
    'faa_fuel_pump_transfer':   { name: 'Fuel transfer pump',                                lambda: 3.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Fuel System', category: 'Pump' },
    'faa_fuel_valve_shutoff':   { name: 'Fuel shutoff valve (motor-operated)',                lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Fuel System', category: 'Valve' },
    'faa_fuel_qty_indicator':   { name: 'Fuel quantity indication system (FQIS)',             lambda: 2.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Fuel System', category: 'Subsystem' },
    'faa_fuel_xfeed_valve':     { name: 'Fuel cross-feed valve',                              lambda: 1.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Fuel System', category: 'Valve' },

    'faa_elec_generator':       { name: 'Electrical generator (IDG)',                         lambda: 6.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Subsystem' },
    'faa_elec_apu_generator':   { name: 'APU generator',                                      lambda: 5.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Subsystem' },
    'faa_elec_ram_air_turbine': { name: 'Ram-air turbine (RAT) generator',                    lambda: 1.0e-4, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Subsystem' },
    'faa_elec_bus_contactor':   { name: 'Bus tie contactor / breaker',                        lambda: 3.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Switch' },
    'faa_elec_essential_bus':   { name: 'Essential bus management (BPCU)',                    lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Subsystem' },
    'faa_elec_battery':         { name: 'Battery — main NiCd / Li-ion (28V)',                 lambda: 5.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Battery' },
    'faa_elec_tru':             { name: 'Transformer-rectifier unit (TRU)',                   lambda: 1.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Electrical',  category: 'Subassembly' },

    'faa_lg_extension':         { name: 'Landing gear — extension/retraction actuator',       lambda: 4.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Landing Gear', category: 'Actuator' },
    'faa_lg_uplock':            { name: 'Landing gear — uplock / downlock mechanism',         lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Landing Gear', category: 'Subassembly' },
    'faa_lg_steering':          { name: 'Nose-wheel steering actuator',                       lambda: 2.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Landing Gear', category: 'Actuator' },
    'faa_lg_wow_switch':        { name: 'Weight-on-wheels (WOW) switch',                      lambda: 5.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Landing Gear', category: 'Switch' },

    'faa_fc_aileron_actuator':  { name: 'Aileron actuator (powered)',                         lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Actuator' },
    'faa_fc_elevator_actuator': { name: 'Elevator actuator (powered)',                        lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Actuator' },
    'faa_fc_rudder_actuator':   { name: 'Rudder actuator (powered)',                          lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Actuator' },
    'faa_fc_flap_drive':        { name: 'Flap drive system (PCU + torque tubes)',             lambda: 3.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Subsystem' },
    'faa_fc_slat_drive':        { name: 'Slat drive system',                                  lambda: 3.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Subsystem' },
    'faa_fc_spoiler_actuator':  { name: 'Spoiler actuator (single panel)',                    lambda: 1.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Actuator' },
    'faa_fc_trim_actuator':     { name: 'Trim actuator (THS or aileron tab)',                 lambda: 1.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Actuator' },
    'faa_fc_yaw_damper':        { name: 'Yaw damper (computer + servo)',                      lambda: 2.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Subsystem' },
    'faa_fc_autopilot':         { name: 'Autopilot computer (single channel)',                lambda: 3.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Subsystem' },
    'faa_fc_stick_shaker':      { name: 'Stick shaker / pusher',                              lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Flight Controls', category: 'Subsystem' },

    'faa_eng_fadec':            { name: 'FADEC channel (single)',                             lambda: 2.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Subsystem' },
    'faa_eng_starter':          { name: 'Engine starter (air or electric)',                   lambda: 3.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Subassembly' },
    'faa_eng_ignition':         { name: 'Engine ignition exciter / igniter',                  lambda: 1.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Subassembly' },
    'faa_eng_fuel_control':     { name: 'Engine fuel control unit (HMU/FCU)',                 lambda: 2.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Subassembly' },
    'faa_eng_thrust_reverser':  { name: 'Thrust reverser actuation system',                   lambda: 4.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Subsystem' },
    'faa_eng_oil_pump':         { name: 'Engine oil pump',                                    lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Pump' },
    'faa_eng_oil_cooler':       { name: 'Engine oil cooler',                                  lambda: 8.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — Propulsion',   category: 'Subassembly' },

    'faa_ecs_pack':             { name: 'Environmental control system pack (ACM)',            lambda: 4.0e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — ECS',          category: 'Subsystem' },
    'faa_ecs_mixing':           { name: 'ECS mixing manifold / outflow valve',                lambda: 8.0e-6, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — ECS',          category: 'Valve' },
    'faa_ecs_press_controller': { name: 'Cabin pressure controller',                          lambda: 1.5e-5, source: 'DOT-FAA-CT-83-49',       group: 'DOT-FAA-CT-83-49 — ECS',          category: 'Subsystem' },

    // ============ FAA AC 25.1309-1A Appendix — Conservative generic rates (public domain) ============
    'ac1309_lru_generic_elec':   { name: 'Generic electronic LRU (conservative)',             lambda: 1.0e-5, source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Subsystem' },
    'ac1309_lru_generic_em':     { name: 'Generic electromechanical LRU (conservative)',      lambda: 3.0e-5, source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Subsystem' },
    'ac1309_lru_mechanical':     { name: 'Generic mechanical assembly (conservative)',        lambda: 5.0e-5, source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Subsystem' },
    'ac1309_lru_hyd':            { name: 'Generic hydraulic component (conservative)',         lambda: 5.0e-5, source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Subsystem' },
    'ac1309_lru_software_a':     { name: 'Generic DAL-A software (qualitative — no λ)',       lambda: 0,      source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Software' },
    'ac1309_lru_software_b':     { name: 'Generic DAL-B software (qualitative — no λ)',       lambda: 0,      source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Software' },
    'ac1309_lru_sensor':         { name: 'Generic sensor / transducer (conservative)',         lambda: 2.0e-5, source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Subsystem' },
    'ac1309_lru_display':        { name: 'Generic crew display (conservative)',                lambda: 1.5e-5, source: 'AC 25.1309-1A App',     group: 'AC 25.1309 — Generic Defaults',  category: 'Subsystem' },

    // ============ NASA SP-2011-3421 — PRA Procedures Guide generic event data (NASA, public domain) ============
    'nasa_relay_general':       { name: 'Relay — general purpose (PRA generic)',              lambda: 1.0e-6, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Relay' },
    'nasa_switch_manual':       { name: 'Switch — manual, snap-action (PRA generic)',         lambda: 5.0e-7, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Switch' },
    'nasa_motor_dc':            { name: 'Motor — DC, fractional HP (PRA generic)',             lambda: 5.0e-6, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Motor' },
    'nasa_motor_ac':            { name: 'Motor — AC induction (PRA generic)',                  lambda: 3.0e-6, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Motor' },
    'nasa_solenoid':            { name: 'Solenoid (PRA generic)',                              lambda: 2.0e-6, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Other' },
    'nasa_thermal_battery':     { name: 'Thermal battery (PRA generic)',                       lambda: 1.0e-5, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Battery' },
    'nasa_pyro_actuator':       { name: 'Pyrotechnic actuator (one-shot)',                     lambda: 1.0e-4, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Actuator' },
    'nasa_pyro_initiator':      { name: 'Pyrotechnic initiator (one-shot)',                    lambda: 5.0e-5, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Other' },
    'nasa_pressure_xducer':     { name: 'Pressure transducer (PRA generic)',                   lambda: 4.0e-6, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Other' },
    'nasa_temp_sensor':         { name: 'Temperature sensor — thermocouple / RTD',             lambda: 2.0e-6, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Other' },
    'nasa_thruster_mono':       { name: 'Monopropellant thruster',                             lambda: 5.0e-5, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Subsystem' },
    'nasa_thruster_bi':         { name: 'Bipropellant thruster',                               lambda: 8.0e-5, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Generic Events',      category: 'Subsystem' },
    'nasa_human_routine':       { name: 'Human error — routine, well-trained task (HEP)',     lambda: 1.0e-3, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Human Factors',       category: 'Other' },
    'nasa_human_skill':         { name: 'Human error — skill-based, time-pressured (HEP)',     lambda: 1.0e-2, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Human Factors',       category: 'Other' },
    'nasa_human_dynamic':       { name: 'Human error — dynamic crisis response (HEP)',         lambda: 2.5e-1, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Human Factors',       category: 'Other' },
    'nasa_human_recover':       { name: 'Human error — recovery from off-nominal (HEP)',       lambda: 5.0e-2, source: 'NASA SP-2011-3421',     group: 'NASA PRA — Human Factors',       category: 'Other' },

    // ============ NUREG-CR-6928 — NRC industry-average performance data (public domain) ============
    'nrc_valve_mov':            { name: 'Valve — motor-operated (MOV)',                       lambda: 2.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Valves',         category: 'Valve' },
    'nrc_valve_aov':            { name: 'Valve — air-operated (AOV)',                         lambda: 3.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Valves',         category: 'Valve' },
    'nrc_valve_sov':            { name: 'Valve — solenoid-operated (SOV)',                    lambda: 4.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Valves',         category: 'Valve' },
    'nrc_valve_check':          { name: 'Valve — check (passive)',                            lambda: 5.0e-7, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Valves',         category: 'Valve' },
    'nrc_valve_safety':         { name: 'Valve — safety / relief',                            lambda: 2.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Valves',         category: 'Valve' },
    'nrc_valve_manual':         { name: 'Valve — manual (operator action)',                   lambda: 3.0e-7, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Valves',         category: 'Valve' },

    'nrc_pump_motor_driven':    { name: 'Pump — motor-driven centrifugal',                    lambda: 5.0e-5, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Pumps',          category: 'Pump' },
    'nrc_pump_turbine_driven':  { name: 'Pump — turbine-driven',                              lambda: 8.0e-5, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Pumps',          category: 'Pump' },
    'nrc_pump_positive_disp':   { name: 'Pump — positive displacement',                       lambda: 4.0e-5, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Pumps',          category: 'Pump' },

    'nrc_breaker_lv':           { name: 'Circuit breaker — low voltage',                      lambda: 1.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Switch' },
    'nrc_breaker_mv':           { name: 'Circuit breaker — medium voltage',                   lambda: 3.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Switch' },
    'nrc_breaker_hv':           { name: 'Circuit breaker — high voltage',                     lambda: 5.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Switch' },
    'nrc_xfmr_power':           { name: 'Power transformer',                                  lambda: 3.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Magnetic' },
    'nrc_diesel_gen':           { name: 'Emergency diesel generator (standby)',                lambda: 2.0e-4, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Subsystem' },
    'nrc_battery_chgr':         { name: 'Battery charger',                                    lambda: 8.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Subassembly' },
    'nrc_inverter':             { name: 'Inverter (DC→AC, instrument bus)',                   lambda: 1.5e-5, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Subassembly' },
    'nrc_battery_lead':         { name: 'Battery — lead-acid (vented)',                       lambda: 5.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Electrical',     category: 'Battery' },

    'nrc_sensor_press':         { name: 'Pressure sensor / transmitter',                      lambda: 2.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Instrumentation', category: 'Other' },
    'nrc_sensor_temp':          { name: 'Temperature sensor / transmitter',                   lambda: 1.5e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Instrumentation', category: 'Other' },
    'nrc_sensor_flow':          { name: 'Flow sensor / transmitter',                          lambda: 3.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Instrumentation', category: 'Other' },
    'nrc_sensor_level':         { name: 'Level sensor / transmitter',                         lambda: 2.5e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Instrumentation', category: 'Other' },
    'nrc_proc_signal_mod':      { name: 'Signal conditioner / processing module',             lambda: 1.5e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Instrumentation', category: 'Other' },

    'nrc_heat_exchanger':       { name: 'Heat exchanger / cooler',                            lambda: 4.0e-6, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Mechanical',     category: 'Subassembly' },
    'nrc_strainer':             { name: 'Strainer / filter (mechanical)',                     lambda: 8.0e-7, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Mechanical',     category: 'Filter' },
    'nrc_tank':                 { name: 'Tank / vessel (passive)',                            lambda: 3.0e-7, source: 'NUREG-CR-6928',          group: 'NUREG-CR-6928 — Mechanical',     category: 'Subassembly' },
};

// ============================================================================
// Phase 53.60 — FAILURE MODE DISTRIBUTIONS (α_FM)
// Maps a library entry key → array of typical failure modes with their published
// apportionment ratios. Values are drawn from DOT-FAA-CT-83-49 patterns and from
// generally-accepted industry distributions (no copyrighted table reproduction).
// Σα_FM should be ≈ 1.0 across the modes of a single component.
// When a user picks a library entry on an FTA basic event, these modes surface in
// the BE properties panel and can be one-click added to the FMEA as piece-part
// rows with auto-computed λ_mode = α_FM × λ_library.
// ============================================================================
const FAILURE_MODE_DISTRIBUTIONS = {
    // ===== Hydraulics — DOT-FAA-CT-83-49 patterns =====
    'faa_hyd_actuator': [
        { mode: 'Fails extended (stuck out)',  alphaFm: 0.40, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Fails retracted (stuck in)',  alphaFm: 0.40, source: 'DOT-FAA-CT-83-49' },
        { mode: 'External leak',               alphaFm: 0.15, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Internal leak / drift',       alphaFm: 0.05, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_hyd_pump_eng': [
        { mode: 'Loss of output (seizure)',    alphaFm: 0.55, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Reduced output / cavitation', alphaFm: 0.25, source: 'DOT-FAA-CT-83-49' },
        { mode: 'External leak',               alphaFm: 0.15, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Overheat / scoring',          alphaFm: 0.05, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_hyd_pump_elec': [
        { mode: 'Loss of output',              alphaFm: 0.55, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Reduced output',              alphaFm: 0.25, source: 'DOT-FAA-CT-83-49' },
        { mode: 'External leak',               alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Motor failure',               alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_hyd_servo_valve': [
        { mode: 'Fails open (null-bias)',      alphaFm: 0.30, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Fails closed (locked)',       alphaFm: 0.30, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Spurious / hardover',         alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Internal leak (loss of gain)',alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_hyd_solenoid_valve': [
        { mode: 'Fails open (energized)',      alphaFm: 0.35, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Fails closed (de-energized)', alphaFm: 0.35, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Spurious operation',          alphaFm: 0.15, source: 'DOT-FAA-CT-83-49' },
        { mode: 'External leak',               alphaFm: 0.15, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_hyd_check_valve': [
        { mode: 'Fails to seat (reverse flow)',alphaFm: 0.50, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Fails to open (blocked)',     alphaFm: 0.25, source: 'DOT-FAA-CT-83-49' },
        { mode: 'External leak',               alphaFm: 0.25, source: 'DOT-FAA-CT-83-49' }
    ],
    // ===== NRC patterns from NUREG-CR-6928 =====
    'nrc_valve_mov': [
        { mode: 'Fails to open on demand',     alphaFm: 0.25, source: 'NUREG-CR-6928' },
        { mode: 'Fails to close on demand',    alphaFm: 0.25, source: 'NUREG-CR-6928' },
        { mode: 'Spurious operation',          alphaFm: 0.20, source: 'NUREG-CR-6928' },
        { mode: 'Internal leak',               alphaFm: 0.15, source: 'NUREG-CR-6928' },
        { mode: 'External leak',               alphaFm: 0.15, source: 'NUREG-CR-6928' }
    ],
    'nrc_valve_sov': [
        { mode: 'Fails open',                  alphaFm: 0.35, source: 'NUREG-CR-6928' },
        { mode: 'Fails closed',                alphaFm: 0.35, source: 'NUREG-CR-6928' },
        { mode: 'Spurious operation',          alphaFm: 0.15, source: 'NUREG-CR-6928' },
        { mode: 'External leak',               alphaFm: 0.15, source: 'NUREG-CR-6928' }
    ],
    'nrc_pump_motor_driven': [
        { mode: 'Fails to start',              alphaFm: 0.30, source: 'NUREG-CR-6928' },
        { mode: 'Fails to run (1h)',           alphaFm: 0.50, source: 'NUREG-CR-6928' },
        { mode: 'External leak',               alphaFm: 0.15, source: 'NUREG-CR-6928' },
        { mode: 'Spurious trip',               alphaFm: 0.05, source: 'NUREG-CR-6928' }
    ],
    // ===== Electrical — DOT-FAA-CT-83-49 + AC 25.1309 patterns =====
    'faa_elec_generator': [
        { mode: 'Fails to start',              alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Fails to run',                alphaFm: 0.50, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Spurious trip / disconnect',  alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Reduced / dirty output',      alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_elec_battery': [
        { mode: 'Fails to provide output',     alphaFm: 0.50, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Low capacity / degraded',     alphaFm: 0.30, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Internal short circuit',      alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Electrolyte leak',            alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_elec_tru': [
        { mode: 'No output',                   alphaFm: 0.50, source: 'DOT-FAA-CT-83-49' },
        { mode: 'High output (overvoltage)',   alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Low output / sag',            alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Excessive ripple',            alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_elec_bus_contactor': [
        { mode: 'Fails to open on demand',     alphaFm: 0.40, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Fails to close on demand',    alphaFm: 0.40, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Spurious trip',               alphaFm: 0.20, source: 'DOT-FAA-CT-83-49' }
    ],
    'nrc_breaker_lv': [
        { mode: 'Fails to open on demand',     alphaFm: 0.35, source: 'NUREG-CR-6928' },
        { mode: 'Fails to close on demand',    alphaFm: 0.35, source: 'NUREG-CR-6928' },
        { mode: 'Spurious trip',               alphaFm: 0.30, source: 'NUREG-CR-6928' }
    ],
    // ===== Avionics / Flight Controls =====
    'faa_fc_autopilot': [
        { mode: 'Passive disconnect / blank',  alphaFm: 0.50, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Erroneous output (slowover)', alphaFm: 0.25, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Hardover (fast deviation)',   alphaFm: 0.15, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Mode confusion / latched',    alphaFm: 0.10, source: 'DOT-FAA-CT-83-49' }
    ],
    'faa_eng_fadec': [
        { mode: 'Passive failure (channel B takeover)', alphaFm: 0.55, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Erroneous fuel command',      alphaFm: 0.25, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Spurious shutdown command',   alphaFm: 0.15, source: 'DOT-FAA-CT-83-49' },
        { mode: 'Latched fault (no annunciation)', alphaFm: 0.05, source: 'DOT-FAA-CT-83-49' }
    ],
    'h338_lru_inertial': [
        { mode: 'Loss of attitude',            alphaFm: 0.35, source: 'MIL-HDBK-338B §7' },
        { mode: 'Loss of heading',             alphaFm: 0.25, source: 'MIL-HDBK-338B §7' },
        { mode: 'Drift (slow degradation)',    alphaFm: 0.25, source: 'MIL-HDBK-338B §7' },
        { mode: 'Total loss of output',        alphaFm: 0.15, source: 'MIL-HDBK-338B §7' }
    ],
    'h338_lru_display': [
        { mode: 'Blank / no display',          alphaFm: 0.50, source: 'MIL-HDBK-338B §7' },
        { mode: 'Corrupted image / artifacts', alphaFm: 0.25, source: 'MIL-HDBK-338B §7' },
        { mode: 'Incorrect data (mis-display)',alphaFm: 0.15, source: 'MIL-HDBK-338B §7' },
        { mode: 'Reduced brightness / dim',    alphaFm: 0.10, source: 'MIL-HDBK-338B §7' }
    ],
    // ===== Generic NASA PRA components =====
    'nasa_relay_general': [
        { mode: 'Fails open',                  alphaFm: 0.45, source: 'NASA SP-2011-3421' },
        { mode: 'Fails closed (welded)',       alphaFm: 0.40, source: 'NASA SP-2011-3421' },
        { mode: 'Intermittent contact',        alphaFm: 0.15, source: 'NASA SP-2011-3421' }
    ]
};

// ==========================================
// Standard environments — π_E factor per source standard.
// Each entry: factor that multiplies λ_base. GB = Ground Benign = 1.0 (the reference).
// ==========================================
const STANDARD_ENVIRONMENTS = {
    'MIL-HDBK-217F': {
        'GB':  { label: 'Ground, Benign',                  piE: 1.0  },
        'GF':  { label: 'Ground, Fixed',                   piE: 2.5  },
        'GM':  { label: 'Ground, Mobile',                  piE: 4.0  },
        'NS':  { label: 'Naval, Sheltered',                piE: 4.0  },
        'NU':  { label: 'Naval, Unsheltered',              piE: 6.0  },
        'AIA': { label: 'Airborne, Inhabited Attack',      piE: 4.0  },
        'AIC': { label: 'Airborne, Inhabited Cargo',       piE: 4.0  },
        'AUC': { label: 'Airborne, Uninhabited Cargo',     piE: 8.0  },
        'AUF': { label: 'Airborne, Uninhabited Fighter',   piE: 12.0 },
        'ARW': { label: 'Airborne, Rotary Wing',           piE: 8.0  },
        'SF':  { label: 'Space, Flight',                   piE: 0.5  },
        'MF':  { label: 'Missile, Flight',                 piE: 10.0 },
        'ML':  { label: 'Missile, Launch',                 piE: 13.0 },
        'CL':  { label: 'Cannon, Launch',                  piE: 220.0}
    },
    'NSWC-11':         { 'GENERIC': { label: 'Generic (NSWC handles stress in part-specific multipliers)', piE: 1.0 } },
    // Phase 53.57 — Public-Domain family: π_E = 1.0 by default. Values are taken as
    // published (FAA / NASA / NRC field data already reflects operational environments)
    // so no further derate is applied unless the user overrides via stress prediction.
    'Public Domain':   { 'AS_PUBLISHED': { label: 'As-published (no environment derate)', piE: 1.0 } },
    // Phase 53.59 — Pro · BYOL stubs. Customers hold the publisher's license and import their
    // own CSV; Safety Lab Aero does not redistribute the copyrighted π_E factor tables. The single
    // 'BYOL' entry below tells the engine to use λ values exactly as imported (the customer's
    // CSV already embeds whatever π_E derate they have selected from their own licensed copy).
    '217Plus 2015':       { 'BYOL': { label: 'Per imported CSV (Pro · BYOL Quanterion)',  piE: 1.0 } },
    'FIDES 2022':         { 'BYOL': { label: 'Per imported CSV (Pro · BYOL consortium)',  piE: 1.0 } },
    'Telcordia SR-332':   { 'BYOL': { label: 'Per imported CSV (Pro · BYOL iconectiv)',   piE: 1.0 } },
    'Siemens SN 29500':   { 'BYOL': { label: 'Per imported CSV (Pro · BYOL Siemens AG)',  piE: 1.0 } },
    'IEC TR 62380':       { 'BYOL': { label: 'Per imported CSV (Pro · BYOL IEC)',         piE: 1.0 } }
};

// ==========================================
// Standard quality levels — π_Q factor per source standard.
// ==========================================
const STANDARD_QUALITIES = {
    'MIL-HDBK-217F': {
        'S':   { label: 'Space-Level (Class S / Level 1)',  piQ: 0.030 },
        'B':   { label: 'Military Spec (Class B / Level 2)', piQ: 0.10  },
        'B1':  { label: 'Established Reliability (B-1)',     piQ: 0.30  },
        'B2':  { label: 'Established Reliability (B-2)',     piQ: 1.0   },
        'JAN': { label: 'JAN / JANTX / JANTXV',              piQ: 0.7   },
        'COM': { label: 'Commercial / non-screened',         piQ: 10.0  }
    },
    'NSWC-11':         { 'GENERIC': { label: 'Generic',         piQ: 1.0 } },
    // Phase 53.57 — Public-Domain family: π_Q = 1.0 default. Public-domain handbook
    // values already reflect typical screening / qualification levels.
    'Public Domain':   { 'AS_PUBLISHED': { label: 'As-published (no quality derate)', piQ: 1.0 } },
    // Phase 53.59 — Pro · BYOL stubs. As-imported π_Q from the customer's CSV.
    '217Plus 2015':       { 'BYOL': { label: 'Per imported CSV (Pro · BYOL)', piQ: 1.0 } },
    'FIDES 2022':         { 'BYOL': { label: 'Per imported CSV (Pro · BYOL)', piQ: 1.0 } },
    'Telcordia SR-332':   { 'BYOL': { label: 'Per imported CSV (Pro · BYOL)', piQ: 1.0 } },
    'Siemens SN 29500':   { 'BYOL': { label: 'Per imported CSV (Pro · BYOL)', piQ: 1.0 } },
    'IEC TR 62380':       { 'BYOL': { label: 'Per imported CSV (Pro · BYOL)', piQ: 1.0 } }
};
