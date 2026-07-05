// ai_memory.js — extracted verbatim from safety_lab.js (Phase 76 modularization).
// Classic script, shares the global lexical scope; loaded BEFORE safety_lab.js.
// The IIFE is self-contained at definition time — AI_IDB_NAME / AI_IDB_STORE are read
// only inside its methods (at runtime), so they resolve from safety_lab.js's globals.
// Behavior is byte-identical to the original in-monolith definition.

// ----------------------------------------------------------------------------
// AiMemory — IndexedDB-backed review memory store. Phase 53.66 will hook this
// into the actual feature loops. For Phase 53.65 we expose count() + clear()
// so the Settings panel can show the running count and let users wipe it.
// ----------------------------------------------------------------------------
const AiMemory = (function(){
    let _db = null;
    function _open(){
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(AI_IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(AI_IDB_STORE)) {
                    const store = db.createObjectStore(AI_IDB_STORE, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('feature', 'feature', { unique: false });
                    store.createIndex('ts', 'ts', { unique: false });
                }
            };
            req.onsuccess = () => { _db = req.result; resolve(_db); };
            req.onerror = () => reject(req.error);
        });
    }
    async function add(entry){
        const db = await _open();
        return new Promise((res, rej) => {
            const tx = db.transaction(AI_IDB_STORE, 'readwrite');
            tx.objectStore(AI_IDB_STORE).add(Object.assign({ ts: Date.now() }, entry));
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }
    async function count(){
        const db = await _open();
        return new Promise((res, rej) => {
            const req = db.transaction(AI_IDB_STORE, 'readonly').objectStore(AI_IDB_STORE).count();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    }
    async function clear(){
        const db = await _open();
        return new Promise((res, rej) => {
            const tx = db.transaction(AI_IDB_STORE, 'readwrite');
            tx.objectStore(AI_IDB_STORE).clear();
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
        });
    }
    async function all(){
        const db = await _open();
        return new Promise((res, rej) => {
            const req = db.transaction(AI_IDB_STORE, 'readonly').objectStore(AI_IDB_STORE).getAll();
            req.onsuccess = () => res(req.result || []);
            req.onerror = () => rej(req.error);
        });
    }
    return { add, count, clear, all };
})();
window.AiMemory = AiMemory;
