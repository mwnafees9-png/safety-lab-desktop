// ============================================================================
// lock_delta.js — v1.0 — L4: the baseline delta report. What changed between
// seal and re-seal, tied to the PR that authorized it.
//
// Every baseline stamps the journal head sequence it was sealed at. Every
// reopen stamps the sequence it opened at. When a reopened gate re-baselines,
// the completed cycle is recorded: gate, PR, the journal window [from → to],
// and the artifact families the PR declared. The REG report gains §5b — per
// completed PR cycle, the exact journaled acts that happened inside the
// window. This is the change-summary page a certification review asks for:
// not "trust us, we only touched requirements" but the hash-chained act list
// that proves it — beside the PR that authorized each act.
//
// ARP4754B §5.6 alignment: this is status accounting made mechanical —
// change identification, authorization, and implementation, per gate, per PR.
// ============================================================================
(function () {
    'use strict';

    function _pc() { return (typeof projectConfig !== 'undefined' ? projectConfig : {}) || {}; }
    function _bl() { const pc = _pc(); if (!pc.gateBaselines) pc.gateBaselines = {}; return pc.gateBaselines; }
    function _jseq() {
        try {
            const st = (typeof window._jrnlStore === 'function') ? window._jrnlStore() : null;
            const e = st && st.entries;
            return (e && e.length) ? e[e.length - 1].seq : 0;
        } catch (_) { return 0; }
    }
    function _deltas() { const pc = _pc(); if (!Array.isArray(pc.baselineDeltas)) pc.baselineDeltas = []; return pc.baselineDeltas; }

    // stamp the seal sequence on baseline; close the cycle on re-baseline
    (function wrapApply() {
        if (typeof window._blApply !== 'function' || window._blApply._deltaWrapped) return;
        const orig = window._blApply;
        const wrapped = function (gate, by, note) {
            const prev = _bl()[gate];   // capture BEFORE orig overwrites
            const ok = orig.apply(this, arguments);
            if (ok) {
                try {
                    const now = _jseq();
                    _bl()[gate].jseq = now;
                    if (prev && prev.state === 'reopened' && prev.prId) {
                        _deltas().push({
                            gate, prId: prev.prId,
                            from: prev.reopenJseq != null ? prev.reopenJseq : (prev.jseq || 0),
                            to: now,
                            artifacts: prev.reopenArtifacts || [],
                            reopenedBy: prev.reopenedBy || '', rebaselinedBy: String(by).trim(),
                            reopenedAt: prev.reopenedAt || null, rebaselinedAt: Date.now(),
                        });
                        if (typeof window.jrnl === 'function') window.jrnl('baseline-delta', gate + ' cycle closed: ' + prev.prId + ' — journal window seq ' + (prev.reopenJseq || '?') + ' → ' + now);
                    }
                } catch (_) {}
            }
            return ok;
        };
        wrapped._deltaWrapped = true;
        window._blApply = wrapped;
    })();

    (function wrapReopen() {
        if (typeof window._blReopenApply !== 'function' || window._blReopenApply._deltaWrapped) return;
        const orig = window._blReopenApply;
        const wrapped = function (gate, p) {
            const r = orig.apply(this, arguments);
            if (r && r.ok) {
                try {
                    const b = _bl()[gate];
                    b.reopenJseq = _jseq();
                    b.reopenArtifacts = (p && p.artifacts || []).slice();
                } catch (_) {}
            }
            return r;
        };
        wrapped._deltaWrapped = true;
        window._blReopenApply = wrapped;
    })();

    // ------------------------------------------------- the register builder
    function regDeltas() {
        const rows = [];
        let entries = [];
        try { entries = ((window._jrnlStore && window._jrnlStore()) || {}).entries || []; } catch (_) {}
        _deltas().forEach(d => {
            const acts = entries.filter(e => e.seq > (d.from || 0) && e.seq <= (d.to || 0));
            rows.push({
                'Gate': d.gate, 'PR': d.prId,
                'Declared scope': (d.artifacts || []).join('; ') || '—',
                'Journal window': 'seq ' + (d.from || 0) + ' → ' + (d.to || 0) + ' (' + acts.length + ' act(s))',
                'Acts in window': acts.map(e => '[' + e.kind + '] ' + String(e.s).slice(0, 70)).join('  ·  ') || '(no journaled acts in window)',
                'Reopened / re-baselined by': (d.reopenedBy || '?') + ' / ' + (d.rebaselinedBy || '?'),
            });
        });
        return rows;
    }

    // extend REG: §5b delta table
    function _extend() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        if (T.REG.indexOf('{{reg_deltas}}') < 0) {
            T.REG = T.REG.replace('{{reg_baselines}}',
                '{{reg_baselines}}\n\n' +
                '### 5b. Baseline delta record (per Problem Report)\n' +
                'Every completed reopen cycle: the PR that authorized it, the artifact families it declared, and the exact journaled acts that occurred inside the reopen window — the hash chain beneath each act makes the record tamper-evident.\n' +
                '{{reg_deltas}}');
        }
        if (!window.Reports.extractData._deltaWrapped) {
            const orig = window.Reports.extractData;
            const wrapped = function (reportType) {
                const data = orig.apply(this, arguments);
                try { if (reportType === 'REG') data.reg_deltas = regDeltas(); } catch (_) { data.reg_deltas = []; }
                return data;
            };
            wrapped._deltaWrapped = true;
            window.Reports.extractData = wrapped;
        }
        return true;
    }
    if (!_extend()) { let tries = 20; const t = setInterval(() => { if (_extend() || --tries <= 0) clearInterval(t); }, 300); }

    // ------------------------------------------------------------- exports
    window.blDeltas = regDeltas;
})();
