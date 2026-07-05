// ============================================================================
// engine_selftest.js — v1.0 — Q6: in-app engine self-test attestation.
//
// The Math Validation tab already carries the 25 cited benchmarks (Vesely,
// Andrews & Moss, NUREG/CR-5485, Trivedi, …) with stepwise breakdowns. What
// it did NOT do is leave a trace: a reviewer reading an evidence package had
// no way to know the numerical engines were exercised on the machine and
// build that produced the numbers.
//
// This module turns the suite into an ATTESTATION: "Verify engine" runs all
// benchmarks in the user's browser and stamps the outcome — when, pass
// count, per-failure names, runtime, browser — into
// projectConfig.engineSelfTest, whence the evidence package (§10j) and the
// Thread Integrity page surface it. The evidence-package builder also runs
// the suite FRESH at package build, so every shipped package carries a
// same-session engine verification, not a stale one.
//
// The suite is the monolith's own BENCHMARKS + runOneBenchmark (single
// source of truth) — this module adds no fixtures and never mutates data.
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _browserLabel() {
        try {
            const ua = navigator.userAgent || '';
            const m = ua.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/g);
            return m ? m[m.length - 1] : ua.slice(0, 40);
        } catch (_) { return 'unknown'; }
    }

    function engineSelfTest(opts) {
        opts = opts || {};
        if (typeof BENCHMARKS === 'undefined' || typeof runOneBenchmark !== 'function')
            throw new Error('benchmark suite unavailable in this build');
        const t0 = Date.now();
        const results = BENCHMARKS.map(runOneBenchmark);
        const fails = results.filter(r => !r.pass);
        const out = {
            at: new Date().toISOString(),
            total: results.length,
            pass: results.length - fails.length,
            ok: fails.length === 0,
            ms: Date.now() - t0,
            browser: _browserLabel(),
            fails: fails.map(f => f.id + ' ' + f.name + (f.error ? ' — ' + f.error : ''))
        };
        try {
            if (!opts.skipStamp && typeof projectConfig !== 'undefined') {
                projectConfig.engineSelfTest = out;
                if (typeof scheduleAutosave === 'function') scheduleAutosave();
            }
        } catch (_) {}
        return out;
    }

    // ------------------------------------------------------------- UI action
    window.engineSelfTestUi = function () {
        try {
            const r = engineSelfTest();
            try {
                if (typeof showToast === 'function') {
                    showToast(r.ok
                        ? 'Engine verified: ' + r.pass + '/' + r.total + ' benchmarks passed on this machine (' + r.ms + ' ms).'
                        : 'ENGINE SELF-TEST FAILED — ' + r.fails.length + ' benchmark(s): ' + r.fails.slice(0, 3).join('; '),
                        r.ok ? 'success' : 'error', r.ok ? 4000 : 8000);
                }
            } catch (_) {}
            _injectPanel();
        } catch (e) { alert('Self-test failed to run: ' + e.message); }
    };

    // ------------------------------------------- panel on Thread Integrity
    function _injectPanel() {
        const host = document.getElementById('gt-integrity-host');
        if (!host) return;
        let div = document.getElementById('gt-selftest-panel');
        if (!div) {
            div = document.createElement('div');
            div.id = 'gt-selftest-panel';
            host.appendChild(div);
        }
        const last = (typeof projectConfig !== 'undefined' && projectConfig.engineSelfTest) || null;
        div.innerHTML =
            '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:18px;">' +
            '<div style="padding:9px 14px; border-bottom:2px solid var(--color-text-primary); display:flex; justify-content:space-between; align-items:center;">' +
            '<b>Engine self-test</b>' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:2px 10px;" onclick="engineSelfTestUi()">Verify engine…</button></div>' +
            '<p style="font-size:12px; color:var(--color-text-secondary); padding:8px 14px 4px;">Runs the 25 published-reference benchmarks (Math Validation tab) in THIS browser and stamps the outcome into the project and every evidence package — the math was tested on this machine, this session.</p>' +
            '<p class="u-mono" style="font-size:11px; padding:0 14px 10px;' + (last && !last.ok ? ' color:#8E2A2A; font-weight:600;' : ' color:var(--color-text-tertiary);') + '">' +
            (last
                ? ('Last run ' + String(last.at).slice(0, 16).replace('T', ' ') + ' — ' +
                    (last.ok ? 'VERIFIED ✓ ' + last.pass + '/' + last.total + ' (' + last.ms + ' ms, ' + _esc(last.browser) + ')'
                        : 'FAILED: ' + _esc(last.fails.slice(0, 3).join('; '))))
                : 'Not yet run on this project.') + '</p></div>';
    }

    (function wrap() {
        if (typeof window.switchTab === 'function' && !window.switchTab._selftestWrapped) {
            const orig = window.switchTab;
            const wrapped = function (tabId) {
                const r = orig.apply(this, arguments);
                try { if (tabId === 'gt-integrity') setTimeout(_injectPanel, 140); } catch (_) {}
                return r;
            };
            wrapped._selftestWrapped = true;
            window.switchTab = wrapped;
        }
    })();

    // ------------------------------------------------------------- exports
    window.engineSelfTest = engineSelfTest;
})();
