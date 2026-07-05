// ============================================================================
// do160_ledger.js — v1.0 — C2: DO-160 environmental qualification ledger.
//
// Per item, per DO-160 section: the CLAIMED category and the substantiating
// test-report reference — user-entered, signed. The section index below is a
// factual table of contents (section numbers + subject areas); category
// definitions and procedures live in the program's copy of the standard.
//
// THE DUAL-LANE RECONCILE: the PRA already names environmental threats
// (HIRF, lightning, icing). An item whose system sits in a PRA threat's
// blast radius, with no qualification claim for the matching DO-160
// section, is a FINDING — the elicited PRA mitigation and the equipment
// qualification record disagree. INV-25 (advisory) names each one.
//
// Prints via REG §11b (Environmental qualification register).
// ============================================================================
(function () {
    'use strict';

    function _esc(s) {
        if (typeof esc === 'function') return esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _items() { return (typeof itemsData !== 'undefined' ? itemsData : []) || []; }
    function _jr(k, m) { try { if (typeof window.jrnl === 'function') window.jrnl(k, m); } catch (_) {} }
    function _save() { try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch (_) {} }

    // factual section index (numbers + subjects) — not the standard's text
    const SECTIONS = [
        ['4',  'Temperature & altitude'], ['5', 'Temperature variation'], ['6', 'Humidity'],
        ['7',  'Operational shock & crash safety'], ['8', 'Vibration'], ['10', 'Waterproofness'],
        ['11', 'Fluids susceptibility'], ['12', 'Sand & dust'], ['13', 'Fungus'], ['14', 'Salt fog'],
        ['15', 'Magnetic effect'], ['16', 'Power input'], ['17', 'Voltage spike'],
        ['18', 'Audio-frequency susceptibility'], ['19', 'Induced signal susceptibility'],
        ['20', 'RF susceptibility (incl. HIRF)'], ['21', 'RF emission'],
        ['22', 'Lightning — induced transients'], ['23', 'Lightning — direct effects'],
        ['24', 'Icing'], ['25', 'Electrostatic discharge'], ['26', 'Fire & flammability'],
    ];
    // PRA threat keyword → the DO-160 sections that substantiate the equipment side
    const THREAT_SECTIONS = [
        { re: /hirf|radio|radiated/i, secs: ['20'] },
        { re: /lightning/i, secs: ['22', '23'] },
        { re: /icing|ice/i, secs: ['24'] },
        { re: /fire/i, secs: ['26'] },
    ];

    window.do160Claim = function (itemId, section, category, ref, by) {
        const it = _items().find(x => x && x.itemId === itemId);
        if (!it) return { ok: false, err: 'Item not found.' };
        if (!SECTIONS.some(s => s[0] === String(section))) return { ok: false, err: 'Unknown DO-160 section.' };
        if (!String(category || '').trim()) return { ok: false, err: 'A claimed category is required.' };
        if (!String(by || '').trim()) return { ok: false, err: 'A signature is required.' };
        if (!it.do160) it.do160 = {};
        it.do160[String(section)] = { category: String(category).trim(), ref: String(ref || '').trim(), by: String(by).trim(), at: new Date().toISOString() };
        _jr('do160-claim', it.itemId + ' §' + section + ' category ' + category + (ref ? ' (' + ref + ')' : '') + ' — signed ' + by);
        _save();
        return { ok: true };
    };

    // items implicated by a PRA threat = items owned by the threat's affected systems
    function _threatItems(pra) {
        const sysIds = new Set();
        (Array.isArray(pra.systems) ? pra.systems : String(pra.systems || '').split(/[,;]\s*/)).forEach(s => { if (s) sysIds.add(s); });
        // demo stores names or ids — match either
        const byName = {};
        (((typeof systemsData !== 'undefined' ? systemsData : []) || [])).forEach(s => { byName[s.name] = s.id; byName[s.id] = s.id; });
        const ids = new Set([...sysIds].map(s => byName[s]).filter(Boolean));
        return _items().filter(it => ids.has(it.owningSystemId));
    }

    function do160Findings() {
        const out = [];
        (((typeof praData !== 'undefined' ? praData : []) || [])).forEach(p => {
            const rule = THREAT_SECTIONS.find(t => t.re.test(p.threat || ''));
            if (!rule) return;
            _threatItems(p).forEach(it => {
                const missing = rule.secs.filter(sec => !(it.do160 || {})[sec]);
                if (missing.length) out.push({
                    pra: p.praId || '', threat: p.threat || '', item: it.itemId,
                    missing: missing.map(s => '§' + s).join(', '),
                });
            });
        });
        return out;
    }

    function do160Rows() {
        const rows = [];
        _items().forEach(it => {
            Object.keys(it.do160 || {}).sort((a, b) => +a - +b).forEach(sec => {
                const c = it.do160[sec];
                const subj = (SECTIONS.find(s => s[0] === sec) || [])[1] || '';
                rows.push({ 'Item': it.itemId, 'Section': '§' + sec + ' ' + subj, 'Claimed category': c.category, 'Test report': c.ref || '—', 'Signed': c.by + ' ' + String(c.at).slice(0, 10) });
            });
        });
        return rows;
    }

    // INV-25 (advisory): PRA threat vs missing qualification claim
    (function register() {
        function reg() {
            if (typeof window.invRegister !== 'function') return false;
            window.invRegister({
                id: 'INV-25', name: 'Every PRA environmental threat is matched by DO-160 claims on implicated items', sev: 'advisory',
                run: () => {
                    const f = do160Findings();
                    let checked = 0;
                    (((typeof praData !== 'undefined' ? praData : []) || [])).forEach(p => { if (THREAT_SECTIONS.some(t => t.re.test(p.threat || ''))) checked += _threatItems(p).length; });
                    return { checked, fails: f.map(x => x.item + ': in ' + x.pra + ' (' + x.threat + ') blast radius with no DO-160 ' + x.missing + ' claim — PRA mitigation and equipment qualification disagree') };
                }
            });
            return true;
        }
        if (!reg()) { let tries = 20; const t = setInterval(() => { if (reg() || --tries <= 0) clearInterval(t); }, 300); }
    })();

    // ----------------------------------------- panel on the items master list
    function _render() {
        const view = document.getElementById('view-items');
        if (!view) return;
        let div = document.getElementById('do160-panel');
        if (!div) { div = document.createElement('div'); div.id = 'do160-panel'; view.appendChild(div); }
        const f = do160Findings();
        let html = '<div style="border:1px solid var(--color-border-strong); background:var(--color-surface-1); margin-top:var(--s-5);">' +
            '<div style="padding:8px 14px; border-bottom:1px solid var(--color-border-strong); font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">DO-160 environmental qualification ledger (C2)</div>' +
            '<div style="padding:8px 14px; font-size:11.5px; color:var(--color-text-secondary);">Claimed category + test-report reference per section, signed. The PRA&#8217;s environmental threats are reconciled against these claims — disagreement is a finding (INV-25).</div>';
        if (f.length) {
            html += '<div style="padding:8px 14px; border-top:1px solid var(--color-border-hair);">' +
                f.map(x => '<div style="font-size:12px; padding:4px 0; border-left:3px solid #B7791F; padding-left:10px; margin:4px 0;"><b>' + _esc(x.item) + '</b> sits in ' + _esc(x.pra) + ' (' + _esc(x.threat) + ') blast radius with no ' + _esc(x.missing) + ' claim.</div>').join('') + '</div>';
        }
        html += '<div style="padding:8px 14px; border-top:1px solid var(--color-border-hair); display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
            '<select id="d16-item" class="state-select" style="font-size:11.5px;">' + _items().map(it => '<option value="' + _esc(it.itemId) + '">' + _esc(it.itemId) + '</option>').join('') + '</select>' +
            '<select id="d16-sec" class="state-select" style="font-size:11.5px;">' + SECTIONS.map(s => '<option value="' + s[0] + '">§' + s[0] + ' ' + _esc(s[1]) + '</option>').join('') + '</select>' +
            '<input id="d16-cat" type="text" placeholder="Category (e.g. B2, R)" style="font-size:11.5px; padding:4px 8px; width:130px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);">' +
            '<input id="d16-ref" type="text" placeholder="Test report ref" style="font-size:11.5px; padding:4px 8px; width:160px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);">' +
            '<input id="d16-by" type="text" placeholder="Signature" style="font-size:11.5px; padding:4px 8px; width:110px; border:1px solid var(--color-border-strong); background:var(--color-surface-2); color:var(--color-text-primary);">' +
            '<button class="ckpt-m-btn" style="font-size:11px; padding:3px 12px;" onclick="_d16AddUi()">Record claim</button>' +
            '<span id="d16-err" style="color:var(--color-danger); font-size:11px; font-weight:600;"></span></div>';
        const rows = do160Rows();
        if (rows.length) {
            html += '<table class="data-table" style="width:100%; font-size:12px;"><thead><tr><th>Item</th><th>Section</th><th>Category</th><th>Test report</th><th>Signed</th></tr></thead><tbody>' +
                rows.map(r => '<tr><td>' + _esc(r['Item']) + '</td><td>' + _esc(r['Section']) + '</td><td class="u-mono">' + _esc(r['Claimed category']) + '</td><td class="u-mono" style="font-size:11px;">' + _esc(r['Test report']) + '</td><td style="font-size:11px;">' + _esc(r['Signed']) + '</td></tr>').join('') +
                '</tbody></table>';
        }
        html += '</div>';
        div.innerHTML = html;
    }
    window._d16AddUi = function () {
        const g = id => (document.getElementById(id) || { value: '' }).value;
        const r = window.do160Claim(g('d16-item'), g('d16-sec'), g('d16-cat'), g('d16-ref'), g('d16-by'));
        const err = document.getElementById('d16-err');
        if (!r.ok) { if (err) err.textContent = r.err; return; }
        _render();
    };
    (function wrapNav() {
        if (typeof window.switchTab !== 'function' || window.switchTab._d16Wrapped) return;
        const orig = window.switchTab;
        const wrapped = function (tabId) {
            const r = orig.apply(this, arguments);
            try { if (tabId === 'items') setTimeout(_render, 120); } catch (_) {}
            return r;
        };
        wrapped._d16Wrapped = true;
        window.switchTab = wrapped;
    })();

    // ---------------------------------------------- REG §11b print path
    function _extend() {
        if (!window.Reports || !window.Reports.DEFAULT_TEMPLATES || !window.Reports.DEFAULT_TEMPLATES.REG) return false;
        const T = window.Reports.DEFAULT_TEMPLATES;
        if (T.REG.indexOf('{{reg_do160}}') < 0) {
            T.REG = T.REG.replace('## 11. RAM suite outputs',
                '## 11b. Environmental qualification register (DO-160)\nClaimed categories and substantiating test reports per item, plus PRA-threat reconciliation findings.\n{{reg_do160}}\n{{reg_do160_findings}}\n\n## 11. RAM suite outputs');
        }
        if (!window.Reports.extractData._d16Wrapped) {
            const orig = window.Reports.extractData;
            const wrapped = function (reportType) {
                const data = orig.apply(this, arguments);
                try {
                    if (reportType === 'REG') {
                        data.reg_do160 = do160Rows();
                        data.reg_do160_findings = do160Findings().map(x => ({ 'PRA': x.pra, 'Threat': x.threat, 'Item': x.item, 'Missing claim': x.missing }));
                    }
                } catch (_) { if (reportType === 'REG') { data.reg_do160 = []; data.reg_do160_findings = []; } }
                return data;
            };
            wrapped._d16Wrapped = true;
            window.Reports.extractData = wrapped;
        }
        return true;
    }
    if (!_extend()) { let tries = 20; const t = setInterval(() => { if (_extend() || --tries <= 0) clearInterval(t); }, 300); }

    window.do160Rows = do160Rows;
    window.do160Findings = do160Findings;
})();
