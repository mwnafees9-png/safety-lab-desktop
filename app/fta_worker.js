/* ============================================================================
 * Safety Lab Aero — cut-set enumeration Web Worker (#19)
 * ----------------------------------------------------------------------------
 * Runs the SAME engine as the main thread (fta_engine.js) off the UI thread so
 * large fault trees don't freeze the page. Air-gap / ITAR safe: importScripts is
 * same-origin only, the worker reaches no network and emits nothing off-device.
 *
 * Protocol:
 *   in : { id, root }        root = a transfer-FLATTENED tree (self-contained)
 *   out: { id, ok:true,  cutsets:[{ ids:[...], dyn?:{o,ord} }, ...] }
 *        { id, ok:false, name, count, message }   (name='CutsetExplosionError' on budget abort)
 * The main thread reconstructs node objects from the ids, so the result is
 * identical to calling getCutsets() synchronously.
 * ========================================================================== */
importScripts('fta_engine.js');
self.onmessage = function (e) {
    var msg = e.data || {};
    try {
        if (msg.op === 'ptop') {
            // #17 — exact P(top) + importance over a transfer-flattened, probability-baked tree.
            self.postMessage({ id: msg.id, ok: true, ptop: SLFTAEngine.computeImportanceForWorker(msg.root) });
            return;
        }
        var cutsets = SLFTAEngine.enumerateForWorker(msg.root);
        self.postMessage({ id: msg.id, ok: true, cutsets: cutsets });
    } catch (err) {
        self.postMessage({
            id: msg.id, ok: false,
            name: (err && err.name) || 'Error',
            count: (err && err.count) || 0,
            message: (err && err.message) || String(err)
        });
    }
};
