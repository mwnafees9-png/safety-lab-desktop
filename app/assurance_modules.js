// assurance_modules.js — Review / AutoReq / Traceability, extracted verbatim from
// safety_lab.js (Phase 76). Classic script, shared global lexical scope, loaded BEFORE
// safety_lab.js. Accessed by bare name (no window.*); self-contained at definition;
// monolith globals used inside methods at runtime. Byte-identical.

const Review = (function() {

    // Phase 53.25 — sysFunc + sysFcim added so comments scope to active system.
    const SYS_KINDS = new Set(['sysFha', 'sysReq', 'sysAsm', 'sysFunc', 'sysFcim']);

    function targetMatches(comment, target) {
        if (!comment || !comment.target || !target) return false;
        if (comment.target.kind !== target.kind) return false;
        if (comment.target.id !== target.id) return false;
        if (SYS_KINDS.has(comment.target.kind)) {
            // systemId optional on either side — treat missing as "any" for back-compat
            if (target.systemId && comment.target.systemId &&
                target.systemId !== comment.target.systemId) return false;
        }
        return true;
    }

    function _nextId() {
        // Globally-unique id: a per-session token stops two live clients from minting
        // the same cmt-N and colliding when comments are broadcast (#27 part 2).
        const tok = (typeof _rtClientToken !== 'undefined' && _rtClientToken) ? _rtClientToken : 'L';
        const id = 'cmt-' + tok + '-' + reviewCounter;
        reviewCounter++;
        return id;
    }

    function addComment(target, text, parentId) {
        text = (text || '').toString().trim();
        if (!text) return null;
        const author = (activeReviewerName || '').trim() || 'Reviewer';
        const c = {
            commentId: _nextId(),
            target: {
                kind: target.kind,
                id: target.id,
                systemId: target.systemId || null
            },
            authorName: author,
            timestamp: Date.now(),
            text: text,
            status: 'open',
            parentId: parentId || null,
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: ''
        };
        reviewCommentsData.push(c);
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('upsert', { c: c }); } catch(_) {}   // #27 part 2
        return c;
    }

    function getById(commentId) {
        return reviewCommentsData.find(c => c.commentId === commentId) || null;
    }

    function resolveComment(commentId, note) {
        const c = getById(commentId);
        if (!c) return false;
        c.status = 'resolved';
        c.resolvedAt = Date.now();
        c.resolvedBy = (activeReviewerName || '').trim() || 'Reviewer';
        if (note) c.resolutionNote = note.toString();
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('upsert', { c: c }); } catch(_) {}   // #27 part 2
        return true;
    }

    function reopenComment(commentId) {
        const c = getById(commentId);
        if (!c) return false;
        c.status = 'open';
        c.resolvedAt = null;
        c.resolvedBy = null;
        c.resolutionNote = '';
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('upsert', { c: c }); } catch(_) {}   // #27 part 2
        return true;
    }

    function deleteComment(commentId) {
        // Cascade — drop the comment + every descendant reply.
        const doomed = new Set([commentId]);
        let grew = true;
        while (grew) {
            grew = false;
            reviewCommentsData.forEach(c => {
                if (c.parentId && doomed.has(c.parentId) && !doomed.has(c.commentId)) {
                    doomed.add(c.commentId);
                    grew = true;
                }
            });
        }
        const before = reviewCommentsData.length;
        reviewCommentsData = reviewCommentsData.filter(c => !doomed.has(c.commentId));
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        try { if (typeof _rtBroadcastComment === 'function') _rtBroadcastComment('delete', { commentId: commentId }); } catch(_) {}   // #27 part 2
        return reviewCommentsData.length < before;
    }

    function commentsForTarget(target, includeResolved) {
        return reviewCommentsData.filter(c =>
            targetMatches(c, target) &&
            (includeResolved ? true : (c.status === 'open' || _hasOpenDescendant(c)))
        );
    }

    function _hasOpenDescendant(root) {
        // Used to keep the thread visible if any reply is still open.
        const stack = [root.commentId];
        while (stack.length) {
            const pid = stack.pop();
            const kids = reviewCommentsData.filter(c => c.parentId === pid);
            for (const k of kids) {
                if (k.status === 'open') return true;
                stack.push(k.commentId);
            }
        }
        return false;
    }

    // Build threaded view: roots (parentId === null) for the target, plus all
    // descendants in DFS order. Each thread = { root, descendants: [{c, depth}] }.
    function threadsFor(target, opts) {
        opts = opts || {};
        const includeResolved = !!opts.includeResolved;
        const all = reviewCommentsData.filter(c => targetMatches(c, target));
        const byParent = new Map();
        all.forEach(c => {
            const k = c.parentId || '__root__';
            if (!byParent.has(k)) byParent.set(k, []);
            byParent.get(k).push(c);
        });
        // Sort siblings by timestamp ascending so the conversation reads top-to-bottom.
        byParent.forEach(list => list.sort((a, b) => a.timestamp - b.timestamp));

        const roots = (byParent.get('__root__') || []);
        const threads = [];
        for (const root of roots) {
            const descendants = [];
            (function walk(parentId, depth) {
                const kids = byParent.get(parentId) || [];
                for (const k of kids) {
                    descendants.push({ c: k, depth: depth });
                    walk(k.commentId, depth + 1);
                }
            })(root.commentId, 1);

            // Apply resolved filter: drop the entire thread only if the root AND
            // every descendant are resolved.
            if (!includeResolved) {
                const anyOpen = root.status === 'open' || descendants.some(d => d.c.status === 'open');
                if (!anyOpen) continue;
            }
            threads.push({ root, descendants });
        }
        // Newest-first thread order by root timestamp.
        threads.sort((a, b) => b.root.timestamp - a.root.timestamp);
        return threads;
    }

    function openCountFor(target) {
        return reviewCommentsData.filter(c => targetMatches(c, target) && c.status === 'open').length;
    }

    function totalCountFor(target) {
        return reviewCommentsData.filter(c => targetMatches(c, target)).length;
    }

    function allOpen() {
        return reviewCommentsData
            .filter(c => c.status === 'open')
            .slice()
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    function byKind(kind) {
        return reviewCommentsData.filter(c => c.target && c.target.kind === kind);
    }

    function setReviewerName(name) {
        activeReviewerName = (name || '').toString();
        try { localStorage.setItem('safetyLab.activeReviewerName', activeReviewerName); } catch(_) {}
    }

    function getReviewerName() {
        return activeReviewerName || '';
    }

    // Format a timestamp into a short human label ("just now", "5m ago", "2h ago", or yyyy-mm-dd).
    function relTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 30 * 1000) return 'just now';
        if (diff < 60 * 60 * 1000) return Math.round(diff / 60000) + 'm ago';
        if (diff < 24 * 60 * 60 * 1000) return Math.round(diff / 3600000) + 'h ago';
        return new Date(ts).toISOString().slice(0, 10);
    }

    // Human label for an artifact kind (used in summary tab headers / dashboard).
    // Phase 53.25 — Functions + FCIM added.
    const KIND_LABELS = {
        acFunc: 'AC Functions',
        sysFunc:'System Functions',
        acFcim: 'AC FCIM',
        sysFcim:'System FCIM',
        acFha:  'AC Hazards',
        sysFha: 'System Hazards',
        acReq:  'AC Requirements',
        sysReq: 'System Requirements',
        acAsm:  'AC Assumptions',
        sysAsm: 'System Assumptions',
        pra:    'Particular Risks',
        zsa:    'Zonal Safety',
        cma:    'Common Mode',
        fmea:   'FMEA'
    };
    const KIND_ORDER = ['acFunc', 'sysFunc', 'acFcim', 'sysFcim', 'acFha', 'sysFha', 'pra', 'zsa', 'cma', 'fmea', 'acReq', 'sysReq', 'acAsm', 'sysAsm'];
    function kindLabel(k) { return KIND_LABELS[k] || k; }

    // Phase 53.71 — Approval records. Approval is an explicit reviewer action distinct
    // from comment resolution. An artifact is "approved" when (a) a reviewer has signed
    // off via approve() AND (b) there are no open review comments on it. The phase-status
    // logic on the dashboard treats only approved artifacts as counting toward "complete".
    function _approvalMatches(rec, target) {
        if (!rec || !target) return false;
        if (rec.kind !== target.kind) return false;
        if (String(rec.id) !== String(target.id)) return false;
        if (SYS_KINDS.has(rec.kind)) {
            if (target.systemId && rec.systemId && target.systemId !== rec.systemId) return false;
        }
        return true;
    }
    function getApproval(target) {
        if (!target) return null;
        return reviewApprovalsData.find(r => _approvalMatches(r, target)) || null;
    }
    function isApproved(target) {
        const rec = getApproval(target);
        if (!rec) return false;
        if (rec.signoffOnly && !rec.approvedBy) return false;   // #25 — sign-off-only record; not a binary approval
        // An approval is invalidated if there is *any* open comment on the same target.
        // Forces re-approval whenever someone reopens a concern.
        const openCount = reviewCommentsData.filter(c => targetMatches(c, target) && c.status === 'open').length;
        return openCount === 0;
    }
    function approve(target, note) {
        if (!target || !target.kind || target.id == null) return null;
        // Don't double-record — if an approval exists, refresh it (treats as re-approve).
        const existing = getApproval(target);
        const reviewer = (activeReviewerName || '').trim() || 'Reviewer';
        const now = Date.now();
        if (existing) {
            existing.approvedBy = reviewer;
            existing.approvedAt = now;
            if (note) existing.note = String(note);
        } else {
            reviewApprovalsData.push({
                kind: target.kind,
                id: target.id,
                systemId: target.systemId || null,
                approvedBy: reviewer,
                approvedAt: now,
                note: note ? String(note) : ''
            });
        }
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        return getApproval(target);
    }
    function unapprove(target) {
        const idx = reviewApprovalsData.findIndex(r => _approvalMatches(r, target));
        if (idx < 0) return false;
        reviewApprovalsData.splice(idx, 1);
        try { if (typeof scheduleAutosave === 'function') scheduleAutosave(); } catch(_) {}
        return true;
    }
    function approvalCountByKind() {
        const out = {};
        reviewApprovalsData.forEach(r => { out[r.kind] = (out[r.kind] || 0) + 1; });
        return out;
    }

    return {
        targetMatches,
        addComment, getById, resolveComment, reopenComment, deleteComment,
        commentsForTarget, threadsFor, openCountFor, totalCountFor,
        allOpen, byKind,
        setReviewerName, getReviewerName,
        approve, unapprove, isApproved, getApproval, approvalCountByKind,
        relTime, kindLabel, KIND_LABELS, KIND_ORDER
    };
})();

