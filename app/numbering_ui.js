/* ============================================================================
 * Safety Lab Aero — IDs & Numbering scheme editor (UI)
 * ----------------------------------------------------------------------------
 * Renders the "ID Numbering Scheme" modal (launched from Certification Basis →
 * Data Actions → 🔢 Numbering…). Per-artifact templates, live preview, counter
 * scope, presets, export/import. Applying a scheme is forward-only — it changes
 * how NEW IDs are minted; existing IDs never renumber.
 *
 * Depends on window.SafetyLabNumbering (engine) and window.SafetyLabNumberingState
 * (accessors in safety_lab.js).
 * ==========================================================================*/
(function () {
  'use strict';

  var KIND_ORDER = ['acFunction', 'subFunction', 'fcimMode', 'failureCond', 'faultTree', 'gate', 'basicEvent', 'requirement'];
  var SCOPES = [['global', 'Global'], ['system', 'Per system'], ['parent', 'Per parent']];
  var INP = 'width:100%; box-sizing:border-box; font-family:var(--font-mono,monospace); font-size:12.5px; padding:5px 7px; border:1px solid var(--color-border,#ccc); border-radius:6px; background:var(--color-surface,#fff); color:var(--color-text-primary,#111);';
  var SEL = 'font-size:12.5px; padding:4px 6px; border:1px solid var(--color-border,#ccc); border-radius:6px; background:var(--color-surface,#fff); color:var(--color-text-primary,#111);';

  var working = null;

  function N() { return window.SafetyLabNumbering; }
  function State() { return window.SafetyLabNumberingState; }
  function byId(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function open() {
    if (!N() || !State()) { alert('Numbering engine is not loaded yet — try reloading the page.'); return; }
    working = N().cloneScheme(State().getScheme() || N().DEFAULT_SCHEME);
    render();
    var m = byId('sl-numbering-modal'); if (m) m.style.display = 'flex';
  }
  function close() { var m = byId('sl-numbering-modal'); if (m) m.style.display = 'none'; }

  function render() {
    var body = byId('sl-num-body'); if (!body) return;
    var kinds = N().KINDS;
    var presetOpts = N().PRESETS.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');

    var rows = KIND_ORDER.map(function (k) {
      var t = working.templates[k] || { pattern: '', counterScope: 'global' };
      var scopeCell = t.derived
        ? '<span style="color:#888; font-size:12px;">derived</span>'
        : '<select data-k="' + k + '" data-f="scope" style="' + SEL + '">' +
            SCOPES.map(function (s) { return '<option value="' + s[0] + '"' + (t.counterScope === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') +
          '</select>';
      return '<tr style="border-top:1px solid var(--color-border-hair,#eee);">' +
        '<td style="padding:7px 8px 7px 0; white-space:nowrap;">' + esc(kinds[k].label) + '</td>' +
        '<td style="padding:7px 8px 7px 0; width:46%;"><input data-k="' + k + '" data-f="pattern" value="' + esc(t.pattern || '') + '" style="' + INP + '"></td>' +
        '<td style="padding:7px 8px 7px 0;">' + scopeCell + '</td>' +
        '<td class="sl-num-prev" data-prev="' + k + '" style="padding:7px 0; font-family:var(--font-mono,monospace); font-size:12.5px; white-space:nowrap;">—</td>' +
        '</tr>';
    }).join('');

    body.innerHTML =
      '<p style="font-size:13px; color:var(--color-text-secondary,#666); margin:0 0 12px;">' +
      'Define how IDs are generated. Tokens: ' +
      '<code>{TYPE}</code> <code>{SEQ:000}</code> <code>{SYS}</code> <code>{PARENT}</code> <code>{MODE}</code> <code>{PROGRAM}</code>. ' +
      'Changes apply to <strong>new</strong> items only — existing IDs never renumber.</p>' +
      '<div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">' +
      '<label style="font-size:13px;">Start from a preset:</label>' +
      '<select id="sl-num-preset" style="' + SEL + '">' + presetOpts + '</select>' +
      '<button type="button" id="sl-num-loadpreset" class="secondary-btn" style="font-size:13px;">Load preset</button></div>' +
      '<table style="width:100%; border-collapse:collapse; font-size:13px;">' +
      '<thead><tr style="text-align:left; color:#888; font-size:11.5px; text-transform:uppercase; letter-spacing:.03em;">' +
      '<th style="padding-bottom:4px;">Artifact</th><th>Template</th><th>Counter scope</th><th>Preview</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<div id="sl-num-errs" style="color:#c0392b; font-size:12px; margin-top:10px; min-height:16px;"></div>' +
      '<div style="display:flex; justify-content:space-between; margin-top:18px; gap:10px; flex-wrap:wrap;">' +
      '<div style="display:flex; gap:8px;">' +
      '<button type="button" id="sl-num-reset" class="secondary-btn" style="font-size:13px;">Reset to default</button>' +
      '<button type="button" id="sl-num-export" class="secondary-btn" style="font-size:13px;">Export</button>' +
      '<button type="button" id="sl-num-import" class="secondary-btn" style="font-size:13px;">Import</button>' +
      '<input type="file" id="sl-num-file" accept="application/json" style="display:none;"></div>' +
      '<div style="display:flex; gap:10px;">' +
      '<button type="button" onclick="closeNumberingEditor()" class="secondary-btn">Cancel</button>' +
      '<button type="button" id="sl-num-apply" class="primary-btn">Apply scheme</button></div></div>';

    wire();
    updatePreviews();
  }

  function wire() {
    var body = byId('sl-num-body');
    body.querySelectorAll('input[data-f="pattern"]').forEach(function (inp) {
      inp.addEventListener('input', function () { working.templates[inp.dataset.k].pattern = inp.value; updatePreviews(); });
    });
    body.querySelectorAll('select[data-f="scope"]').forEach(function (sel) {
      sel.addEventListener('change', function () { working.templates[sel.dataset.k].counterScope = sel.value; updatePreviews(); });
    });
    byId('sl-num-loadpreset').onclick = function () {
      var id = byId('sl-num-preset').value;
      var p = N().PRESETS.find(function (x) { return x.id === id; });
      if (p) { working = N().cloneScheme(p); render(); }
    };
    byId('sl-num-reset').onclick = function () { working = N().cloneScheme(N().DEFAULT_SCHEME); render(); };
    byId('sl-num-export').onclick = exportScheme;
    byId('sl-num-import').onclick = function () { byId('sl-num-file').click(); };
    byId('sl-num-file').onchange = importScheme;
    byId('sl-num-apply').onclick = apply;
  }

  function updatePreviews() {
    var errs = [];
    KIND_ORDER.forEach(function (k) {
      var t = working.templates[k];
      var cell = document.querySelector('.sl-num-prev[data-prev="' + k + '"]');
      var v = N().validateTemplate(t.pattern, { derived: !!t.derived });
      if (!v.ok) {
        if (cell) { cell.textContent = '⚠ invalid'; cell.style.color = '#c0392b'; }
        errs.push(N().KINDS[k].label + ': ' + v.errors.join(' '));
        return;
      }
      try { if (cell) { cell.textContent = N().previewId(working, k); cell.style.color = '#1a7f37'; } }
      catch (e) { if (cell) { cell.textContent = '—'; cell.style.color = ''; } }
    });
    var box = byId('sl-num-errs'); if (box) box.textContent = errs.join('   •   ');
    var apply = byId('sl-num-apply'); if (apply) apply.disabled = errs.length > 0;
  }

  function apply() {
    var v = N().validateScheme(working);
    if (!v.ok) { alert('Please fix the highlighted template errors before applying.'); return; }
    State().setScheme(N().cloneScheme(working));
    close();
    alert('Numbering scheme applied. New items will use it — existing IDs are unchanged. Save the project to keep this scheme.');
  }

  function exportScheme() {
    try {
      var blob = new Blob([JSON.stringify(working, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'safety_lab_numbering_scheme.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) { alert('Export failed: ' + e.message); }
  }

  function importScheme(e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function (ev) {
      try {
        var s = JSON.parse(ev.target.result);
        if (!s || !s.templates) throw new Error('not a numbering scheme');
        working = s; render();
      } catch (err) { alert('Invalid scheme file: ' + err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
  }

  window.openNumberingEditor = open;
  window.closeNumberingEditor = close;
})();
