/* ============================================================================
 * Safety Lab Aero — IDs & Numbering engine
 * ----------------------------------------------------------------------------
 * Standalone, dependency-free. Generates automated, STABLE, human-readable IDs
 * for functions, sub-functions, FCIM modes, failure conditions, fault trees,
 * gates, basic events and requirements, from user-definable templates.
 *
 * Core principles:
 *   • Immutable: an ID is assigned once at creation and never renumbers. The
 *     counter only ever moves forward; deletes leave gaps (by design).
 *   • Template-driven: each artifact kind has a pattern built from tokens.
 *   • Scoped counters: a sequence can count globally, per-system, or per-parent.
 *   • Shared identity: repeated/common-mode basic events reuse one ID.
 *   • Forward-only: changing a template affects NEW items only; existing IDs
 *     stay frozen unless an explicit, audited re-number is requested.
 *
 * Exposed as window.SafetyLabNumbering (browser) and module.exports (node test).
 * ==========================================================================*/
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SafetyLabNumbering = api;
}(this, function () {
  'use strict';

  // The artifact kinds we number, with their default type code.
  var KINDS = {
    acFunction:  { type: 'AF',  label: 'Aircraft function' },
    subFunction: { type: 'SF',  label: 'Sub-function' },
    fcimMode:    { type: 'FM',  label: 'FCIM failure mode' },
    failureCond: { type: 'FC',  label: 'Failure condition' },
    faultTree:   { type: 'FT',  label: 'Fault tree (top event)' },
    gate:        { type: 'G',   label: 'Gate' },
    basicEvent:  { type: 'BE',  label: 'Basic event' },
    requirement: { type: 'REQ', label: 'Requirement' }
  };

  // ---- Token grammar -------------------------------------------------------
  // {TYPE}              the artifact type code (FC, AF, …)
  // {SEQ} / {SEQ:000}   the counter, optional zero-pad ('000' → width 3, '4' → width 4)
  // {SYS}              system / scope prefix
  // {PARENT}           parent ID (sub-function → its function, FCIM mode → sub-function)
  // {MODE}             FCIM mode suffix (TL / PL / M) — supplied by caller
  // {PROJECT} {PROGRAM} {YEAR}   project-level context
  var TOKEN_RE = /\{([A-Z]+)(?::([0-9]+))?\}/g;

  function pad(n, fmt) {
    var s = String(n);
    if (!fmt) return s;
    var width = /^0+$/.test(fmt) ? fmt.length : parseInt(fmt, 10);
    if (!width || width < s.length) return s;
    return s.padStart(width, '0');
  }

  // Expand a pattern against a context map. Missing tokens collapse to '' and
  // dangling separators are cleaned up so '{SYS}-{TYPE}' with no SYS → 'FC'.
  function expand(pattern, ctx) {
    var out = String(pattern).replace(TOKEN_RE, function (_, name, fmt) {
      if (name === 'SEQ') return pad(ctx.SEQ != null ? ctx.SEQ : '', fmt);
      var v = ctx[name];
      return (v == null) ? '' : String(v);
    });
    // tidy separators left by empty tokens
    out = out.replace(/([-_.\/])\1+/g, '$1')        // collapse doubled separators
             .replace(/^[-_.\/]+|[-_.\/]+$/g, '');    // trim leading/trailing
    return out;
  }

  function parseTokens(pattern) {
    var names = [], m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(pattern)) !== null) names.push(m[1]);
    return names;
  }

  // Validate a template. requireSeq=true means it must contain a uniqueness
  // token (SEQ), unless it is a derived kind that is unique via PARENT+MODE.
  function validateTemplate(pattern, opts) {
    opts = opts || {};
    var errors = [];
    if (!pattern || !String(pattern).trim()) { errors.push('Template is empty.'); return { ok: false, errors: errors }; }
    var tokens = parseTokens(pattern);
    var KNOWN = ['TYPE', 'SEQ', 'SYS', 'PARENT', 'MODE', 'PROJECT', 'PROGRAM', 'YEAR'];
    tokens.forEach(function (t) { if (KNOWN.indexOf(t) === -1) errors.push('Unknown token {' + t + '}.'); });
    var unique = tokens.indexOf('SEQ') !== -1 ||
                 (opts.derived && tokens.indexOf('PARENT') !== -1 && tokens.indexOf('MODE') !== -1);
    if (!unique) errors.push('Template must include {SEQ} so IDs are guaranteed unique.');
    if (/[^A-Za-z0-9{}:_.\/\- ]/.test(pattern)) errors.push('Only letters, numbers and - _ . / separators are allowed.');
    return { ok: errors.length === 0, errors: errors };
  }

  // ---- Counter store -------------------------------------------------------
  // Shape: { seq: { 'FC|_': 12, 'SF|AF-003': 4 }, map: { basicEvent: { '<key>': 'BE-014' } } }
  function newStore() { return { seq: {}, map: {} }; }

  function scopeKeyFor(scope, ctx) {
    if (scope === 'system') return ctx.SYS || '_';
    if (scope === 'parent') return ctx.PARENT || '_';
    return '_'; // global
  }

  function allocateSeq(store, typeCode, scope, ctx) {
    var k = typeCode + '|' + scopeKeyFor(scope, ctx);
    store.seq[k] = (store.seq[k] || 0) + 1;   // forward-only; never decremented
    return store.seq[k];
  }

  // Seed a counter so it sits ABOVE any pre-existing IDs (migration on load).
  function seedCounter(store, typeCode, scope, ctx, maxSeq) {
    var k = typeCode + '|' + scopeKeyFor(scope, ctx);
    store.seq[k] = Math.max(store.seq[k] || 0, maxSeq || 0);
  }

  // ---- ID generation -------------------------------------------------------
  function templateFor(scheme, kind) {
    var t = (scheme && scheme.templates && scheme.templates[kind]) || null;
    if (!t) t = DEFAULT_SCHEME.templates[kind];
    return t;
  }

  // Allocate a brand-new ID for an artifact instance.
  //   scheme : the active numbering scheme
  //   kind   : one of KINDS
  //   ctx    : { SYS, PARENT, PROJECT, PROGRAM, YEAR, MODE } as available
  //   store  : counter store (mutated)
  function makeId(scheme, kind, ctx, store) {
    ctx = ctx || {};
    var t = templateFor(scheme, kind);
    var fullCtx = Object.assign({}, ctx, { TYPE: ctx.TYPE || t.type });
    if (parseTokens(t.pattern).indexOf('SEQ') !== -1) {
      fullCtx.SEQ = allocateSeq(store, t.type, t.counterScope || 'global', fullCtx);
    }
    return expand(t.pattern, fullCtx);
  }

  // Allocate an ID once per logical key and reuse it thereafter (shared basic
  // events / common-mode: every repeat of the same physical event = same ID).
  function makeSharedId(scheme, kind, key, ctx, store) {
    if (!store.map[kind]) store.map[kind] = {};
    if (store.map[kind][key] != null) return store.map[kind][key];
    var id = makeId(scheme, kind, ctx, store);
    store.map[kind][key] = id;
    return id;
  }

  function previewId(scheme, kind, ctx) {
    var t = templateFor(scheme, kind);
    var c = Object.assign({ SYS: 'NAV', PARENT: (KINDS.subFunction.type) + '-014', MODE: 'TL',
                            PROJECT: 'PRJ', PROGRAM: 'ALIA', YEAR: new Date().getFullYear() },
                          ctx || {}, { TYPE: t.type, SEQ: 12 });
    return expand(t.pattern, c);
  }

  // ---- Outline numbers -----------------------------------------------------
  // Stable IDs never change; the outline number is a SEPARATE, derived display
  // that reflects current hierarchy/order (e.g. 3.2) and may change on reorg.
  // `nodes` is an ordered array of { id, parentId|null }. Returns map id→outline.
  function computeOutline(nodes) {
    var children = {}, roots = [];
    nodes.forEach(function (n) {
      var p = n.parentId == null ? '__root__' : n.parentId;
      (children[p] = children[p] || []).push(n.id);
      if (n.parentId == null) roots.push(n.id);
    });
    var out = {};
    function walk(id, prefix) {
      out[id] = prefix;
      (children[id] || []).forEach(function (cid, i) { walk(cid, prefix + '.' + (i + 1)); });
    }
    roots.forEach(function (rid, i) { walk(rid, String(i + 1)); });
    return out;
  }

  // ---- Default scheme + presets -------------------------------------------
  var DEFAULT_SCHEME = {
    id: 'default', name: 'Safety Lab Aero default',
    templates: {
      acFunction:  { type: 'AF',  pattern: '{TYPE}-{SEQ:000}',        counterScope: 'global' },
      subFunction: { type: 'SF',  pattern: '{TYPE}-{SEQ:000}',        counterScope: 'global' },
      fcimMode:    { type: 'FM',  pattern: '{PARENT}-{MODE}',         counterScope: 'global', derived: true },
      failureCond: { type: 'FC',  pattern: '{TYPE}-{SEQ:000}',        counterScope: 'global' },
      faultTree:   { type: 'FT',  pattern: '{TYPE}-{SEQ:000}',        counterScope: 'global' },
      gate:        { type: 'G',   pattern: '{TYPE}-{SEQ:000}',        counterScope: 'global' },
      basicEvent:  { type: 'BE',  pattern: '{TYPE}-{SEQ:000}',        counterScope: 'global' },
      requirement: { type: 'REQ', pattern: '{TYPE}-{SEQ:0000}',       counterScope: 'global' }
    }
  };

  var PRESETS = [
    DEFAULT_SCHEME,
    {
      id: 'system-scoped', name: 'System-scoped',
      templates: {
        acFunction:  { type: 'AF',  pattern: '{TYPE}-{SEQ:000}',          counterScope: 'global' },
        subFunction: { type: 'SF',  pattern: '{TYPE}-{SEQ:000}',          counterScope: 'global' },
        fcimMode:    { type: 'FM',  pattern: '{PARENT}-{MODE}',           counterScope: 'global', derived: true },
        failureCond: { type: 'FC',  pattern: '{SYS}-{TYPE}-{SEQ:000}',    counterScope: 'system' },
        faultTree:   { type: 'FT',  pattern: '{SYS}-{TYPE}-{SEQ:000}',    counterScope: 'system' },
        gate:        { type: 'G',   pattern: '{TYPE}-{SEQ:000}',          counterScope: 'global' },
        basicEvent:  { type: 'BE',  pattern: '{TYPE}-{SEQ:000}',          counterScope: 'global' },
        requirement: { type: 'REQ', pattern: '{TYPE}-{SEQ:0000}',         counterScope: 'global' }
      }
    },
    {
      id: 'program-prefixed', name: 'Program-prefixed',
      templates: {
        acFunction:  { type: 'AF',  pattern: '{PROGRAM}.{TYPE}.{SEQ:000}',  counterScope: 'global' },
        subFunction: { type: 'SF',  pattern: '{PROGRAM}.{TYPE}.{SEQ:000}',  counterScope: 'global' },
        fcimMode:    { type: 'FM',  pattern: '{PARENT}-{MODE}',             counterScope: 'global', derived: true },
        failureCond: { type: 'FC',  pattern: '{PROGRAM}.{TYPE}.{SEQ:000}',  counterScope: 'global' },
        faultTree:   { type: 'FT',  pattern: '{PROGRAM}.{TYPE}.{SEQ:000}',  counterScope: 'global' },
        gate:        { type: 'G',   pattern: '{PROGRAM}.{TYPE}.{SEQ:000}',  counterScope: 'global' },
        basicEvent:  { type: 'BE',  pattern: '{PROGRAM}.{TYPE}.{SEQ:000}',  counterScope: 'global' },
        requirement: { type: 'REQ', pattern: '{PROGRAM}.{TYPE}.{SEQ:0000}', counterScope: 'global' }
      }
    }
  ];

  function cloneScheme(s) { return JSON.parse(JSON.stringify(s)); }

  function validateScheme(scheme) {
    var errs = {};
    Object.keys(KINDS).forEach(function (kind) {
      var t = scheme.templates && scheme.templates[kind];
      if (!t) { errs[kind] = ['Missing template.']; return; }
      var r = validateTemplate(t.pattern, { derived: !!t.derived });
      if (!r.ok) errs[kind] = r.errors;
    });
    return { ok: Object.keys(errs).length === 0, errors: errs };
  }

  return {
    KINDS: KINDS,
    DEFAULT_SCHEME: DEFAULT_SCHEME,
    PRESETS: PRESETS,
    newStore: newStore,
    expand: expand,
    parseTokens: parseTokens,
    validateTemplate: validateTemplate,
    validateScheme: validateScheme,
    allocateSeq: allocateSeq,
    seedCounter: seedCounter,
    makeId: makeId,
    makeSharedId: makeSharedId,
    previewId: previewId,
    computeOutline: computeOutline,
    cloneScheme: cloneScheme
  };
}));