const AutoReq = (function(){
    // Tiny non-crypto hash (DJB2) for fingerprinting.
    function hashStr(s){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); }
    function fp(){ return hashStr(Array.prototype.slice.call(arguments).map(p => JSON.stringify(p==null?null:p)).join('|')); }

    // Severity ranking for SPF / independence checks.
    const SEV_ORDER = SEVERITY_RANK;   // Phase 27 refactor B5 — alias to module-scope constant.

    // Walk every node in every page; cb(node, page).
    function walkAllPages(cb){
        ftaPages.forEach(page => {
            (function walk(node){
                if(!node) return;
                cb(node, page);
                const kids = node.children || node._children;
                if(kids) kids.forEach(walk);
            })(page.root);
        });
    }

    // Find path from root → target node. Returns null if not found.
    function findPathTo(root, target){
        if(root === target) return [root];
        const kids = root.children || root._children;
        if(!kids) return null;
        for(const c of kids){ const p = findPathTo(c, target); if(p) return [root, ...p]; }
        return null;
    }

    // Determine top-event severity for a page by walking the linked FHA. The page may carry
    // its own linkedFhaId (raw internalId), or fall back to ftaConfig's prefixed AC_/SYS_ id
    // when the page is currently active. Resolve across both AC + every system folder so
    // OR-family compromise checks work on system-level trees too (Phase 27 audit A6).
    function pageTopSeverity(page){
        if (!page) return null;
        // 1. Direct page.linkedFhaId (raw internalId stored on the page object).
        if (page.linkedFhaId) {
            const acHit = (acFhaData || []).find(f => f.internalId === page.linkedFhaId);
            if (acHit) return acHit.severity || null;
            for (const s of (systemsData || [])) {
                const sysHit = (s.fha || []).find(f => f.internalId === page.linkedFhaId);
                if (sysHit) return sysHit.severity || null;
            }
        }
        // 2. Fall back to ftaConfig's prefixed id when this is the active page. Use the same
        //    AC_/SYS_ resolver the toolbar uses so sys-FHA links are honored.
        if (page.id === activeFTAPageId && ftaConfig && ftaConfig.linkedFhaId) {
            const fha = (typeof _resolveLinkedFha === 'function') ? _resolveLinkedFha(ftaConfig.linkedFhaId) : null;
            if (fha) return fha.severity || null;
        }
        return null;
    }

    // DAL ranking — alias to module-scope DAL_RANK_MAP (Phase 27 refactor B7).
    const DAL_RANK = DAL_RANK_MAP;
    function moreRestrictiveSev(a, b){
        if(!a) return b; if(!b) return a;
        return (SEV_ORDER[a] || 0) >= (SEV_ORDER[b] || 0) ? a : b;
    }

    // Phase 28 — sys FHAs now carry acTraces[] (1-to-many AC FHA references). Reads check
    // the array form first and fall back to the legacy scalar field.
    function _sysFhaAcTraces(sf){
        if (!sf) return [];
        if (Array.isArray(sf.acTraces) && sf.acTraces.length) return sf.acTraces;
        return sf.acTrace ? [sf.acTrace] : [];
    }
    // Locate the most-restrictive linked sys FHA for a given AC FHA. A sys FHA matches if
    // its acTraces array contains the AC FHA's fcId. Returns null when nothing links.
    function findLinkedSysFhaForAcFc(acFha){
        if(!acFha || !acFha.fcId) return null;
        let best = null;
        systemsData.forEach(sys => {
            (sys.fha || []).forEach(sf => {
                if(_sysFhaAcTraces(sf).includes(acFha.fcId)){
                    if(!best || (SEV_ORDER[sf.severity] || 0) > (SEV_ORDER[best.severity] || 0)) best = sf;
                }
            });
        });
        return best;
    }
    // Reverse: locate every AC FHA that a sys FHA traces to (returns the most-conservative
    // when called via the legacy [0] callsite shape — but callers should iterate when they
    // want the full set).
    function findAcFhaForSysFc(sysFha){
        const traces = _sysFhaAcTraces(sysFha);
        if (!traces.length) return null;
        // For backwards compat, return just the first matching AC FHA.
        for (const fcId of traces) {
            const hit = acFhaData.find(a => a.fcId === fcId);
            if (hit) return hit;
        }
        return null;
    }
    function findAllAcFhasForSysFc(sysFha){
        return _sysFhaAcTraces(sysFha)
            .map(fcId => acFhaData.find(a => a.fcId === fcId))
            .filter(Boolean);
    }

    // ----- Generator 1: FHA → safety + per-function DAL requirements -----
    // Probabilistic reqs: one per failure condition (per FHA hazard). When the FHA is linked
    // (sys ↔ ac via acTrace), the AC scope emits ONE combined req using the more-restrictive
    // (severity, target) of the pair; the sys scope skips it.
    // FDAL reqs: one per sub-function (subId), with the MAX DAL across all hazards on that function.
    // Phase 53.18 — read the active certification basis from projectConfig.
    // Drives AC reference (1309-1B vs 1309-1E) and class-aware analysis depth.
    function certBasisForChart() {
        const reg = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.regulation) || 'Part 25';
        const cls = (typeof projectConfig !== 'undefined' && projectConfig && projectConfig.part23Class) || 'IV';
        const isPart23 = reg === 'Part 23';
        return {
            regulation: reg,
            part23Class: cls,
            acRef: isPart23 ? 'AC 23.1309-1E' : 'AC 25.1309-1B',
            // Class IV behaves like Part 25 (full rigor for Cat/Haz). Class I & II
            // accept qualitative-only defaults for Cat/Haz where Part 25 would
            // force qual+quant. Class III sits in between — same as default for
            // now (qual+quant) but with the 23.1309-1E reference.
            classRigor: isPart23 ? cls : 'IV'
        };
    }

    // Phase 53.13/14/18 — AC 25.1309-1B Figure 2 / AC 23.1309-1E Figure 2 decision logic.
    // Returns the analysis depth required for an FHA based on severity, chartProps,
    // and the active cert basis. Drives which requirements genFHA emits.
    //
    // Cert basis differences:
    //   Part 25 / Part 23 Class IV     → full rigor (qual+quant default for Cat/Haz)
    //   Part 23 Class III              → qual+quant default for Cat/Haz, but qual
    //                                    sufficient when isSimpleConventional=true
    //   Part 23 Class II               → qualitative often sufficient for Haz/Cat
    //                                    (the smaller-aircraft path). Defaults to
    //                                    qualitative unless explicitly told the
    //                                    system is complex (isSimpleConventional=false).
    //   Part 23 Class I                → most permissive. Qualitative default for
    //                                    every severity (even Cat) on simple
    //                                    aircraft per AC 23.1309-1E §17(d).
    function decideAnalysisDepth(fha, certBasis){
        const sev = (fha && fha.severity) || '';
        // Minor / Negligible / No Effect → 17(a) & (b): verify by design and
        // installation appraisal. No safety requirement is generated. Applies to
        // both AC 25.1309-1B and AC 23.1309-1E.
        if (sev === 'Minor' || sev === 'Negligible' || sev === 'No Effect') {
            return { skip: true, reason: 'design-appraisal' };
        }
        const cb = certBasis || certBasisForChart();
        const cp = (fha && fha.chartProps) || {};
        const isPart23 = cb.regulation === 'Part 23';
        const cls = cb.classRigor;
        // Permissive class = qualitative is the conservative default for Cat/Haz.
        const permissive = isPart23 && (cls === 'I' || cls === 'II');

        // Similar to prior design — applies to all qualifying severities, both
        // regulations. AC 23.1309-1E §17(c) & (d) mirrors AC 25.1309-1B.
        if (cp.similarPrior === true) {
            return { mode: 'similarity', clause: '17(c) & (d)', branch: 'similar-prior',
                     acRef: cb.acRef, certBasis: cb };
        }

        if (sev === 'Major') {
            if (cp.isSimple === true)     return { mode: 'qualitative', clause: '17(c)', branch: 'major-simple', acRef: cb.acRef, certBasis: cb };
            if (cp.isRedundant === true)  return { mode: 'qualitative', clause: '17(c)', branch: 'major-redundant', acRef: cb.acRef, certBasis: cb };
            if (cp.isSimple === false && cp.isRedundant === false) {
                return { mode: 'qual-quant', clause: '17(c)', branch: 'major-complex', acRef: cb.acRef, certBasis: cb };
            }
            // Major uncharacterized — for permissive classes (I/II) default to
            // qualitative; otherwise default to conservative qual+quant.
            return {
                mode: permissive ? 'qualitative' : 'qual-quant',
                clause: '17(c)',
                branch: permissive ? 'major-uncharacterized-permissive' : 'major-uncharacterized',
                acRef: cb.acRef, certBasis: cb,
                uncharacterized: true
            };
        }

        if (sev === 'Hazardous' || sev === 'Catastrophic') {
            if (cp.isSimpleConventional === true) {
                return { mode: 'qualitative', clause: '17(d)', branch: 'cat-haz-simple-conventional',
                         acRef: cb.acRef, certBasis: cb };
            }
            if (cp.isSimpleConventional === false) {
                return { mode: 'qual-quant', clause: '17(c)', branch: 'cat-haz-complex',
                         acRef: cb.acRef, certBasis: cb };
            }
            // Uncharacterized Cat/Haz. Class I/II default to qualitative
            // (permissive path); Class III/IV and Part 25 default to qual+quant.
            return {
                mode: permissive ? 'qualitative' : 'qual-quant',
                clause: permissive ? '17(d)' : '17(c)',
                branch: permissive ? 'cat-haz-uncharacterized-permissive' : 'cat-haz-default',
                acRef: cb.acRef, certBasis: cb,
                uncharacterized: true
            };
        }
        return { skip: true, reason: 'unknown-severity' };
    }

    // Phase 53.17 — group FHA records by fcId so duplicates (same FC referenced
    // by multiple rows across phases / pages / imports) collapse into a single
    // canonical record. Worst-severity wins; chartProps roll up with "more
    // conservative wins" (any answer that drives toward qual+quant defeats
    // similarity/qualitative-only).
    function _rollupChartProp(members, key, conservativeValue) {
        let anyConservative = false, anyTrue = false;
        for (const m of members) {
            const cp = (m && m.chartProps) || {};
            if (cp[key] === conservativeValue) anyConservative = true;
            if (cp[key] === true) anyTrue = true;
        }
        if (anyConservative) return conservativeValue;
        if (anyTrue) return true;
        return null;
    }

    function _canonicalizeFhaGroup(members) {
        if (members.length === 1) return members[0];
        // Pick the most-restrictive severity member as the canonical base.
        let canonical = members[0];
        for (let i = 1; i < members.length; i++) {
            const winnerSev = moreRestrictiveSev(canonical.severity, members[i].severity);
            if (winnerSev === members[i].severity && winnerSev !== canonical.severity) {
                canonical = members[i];
            }
        }
        // Synthetic canonical — don't mutate the source FHA.
        const out = Object.assign({}, canonical);
        // chartProps rollup: similarPrior=false is more conservative (forces deeper
        // analysis); isSimple/isRedundant/isSimpleConventional=false is more conservative
        // (drives toward qual+quant).
        out.chartProps = {
            similarPrior:         _rollupChartProp(members, 'similarPrior', false),
            isSimple:             _rollupChartProp(members, 'isSimple', false),
            isRedundant:          _rollupChartProp(members, 'isRedundant', false),
            isSimpleConventional: _rollupChartProp(members, 'isSimpleConventional', false)
        };
        // Union of phases (comma-separated lists in each member).
        const phasesSet = new Set();
        members.forEach(m => {
            const s = (m && m.phases) ? String(m.phases) : '';
            s.split(',').map(x => x.trim()).filter(Boolean).forEach(p => phasesSet.add(p));
        });
        out.phases = Array.from(phasesSet).join(', ');
        // Union of subIds across all members.
        const subSet = new Set();
        members.forEach(m => {
            if (Array.isArray(m && m.subIds)) m.subIds.forEach(s => subSet.add(s));
            else if (m && m.subId) subSet.add(m.subId);
        });
        out.subIds = Array.from(subSet);
        out.subId = out.subIds[0] || canonical.subId || '';
        // Union of assumption IDs.
        const asmSet = new Set();
        members.forEach(m => (m && m.assumptionIds || []).forEach(a => asmSet.add(a)));
        out.assumptionIds = Array.from(asmSet);
        // Longest fcDesc is usually the most complete one.
        out.fcDesc = members.reduce((best, m) => {
            const d = (m && m.fcDesc) || '';
            return d.length > best.length ? d : best;
        }, '');
        // Track every contributing internalId — feeds the fingerprint so any edit
        // to any duplicate re-stales the requirement.
        out._contributingIds = members.map(m => m.internalId).filter(Boolean).sort();
        out._duplicateCount  = members.length;
        return out;
    }

    function _groupFhaByFcId(fhaArr) {
        const groups = new Map();
        (fhaArr || []).forEach(f => {
            if (!f || !f.severity) return;
            const id = (f.fcId || '').trim();
            // Records without an fcId can't be deduplicated; each gets its own group.
            const key = id ? id : ('__no-fcid__' + (f.internalId || Math.random()));
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(f);
        });
        return groups;
    }

    // ---------------------------------------------------------------------
    // Phase 56.50 — requirement-syntax house style (EARS / INCOSE + ARP form).
    // Every generated requirement carries exactly ONE "shall", active voice,
    // condition-first, and NO parentheticals, citations, IDs, or derivation
    // math in the normative text — all of that lives in the rationale field.
    // Fingerprints carry a 'v2' token where text forms changed, so existing
    // generated requirements update in place (one expected stale pass).
    // ---------------------------------------------------------------------
    // Lowercase the first letter for mid-sentence flow unless the first word
    // is an acronym (all-caps, len>1).
    function _midSentence(s) {
        const str = (s || '').trim();
        if (!str) return str;
        const fw = str.split(/\s+/)[0] || '';
        if (fw && fw === fw.toUpperCase() && fw.length > 1) return str;
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
    // "A" / "A and B" / "A, B, and C" — natural-language list subject.
    function _subjectList(names) {
        const n = (names || []).filter(Boolean);
        if (!n.length) return '';
        if (n.length === 1) return n[0];
        if (n.length === 2) return n[0] + ' and ' + n[1];
        return n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1];
    }

    function genFHA(fhaArr, scopeKey){
        const out = [];
        const isAcScope = scopeKey === 'ac';

        // Phase 53.17 — collapse duplicate fcId entries into canonical groups
        // before applying the per-FC decision tree.
        const groups = _groupFhaByFcId(fhaArr);
        const canonicals = [];
        groups.forEach(members => canonicals.push(_canonicalizeFhaGroup(members)));

        // ----- Per-hazard safety reqs (probabilistic + qualitative), with linkage dedup -----
        // Chart-aware: severity + chartProps drive which req types are emitted.
        // - Min/Neg              → nothing (design-appraisal path)
        // - similarPrior         → similarity-argument req only
        // - qualitative branch   → qualitative assessment req only
        // - qual-quant branch    → qualitative + probabilistic reqs
        canonicals.forEach(fha => {
            if(!fha || !fha.severity) return;

            // Phase 53.18 — cert basis lookup is project-wide; pass it through
            // so generated reqs cite the right AC (1309-1B for Part 25, 1309-1E
            // for Part 23) and Class I/II get the permissive defaults.
            const certBasis = certBasisForChart();
            const depth = decideAnalysisDepth(fha, certBasis);
            if (depth.skip) return;

            let linkedSysFha = null, linkedAcFha = null;
            if(isAcScope){
                linkedSysFha = findLinkedSysFhaForAcFc(fha);
            } else {
                linkedAcFha = findAcFhaForSysFc(fha);
                // Sys-side: if this FC is linked to an AC FC, the AC-scope generator owns the combined req. Skip it here.
                if(linkedAcFha) return;
            }

            // Effective (more-restrictive) target for this hazard, accounting for linkage.
            let effSev = fha.severity;
            if(linkedSysFha) effSev = moreRestrictiveSev(fha.severity, linkedSysFha.severity);
            const t = getNormalizedSafetyTarget(effSev, fha.phases);

            const fcLabelShort = fha.fcId ? `${fha.fcId} (${fha.fcDesc || 'failure condition'})` : (fha.fcDesc || 'the identified failure condition');

            // Phase 56.49b — Qualitative FHA requirements (Similarity Argument,
            // Qualitative Assessment) suppressed. They were non-verifiable prose
            // that bloated the SRDD without adding cert-defensible content. The
            // FC's quantitative probability budget IS the safety requirement
            // (AC 25.1309-1A); narrative justification belongs in the FHA report
            // / SSA, not in the generated SRDD. Only the probabilistic branch
            // continues below.
            const certClassClause = (certBasis.regulation === 'Part 23')
                ? `${certBasis.acRef} §${depth.clause} (Class ${certBasis.part23Class})`
                : `${certBasis.acRef} §${depth.clause}`;
            if (depth.mode === 'similarity') return;   // similarity-only branch → no req emitted
            if (depth.mode !== 'qual-quant') return;
            if (t.prob === null) return;   // no quantitative target (shouldn't happen for Cat/Haz/Maj)

            const fcSubject = _midSentence(fha.fcDesc || (fha.fcId ? 'failure condition ' + fha.fcId : 'the identified failure condition'));
            const phaseLabel = fha.phases ? fha.phases : 'all applicable flight phases';
            const phaseClause = fha.phases ? ` during ${fha.phases}` : '';
            let linkRat = '';
            if(linkedSysFha){
                const winner = effSev === fha.severity ? 'AC' : 'System';
                linkRat = ` Linked to system FC ${linkedSysFha.fcId}; the combined target is the more restrictive of AC (${fha.severity}) and System (${linkedSysFha.severity}) — ${winner} governs.`;
            }

            // Top-event probability target is NOT normalized — the cert basis quotes 1e-9/FH
            // (or whatever severity bucket) as an *averaged* rate over the flight envelope.
            // Phase exposure context belongs in the rationale + fingerprint so phase changes
            // re-stale derived event allocations, but the headline target stands as-is.
            const hasNormalization = fha.phases && t.matchedPhases.length && t.exposureRatio < 0.999;
            let exposureRat = '';
            if (hasNormalization) {
                const rPct = t.exposureRatio * 100;
                const rPctStr = rPct < 1 ? rPct.toFixed(2) : rPct.toFixed(1);
                exposureRat = ` Phase exposure: ${t.exposedHours.toFixed(2)} h of ${t.totalHours.toFixed(2)} h flight (r=${rPctStr}%; ${t.matchedPhases.join(', ')}). Basic-event allocations under this hazard should be expressed as operational rates during these phases (event-allocation normalization, not target rescaling).`;
            }

            // Phase 56.50 — ARP 4761 / AIR6110 form: "The probability of <FC>
            // during <phase> shall not exceed P per flight." One shall, condition
            // in the sentence, everything derivational (per-FH equivalence,
            // envelope math, linkage, severity, citation) in the rationale.
            let mhFc = 0;
            try { if (typeof _missionHoursForNormalization === 'function') mhFc = _missionHoursForNormalization() || 0; } catch (_) {}
            if (!mhFc && t.totalHours) mhFc = t.totalHours;
            const pFc = mhFc ? -Math.expm1(-t.prob * mhFc) : null;
            out.push({
                text: pFc != null
                    ? `The probability of ${fcSubject}${phaseClause} shall not exceed ${pFc.toExponential(2)} per flight.`
                    : `The probability of ${fcSubject}${phaseClause} shall not exceed ${t.prob.toExponential(2)} per flight hour.`,
                rat: `${fha.fcId ? fha.fcId + ' — ' : ''}${effSev} per ${certBasis.acRef}.` +
                     (pFc != null ? ` Equivalent to ≤ ${t.prob.toExponential(2)} per flight hour averaged over the ${mhFc.toFixed(2)} h flight envelope (cert-basis form).` : '') +
                     `${linkRat} Phase: ${phaseLabel}.${exposureRat}`,
                level: 'L1', type: 'Probabilistic',
                verifMethod: 'Analysis',
                traceId: fha.subId || '',
                reqSource: {
                    generator: 'fha-prob',
                    sourceId: `${scopeKey}:fha:prob:${fha.internalId}`,
                    context: {
                        severity: fha.severity, phases: fha.phases, fcId: fha.fcId,
                        effSeverity: effSev, dal: t.dal, prob: t.prob, scope: t.scope,
                        linkedSysFcId: linkedSysFha ? linkedSysFha.fcId : null,
                        linkedSysSeverity: linkedSysFha ? linkedSysFha.severity : null,
                        // Phase normalization context — drives the stale-detection fingerprint so
                        // edits to phase durations / FHA phase list re-flag the requirement.
                        exposureRatio:   t.exposureRatio,
                        exposedHours:    t.exposedHours,
                        totalHours:      t.totalHours,
                        matchedPhases:   t.matchedPhases,
                        phaseActiveProb: t.phaseActiveProb,
                        missionProb:     t.missionProb
                    },
                    fingerprint: fp('fha-prob', 'v2', fha.severity, fha.phases, fha.fcId, fha.fcDesc,
                                    t.dal, t.prob, t.scope,
                                    linkedSysFha ? linkedSysFha.fcId : '',
                                    linkedSysFha ? linkedSysFha.severity : '',
                                    // Round to 6 sig figs to avoid spurious staleness from float jitter.
                                    Math.round(t.exposureRatio * 1e6) / 1e6,
                                    t.matchedPhases.slice().sort(),
                                    // Sorted contributing internalIds so edits to any duplicate re-stale.
                                    fha._contributingIds || []),
                    generatedAt: Date.now()
                }
            });
        });

        // ----- Per-function FDAL reqs: one per sub-function with max DAL across that function's hazards -----
        // For AC scope, sub-functions come from acFunctionsData (subId/subName/subDef).
        // For Sys scope, they come from sys().functions.
        const funcMeta = isAcScope
            ? acFunctionsData
            : ((systemsData.find(s => 'sys-' + s.id === scopeKey) || {}).functions || []);
        const funcByKey = new Map();
        funcMeta.forEach(f => funcByKey.set(f.subId, f));

        // Group hazards by subId; aggregate severity (most-restrictive) accounting for linkage.
        // Phase 28 — FHAs now carry subIds[] (1-to-many functions). Each FHA contributes to
        // EVERY listed function's FDAL allocation. Legacy single .subId still honored as fallback.
        const bySub = new Map();
        (fhaArr || []).forEach(fha => {
            if(!fha || !fha.severity) return;
            // Phase 53.14 — Min/Neg/No-Effect FCs do not contribute to FDAL allocation.
            // Chart says they're verified by design appraisal only; no DAL req.
            if (fha.severity === 'Minor' || fha.severity === 'Negligible' || fha.severity === 'No Effect') return;
            const fnIds = (Array.isArray(fha.subIds) && fha.subIds.length) ? fha.subIds : (fha.subId ? [fha.subId] : []);
            if(!fnIds.length) return;
            let effSev = fha.severity;
            let linkedSysFha = isAcScope ? findLinkedSysFhaForAcFc(fha) : null;
            let linkedAcFha = !isAcScope ? findAcFhaForSysFc(fha) : null;
            if(linkedSysFha) effSev = moreRestrictiveSev(effSev, linkedSysFha.severity);
            if(linkedAcFha){
                // Sys-scope FDAL: skip if linked (covered by AC-side FDAL on the parent function).
                return;
            }
            fnIds.forEach(subId => {
                if(!bySub.has(subId)) bySub.set(subId, { fhaList: [], effSev: null, linkNotes: [] });
                const ent = bySub.get(subId);
                ent.fhaList.push(fha);
                ent.effSev = moreRestrictiveSev(ent.effSev, effSev);
                if(linkedSysFha) ent.linkNotes.push(`${fha.fcId} ↔ ${linkedSysFha.fcId} (sys ${linkedSysFha.severity})`);
            });
        });

        bySub.forEach((ent, subId) => {
            const t = getSafetyTarget(ent.effSev);
            if(!t.dal) return;
            const fmeta = funcByKey.get(subId);
            // System-scope functions only carry funcName now (subName was dropped in Phase 24);
            // AC-scope keeps the legacy sub-* fields. Use whichever name field exists.
            const funcName = fmeta ? (fmeta.funcName || fmeta.subName || '') : '';
            const hazList = ent.fhaList.map(h => `${h.fcId} [${h.severity}]`).join(', ');
            const linkRat = ent.linkNotes.length ? ` Linked FCs: ${ent.linkNotes.join('; ')}.` : '';
            // Phase 56.50 — the function is the subject; driving hazards, linkage,
            // and the cert-basis citation move to the rationale.
            const funcSubject = funcName
                ? (/function/i.test(funcName) ? `The ${funcName}` : `The ${funcName} function`)
                : `Function ${subId}`;

            out.push({
                text: `${funcSubject} shall be developed to FDAL ${t.dal}.`,
                rat: `Function ${subId}. FDAL allocated per ${t.scope}: maximum across the hazards this function contributes to (${hazList}). Effective severity ${ent.effSev}.${linkRat}`,
                level: 'L1', type: 'Design Assurance',
                verifMethod: 'Inspection',
                traceId: subId,
                reqSource: {
                    generator: 'fha-dal',
                    sourceId: `${scopeKey}:fha:dal:func:${subId}`,
                    context: {
                        subId, effSeverity: ent.effSev, dal: t.dal, scope: t.scope,
                        fhaIds: ent.fhaList.map(h => h.internalId),
                        linked: ent.linkNotes
                    },
                    fingerprint: fp('fha-dal-func', 'v2', subId, ent.effSev, t.dal, t.scope,
                                    ent.fhaList.map(h => h.fcId + ':' + h.severity).sort(),
                                    ent.linkNotes.slice().sort()),
                    generatedAt: Date.now()
                }
            });
        });

        return out;
    }

    // ----- Generator 2: FTA basic events → reliability requirements -----
    function genFTAEvents(scopeKey){
        const out = [];
        const seenLids = new Set();
        // Resolve the page's linked-FHA exposure once per page so we don't recompute on every event.
        const pageExposure = new Map();   // pageId → { exposureRatio, exposedHours, totalHours, matchedPhases, fhaFcId }
        (ftaPages || []).forEach(p => {
            // Phase 28 item 4 — pages can link multiple FHAs (linkedFhaIds[]). For exposure
            // we take the most-restrictive linked FHA's phases (driving target).
            const ids = (Array.isArray(p.linkedFhaIds) && p.linkedFhaIds.length) ? p.linkedFhaIds : (p.linkedFhaId ? [p.linkedFhaId] : []);
            if (!ids.length) return;
            let f = null;
            for (const lid of ids) {
                let cand = (acFhaData || []).find(x => x.internalId === lid);
                if (!cand) {
                    for (const s of (systemsData || [])) {
                        const m = (s.fha || []).find(x => x.internalId === lid);
                        if (m) { cand = m; break; }
                    }
                }
                if (!cand) continue;
                if (!f || (SEV_ORDER[cand.severity] || 0) > (SEV_ORDER[f.severity] || 0)) f = cand;
            }
            if (!f || !f.phases) return;
            const exp = getPhaseExposureRatio(f.phases);
            pageExposure.set(p.id, Object.assign({}, exp, { fhaFcId: f.fcId, fhaSeverity: f.severity }));
        });

        walkAllPages((node, page) => {
            if(!node || (node.type !== 'basic' && node.type !== 'undeveloped')) return;
            // Phase 61 — requirements are generated from ALLOCATION trees only. Verification
            // mirrors are evidence sinks, not requirement sources (generating from them would
            // restate computed values as requirements).
            if (page && page.verifies) return;
            const lid = node.logicalId != null ? node.logicalId : node.id;
            if(seenLids.has(lid)) return;   // dedupe across common-mode repeats
            seenLids.add(lid);
            // Phase 61 — the allocated PROBABILITY budget is the requirement quantity.
            // Allocation is probability-only: no λ exists on allocation-tree leaves, and
            // none is derived. λ (with its repair model) lives on the verification tree,
            // where getAutoReqVerificationEvidence compares computed P against this budget.
            const pAllocated = parseFloat(node.probability) || 0;
            if(pAllocated <= 0) return;

            // Phase 56.50 — repair/monitoring credit and library provenance are NOT
            // part of the probability requirement's normative text. The repair model
            // becomes its own singular maintenance requirement (below); the library
            // reference moves to the rationale.
            let repairRat = '';
            if(node.repairModel === 'monitored' && node.mu){
                repairRat = ` The allocation takes credit for continuous monitoring with repair (μ ≥ ${(+node.mu).toExponential(2)}/h) — see the companion maintenance requirement.`;
            } else if(node.repairModel === 'periodic' && node.tau){
                repairRat = ` The allocation takes latent-failure detection credit (periodic test, τ ≤ ${node.tau} h) — see the companion maintenance requirement.`;
            }
            const libRat = node.libraryKey ? ` Component library ref: ${node.libraryKey}.` : '';

            // Phase-exposure normalization. λ stored on the node is interpreted as the
            // OPERATIONAL rate (failures per hour while exposed). The cert basis target is
            // expressed as an AVERAGED rate (per flight hour over the whole envelope).
            // Bridge: λ_averaged = λ_operational × r. We surface both so the supplier sees the
            // rate they design to, and the safety reviewer sees how it rolls up to FAR 1309.
            const exp = pageExposure.get(page.id);
            const exposureNormalized = exp && exp.matchedPhases.length && exp.ratio < 0.999;
            // Express the allocation as a PROBABILITY of failure per flight, not a rate. t_exposed is
            // the hours the event is exposed per flight; P = 1 − e^(−λ·t_exposed). λ still travels in
            // reqSource.context (below) for verification — only the requirement prose changes.
            let missionHours = 0;
            try { if (typeof _missionHoursForNormalization === 'function') missionHours = _missionHoursForNormalization() || 0; } catch (_) {}
            if (!missionHours && exp && exp.totalHours) missionHours = exp.totalHours;
            const tExposed = exposureNormalized ? exp.exposedHours : (missionHours || (exp && exp.totalHours) || 1);
            // Phase 61 — the allocated budget IS the requirement value; no λ→P conversion.
            // tExposed above is retained purely as the requirement's time-basis label.
            const pFlight = pAllocated;
            const pStr = (isFinite(pFlight) && pFlight > 0) ? pFlight.toExponential(2) : '0';
            // Phase 56.50 — exposure math is derivation, not requirement. The
            // normative text states only the budget; the accrual window, exposure
            // ratio and time basis live in the rationale.
            let phaseRat = '';
            if (exposureNormalized) {
                const rPct = exp.ratio * 100;
                const rStr = rPct < 1 ? rPct.toFixed(2) : rPct.toFixed(1);
                phaseRat = ` Budget accrues while exposed during ${exp.matchedPhases.join(', ')} (${exp.exposedHours.toFixed(2)} h of the ${exp.totalHours.toFixed(2)} h flight envelope, r=${rStr}%; page top hazard ${exp.fhaFcId || ''}).`;
            } else if (missionHours || (exp && exp.totalHours)) {
                phaseRat = ` Time basis: the ${(missionHours || exp.totalHours).toFixed(2)} h flight.`;
            }

            // Phase 56.18d — external-source rationale. When the event inherits
            // its target from another FHA row or FTA node, the requirement text
            // should say so explicitly and the fingerprint should pick up the
            // link so regeneration after an external move marks the req stale.
            let extRat = '';
            let extFingerprintTokens = [];
            if (node.externalSource) {
                const src = node.externalSource;
                const kind = src.kind || (src.targetId && !src.targetNodeId ? 'fha' : (src.targetNodeId ? 'fta' : ''));
                const scopeStr = src.scope === 'aircraft' ? 'aircraft-level' : ('system ' + (((systemsData || []).find(s => s.id === src.systemId) || {}).name || src.systemId || '?'));
                if (kind === 'fha') {
                    extRat = ` Inherited from ${scopeStr} FHA row ${src.targetId}; this event's rate is fixed by that hazard's allocated target.`;
                    extFingerprintTokens = ['ext-fha', src.scope || '', src.systemId || '', src.targetId || ''];
                } else if (kind === 'fta') {
                    extRat = ` Inherited from ${scopeStr} FTA node ${src.targetNodeId} on page ${src.targetPageId}; this event's rate is fixed by the linked node's computed probability.`;
                    extFingerprintTokens = ['ext-fta', src.scope || '', src.systemId || '', src.targetPageId || '', src.targetNodeId || ''];
                }
                if (node._externalAllocation && node._externalAllocation.overrun) {
                    extRat += ` Allocator flag: apportioned target (${node._externalAllocation.apportioned.toExponential(2)}) exceeded the inherited ceiling (${node._externalAllocation.external.toExponential(2)}); the inherited value governs.`;
                }
            }

            // Phase 56.50 — description as subject (event ID lives only in the trace
            // tag). One shall; repair credit and library provenance in the rationale.
            // When the event NAME is already a failure statement ("… fails",
            // "loss of …"), don't prepend "failure of" — that reads double.
            const subjName = node.name || node.displayId || 'the component';
            const failurePhrased = /(fail|loss|lost|erroneous|inadvertent|jam|rupture|leak|inoperative|unavailable)/i.test(subjName);
            // Verb-phrased names ("… fails") take "The probability THAT X fails";
            // noun-phrased failures ("loss of …") take "The probability OF …".
            const verbPhrased = /(fails?|failed|jams?|jammed|ruptures?|ruptured|leaks?|leaked|sticks?|stuck|opens?|closes?|disconnects?|activates?|deploys?|bursts?)$/i.test(subjName.trim());
            out.push({
                text: verbPhrased
                    ? `The probability that ${_midSentence(subjName)} shall not exceed ${pStr} per flight.`
                    : (failurePhrased
                        ? `The probability of ${_midSentence(subjName)} shall not exceed ${pStr} per flight.`
                        : `The probability of failure of ${_midSentence(subjName)} shall not exceed ${pStr} per flight.`),
                rat: `Allocated from the fault tree on page ${page.name}.${phaseRat}${repairRat}${libRat}${extRat}`,
                level: 'L3', type: 'Probabilistic',
                verifMethod: 'Analysis',
                traceId: node.displayId || '',
                reqSource: {
                    generator: 'fta-event',
                    sourceId: `${scopeKey}:fta-event:${lid}`,
                    context: {
                        // Phase 61 — the allocated PROBABILITY budget is the requirement's
                        // quantitative target. Verification evidence compares the mirror
                        // node's computed P (λ + repair/Markov model) against pAllocated.
                        pAllocated,
                        exposureBasisHours: tExposed,
                        libraryKey: node.libraryKey || '',
                        repairModel: node.repairModel || 'unmaintained',
                        mu: node.mu || 0, tau: node.tau || 0,
                        exposureRatio:      exp ? exp.ratio : 1,
                        matchedPhases:      exp ? exp.matchedPhases : [],
                        linkedFhaFcId:      exp ? exp.fhaFcId : null,
                        // Phase 56.18d — capture external-source state so the req
                        // can be re-validated on regen and surfaced in the UI.
                        externalSource:     node.externalSource ? Object.assign({}, node.externalSource) : null,
                        externalAllocation: node._externalAllocation ? Object.assign({}, node._externalAllocation) : null
                    },
                    fingerprint: fp('fta-event', 'v2', pAllocated, node.libraryKey, node.repairModel, node.mu, node.tau,
                                    exp ? Math.round(exp.ratio * 1e6) / 1e6 : 1,
                                    exp ? exp.matchedPhases.slice().sort() : [],
                                    ...extFingerprintTokens),
                    generatedAt: Date.now()
                }
            });

            // Phase 56.50 — the repair model is a REQUIREMENT in its own right,
            // not a subordinate clause. A periodic-test interval on a latent
            // event is a candidate CMR; monitored repair is a design claim the
            // safety case depends on. Singular, separately verifiable.
            if (node.repairModel === 'periodic' && node.tau) {
                out.push({
                    text: `${subjName} shall be tested for undetected failure at intervals not exceeding ${node.tau} hours.`,
                    rat: `The fault-tree allocation for this event on page ${page.name} takes latent-failure detection credit (periodic test, τ ≤ ${node.tau} h); without the interval the allocated probability is invalid. Candidate CMR — coordinate the interval with the scheduled-maintenance program.`,
                    level: 'L3', type: 'Maintenance',
                    verifMethod: 'Inspection',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'fta-interval',
                        sourceId: `${scopeKey}:fta-interval:${lid}`,
                        context: { repairModel: 'periodic', tau: node.tau },
                        fingerprint: fp('fta-interval', 'periodic', node.tau),
                        generatedAt: Date.now()
                    }
                });
            } else if (node.repairModel === 'monitored' && node.mu) {
                out.push({
                    text: `${subjName} shall provide continuous failure monitoring achieving a mean repair rate of at least ${(+node.mu).toExponential(2)} per hour.`,
                    rat: `The fault-tree allocation for this event on page ${page.name} takes credit for monitored repair (μ ≥ ${(+node.mu).toExponential(2)}/h); the monitoring and restoration path is part of the safety case for the allocated probability.`,
                    level: 'L3', type: 'Maintenance',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'fta-interval',
                        sourceId: `${scopeKey}:fta-interval:${lid}`,
                        context: { repairModel: 'monitored', mu: node.mu },
                        fingerprint: fp('fta-interval', 'monitored', node.mu),
                        generatedAt: Date.now()
                    }
                });
            }
        });
        return out;
    }

    // ----- Generator 3: DALgebra → DAL allocation requirements -----
    // Phase 56.49f — Two output modes:
    //   compressed (default): emit one default-DAL statement covering the
    //     dominant (modal) DAL/kind combination across the scope, plus a
    //     per-node exception line for every node whose DAL differs from the
    //     default. ~70% fewer lines on typical trees where OR pass-through
    //     keeps most nodes at the same DAL.
    //   explicit: emit one per-node DAL line as before. Engineers (or their
    //     DERs) who prefer everything spelled out can flip the toggle in the
    //     AutoReq settings panel.
    // Toggle stored on projectConfig.autoreqDalMode (default 'compressed').
    function genDALgebra(scopeKey){
        const out = [];
        const seen = new Set();
        // Option-based DALgebra rationale (ARP4754B §5.2.3 / ARP4761A Table P2). The standards define
        // no marked "carrier"; the explanation of how each member's DAL was derived lives here — in the
        // requirement's rationale — keyed to the option the engineer chose and the independence basis.
        function _dalgebraRat(a) {
            const d = (a.node && a.node._dalDerivation) || {};
            const tp2 = 'ARP4754B §5.2.3 / ARP4761A Table P2';
            const indepTxt = d.independence === 'substantiated' ? 'CMA-substantiated functional independence'
                : d.independence === 'claimed' ? 'a claimed (CMA-pending) functional independence'
                : 'functional independence';
            if (d.basis === 'option1') return d.role === 'top'
                ? a.kind + ' ' + a.dal + ' held at the failure condition’s top level under ' + tp2 + ' Option 1 (one member retains the top DAL), predicated on ' + indepTxt + ' between the members.'
                : a.kind + ' ' + a.dal + ' reduced to the Option 1 floor under ' + tp2 + ' (additional members no lower than the per-severity floor: Cat→C, Haz→D), predicated on ' + indepTxt + ' between the members.';
            if (d.basis === 'option2') return d.role === 'upper'
                ? a.kind + ' ' + a.dal + ' set one level below the top under ' + tp2 + ' Option 2 (at least two members one level below the FC DAL), predicated on ' + indepTxt + ' between the members.'
                : a.kind + ' ' + a.dal + ' reduced to the Option 2 floor under ' + tp2 + ', predicated on ' + indepTxt + ' between the members.';
            if (d.basis === 'no-independence') return a.kind + ' ' + a.dal + ' held at the top level: no functional independence claimed between the AND members, so no reduction is taken (' + tp2 + ' step f).';
            if (d.basis === 'compromised') return a.kind + ' ' + a.dal + ' held at the top level: functional independence is COMPROMISED (CMA found a common mode), so any reduction is invalid and members revert to the top (' + tp2 + ' step f).';
            if (d.basis === 'inherit') return a.kind + ' ' + a.dal + ' inherited from the top level — an OR/XOR/VOTING member whose single failure causes the condition takes the full FC DAL (' + tp2 + ', single-member basis).';
            return a.kind + ' ' + a.dal + ' allocated by top-down apportionment from the linked failure condition severity (' + tp2 + ').';
        }
        const mode = (typeof projectConfig === 'object' && projectConfig && projectConfig.autoreqDalMode === 'explicit')
            ? 'explicit' : 'compressed';
        // First pass — collect every unique-logicalId DAL allocation in the
        // scope. We then either emit them all (explicit) or compute the
        // modal default and emit the exceptions (compressed).
        const allocations = [];   // { node, page, lid, kind, dal, opt }
        walkAllPages((node, page) => {
            // Every node that received an allocated DAL gets a requirement — including the REDUCED
            // members (not just the former "carriers"), so the option-based reduction is explained
            // in each member's rationale rather than implied by a canvas symbol.
            if(!node.allocatedDAL) return;
            const lid = node.logicalId != null ? node.logicalId : node.id;
            // Phase 56.49c — dedup by logicalId only (not per-page:per-logicalId).
            // Shared events represent one physical item; emit one DAL requirement.
            if(seen.has(lid)) return;
            seen.add(lid);

            const opt = (node._dalDerivation && node._dalDerivation.option) || (node.dalOption === 'opt1' ? '1' : '2');
            // FDAL vs IDAL routing — authoritative when page.treeLevel is declared:
            //   aircraft-level tree → FDAL for every carrier (functions awaiting decomposition).
            //   system-level tree   → IDAL for every basic-event carrier; gates still get FDAL.
            //   standalone / unset  → fall back to node-type heuristic
            //                         (gate/undeveloped → FDAL, basic → IDAL).
            // Phase 55.0.8 — per-node dalKindOverride wins over every other rule, so
            // engineers can force a specific label without renaming the node type.
            const level = page.treeLevel || 'standalone';
            let kind;
            if (node.dalKindOverride === 'FDAL' || node.dalKindOverride === 'IDAL') {
                kind = node.dalKindOverride;
            } else if (level === 'aircraft') {
                kind = 'FDAL';
            } else if (level === 'system') {
                kind = (node.type === 'basic') ? 'IDAL' : 'FDAL';
            } else {
                kind = (node.type === 'gate' || node.type === 'undeveloped') ? 'FDAL' : 'IDAL';
            }

            allocations.push({ node, page, lid, kind, dal: node.allocatedDAL, opt, level });
        });

        // Phase 56.49f — emit per mode.
        if (mode === 'explicit') {
            allocations.forEach(a => {
                out.push({
                    text: `${a.node.name || a.node.displayId || 'Item'} shall be developed to ${a.kind} ${a.dal}.`,
                    rat: _dalgebraRat(a),
                    level: 'L2', type: 'Design Assurance',
                    verifMethod: 'Inspection',
                    traceId: a.node.displayId || '',
                    reqSource: {
                        generator: 'dalgebra',
                        sourceId: `${scopeKey}:dalgebra:${a.page.id}:${a.lid}`,
                        context: { dal: a.dal, dalOption: a.opt, kind: a.kind, type: a.node.type, treeLevel: a.level },
                        fingerprint: fp('dalgebra', a.dal, a.opt, a.kind, a.node.type, a.level),
                        generatedAt: Date.now()
                    }
                });
            });
            return out;
        }

        // Compressed mode: compute modal (kind, dal) combo across all allocations.
        // Default = the most common pair. Exceptions = everything else.
        if (allocations.length === 0) return out;
        const tally = new Map();   // "kind|dal" → count
        allocations.forEach(a => {
            const k = a.kind + '|' + a.dal;
            tally.set(k, (tally.get(k) || 0) + 1);
        });
        let defaultKey = null, defaultCount = 0;
        tally.forEach((c, k) => { if (c > defaultCount) { defaultCount = c; defaultKey = k; } });
        const [defaultKind, defaultDal] = defaultKey.split('|');

        // Emit the default-DAL statement only if at least 2 allocations share it;
        // otherwise every line is an exception and the compressed form gains nothing.
        if (defaultCount >= 2) {
            const scopeLabel = scopeKey === 'ac' ? 'aircraft' : 'system';
            out.push({
                text: `Each ${defaultKind === 'FDAL' ? 'function' : 'item'} within ${scopeLabel} scope shall be developed to ${defaultKind} ${defaultDal} unless a ${defaultKind === 'FDAL' ? 'function' : 'item'}-specific allocation requirement states otherwise.`,
                rat: `Default applies to ${defaultCount} of ${allocations.length} ${defaultKind === 'FDAL' ? 'functions' : 'items'} in scope; the exceptions are stated as individual allocation requirements. Per ARP4754B §5.2.3 / ARP4761A Table P2.`,
                level: 'L2', type: 'Design Assurance',
                verifMethod: 'Inspection',
                traceId: '',
                reqSource: {
                    generator: 'dalgebra-default',
                    sourceId: `${scopeKey}:dalgebra-default:${defaultKey}`,
                    context: { defaultDal, defaultKind, defaultCount, totalCount: allocations.length },
                    fingerprint: fp('dalgebra-default', 'v2', defaultDal, defaultKind, defaultCount, allocations.length),
                    generatedAt: Date.now()
                }
            });
        }

        // Exception requirements: any allocation that doesn't match the default.
        // (Or if defaultCount < 2, every allocation becomes an "exception" — same
        // output as explicit mode, which is fine.)
        const emitAll = defaultCount < 2;
        allocations.forEach(a => {
            const aKey = a.kind + '|' + a.dal;
            if (!emitAll && aKey === defaultKey) return;
            out.push({
                text: `${a.node.name || a.node.displayId || 'Item'} shall be developed to ${a.kind} ${a.dal}.`,
                rat: 'Exception to default. ' + _dalgebraRat(a),
                level: 'L2', type: 'Design Assurance',
                verifMethod: 'Inspection',
                traceId: a.node.displayId || '',
                reqSource: {
                    generator: 'dalgebra',
                    sourceId: `${scopeKey}:dalgebra:${a.page.id}:${a.lid}`,
                    context: { dal: a.dal, dalOption: a.opt, kind: a.kind, type: a.node.type, treeLevel: a.level, isException: !emitAll },
                    fingerprint: fp('dalgebra', a.dal, a.opt, a.kind, a.node.type, a.level, defaultKey),
                    generatedAt: Date.now()
                }
            });
        });
        return out;
    }

    // ----- Generator 4: Gate structure → independence / SPF requirements -----
    function isAndFamily(node){
        if(!node || node.type !== 'gate') return false;
        if(node.gateType === 'AND' || node.gateType === 'INHIBIT' || node.gateType === 'PAND') return true;
        if(node.gateType === 'VOTING'){
            const k = parseInt(node.votingK) || 0;
            const n = (node.children || []).length;
            return k > 0 && k === n;
        }
        return false;
    }
    function isOrFamily(node){
        if(!node || node.type !== 'gate') return false;
        if(node.gateType === 'OR' || node.gateType === 'XOR') return true;
        if(node.gateType === 'VOTING'){
            const k = parseInt(node.votingK) || 0;
            const n = (node.children || []).length;
            return n > 0 && k > 0 && k < n;
        }
        return false;
    }

    function checkANDCompromise(gate){
        const reasons = [];
        const kids = gate.children || [];
        if(kids.length < 2) return reasons;

        // Shared logicalId — same physical event used twice in an AND.
        const lidMap = new Map();
        kids.forEach(c => {
            const lid = c.logicalId != null ? c.logicalId : c.id;
            if(!lidMap.has(lid)) lidMap.set(lid, []);
            lidMap.get(lid).push(c.displayId || String(c.id));
        });
        lidMap.forEach((displays, lid) => {
            if(displays.length > 1) reasons.push({
                kind: 'shared-logical-id',
                detail: `Children ${displays.join(' and ')} share logicalId ${lid} — same physical event used twice (common-mode).`
            });
        });

        // Shared CCF group.
        const ccfMap = new Map();
        kids.forEach(c => {
            if(!c.ccfGroup) return;
            if(!ccfMap.has(c.ccfGroup)) ccfMap.set(c.ccfGroup, []);
            ccfMap.get(c.ccfGroup).push(c.displayId || String(c.id));
        });
        ccfMap.forEach((displays, grp) => {
            if(displays.length > 1) reasons.push({
                kind: 'shared-ccf-group',
                detail: `Children ${displays.join(', ')} all belong to CCF group "${grp}" — explicit common-cause dependency.`
            });
        });

        // Shared component library entry — heuristic for common manufacturer / family.
        const libMap = new Map();
        kids.forEach(c => {
            if(!c.libraryKey) return;
            if(!libMap.has(c.libraryKey)) libMap.set(c.libraryKey, []);
            libMap.get(c.libraryKey).push(c.displayId || String(c.id));
        });
        libMap.forEach((displays, key) => {
            if(displays.length > 1) reasons.push({
                kind: 'shared-library-entry',
                detail: `Children ${displays.join(', ')} reference the same component library entry "${key}" — likely shared family / manufacturer.`
            });
        });

        return reasons;
    }

    // CMA-driven compromise: any Open / In-Progress CMA that links this gate AND lists
    // common modes or non-empty findings tells us the AutoReq independence claim is at risk.
    // Closed / Mitigated CMAs are considered resolved and do NOT flag the requirement.
    function checkCMACompromise(gate, page){
        const reasons = [];
        if (!gate || !page) return reasons;
        const gateKey = page.id + ':' + gate.id;
        (typeof cmaData !== 'undefined' ? cmaData : []).forEach(c => {
            if (!c || !c.linkedGateIds || !c.linkedGateIds.includes(gateKey)) return;
            const status = c.status || 'Open';
            if (status === 'Mitigated' || status === 'Closed — Accepted') return;
            const hasModes = c.modes && c.modes.length > 0;
            const hasFindings = c.findings && String(c.findings).trim().length > 0;
            if (!hasModes && !hasFindings) return;   // a CMA that just links a gate but identifies nothing isn't a finding
            const modeLabelMap = (typeof CMA_MODE_LABELS !== 'undefined') ? CMA_MODE_LABELS : {};
            const modeLabels = (c.modes || []).map(m => modeLabelMap[m] || m).join(', ');
            const cmaIdStr = c.cmaId || ('CMA#' + c.internalId);
            const parts = [];
            parts.push(`CMA ${cmaIdStr} (status: ${status})`);
            if (modeLabels) parts.push(`identifies common modes: ${modeLabels}`);
            if (hasFindings) parts.push(`findings: ${c.findings}`);
            reasons.push({ kind: 'cma', detail: parts.join(' — ') });
        });
        return reasons;
    }

    function checkORCompromise(gate, page){
        const reasons = [];
        const root = page.root;
        if(!root) return reasons;
        const topSev = pageTopSeverity(page);

        // Structural SPF: walk from root → gate. If no AND-family ancestor and top sev ≥ Hazardous, flag.
        const path = findPathTo(root, gate);
        if(path && path.length >= 1){
            const ancestors = path.slice(0, -1);
            const hasAndAncestor = ancestors.some(isAndFamily);
            if(!hasAndAncestor && topSev && SEV_ORDER[topSev] >= 4){
                reasons.push({
                    kind: 'structural-spf',
                    detail: `Gate ${gate.displayId || gate.id} has no AND-family ancestor and feeds a ${topSev} top event — any single child failure propagates to top.`
                });
            }
            if(gate === root && topSev && SEV_ORDER[topSev] >= 4){
                reasons.push({
                    kind: 'top-or-spf',
                    detail: `OR-family gate is the top event of a ${topSev} hazard — every child is structurally a single point of failure.`
                });
            }
        }
        return reasons;
    }

    function genGateIndependence(scopeKey){
        const out = [];
        walkAllPages((node, page) => {
            if(!node || node.type !== 'gate') return;
            // Skip pure TRANSFER pointers and transferred-out stubs (destination root carries the children).
            if(node.gateType === 'TRANSFER' || node.transferOutTo) return;
            const kids = node.children || [];
            if(kids.length < 1) return;

            // Phase 55.0.8 — show descriptions alongside IDs so generated reqs read
            // as "BE-1 (Power supply A)" rather than the cryptic ID-only "BE-1".
            const childLabels = kids.map(c => {
                const id = c.displayId || String(c.id);
                const nm = (c.name || '').trim();
                return nm ? `${id} (${nm})` : id;
            }).join(', ');
            // Phase 56.49d — positive-form labels for independence requirements
            // (descriptions only, no IDs). When a description starts with a
            // failure-mode prefix ("Loss of", "Erroneous Info from", etc.) we
            // strip it so the subject reads as the signal/asset, not its failure.
            function _stripFailurePrefix(s) {
                // Strip leading failure-mode prefixes AND trailing failure verbs
                // ("Elevator servo channel A fails" → "Elevator servo channel A")
                // so independence subjects read as assets, not their failures.
                let t = (s || '').replace(/^(loss of (ability to )?|erroneous info from |inadvertent |failure of |loss of )/i, '').trim();
                t = t.replace(/ (fails?|failed|failure|lost|inoperative|unavailable)$/i, '').trim();
                return t || s;
            }
            const childAssetNames = kids.map(c => _stripFailurePrefix(c.name || c.displayId || ''));
            const childAssetSubject = _subjectList(childAssetNames);
            const sortedChildLids = kids.map(c => c.logicalId != null ? c.logicalId : c.id).slice().sort();
            const topSev = pageTopSeverity(page);
            const gateLabel = (function(){
                const id = node.displayId || '';
                const nm = (node.name || '').trim();
                if (id && nm) return `${id} (${nm})`;
                return id || nm || 'unnamed gate';
            })();

            // Phase 56.18d — gate rebalance rationale. When children of this
            // gate include externally-constrained events, allocator already
            // redistributed the budget; the requirement text should call this
            // out so designers know which sibling targets were tightened or
            // loosened to satisfy the external inheritance.
            let rebalRat = '';
            const rebalFingerprintTokens = [];
            if (node._externalRebalance) {
                rebalRat = ` Allocator rebalanced this gate's children because ${node._externalRebalance.constrainedCount} of ${node._externalRebalance.constrainedCount + node._externalRebalance.freeCount} carry an external-source link; sibling targets have been adjusted (tightened or loosened) to keep the gate at its allocated probability while honoring the inherited values.`;
                rebalFingerprintTokens.push('rebal', node._externalRebalance.mode, node._externalRebalance.constrainedCount);
            }

            // Surface the allocateDAL-generated independence requirement's substantiation state
            // (the precondition for the DAL reduction) in the AutoReq rationale.
            const _ir = node._independenceReq;
            const irNote = _ir
                ? ` DAL reduction taken under ${_ir.status} independence — CMA substantiation (ARP4761A App M) ${_ir.status === 'substantiated' ? 'is recorded' : 'is REQUIRED to validate the reduction'}.`
                : '';

            if(isAndFamily(node)){
                if (kids.length < 2) return;   // independence needs ≥2 members
                const reasons = checkANDCompromise(node).concat(checkCMACompromise(node, page));
                // Phase 56.50 — independence is TYPED, one claim per requirement:
                //   (a) functional independence — the AND gate's standing claim;
                //   (b) development independence — only when a DAL reduction is
                //       predicated on it (Option 1/2), typed function-vs-item;
                //   (c) physical separation — only when the gate protects a
                //       Catastrophic top event (installation coupling matters);
                //   (d) common-cause couplings detected on the gate (shared
                //       library entry, declared CCF group, CMA-identified
                //       modes) become their own singular requirements.
                out.push({
                    text: `${childAssetSubject} shall be functionally independent.`,
                    rat: `Required by AND-family gate ${gateLabel} per ARP 4754A §5.4.1 — the gate's probability product assumes no common cause couples its members. Children: ${childLabels}.${rebalRat}${irNote}`,
                    level: 'L2', type: 'Independence',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'gate-indep-and',
                        sourceId: `${scopeKey}:gate-indep:${page.id}:${node.id}`,
                        context: { gateType: node.gateType, children: kids.map(c => c.displayId || String(c.id)), childLids: sortedChildLids, externalRebalance: node._externalRebalance || null },
                        fingerprint: fp('gate-indep-and', 'v2', node.gateType, sortedChildLids,
                            kids.map(c => c.ccfGroup || ''),
                            kids.map(c => c.libraryKey || ''),
                            ...rebalFingerprintTokens),
                        generatedAt: Date.now()
                    },
                    compromised: reasons.length > 0,
                    compromiseReasons: reasons
                });

                // (b) Development independence — the predicate of the DAL reduction.
                if (_ir) {
                    const kw = (page.treeLevel === 'system')
                        ? (kids.every(c => c.type === 'basic') ? 'item' : 'function')
                        : (page.treeLevel === 'aircraft' ? 'function'
                            : (kids.every(c => c.type === 'basic') ? 'item' : 'function'));
                    const opt = node.dalOption === 'opt1' ? '1' : '2';
                    out.push({
                        text: `${childAssetSubject} shall be developed with ${kw} development independence.`,
                        rat: `The DAL reduction at gate ${gateLabel} (ARP4754B §5.2.3 / ARP4761A Table P2, Option ${opt}) is predicated on development independence between the members. CMA substantiation (ARP4761A App M) ${_ir.status === 'substantiated' ? 'is recorded' : 'is REQUIRED to validate the reduction'}. Children: ${childLabels}.`,
                        level: 'L2', type: 'Independence',
                        verifMethod: 'Analysis',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-dev',
                            sourceId: `${scopeKey}:gate-indep-dev:${page.id}:${node.id}`,
                            context: { gateType: node.gateType, childLids: sortedChildLids, option: opt, kind: kw, cmaStatus: _ir.status },
                            fingerprint: fp('gate-indep-dev', node.gateType, sortedChildLids, opt, kw, _ir.status),
                            generatedAt: Date.now()
                        }
                    });
                }

                // (c) Physical separation — Catastrophic top events only.
                if (topSev === 'Catastrophic') {
                    out.push({
                        text: `${childAssetSubject} shall be physically separated.`,
                        rat: `Members of AND-family gate ${gateLabel} protect a Catastrophic top event; installation separation (location, routing, power sources) is required so a single physical event cannot fail more than one member. Coverage is corroborated by ZSA/PRA. Children: ${childLabels}.`,
                        level: 'L2', type: 'Independence',
                        verifMethod: 'Inspection',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-phys',
                            sourceId: `${scopeKey}:gate-indep-phys:${page.id}:${node.id}`,
                            context: { gateType: node.gateType, childLids: sortedChildLids, topSeverity: topSev },
                            fingerprint: fp('gate-indep-phys', node.gateType, sortedChildLids, topSev),
                            generatedAt: Date.now()
                        }
                    });
                }

                // (d1) Shared component-library entries → dissimilarity requirements.
                const libGroups = new Map();
                kids.forEach(c => {
                    if (!c.libraryKey) return;
                    if (!libGroups.has(c.libraryKey)) libGroups.set(c.libraryKey, []);
                    libGroups.get(c.libraryKey).push(c);
                });
                libGroups.forEach((members, key) => {
                    if (members.length < 2) return;
                    const subj = _subjectList(members.map(c => _stripFailurePrefix(c.name || c.displayId || '')));
                    out.push({
                        text: `${subj} shall not be implemented with components of a common part number or design family.`,
                        rat: `Members of AND-family gate ${gateLabel} reference the same component library entry "${key}"; a shared design family defeats the independence claimed at this gate (common-mode susceptibility, ARP4761A App M). Members: ${members.map(c => c.displayId || String(c.id)).join(', ')}.`,
                        level: 'L2', type: 'Independence',
                        verifMethod: 'Inspection',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-ccf-lib',
                            sourceId: `${scopeKey}:gate-indep-ccf-lib:${page.id}:${node.id}:${key}`,
                            context: { libraryKey: key, members: members.map(c => c.displayId || String(c.id)) },
                            fingerprint: fp('gate-indep-ccf-lib', key, members.map(c => c.logicalId != null ? c.logicalId : c.id).sort()),
                            generatedAt: Date.now()
                        }
                    });
                });

                // (d2) Declared CCF groups → common-cause control requirements.
                const ccfGroups = new Map();
                kids.forEach(c => {
                    if (!c.ccfGroup) return;
                    if (!ccfGroups.has(c.ccfGroup)) ccfGroups.set(c.ccfGroup, []);
                    ccfGroups.get(c.ccfGroup).push(c);
                });
                ccfGroups.forEach((members, grp) => {
                    if (members.length < 2) return;
                    const subj = _subjectList(members.map(c => _stripFailurePrefix(c.name || c.displayId || '')));
                    out.push({
                        text: `A single common cause shall not fail more than one of ${subj}.`,
                        rat: `Members of AND-family gate ${gateLabel} are declared members of CCF group "${grp}". The independence claimed at this gate requires the declared coupling to be controlled by segregation and its residual contribution bounded (β term) in the gate's quantification (ARP4761A App M). Members: ${members.map(c => c.displayId || String(c.id)).join(', ')}.`,
                        level: 'L2', type: 'Independence',
                        verifMethod: 'Analysis',
                        traceId: node.displayId || '',
                        reqSource: {
                            generator: 'gate-indep-ccf-group',
                            sourceId: `${scopeKey}:gate-indep-ccf-group:${page.id}:${node.id}:${grp}`,
                            context: { ccfGroup: grp, members: members.map(c => c.displayId || String(c.id)) },
                            fingerprint: fp('gate-indep-ccf-group', grp, members.map(c => c.logicalId != null ? c.logicalId : c.id).sort()),
                            generatedAt: Date.now()
                        }
                    });
                });

                // (d3) CMA-identified common modes → preclusion requirements. Emitted
                // for ANY CMA linking this gate with identified modes (not just open
                // ones): closing the CMA is the verification evidence, and the
                // requirement must survive closure — it is the design constraint the
                // mitigation made real. Status travels in rationale + fingerprint.
                const gateKey = page.id + ':' + node.id;
                (typeof cmaData !== 'undefined' ? cmaData : []).forEach(c => {
                    if (!c || !c.linkedGateIds || !c.linkedGateIds.includes(gateKey)) return;
                    const modes = c.modes || [];
                    if (!modes.length) return;
                    const modeLabelMap = (typeof CMA_MODE_LABELS !== 'undefined') ? CMA_MODE_LABELS : {};
                    const cmaIdStr = c.cmaId || ('CMA#' + c.internalId);
                    const status = c.status || 'Open';
                    modes.forEach(m => {
                        const label = modeLabelMap[m] || m;
                        out.push({
                            text: `The design shall preclude ${_midSentence(label)} from affecting more than one of ${childAssetSubject}.`,
                            rat: `Derived from ${cmaIdStr} (status: ${status}), which identifies this common mode across the members of AND-family gate ${gateLabel}. CMA closure (Mitigated / Closed — Accepted) is the substantiating evidence.${c.findings ? ' Findings: ' + c.findings : ''}`,
                            level: 'L2', type: 'Independence',
                            verifMethod: 'Analysis',
                            traceId: node.displayId || '',
                            reqSource: {
                                generator: 'gate-indep-cma',
                                sourceId: `${scopeKey}:gate-indep-cma:${page.id}:${node.id}:${c.internalId}:${m}`,
                                context: { cmaId: cmaIdStr, mode: m, status, childLids: sortedChildLids },
                                fingerprint: fp('gate-indep-cma', m, status, sortedChildLids),
                                generatedAt: Date.now()
                            }
                        });
                    });
                });
            } else if(isOrFamily(node)){
                const reasons = checkORCompromise(node, page).concat(checkCMACompromise(node, page));
                // Phase 56.49e — NSPF requirement only at FC top with severity
                // ≥ Hazardous. Suppress OR-gate NSPF for everything else (it's
                // a tautology — the upstream AND covers NSPF for the FC).
                if (node !== page.root) return;   // not the FC top, skip
                if (!topSev || SEV_ORDER[topSev] < 4) return;   // not Catastrophic/Hazardous
                // Use the FULL failure condition (do NOT strip "Loss of…") — an NSPF requirement must
                // name the FAILURE ("loss of cabin pressurization"), not the function ("cabin
                // pressurization"). Lowercase the first letter for mid-sentence flow unless it's an acronym.
                const _rawFc = (node.name || gateLabel || '').trim();
                const _fw = _rawFc.split(/\s+/)[0] || '';
                const fcSubject = (_fw && _fw === _fw.toUpperCase() && _fw.length > 1)
                    ? _rawFc
                    : (_rawFc.charAt(0).toLowerCase() + _rawFc.slice(1));
                out.push({
                    text: `No single failure shall result in ${fcSubject}.`,
                    rat: `Required for ${topSev} failure conditions per 14 CFR 25.1309(b) / AC 25.1309-1A. Top: ${gateLabel}.${rebalRat}`,
                    level: 'L2', type: 'Independence',
                    verifMethod: 'Analysis',
                    traceId: node.displayId || '',
                    reqSource: {
                        generator: 'gate-indep-or',
                        sourceId: `${scopeKey}:gate-indep:${page.id}:${node.id}`,
                        context: { gateType: node.gateType, children: kids.map(c => c.displayId || String(c.id)), childLids: sortedChildLids, topSeverity: topSev, externalRebalance: node._externalRebalance || null },
                        fingerprint: fp('gate-indep-or', 'v2', node.gateType, sortedChildLids, topSev, ...rebalFingerprintTokens),
                        generatedAt: Date.now()
                    },
                    compromised: reasons.length > 0,
                    compromiseReasons: reasons
                });
            }
        });
        return out;
    }

    // ----- Generator 5: PRA → zonal protection requirements -----
    // One requirement per PRA that lists affected zones. Aggregates the exposed sub-functions
    // (housed functions across the affected zones) so the requirement captures the full bidirectional
    // PRA ↔ Zone ↔ Function trace. AC-scope only — PRAs are inherently aircraft-level.
    function genPRA(scopeKey){
        if (scopeKey !== 'ac') return [];
        const out = [];
        const pras = (typeof praData !== 'undefined' ? praData : []) || [];
        pras.forEach(p => {
            if (!p) return;
            const zones = Array.isArray(p.affectedZones) ? p.affectedZones.slice().sort() : [];
            if (!zones.length) return;   // PRAs without affected zones have nothing to constrain
            // Derive exposed sub-functions via the zone → housedFunctions join.
            const exposed = new Set();
            zones.forEach(zid => {
                const z = (typeof zsaData !== 'undefined' ? zsaData : []).find(zz => zz.zoneId === zid);
                if (z && Array.isArray(z.housedFunctions)) z.housedFunctions.forEach(s => exposed.add(s));
            });
            const exposedList = Array.from(exposed).sort();
            const zonesStr = zones.join(', ');
            const exposedStr = exposedList.length ? exposedList.join(', ') : 'no housed functions recorded';
            const mitRat = p.mitigation ? ` Reference mitigation: ${p.mitigation}.` : '';
            const sourceKey = p.praId || ('internal-' + p.internalId);
            // Phase 56.50 — EARS unwanted-behavior form: "If <trigger>, the
            // <system> shall <response>." One shall; the old "or compensating
            // means shall be provided" escape clause and the second/third shall
            // are gone — the PRA linkage and mitigation live in the rationale.
            const retainStr = exposedList.length ? exposedList.join(', ') : 'the aircraft sub-functions housed in those zones';
            out.push({
                text: `If the particular risk "${p.threat || 'unspecified threat'}" occurs within zone(s) ${zonesStr}, the aircraft shall retain ${retainStr}.`,
                rat: `Derived from PRA ${p.praId || ''}: "${p.desc || ''}". Threat: ${p.threat || '—'}. Zones affected: ${zonesStr}. Exposed sub-functions (via zone housing): ${exposedStr}. Retention may be met by protection of the installation or by an accepted compensating means — either way the exposed functions survive the postulated event.${mitRat} Per ARP 4761A §5.1.2.4 / 14 CFR 25.1309.`,
                level: 'L2', type: 'Independence',
                verifMethod: 'Analysis',
                traceId: p.praId || '',
                reqSource: {
                    generator: 'pra-zonal',
                    sourceId: `${scopeKey}:pra:${sourceKey}`,
                    context: { threat: p.threat || '', zones, exposedFunctions: exposedList, mitigation: p.mitigation || '' },
                    fingerprint: fp('pra-zonal', 'v2', p.threat || '', zones, exposedList, p.mitigation || ''),
                    generatedAt: Date.now()
                }
            });
        });
        return out;
    }

    // ----- Generator 6: ZSA → housed-function separation requirements -----
    // Per ZSA zone, one separation requirement covering the functions housed in that zone.
    // Catastrophic zones (per ZSA severity) get strictened wording. AC-scope only.
    function genZSA(scopeKey){
        if (scopeKey !== 'ac') return [];
        const out = [];
        const zsas = (typeof zsaData !== 'undefined' ? zsaData : []) || [];
        zsas.forEach(z => {
            if (!z || !z.zoneId) return;
            const housed = Array.isArray(z.housedFunctions) ? z.housedFunctions.slice().sort() : [];
            if (!housed.length) return;   // no housed functions → nothing to separate
            const isCat = z.severity === 'Catastrophic';
            const housedStr = housed.join(', ');
            // Phase 56.50 — the verifiable claim IS the requirement: a single
            // zonal event must not take out more than one housed sub-function.
            // "Adequate … separation" (banned vague term) and the multi-shall
            // Catastrophic strictness clause are gone: the separation means are
            // rationale, and Catastrophic zones get a separate singular physical-
            // separation requirement verified by inspection.
            const strictRat = isCat
                ? ' The zone is classified Catastrophic; physical (not merely logical) separation is required — see the companion physical-separation requirement.'
                : '';
            const mitRat = z.mitigation ? ` Existing mitigation reference: ${z.mitigation}.` : '';
            const sourceKey = z.zoneId;
            out.push({
                text: `A single zonal event within zone ${z.zoneId} shall not compromise more than one of ${housedStr}.`,
                rat: `Derived from ZSA zone ${z.zoneId} (${z.desc || 'no description'}). Severity: ${z.severity || '—'}. Equipment: ${z.equip || '—'}. Environmental, electrical, mechanical, and installation separation of the housed sub-functions is the design means.${strictRat}${mitRat} Per ARP 4761A §5.1.2.4 / AC 25.1309-1B Zonal Safety Analysis.`,
                level: 'L2', type: 'Independence',
                verifMethod: 'Analysis',
                traceId: z.zoneId || '',
                reqSource: {
                    generator: 'zsa-separation',
                    sourceId: `${scopeKey}:zsa:${sourceKey}`,
                    context: { zoneId: z.zoneId, severity: z.severity || '', housedFunctions: housed, equip: z.equip || '', mitigation: z.mitigation || '' },
                    fingerprint: fp('zsa-separation', 'v2', z.zoneId, z.severity || '', housed, z.equip || '', z.mitigation || ''),
                    generatedAt: Date.now()
                }
            });
            if (isCat) {
                out.push({
                    text: `The aircraft sub-functions housed in zone ${z.zoneId} shall be physically separated.`,
                    rat: `Zone ${z.zoneId} is classified Catastrophic; separation must be physical, not merely logical. Housed sub-functions: ${housedStr}. Verified by inspection of the installation and by analysis (ZSA).`,
                    level: 'L2', type: 'Independence',
                    verifMethod: 'Inspection',
                    traceId: z.zoneId || '',
                    reqSource: {
                        generator: 'zsa-phys',
                        sourceId: `${scopeKey}:zsa:${sourceKey}:phys`,
                        context: { zoneId: z.zoneId, housedFunctions: housed },
                        fingerprint: fp('zsa-phys', z.zoneId, housed),
                        generatedAt: Date.now()
                    }
                });
            }
        });
        return out;
    }

    // Resolve target store + helper for scope key 'ac' or 'sys-<id>'.
    function storeForScope(scope){
        if(scope === 'ac') return acReqData;
        const sysId = scope.replace(/^sys-/, '');
        const s = systemsData.find(x => x.id === sysId);
        return s ? s.req : null;
    }
    function fhaArrForScope(scope){
        if(scope === 'ac') return acFhaData;
        const sysId = scope.replace(/^sys-/, '');
        const s = systemsData.find(x => x.id === sysId);
        return s ? s.fha : [];
    }

    // ---------------------------------------------------------------------
    // Phase 55.0.8 — Customizable AutoReq templates.
    // Orgs that have an existing requirements-writing standard (e.g., "[REQ-...]"
    // prefix, "must" instead of "shall", different phrasings, internal IDs at the
    // front) can override the auto-generated text per generator. Templates use
    // ${var} substitution, with `${a|b|c}` falling back through alternatives.
    //
    // Variables available:
    //   ${text}, ${rat}                       — the default-generated text / rationale
    //   ${level}, ${type}, ${traceId}         — the requirement's top-level fields
    //   ${context.<key>}                      — anything in reqSource.context
    //                                           (e.g., context.dal, context.severity,
    //                                            context.fcId, context.threat)
    //   ${generator}                          — generator name (fha-prob, dalgebra, etc.)
    //
    // Storage:
    //   window.autoReqTemplateOverrides = {
    //     'fha-prob': { text: '[SR-${context.fcId}] ${text}', rat: '...' },
    //     'dalgebra': { text: '...', rat: '...' },
    //     ...
    //   }
    // Empty / missing entries fall through to the default text. Save+load
    // round-trips automatically because the overrides live on the project.
    // ---------------------------------------------------------------------
    function _arSubstitute(tmpl, vars) {
        if (typeof tmpl !== 'string' || !tmpl) return '';
        return tmpl.replace(/\$\{([^}]+)\}/g, (m, expr) => {
            const alts = expr.split('|').map(s => s.trim());
            for (const path of alts) {
                let cur = vars;
                const segments = path.split('.');
                let ok = true;
                for (const seg of segments) {
                    if (cur == null || typeof cur !== 'object') { ok = false; break; }
                    cur = cur[seg];
                }
                if (ok && cur != null && String(cur) !== '') return String(cur);
            }
            return '';
        });
    }

    function _applyTemplateOverride(req) {
        if (!req || !req.reqSource) return req;
        const overrides = (typeof window !== 'undefined' && window.autoReqTemplateOverrides) || {};
        const gen = req.reqSource.generator;
        const tmpl = overrides[gen];
        if (!tmpl || (!tmpl.text && !tmpl.rat)) return req;
        const vars = {
            text:      req.text,
            rat:       req.rat,
            level:     req.level,
            type:      req.type,
            traceId:   req.traceId,
            generator: gen,
            context:   (req.reqSource.context || {})
        };
        // Treat reqSource.context fields as top-level too so users can write
        // ${dal} instead of ${context.dal} for convenience.
        const ctx = req.reqSource.context || {};
        Object.keys(ctx).forEach(k => { if (vars[k] === undefined) vars[k] = ctx[k]; });
        try {
            if (tmpl.text) req.text = _arSubstitute(tmpl.text, vars);
            if (tmpl.rat)  req.rat  = _arSubstitute(tmpl.rat,  vars);
        } catch (e) {
            console.warn('[AutoReq] template substitution failed for', gen, e);
        }
        return req;
    }

    // Default templates — captured here so the settings UI can show "reset to default".
    // The strings are the ones the in-code generators emit; if a user clears their
    // override the system reverts to the in-code text (templates are post-processing).
    const DEFAULT_AR_TEMPLATES = {
        'fha-prob':       { text: '${text}', rat: '${rat}' },
        'fha-qualitative':{ text: '${text}', rat: '${rat}' },
        'fha-similarity': { text: '${text}', rat: '${rat}' },
        'fha-dal':        { text: '${text}', rat: '${rat}' },
        'fta-event':      { text: '${text}', rat: '${rat}' },
        'fta-interval':   { text: '${text}', rat: '${rat}' },
        'dalgebra':       { text: '${text}', rat: '${rat}' },
        'gate-indep-and': { text: '${text}', rat: '${rat}' },
        'gate-indep-dev': { text: '${text}', rat: '${rat}' },
        'gate-indep-phys':{ text: '${text}', rat: '${rat}' },
        'gate-indep-ccf-lib':   { text: '${text}', rat: '${rat}' },
        'gate-indep-ccf-group': { text: '${text}', rat: '${rat}' },
        'gate-indep-cma': { text: '${text}', rat: '${rat}' },
        'gate-indep-or':  { text: '${text}', rat: '${rat}' },
        'pra-zonal':      { text: '${text}', rat: '${rat}' },
        'zsa-separation': { text: '${text}', rat: '${rat}' },
        'zsa-phys':       { text: '${text}', rat: '${rat}' }
    };

    // Diff a previous req against the live generated candidate to figure out what changed.
    function describeDiff(prev, next){
        const changes = [];
        if(prev.text !== next.text) changes.push({ field: 'text', from: prev.text, to: next.text });
        if(prev.level !== next.level) changes.push({ field: 'level', from: prev.level, to: next.level });
        if(prev.type !== next.type) changes.push({ field: 'type', from: prev.type, to: next.type });
        if(prev.rat !== next.rat) changes.push({ field: 'rat', from: prev.rat, to: next.rat });
        // Context diff for human-readable summary.
        const a = prev.reqSource && prev.reqSource.context || {};
        const b = next.reqSource && next.reqSource.context || {};
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        keys.forEach(k => { if(JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes.push({ field: `context.${k}`, from: a[k], to: b[k] }); });
        return changes;
    }

    // ----- Public API -----
    // generate({ fha, ftaEvent, dalgebra, gateIndependence }, scope) → preview merge
    function generate(opts, scope){
        scope = scope || 'ac';
        opts = opts || { fha:true, ftaEvent:true, dalgebra:true, gateIndependence:true, praZonal:true, zsaSeparation:true };

        const candidates = [];
        if(opts.fha) candidates.push(...genFHA(fhaArrForScope(scope), scope));
        if(opts.ftaEvent) candidates.push(...genFTAEvents(scope));
        if(opts.dalgebra) candidates.push(...genDALgebra(scope));
        if(opts.gateIndependence) candidates.push(...genGateIndependence(scope));
        if(opts.praZonal) candidates.push(...genPRA(scope));
        if(opts.zsaSeparation) candidates.push(...genZSA(scope));

        // Phase 55.0.8 — apply per-org template overrides to every candidate.
        // The override gets a snapshot of the default text+rat as ${text}/${rat}
        // so most customizations only need to wrap or prefix, not re-derive.
        candidates.forEach(_applyTemplateOverride);

        const store = storeForScope(scope) || [];
        const existing = new Map();
        store.forEach(r => { if(r.reqSource && r.reqSource.sourceId) existing.set(r.reqSource.sourceId, r); });

        const isNew = [], isUpdated = [], unchanged = [];
        candidates.forEach(cand => {
            const prev = existing.get(cand.reqSource.sourceId);
            if(!prev) isNew.push(cand);
            else if(prev.reqSource.fingerprint !== cand.reqSource.fingerprint) isUpdated.push({ prev, next: cand, diff: describeDiff(prev, cand) });
            else unchanged.push({ prev, next: cand });
        });

        // Orphaned auto-reqs whose source disappeared (only check within requested generator scope).
        const candIds = new Set(candidates.map(c => c.reqSource.sourceId));
        const orphaned = [];
        store.forEach(r => {
            if(!r.reqSource) return;
            const g = r.reqSource.generator || '';
            const inScope = (
                (g.startsWith('fha') && opts.fha) ||
                ((g === 'fta-event' || g === 'fta-interval') && opts.ftaEvent) ||
                (g.startsWith('dalgebra') && opts.dalgebra) ||
                (g.startsWith('gate-indep') && opts.gateIndependence) ||
                (g === 'pra-zonal' && opts.praZonal) ||
                (g.startsWith('zsa') && opts.zsaSeparation)
            );
            if(inScope && !candIds.has(r.reqSource.sourceId)) orphaned.push(r);
        });

        return { scope, isNew, isUpdated, unchanged, orphaned };
    }

    // Apply a merge to the store. Choices control what gets written.
    function applyMerge(merge, choices){
        choices = choices || { acceptNew:true, acceptUpdates:true, acceptOrphanRemoval:false };
        const store = storeForScope(merge.scope);
        if(!store) return 0;
        let n = 0;
        if(choices.acceptNew){
            merge.isNew.forEach(cand => {
                cand.internalId = newRowId();
                // Phase 53.63 — assign a default derivationType from the generator if absent.
                // FHA-driven candidates are top-level safety reqs (the FHA IS the top hazard
                // analysis). FTA event, DALgebra, gate-independence, PRA, ZSA are derived
                // during design analysis and need their own validation argument back to safety.
                if (!cand.derivationType && cand.reqSource && cand.reqSource.generator) {
                    const g = cand.reqSource.generator;
                    cand.derivationType = (g.indexOf('fha') === 0) ? 'top-level' : 'derived';
                }
                store.push(cand);
                // Phase 53.56 — log auto-creation in req history.
                try { if (typeof ReqHistory !== 'undefined') ReqHistory.record(cand, 'auto-create', null, { note: (cand.reqSource && cand.reqSource.generator) || '' }); } catch(_) {}
                n++;
            });
        }
        if(choices.acceptUpdates){
            merge.isUpdated.forEach(({ prev, next }) => {
                // Snapshot the prev state before mutating in place — history needs the diff.
                const preSnap = (typeof ReqHistory !== 'undefined') ? JSON.parse(JSON.stringify(prev)) : null;
                // Preserve user-overridden text if user manually edited the requirement statement.
                const keepText = prev.reqSource && prev.reqSource.userOverridden;
                prev.text = keepText ? prev.text : next.text;
                prev.rat = next.rat;
                prev.level = next.level;
                prev.type = next.type;
                prev.traceId = next.traceId || prev.traceId;
                prev.compromised = !!next.compromised;
                prev.compromiseReasons = next.compromiseReasons || [];
                const prevSrc = prev.reqSource || {};
                prev.reqSource = Object.assign({}, next.reqSource, {
                    userOverridden: !!prevSrc.userOverridden,
                    stale: false
                });
                try { if (preSnap) ReqHistory.record(prev, 'auto-update', preSnap, { note: (prev.reqSource && prev.reqSource.generator) || '' }); } catch(_) {}
                n++;
            });
        }
        if(choices.acceptOrphanRemoval){
            const oids = new Set(merge.orphaned.map(o => o.internalId));
            // Phase 53.56 — soft-delete orphans instead of splicing them out, so the
            // audit trail survives and the user can restore from the Deleted filter.
            for(let i = 0; i < store.length; i++){
                if(oids.has(store[i].internalId) && !store[i].deleted){
                    try { if (typeof ReqHistory !== 'undefined') ReqHistory.softDelete(store[i]); } catch(_) { store[i].deleted = true; store[i].deletedAt = Date.now(); }
                    n++;
                }
            }
        }
        return n;
    }

    // Re-evaluate stale + compromised flags on existing auto-reqs without modifying their content.
    function recomputeFlags(scope){
        scope = scope || 'ac';
        const merge = generate({ fha:true, ftaEvent:true, dalgebra:true, gateIndependence:true, praZonal:true, zsaSeparation:true }, scope);
        const store = storeForScope(scope) || [];
        const liveById = new Map();
        merge.isNew.forEach(c => liveById.set(c.reqSource.sourceId, c));
        merge.isUpdated.forEach(u => liveById.set(u.next.reqSource.sourceId, u.next));
        merge.unchanged.forEach(u => liveById.set(u.next.reqSource.sourceId, u.next));
        store.forEach(r => {
            if(!r.reqSource) return;
            const live = liveById.get(r.reqSource.sourceId);
            if(live){
                r.reqSource.stale = (r.reqSource.fingerprint !== live.reqSource.fingerprint);
                r.reqSource.orphan = false;
                r.compromised = !!live.compromised;
                r.compromiseReasons = live.compromiseReasons || [];
            } else {
                r.reqSource.stale = false;
                r.reqSource.orphan = true;
            }
        });
    }

    // Look up the human-readable label for a generator key.
    const GEN_LABELS = {
        'fha-prob':         'FHA → Probabilistic',
        'fha-qualitative':  'FHA → Qualitative',
        'fha-similarity':   'FHA → Similarity argument',
        'fha-dal':          'FHA → DAL',
        'fta-event':        'FTA event → Reliability',
        'fta-interval':     'FTA event → Maintenance interval (CMR candidate)',
        'dalgebra':         'DALgebra → DAL allocation',
        'dalgebra-default': 'DALgebra → Default DAL',
        'gate-indep-and':   'Gate → Functional independence',
        'gate-indep-dev':   'Gate → Development independence (DAL reduction)',
        'gate-indep-phys':  'Gate → Physical separation (Cat top)',
        'gate-indep-ccf-lib':   'Gate → Dissimilarity (shared library entry)',
        'gate-indep-ccf-group': 'Gate → Common-cause control (CCF group)',
        'gate-indep-cma':   'CMA → Common-mode preclusion',
        'gate-indep-or':    'Gate → No-single-failure check',
        'pra-zonal':        'PRA → Zonal protection',
        'zsa-separation':   'ZSA → Housed-function separation',
        'zsa-phys':         'ZSA → Physical separation (Cat zone)'
    };

    // ========================================================================
    // Phase 11.2 — Detect duplicate AC↔Sys requirements and tag the less
    // conservative one as obsolete (does NOT delete; preserves audit trail).
    // Match rule: same FHA fcId OR explicit acTrace linkage; one in AC scope,
    // one in any Sys scope.  Conservativeness: lower prob target wins;
    // higher DAL rank (A=5 → E=1) wins.
    // ========================================================================
    const DAL_RANK_LOCAL = DAL_RANK_MAP;   // Phase 27 refactor B7 — alias to module-scope constant.
    function _conservativenessScore(req) {
        // Score per-req. Lower-target probabilistic reqs and higher-DAL design-assurance reqs are MORE conservative.
        if (!req || !req.reqSource) return null;
        const ctx = req.reqSource.context || {};
        const gen = req.reqSource.generator;
        if (gen === 'fha-prob') {
            // More conservative = lower prob target. Convert so larger score = more conservative.
            const p = ctx.prob;
            if (p == null || p <= 0) return 0;
            return -Math.log10(p);
        }
        if (gen === 'fha-dal') {
            return DAL_RANK_LOCAL[ctx.dal] || 0;
        }
        return null;   // other generators aren't part of this dedup pass
    }
    function _reqFcKey(req) {
        // Returns a key that identifies the underlying failure condition.
        // For AC reqs: the fcId of the linked FHA. For Sys reqs: the linked AC FC (via acTrace), or fcId itself.
        if (!req || !req.reqSource) return null;
        const ctx = req.reqSource.context || {};
        if (ctx.fcId) return ctx.fcId;
        if (req.reqSource.sourceId && req.reqSource.sourceId.indexOf('fha') >= 0) {
            // Try to recover by looking up the source FHA.
            const sourceId = req.reqSource.sourceId;
            const m = sourceId.match(/^(ac|sys-[^:]+):fha:(prob|dal(?::func)?):(.+)$/);
            if (m) {
                const scope = m[1];
                const ref = m[3];
                if (scope === 'ac') {
                    const f = (acFhaData || []).find(x => x.internalId === ref);
                    return f ? f.fcId : null;
                } else {
                    const sys = systemsData.find(s => 'sys-' + s.id === scope);
                    if (!sys) return null;
                    const f = (sys.fha || []).find(x => x.internalId === ref);
                    if (!f) return null;
                    // For sys-side, the FC is normalized to the linked AC FC if traced; otherwise the sys fcId.
                    return f.acTrace || f.fcId;
                }
            }
        }
        return null;
    }
    function _scopeOf(req) {
        if (!req || !req.reqSource) return null;
        const s = req.reqSource.sourceId || '';
        if (s.indexOf('ac:') === 0) return 'ac';
        const m = s.match(/^sys-([^:]+):/);
        return m ? ('sys-' + m[1]) : null;
    }

    // Find duplicates across all stores. Returns array of { winner, loser, kind, reason }.
    // winner = more conservative; loser = less conservative (gets obsolete-flagged).
    function findDuplicates() {
        const allReqs = [];
        (acReqData || []).forEach(r => allReqs.push(r));
        (systemsData || []).forEach(s => (s.req || []).forEach(r => allReqs.push(r)));

        // Group by (fc-key, generator-kind). Only the relevant generators ('fha-prob', 'fha-dal').
        const groups = new Map();
        allReqs.forEach(r => {
            if (!r.reqSource) return;
            const gen = r.reqSource.generator;
            if (gen !== 'fha-prob' && gen !== 'fha-dal') return;
            // Skip already-obsolete or archived reqs from the matching pool.
            if (r.reqSource.obsolete || r.status === 'archived') return;
            const key = _reqFcKey(r);
            if (!key) return;
            const groupKey = gen + '|' + key;
            if (!groups.has(groupKey)) groups.set(groupKey, []);
            groups.get(groupKey).push(r);
        });

        const pairs = [];
        groups.forEach((reqs, gk) => {
            if (reqs.length < 2) return;
            // Identify scopes — we need at least one AC and one Sys to count it as cross-scope duplicate.
            const acReqs = reqs.filter(r => _scopeOf(r) === 'ac');
            const sysReqs = reqs.filter(r => _scopeOf(r) && _scopeOf(r).indexOf('sys-') === 0);
            if (!acReqs.length || !sysReqs.length) return;
            // For each (ac, sys) pair in the group, pick conservativeness winner.
            acReqs.forEach(aReq => {
                sysReqs.forEach(sReq => {
                    const aScore = _conservativenessScore(aReq);
                    const sScore = _conservativenessScore(sReq);
                    if (aScore == null || sScore == null) return;
                    if (Math.abs(aScore - sScore) < 1e-9) return;   // truly equal — no action
                    const winner = aScore >= sScore ? aReq : sReq;
                    const loser  = aScore >= sScore ? sReq : aReq;
                    pairs.push({
                        winner, loser,
                        kind: aReq.reqSource.generator,   // 'fha-prob' or 'fha-dal'
                        reason: aReq.reqSource.generator === 'fha-prob'
                            ? 'Lower probability target is more conservative.'
                            : 'Higher DAL (A > B > C > D > E) is more conservative.'
                    });
                });
            });
        });
        return pairs;
    }

    // Tag the loser of each pair with reqSource.obsolete = { supersededBy, reason, taggedAt }.
    // Returns the count of newly-tagged reqs.
    function applyObsoleteTags(pairs) {
        let n = 0;
        (pairs || []).forEach(p => {
            if (!p.loser || !p.winner) return;
            if (!p.loser.reqSource) return;
            // Skip if already tagged with same supersedingId.
            if (p.loser.reqSource.obsolete && p.loser.reqSource.obsolete.supersededBy === p.winner.internalId) return;
            p.loser.reqSource.obsolete = {
                supersededBy: p.winner.internalId,
                supersededByRef: (p.winner.reqSource && p.winner.reqSource.sourceId) || ('REQ-' + p.winner.internalId),
                reason: p.reason,
                taggedAt: Date.now()
            };
            n++;
        });
        return n;
    }

    return { generate, applyMerge, recomputeFlags, describeDiff, GEN_LABELS, findDuplicates, applyObsoleteTags,
             decideAnalysisDepth, certBasisForChart,
             // Phase 55.0.8 — template overrides API
             DEFAULT_AR_TEMPLATES,
             applyTemplateOverride: _applyTemplateOverride,
             substituteTemplate: _arSubstitute };
})();

const Traceability = (function(){

    // Map of kind → human-readable label (for panel headings + palette).
    const KIND_LABELS = {
        acFunc: 'AC Function', sysFunc: 'System Function',
        acFcim: 'AC FCIM',     sysFcim: 'System FCIM',
        acFha:  'AC FHA',      sysFha:  'System FHA',
        acReq:  'AC Requirement', sysReq: 'System Requirement',
        acAsm:  'AC Assumption',  sysAsm:  'System Assumption',
        ftaPage:'Fault Tree Page', ftaNode: 'FTA Node',
        pra:    'PRA',         zsa:     'ZSA',
        cma:    'CMA',         fmea:    'FMEA',
        library:'Library Entry',
        item:   'Item / LRU'      // Phase 53.61
    };

    // Map of kind → tab id (used by the navigation jumper).
    const KIND_TAB = {
        acFunc: 'ac-func', sysFunc: 'sys-workspace',
        acFcim: 'ac-fcim', sysFcim: 'sys-workspace',
        acFha:  'ac-fha',  sysFha:  'sys-workspace',
        acReq:  'ac-req',  sysReq:  'sys-workspace',
        acAsm:  'ac-asm',  sysAsm:  'sys-workspace',
        ftaPage:'fta', ftaNode: 'fta',
        pra:'pra', zsa:'zsa', cma:'cma', fmea:'fmea',
        library:'library',
        item:   'items'           // Phase 53.61
    };

    // Tiny helper: shorten long labels for chip display.
    function trim(s, n){ s = String(s == null ? '' : s); n = n || 90; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    // Build a descriptor for a referrer artifact, suitable for jump-on-click.
    function descriptor(kind, id, label, opts){
        opts = opts || {};
        return {
            kind,
            id,
            label: String(label || ''),
            detail: opts.detail || '',
            tab: KIND_TAB[kind] || 'dashboard',
            systemId: opts.systemId || null,
            // For sys-* artifacts: the sub-workspace tab inside the system (sys-func, sys-fha, etc.)
            sysSubtab: opts.sysSubtab || null
        };
    }

    // ------------------------------------------------------------------
    //  getReferrers(target) — every artifact that references `target`.
    //  target shape:
    //    { kind: 'acFha',     id: 123 }                    (internalId)
    //    { kind: 'acFunc',    subId: 'F-1' }
    //    { kind: 'acReq',     id: 123 }
    //    { kind: 'sysFha',    id: 123, systemId: 'sys-1' }
    //    { kind: 'ftaPage',   id: pageId }
    //    { kind: 'ftaNode',   id: nodeId, pageId, logicalId? }
    //    { kind: 'pra'|'zsa'|'cma'|'fmea', id: internalId }
    //    { kind: 'acAsm',     id: internalId }
    // ------------------------------------------------------------------
    function getReferrers(target){
        if (!target || !target.kind) return [];
        const out = [];

        // Helper: walk every fault-tree node, invoking cb(node, page).
        const walkAllTreeNodes = (cb) => {
            (ftaPages || []).forEach(page => {
                (function walk(n){
                    if (!n) return;
                    cb(n, page);
                    const kids = n.children || n._children;
                    if (kids) kids.forEach(walk);
                })(page.root);
            });
        };

        // Helper: every requirement (with origin scope) flat-mapped.
        const allReqsWithScope = () => {
            const r = (acReqData || []).map(x => ({ req: x, scope: 'ac', systemId: null }));
            (systemsData || []).forEach(s => (s.req || []).forEach(req => r.push({ req, scope: 'sys-' + s.id, systemId: s.id })));
            return r;
        };

        // Helper: every FHA with its scope.
        const allFhaWithScope = () => {
            const r = (acFhaData || []).map(x => ({ fha: x, scope: 'ac', systemId: null }));
            (systemsData || []).forEach(s => (s.fha || []).forEach(fha => r.push({ fha, scope: 'sys-' + s.id, systemId: s.id })));
            return r;
        };

        switch (target.kind) {

        case 'acFunc': {
            const subId = target.subId;
            if (!subId) return [];
            // System functions that trace to this AC function via their traceIds array (1-to-many).
            (systemsData || []).forEach(s => {
                (s.functions || []).forEach(f => {
                    const traces = Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []);
                    if (traces.includes(subId)) {
                        out.push(descriptor('sysFunc', f.funcId || f.internalId, '[' + (s.name || s.id) + '] ' + (f.funcId || '') + ' · ' + trim(f.funcName), { systemId: s.id, sysSubtab: 'sys-func', detail: 'System function tracing to this AC function' }));
                    }
                });
            });
            // AC FHAs trace via .subIds[] (legacy .subId still honored) — Phase 28 item 3.
            (acFhaData || []).forEach(f => {
                const ids = (Array.isArray(f.subIds) && f.subIds.length) ? f.subIds : (f.subId ? [f.subId] : []);
                if (ids.includes(subId)) out.push(descriptor('acFha', f.internalId, (f.fcId || '') + ': ' + trim(f.fcDesc), { detail: 'Linked function' }));
            });
            // Sys FHAs trace via .subIds[] too — but only the ones in the systems whose acTrace matches.
            (systemsData || []).forEach(s => {
                (s.fha || []).forEach(f => {
                    const ids = (Array.isArray(f.subIds) && f.subIds.length) ? f.subIds : (f.subId ? [f.subId] : []);
                    // Sys FHAs reference SYSTEM functions (which trace to AC functions via traceIds).
                    // Only surface them here if the sys function they reference happens to trace back
                    // to this AC function. (Most queries against AC functions stay on the AC side.)
                    if (!ids.length) return;
                    const sysFuncs = (s.functions || []);
                    const hits = ids.filter(sfid => sysFuncs.some(sf => sf.funcId === sfid && (Array.isArray(sf.traceIds) ? sf.traceIds : [sf.traceId]).includes(subId)));
                    if (hits.length) out.push(descriptor('sysFha', f.internalId, '[' + (s.name || s.id) + '] ' + (f.fcId || '') + ': ' + trim(f.fcDesc), { systemId: s.id, sysSubtab: 'sys-fha', detail: 'Sys FHA on function tracing here' }));
                });
            });
            // Assumptions that link to this function directly (Phase 28 item 8).
            (acAssumptionsData || []).forEach(a => {
                if (Array.isArray(a.linkedFunctions) && a.linkedFunctions.includes(subId)) {
                    out.push(descriptor('acAsm', a.internalId, (a.asmId || '#' + a.internalId) + ' · ' + trim(a.text || a.statement), { detail: 'Linked function (assumption)' }));
                }
            });
            // AC FCIM rows reference via .subFunc
            (acFcimData || []).forEach(c => {
                // FCIM rows store the sub-function under .subId, and the failure-condition
                // descriptors under tl/pl/m id+desc — not fcId/fcDesc (Phase 27 audit A11).
                if (c.subId === subId) {
                    const labelId = c.tlId || c.plId || c.mId || '#' + c.internalId;
                    const labelDesc = c.tlDesc || c.plDesc || c.mDesc || '';
                    out.push(descriptor('acFcim', c.internalId, labelId + ': ' + trim(labelDesc)));
                }
            });
            // AC Requirements that trace to this function
            (acReqData || []).forEach(r => {
                // Phase 28 — reqs carry traceIds[] (legacy traceId still honored).
                const traceList = (Array.isArray(r.traceIds) && r.traceIds.length) ? r.traceIds : (r.traceId ? [r.traceId] : []);
                if (r.traceTo === subId || traceList.includes(subId)) out.push(descriptor('acReq', r.internalId, trim(r.text)));
                else if (r.reqSource && r.reqSource.context && r.reqSource.context.subId === subId) out.push(descriptor('acReq', r.internalId, trim(r.text), { detail: 'Auto-generated' }));
            });
            // FMEA functional rows linking to this sub-function
            (fmeaData || []).forEach(m => {
                if (m.fmeaType === 'functional' && m.funcSubId === subId) out.push(descriptor('fmea', m.internalId, m.fmeaId + ' · ' + trim(m.localEffect)));
            });
            // ZSAs that house this function
            (zsaData || []).forEach(z => {
                if ((z.housedFunctions || []).includes(subId)) out.push(descriptor('zsa', z.internalId, z.zoneId + ' · ' + trim(z.desc), { detail: 'Houses this function' }));
            });
            // PRAs that expose this function (via zone join)
            (praData || []).forEach(p => {
                const exposed = new Set();
                (p.affectedZones || []).forEach(zid => {
                    const z = (zsaData || []).find(zz => zz.zoneId === zid);
                    if (z) (z.housedFunctions || []).forEach(s => exposed.add(s));
                });
                if (exposed.has(subId)) out.push(descriptor('pra', p.internalId, p.praId + ' · ' + trim(p.threat), { detail: 'Exposes this function via zone' }));
            });
            break;
        }

        case 'acFha': {
            // Find by internalId or fcId
            const fha = (acFhaData || []).find(f => f.internalId === target.id || f.fcId === target.id);
            if (!fha) return [];
            const fcId = fha.fcId;
            // Sys FHAs that trace up to this AC FC via acTraces[] (legacy acTrace still honored) — Phase 28 item 1.
            (systemsData || []).forEach(s => (s.fha || []).forEach(sf => {
                const traces = (Array.isArray(sf.acTraces) && sf.acTraces.length) ? sf.acTraces : (sf.acTrace ? [sf.acTrace] : []);
                if (traces.includes(fcId)) out.push(descriptor('sysFha', sf.internalId, sf.fcId + ': ' + trim(sf.fcDesc), { systemId: s.id, sysSubtab: 'sys-fha', detail: 'Traces to this AC FC' }));
            }));
            // FTA pages linked to this hazard
            (ftaPages || []).forEach(page => {
                // Phase 28 item 4 — pages may carry linkedFhaIds[] (legacy linkedFhaId fallback).
                const pageLinks = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
                if (pageLinks.includes(fha.internalId)) out.push(descriptor('ftaPage', page.id, trim(page.name), { detail: 'Linked hazard' }));
            });
            // Generated requirements referencing this FHA (AC + Sys)
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                const ctx = req.reqSource.context || {};
                if (sid.includes(':fha:') && (ctx.fcId === fcId || sid.includes(':' + fha.internalId))) {
                    const kind = scope === 'ac' ? 'acReq' : 'sysReq';
                    out.push(descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req' }));
                }
            });
            // Assumptions linked to this FHA
            (acAssumptionsData || []).forEach(a => {
                if ((a.linkedFHAs || []).includes(fha.internalId) || (a.linkedFHAs || []).includes(fcId)) {
                    out.push(descriptor('acAsm', a.internalId, (a.asmId || '') + ' · ' + trim(a.statement), { detail: 'Linked assumption' }));
                }
            });
            // Functional FMEA rows linked to this failure condition (#3).
            (fmeaData || []).forEach(m => {
                if (m.fmeaType === 'functional' && String(m.linkedFcId) === String(fha.internalId)) {
                    out.push(descriptor('fmea', m.internalId, (m.fmeaId || '') + ' · ' + trim(m.localEffect), { detail: 'Functional FMEA → this FC' }));
                }
            });
            break;
        }

        case 'sysFunc': {
            const sys = (systemsData || []).find(s => s.id === target.systemId);
            if (!sys) return [];
            const f = (sys.functions || []).find(x => x.funcId === target.id || x.internalId === target.id);
            if (!f) return [];
            // AC functions this system function traces to (1-to-many).
            const traces = Array.isArray(f.traceIds) ? f.traceIds : (f.traceId ? [f.traceId] : []);
            traces.forEach(acId => {
                const ac = (acFunctionsData || []).find(x => x.funcId === acId);
                if (ac) {
                    out.push(descriptor('acFunc', ac.subId || ac.funcId, (ac.funcId || '') + ' · ' + trim(ac.funcName), { detail: 'Parent AC function (traced)' }));
                } else {
                    out.push(descriptor('acFunc', acId, acId + ' (orphan trace)', { detail: 'Trace target no longer exists in AC Functions' }));
                }
            });
            // Sys FHAs whose subId points at this function (subId stores funcId post-Phase 24).
            (sys.fha || []).forEach(fh => {
                if (fh.subId === f.funcId) out.push(descriptor('sysFha', fh.internalId, (fh.fcId || '') + ': ' + trim(fh.fcDesc), { systemId: sys.id, sysSubtab: 'sys-fha', detail: 'Linked function' }));
            });
            // Sys FCIM rows likewise.
            (sys.fcim || []).forEach(c => {
                if (c.subId === f.funcId) out.push(descriptor('sysFcim', c.internalId, (c.tlId || c.plId || c.mId || '') + ' · ' + trim(c.tlDesc || c.plDesc || c.mDesc), { systemId: sys.id, sysSubtab: 'sys-fcim' }));
            });
            // Sys requirements that trace to this function.
            (sys.req || []).forEach(r => {
                const traceList = (Array.isArray(r.traceIds) && r.traceIds.length) ? r.traceIds : (r.traceId ? [r.traceId] : []);
                if (r.traceTo === f.funcId || traceList.includes(f.funcId)) {
                    out.push(descriptor('sysReq', r.internalId, trim(r.text), { systemId: sys.id, sysSubtab: 'sys-req' }));
                }
            });
            break;
        }

        case 'sysFha': {
            const sys = (systemsData || []).find(s => s.id === target.systemId);
            if (!sys) return [];
            const fha = (sys.fha || []).find(f => f.internalId === target.id || f.fcId === target.id);
            if (!fha) return [];
            // AC FHAs this sys FHA traces to (acTraces[] with legacy acTrace fallback) — Phase 28 item 1.
            const traces = (Array.isArray(fha.acTraces) && fha.acTraces.length) ? fha.acTraces : (fha.acTrace ? [fha.acTrace] : []);
            traces.forEach(fcId => {
                const acFha = (acFhaData || []).find(a => a.fcId === fcId);
                if (acFha) out.push(descriptor('acFha', acFha.internalId, acFha.fcId + ': ' + trim(acFha.fcDesc), { detail: 'Parent AC FC' }));
                else out.push(descriptor('acFha', fcId, fcId + ' (orphan trace)', { detail: 'AC trace target no longer exists' }));
            });
            // FTA pages linked to this hazard
            (ftaPages || []).forEach(page => {
                const pageLinks = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
                if (pageLinks.includes(fha.internalId)) out.push(descriptor('ftaPage', page.id, trim(page.name)));
            });
            // Sys requirements derived from this FHA
            (sys.req || []).forEach(r => {
                if (!r.reqSource) return;
                const sid = r.reqSource.sourceId || '';
                if (sid.includes(':fha:') && (sid.includes(':' + fha.internalId) || (r.reqSource.context && r.reqSource.context.fcId === fha.fcId))) {
                    out.push(descriptor('sysReq', r.internalId, trim(r.text), { systemId: sys.id, sysSubtab: 'sys-req' }));
                }
            });
            // Sys assumptions linked to this FHA
            (sys.asm || []).forEach(a => {
                if ((a.linkedFHAs || []).includes(fha.internalId)) out.push(descriptor('sysAsm', a.internalId, a.asmId + ' · ' + trim(a.statement), { systemId: sys.id, sysSubtab: 'sys-asm' }));
            });
            break;
        }

        case 'ftaPage': {
            const page = (ftaPages || []).find(p => p.id === target.id);
            if (!page) return [];
            // FHAs this page links to (linkedFhaIds[] with legacy linkedFhaId fallback) — Phase 28 item 4.
            const pageLinks = (Array.isArray(page.linkedFhaIds) && page.linkedFhaIds.length) ? page.linkedFhaIds : (page.linkedFhaId ? [page.linkedFhaId] : []);
            pageLinks.forEach(lid => {
                const acFha = (acFhaData || []).find(f => f.internalId === lid);
                if (acFha) {
                    out.push(descriptor('acFha', acFha.internalId, acFha.fcId + ': ' + trim(acFha.fcDesc), { detail: 'Top hazard' }));
                } else {
                    (systemsData || []).forEach(s => {
                        const sf = (s.fha || []).find(f => f.internalId === lid);
                        if (sf) out.push(descriptor('sysFha', sf.internalId, sf.fcId + ': ' + trim(sf.fcDesc), { systemId: s.id, sysSubtab: 'sys-fha', detail: 'Top hazard' }));
                    });
                }
            });
            // Owning system for system-level trees
            if (page.systemId) {
                const sys = (systemsData || []).find(s => s.id === page.systemId);
                if (sys) out.push(descriptor('sysFunc', sys.id, 'System: ' + sys.name, { systemId: sys.id, detail: 'Owning system' }));
            }
            // Requirements generated from gates / basic events on this page
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                if (sid.includes(':gate-indep:' + page.id + ':') || (sid.includes(':fta-event:'))) {
                    // For fta-event reqs we'd need to walk to confirm the lid lives on this page — keep light here.
                    const kind = scope === 'ac' ? 'acReq' : 'sysReq';
                    if (sid.includes(':gate-indep:' + page.id + ':')) {
                        out.push(descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req', detail: 'Gate independence' }));
                    }
                }
            });
            // CMAs linking any gate on this page
            (cmaData || []).forEach(c => {
                if (!c.linkedGateIds) return;
                if (c.linkedGateIds.some(k => k.indexOf(page.id + ':') === 0)) {
                    out.push(descriptor('cma', c.internalId, c.cmaId + ' · ' + trim(c.subject), { detail: 'Links gate on this page' }));
                }
            });
            break;
        }

        case 'ftaNode': {
            const pageId = target.pageId;
            const nodeId = target.id;
            const page = (ftaPages || []).find(p => p.id === pageId);
            if (!page) return [];
            const node = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
            const lid = (node && node.logicalId != null) ? node.logicalId : nodeId;
            // FMEA piece-part rows referencing this basic event
            (fmeaData || []).forEach(m => {
                if ((m.fmeaType || 'piece-part') === 'piece-part' && m.beId === nodeId) out.push(descriptor('fmea', m.internalId, m.fmeaId + ' · ' + trim(m.part)));
            });
            // CMAs linking this gate
            const gateKey = pageId + ':' + nodeId;
            (cmaData || []).forEach(c => {
                if ((c.linkedGateIds || []).includes(gateKey)) out.push(descriptor('cma', c.internalId, c.cmaId + ' · ' + trim(c.subject)));
            });
            // Auto-reqs derived from this node (basic event reliability OR gate independence)
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                const matchBE = sid.startsWith(scope + ':fta-event:') && (sid.endsWith(':' + lid) || sid.endsWith(':' + nodeId));
                const matchGate = sid === scope + ':gate-indep:' + pageId + ':' + nodeId;
                if (matchBE || matchGate) {
                    const kind = scope === 'ac' ? 'acReq' : 'sysReq';
                    out.push(descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req' }));
                }
            });
            break;
        }

        case 'pra': {
            const pra = (praData || []).find(p => p.internalId === target.id);
            if (!pra) return [];
            // Zones it affects
            (pra.affectedZones || []).forEach(zid => {
                const z = (zsaData || []).find(zz => zz.zoneId === zid);
                if (z) out.push(descriptor('zsa', z.internalId, z.zoneId + ' · ' + trim(z.desc), { detail: 'Affected zone' }));
            });
            // Auto-reqs generated from this PRA
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                if (sid === 'ac:pra:' + (pra.praId || 'internal-' + pra.internalId)) {
                    out.push(descriptor('acReq', req.internalId, trim(req.text), { detail: 'Zonal-protection req' }));
                }
            });
            break;
        }

        case 'zsa': {
            const zsa = (zsaData || []).find(z => z.internalId === target.id);
            if (!zsa) return [];
            // PRAs whose affectedZones include this zone
            (praData || []).forEach(p => {
                if ((p.affectedZones || []).includes(zsa.zoneId)) out.push(descriptor('pra', p.internalId, p.praId + ' · ' + trim(p.threat), { detail: 'Affects this zone' }));
            });
            // Functions housed here
            (zsa.housedFunctions || []).forEach(subId => {
                const f = (acFunctionsData || []).find(x => x.subId === subId);
                if (f) out.push(descriptor('acFunc', f.subId, f.subId + ' · ' + trim(f.subName), { detail: 'Housed in this zone' }));
            });
            // Auto-reqs generated from this ZSA
            allReqsWithScope().forEach(({ req, scope, systemId }) => {
                if (!req.reqSource) return;
                const sid = req.reqSource.sourceId || '';
                if (sid === 'ac:zsa:' + zsa.zoneId) {
                    out.push(descriptor('acReq', req.internalId, trim(req.text), { detail: 'Separation req' }));
                }
            });
            break;
        }

        case 'cma': {
            const cma = (cmaData || []).find(c => c.internalId === target.id);
            if (!cma) return [];
            // Linked gates
            (cma.linkedGateIds || []).forEach(key => {
                const sep = key.indexOf(':');
                if (sep < 0) return;
                const pageId = key.slice(0, sep);
                const nodeId = parseInt(key.slice(sep + 1), 10);
                const page = (ftaPages || []).find(p => String(p.id) === String(pageId));
                if (!page) return;
                const n = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
                if (!n) return;
                out.push(descriptor('ftaNode', nodeId, '[' + (page.name || '') + '] ' + (n.displayId || ('G-' + n.id)) + ' (' + (n.gateType || 'gate') + ')', { detail: 'Linked gate' }));
            });
            // Owning system (if any)
            if (cma.scope === 'system' && cma.owningSystemId) {
                const s = (systemsData || []).find(x => x.id === cma.owningSystemId);
                if (s) out.push(descriptor('sysFunc', s.id, 'System: ' + s.name, { systemId: s.id }));
            }
            break;
        }

        case 'library': {
            // target.id is the library key (e.g. 'CR.A1' for a MIL-HDBK-217F capacitor).
            const libKey = target.id;
            if (!libKey) return [];
            const matchedBeIds = new Set();
            (ftaPages || []).forEach(page => {
                (function walk(n){
                    if (!n) return;
                    if (n.type === 'basic' && n.libraryKey === libKey) {
                        const lid = n.logicalId != null ? n.logicalId : n.id;
                        matchedBeIds.add(n.id);
                        out.push(descriptor('ftaNode', n.id, '[' + (page.name || '') + '] ' + (n.displayId || n.id) + (n.name ? ' · ' + n.name : ''), { detail: 'Uses this library entry' }));
                    }
                    const kids = n.children || n._children;
                    if (kids) kids.forEach(walk);
                })(page.root);
            });
            // FMEA piece-part rows that point at any matched basic event.
            (fmeaData || []).forEach(m => {
                if ((m.fmeaType || 'piece-part') === 'piece-part' && matchedBeIds.has(m.beId)) {
                    out.push(descriptor('fmea', m.internalId, (m.fmeaId || '#' + m.internalId) + ' · ' + trim(m.part), { detail: 'FMEA on a basic event using this library entry' }));
                }
            });
            // Auto-generated reliability reqs whose source context carries this libraryKey.
            const allReqs = [];
            (acReqData || []).forEach(r => allReqs.push({ req: r, scope: 'ac', systemId: null }));
            (systemsData || []).forEach(s => (s.req || []).forEach(r => allReqs.push({ req: r, scope: 'sys-' + s.id, systemId: s.id })));
            allReqs.forEach(({ req, scope, systemId }) => {
                if (req && req.reqSource && req.reqSource.context && req.reqSource.context.libraryKey === libKey) {
                    out.push(descriptor(scope === 'ac' ? 'acReq' : 'sysReq', req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req', detail: 'Reliability req derived from this library entry' }));
                }
            });
            break;
        }

        case 'fmea': {
            const m = (fmeaData || []).find(r => r.internalId === target.id);
            if (!m) return [];
            if (m.fmeaType === 'functional' && m.funcSubId) {
                const f = (acFunctionsData || []).find(x => x.subId === m.funcSubId);
                if (f) out.push(descriptor('acFunc', f.subId, f.subId + ' · ' + trim(f.subName), { detail: 'Linked sub-function' }));
            }
            // Functional FMEA → linked failure condition (#3).
            if (m.fmeaType === 'functional' && m.linkedFcId) {
                const fc = (acFhaData || []).find(h => String(h.internalId) === String(m.linkedFcId));
                if (fc) out.push(descriptor('acFha', fc.internalId, (fc.fcId || '') + ': ' + trim(fc.fcDesc), { detail: 'Linked failure condition' }));
            }
            if ((m.fmeaType || 'piece-part') === 'piece-part' && m.beId) {
                // Find the basic event
                for (const page of (ftaPages || [])) {
                    const n = (typeof findNode === 'function') ? findNode(page.root, m.beId) : null;
                    if (n) { out.push(descriptor('ftaNode', m.beId, '[' + (page.name || '') + '] ' + (n.displayId || n.id), { detail: 'Linked basic event' })); break; }
                }
            }
            if (m.scope === 'system' && m.owningSystemId) {
                const s = (systemsData || []).find(x => x.id === m.owningSystemId);
                if (s) out.push(descriptor('sysFunc', s.id, 'System: ' + s.name, { systemId: s.id }));
            }
            break;
        }

        case 'acReq':
        case 'sysReq': {
            // Reqs are leaves — what they reference is already encoded in their reqSource. Surface the source artifact as a referrer (inverse).
            const list = target.kind === 'acReq' ? (acReqData || []) : (((systemsData || []).find(s => s.id === target.systemId) || {}).req || []);
            const req = list.find(r => r.internalId === target.id);
            if (!req || !req.reqSource) return [];
            const sid = req.reqSource.sourceId || '';
            const ctx = req.reqSource.context || {};
            // FHA source
            if (sid.includes(':fha:')) {
                const m = sid.match(/^(ac|sys-[^:]+):fha:(?:prob|dal(?::func)?):(.+)$/);
                if (m) {
                    if (m[1] === 'ac') {
                        const f = (acFhaData || []).find(x => x.internalId === m[2] || x.fcId === m[2]);
                        if (f) out.push(descriptor('acFha', f.internalId, f.fcId + ': ' + trim(f.fcDesc), { detail: 'Source FHA' }));
                    } else {
                        const sysId = m[1].replace(/^sys-/, '');
                        const s = (systemsData || []).find(x => x.id === sysId);
                        const f = s && (s.fha || []).find(x => x.internalId === m[2] || x.fcId === m[2]);
                        if (f) out.push(descriptor('sysFha', f.internalId, f.fcId + ': ' + trim(f.fcDesc), { systemId: sysId, sysSubtab: 'sys-fha', detail: 'Source FHA' }));
                    }
                }
            }
            // FTA event source
            if (sid.includes(':fta-event:')) {
                const lid = sid.split(':').pop();
                // Find matching basic event
                for (const page of (ftaPages || [])) {
                    let found = null;
                    (function walk(n){
                        if (!n || found) return;
                        const nlid = n.logicalId != null ? n.logicalId : n.id;
                        if (String(nlid) === String(lid)) { found = n; return; }
                        const kids = n.children || n._children;
                        if (kids) kids.forEach(walk);
                    })(page.root);
                    if (found) { out.push(descriptor('ftaNode', found.id, '[' + (page.name || '') + '] ' + (found.displayId || found.id), { detail: 'Source basic event' })); break; }
                }
            }
            // Gate independence source
            if (sid.includes(':gate-indep:')) {
                const parts = sid.split(':');
                const pageId = parts[parts.length - 2];
                const nodeId = parseInt(parts[parts.length - 1], 10);
                const page = (ftaPages || []).find(p => String(p.id) === String(pageId));
                if (page) {
                    const n = (typeof findNode === 'function') ? findNode(page.root, nodeId) : null;
                    if (n) out.push(descriptor('ftaNode', nodeId, '[' + (page.name || '') + '] ' + (n.displayId || n.id) + ' (' + (n.gateType || 'gate') + ')', { detail: 'Source gate' }));
                }
            }
            // PRA / ZSA source
            if (sid.includes(':pra:')) {
                const praId = sid.split(':pra:')[1];
                const p = (praData || []).find(x => x.praId === praId || ('internal-' + x.internalId) === praId);
                if (p) out.push(descriptor('pra', p.internalId, p.praId + ' · ' + trim(p.threat), { detail: 'Source PRA' }));
            }
            if (sid.includes(':zsa:')) {
                const zid = sid.split(':zsa:')[1];
                const z = (zsaData || []).find(x => x.zoneId === zid);
                if (z) out.push(descriptor('zsa', z.internalId, z.zoneId + ' · ' + trim(z.desc), { detail: 'Source ZSA' }));
            }
            // Obsoleting / superseding req
            if (req.reqSource.obsolete && req.reqSource.obsolete.supersededBy) {
                const supId = req.reqSource.obsolete.supersededBy;
                // Find the superseding req across all stores
                const all = allReqsWithScope();
                const sup = all.find(({ req: r }) => r.internalId === supId);
                if (sup) {
                    const k = sup.scope === 'ac' ? 'acReq' : 'sysReq';
                    out.push(descriptor(k, sup.req.internalId, trim(sup.req.text), { systemId: sup.systemId, sysSubtab: sup.scope === 'ac' ? null : 'sys-req', detail: 'This req is superseded by' }));
                }
            }
            break;
        }

        }
        return out;
    }

    // ------------------------------------------------------------------
    //  listAllArtifacts() — flat list of every artifact in the project.
    //  Used by the command palette for fuzzy search.
    // ------------------------------------------------------------------
    function listAllArtifacts(){
        const out = [];
        // AC Functions
        (acFunctionsData || []).forEach(f => out.push({ kind: 'acFunc', id: f.subId, label: f.subId + ' · ' + (f.subName || ''), searchText: [f.subId, f.subName, f.parentFunc].join(' '), tab: 'ac-func' }));
        // AC FCIM
        // Phase 27 audit A11 — FCIM uses tl/pl/m id+desc fields and .subId (not .subFunc/.fcId/.fcDesc).
        (acFcimData || []).forEach(c => {
            const labelId = c.tlId || c.plId || c.mId || '#' + c.internalId;
            const labelDesc = c.tlDesc || c.plDesc || c.mDesc || '';
            out.push({ kind: 'acFcim', id: c.internalId, label: labelId + ' · ' + labelDesc, searchText: [c.tlId, c.plId, c.mId, c.tlDesc, c.plDesc, c.mDesc, c.subId].filter(Boolean).join(' '), tab: 'ac-fcim' });
        });
        // AC FHA
        (acFhaData || []).forEach(f => out.push({ kind: 'acFha', id: f.internalId, label: (f.fcId || '#' + f.internalId) + ' · ' + (f.fcDesc || '') + ' [' + (f.severity || '—') + ']', searchText: [f.fcId, f.fcDesc, f.severity, f.subId].join(' '), tab: 'ac-fha' }));
        // AC Reqs
        (acReqData || []).forEach(r => out.push({ kind: 'acReq', id: r.internalId, label: (r.traceId || '#' + r.internalId) + ' · ' + trim(r.text, 80), searchText: [r.traceId, r.text, r.level, r.type].join(' '), tab: 'ac-req' }));
        // AC Assumptions
        (acAssumptionsData || []).forEach(a => out.push({ kind: 'acAsm', id: a.internalId, label: (a.asmId || '#' + a.internalId) + ' · ' + trim(a.statement, 70), searchText: [a.asmId, a.statement, a.state].join(' '), tab: 'ac-asm' }));
        // Sys-scoped
        (systemsData || []).forEach(s => {
            (s.functions || []).forEach(f => out.push({ kind: 'sysFunc', id: f.subId, systemId: s.id, label: '[' + s.name + '] ' + (f.subId || '') + ' · ' + (f.subName || ''), searchText: [s.name, f.subId, f.subName].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-func' }));
            (s.fcim || []).forEach(c => {
                const labelId = c.tlId || c.plId || c.mId || '#' + c.internalId;
                const labelDesc = c.tlDesc || c.plDesc || c.mDesc || '';
                out.push({ kind: 'sysFcim', id: c.internalId, systemId: s.id, label: '[' + s.name + '] ' + labelId + ' · ' + labelDesc, searchText: [s.name, c.tlId, c.plId, c.mId, c.tlDesc, c.plDesc, c.mDesc, c.subId].filter(Boolean).join(' '), tab: 'sys-workspace', sysSubtab: 'sys-fcim' });
            });
            (s.fha || []).forEach(f => out.push({ kind: 'sysFha', id: f.internalId, systemId: s.id, label: '[' + s.name + '] ' + (f.fcId || '') + ' · ' + (f.fcDesc || '') + ' [' + (f.severity || '—') + ']', searchText: [s.name, f.fcId, f.fcDesc, f.severity].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-fha' }));
            (s.req || []).forEach(r => out.push({ kind: 'sysReq', id: r.internalId, systemId: s.id, label: '[' + s.name + '] ' + (r.traceId || '#' + r.internalId) + ' · ' + trim(r.text, 70), searchText: [s.name, r.traceId, r.text, r.level].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-req' }));
            (s.asm || []).forEach(a => out.push({ kind: 'sysAsm', id: a.internalId, systemId: s.id, label: '[' + s.name + '] ' + (a.asmId || '#' + a.internalId) + ' · ' + trim(a.statement, 60), searchText: [s.name, a.asmId, a.statement].join(' '), tab: 'sys-workspace', sysSubtab: 'sys-asm' }));
        });
        // FTA pages
        (ftaPages || []).forEach(p => out.push({ kind: 'ftaPage', id: p.id, label: 'Tree: ' + (p.name || 'Untitled') + ' [' + (p.treeLevel || 'standalone') + ']', searchText: [p.name, p.treeLevel].join(' '), tab: 'fta' }));
        // PRA / ZSA / CMA / FMEA
        (praData || []).forEach(p => out.push({ kind: 'pra', id: p.internalId, label: (p.praId || '#' + p.internalId) + ' · ' + (p.threat || ''), searchText: [p.praId, p.threat, p.desc].join(' '), tab: 'pra' }));
        (zsaData || []).forEach(z => out.push({ kind: 'zsa', id: z.internalId, label: (z.zoneId || '#' + z.internalId) + ' · ' + (z.desc || '') + ' [' + (z.severity || '—') + ']', searchText: [z.zoneId, z.desc, z.severity, z.equip].join(' '), tab: 'zsa' }));
        (cmaData || []).forEach(c => out.push({ kind: 'cma', id: c.internalId, label: (c.cmaId || '#' + c.internalId) + ' · ' + (c.subject || ''), searchText: [c.cmaId, c.subject, c.claim, c.findings].join(' '), tab: 'cma' }));
        (fmeaData || []).forEach(m => out.push({ kind: 'fmea', id: m.internalId, label: (m.fmeaId || '#' + m.internalId) + ' · ' + (m.part || m.funcSubId || '') + ' · ' + trim(m.localEffect, 50), searchText: [m.fmeaId, m.part, m.funcSubId, m.localEffect].join(' '), tab: 'fmea' }));
        // Library entries — surface them in the command palette so users can jump straight
        // to the component card from anywhere in the project.
        if (typeof getActiveLibrary === 'function') {
            try {
                const active = getActiveLibrary();
                Object.entries(active || {}).forEach(([key, def]) => {
                    out.push({ kind: 'library', id: key, label: key + ' · ' + (def.name || '') + (def.group ? '  [' + def.group + ']' : ''), searchText: [key, def.name, def.group, def.source].filter(Boolean).join(' '), tab: 'library' });
                });
            } catch(e){}
        }
        return out;
    }

    // ------------------------------------------------------------------
    //  getWorklist() — actionable issues for the Dashboard.
    //  Categories: stale, compromised, obsolete-pending-archive, orphans, open CMAs, dup pairs.
    // ------------------------------------------------------------------
    function getWorklist(){
        const buckets = {
            staleReqs: [],
            compromisedReqs: [],
            obsoletePending: [],
            orphanFmea: [],
            openCmas: [],
            duplicatePairs: []
        };

        // Stale + compromised reqs across AC + Sys
        const pushReq = (req, scope, systemId) => {
            if (!req || !req.reqSource) return null;
            const kind = scope === 'ac' ? 'acReq' : 'sysReq';
            return descriptor(kind, req.internalId, trim(req.text), { systemId, sysSubtab: scope === 'ac' ? null : 'sys-req' });
        };
        (acReqData || []).forEach(r => {
            if (r.reqSource && r.reqSource.stale)                  buckets.staleReqs.push(pushReq(r, 'ac'));
            if (r.compromised && r.compromiseReasons && r.compromiseReasons.length) buckets.compromisedReqs.push(pushReq(r, 'ac'));
            if (r.reqSource && r.reqSource.obsolete && r.status !== 'archived') buckets.obsoletePending.push(pushReq(r, 'ac'));
        });
        (systemsData || []).forEach(s => (s.req || []).forEach(r => {
            if (r.reqSource && r.reqSource.stale)                  buckets.staleReqs.push(pushReq(r, 'sys-' + s.id, s.id));
            if (r.compromised && r.compromiseReasons && r.compromiseReasons.length) buckets.compromisedReqs.push(pushReq(r, 'sys-' + s.id, s.id));
            if (r.reqSource && r.reqSource.obsolete && r.status !== 'archived') buckets.obsoletePending.push(pushReq(r, 'sys-' + s.id, s.id));
        }));

        // Orphan FMEA rows
        (fmeaData || []).forEach(m => {
            if (typeof _isFmeaOrphan === 'function' && _isFmeaOrphan(m)) {
                buckets.orphanFmea.push(descriptor('fmea', m.internalId, (m.fmeaId || '#' + m.internalId) + ' · ' + trim(m.localEffect, 50)));
            }
        });

        // Open / In-Progress CMAs with identified modes or findings
        (cmaData || []).forEach(c => {
            const s = c.status || 'Open';
            if (s === 'Mitigated' || s === 'Closed — Accepted') return;
            const hasModes = c.modes && c.modes.length > 0;
            const hasFindings = c.findings && String(c.findings).trim().length > 0;
            if (hasModes || hasFindings) buckets.openCmas.push(descriptor('cma', c.internalId, (c.cmaId || '#' + c.internalId) + ' · ' + trim(c.subject, 50)));
        });

        // Duplicate AC↔Sys req pairs awaiting reconciliation. Resolve the full scope key for
        // each side (e.g. 'sys-fcs' rather than the placeholder 'sys') so the worklist's jump
        // links can route into the correct system workspace (Phase 27 audit A12).
        const _resolveScope = (req) => {
            if (!req || !req.reqSource) return { scope: 'ac', systemId: null };
            const sid = req.reqSource.sourceId || '';
            if (sid.indexOf('ac:') === 0) return { scope: 'ac', systemId: null };
            const m = sid.match(/^sys-([^:]+):/);
            return m ? { scope: 'sys-' + m[1], systemId: m[1] } : { scope: 'ac', systemId: null };
        };
        try {
            const pairs = (typeof AutoReq !== 'undefined' && AutoReq.findDuplicates) ? AutoReq.findDuplicates() : [];
            pairs.forEach(p => {
                if (!p.loser || (p.loser.reqSource && p.loser.reqSource.obsolete)) return;   // already tagged
                const winScope = _resolveScope(p.winner);
                const losScope = _resolveScope(p.loser);
                buckets.duplicatePairs.push({
                    winner: pushReq(p.winner, winScope.scope, winScope.systemId),
                    loser:  pushReq(p.loser,  losScope.scope, losScope.systemId),
                    kind: p.kind, reason: p.reason
                });
            });
        } catch(e){}

        return buckets;
    }

    return { getReferrers, listAllArtifacts, getWorklist, KIND_LABELS, KIND_TAB, descriptor };
})();
