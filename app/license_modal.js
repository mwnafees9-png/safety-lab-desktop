/* Safety Lab Aero — one-time License & Subscription Agreement acceptance modal (web).
 * A SECOND acceptance, separate from and in addition to the EULA (eula_modal.js).
 * Shown on first sign-in immediately AFTER the EULA is accepted; acceptance is
 * recorded to the user's Supabase account (user_metadata.license_version) plus a
 * localStorage cache, so it never reappears once accepted (even on another device).
 *
 * Integration: this file is loaded AFTER eula_modal.js. It wraps the existing
 * window.SafetyLab.checkEula so the auth gate's single liftGate -> checkEula() call
 * now runs the EULA gate and then this License gate in sequence — without editing the
 * auto-generated eula_modal.js or the auth gate.
 *
 * NOTE: the agreement text below is a FIRST-PASS DRAFT (Rev A), supplementary to the
 * EULA, and is pending review by counsel. Swap final text + bump LICENSE_VERSION when
 * the reviewed copy is ready.
 */
(function () {
  'use strict';
  var LICENSE_VERSION = 'SL-LICENSE-0001-B';
  var LS_KEY = 'safetyLab.licenseAgreement.acceptedVersion';
  var OVERLAY_ID = 'sl-license-overlay';

  // EULA constants (must match eula_modal.js) — used only to confirm the EULA was
  // ACCEPTED (not declined) before advancing to the license gate.
  var EULA_LS_KEY = 'safetyLab.eula.acceptedVersion';
  var EULA_VERSION = 'SL-EULA-0001-B';

  var LICENSE_HTML = ""
    + "<p><em>Draft v0.1 &mdash; first-pass terms, supplementary to the End User License Agreement, subject to revision and pending review by counsel. Not legal advice.</em></p>"
    + "<p>This Software License &amp; Subscription Agreement (the &quot;License Agreement&quot;) governs your subscription to and use of the Safety Lab Aero hosted software service made available at safetylabaero.com (the &quot;Service&quot;) by the individual or entity identified by the account under which you sign in (the &quot;Licensee,&quot; &quot;you,&quot; or &quot;your&quot;). The Service is licensed, not sold, by Safety Lab Aero, Inc., a Delaware corporation (&quot;Licensor,&quot; &quot;we,&quot; or &quot;us&quot;). This License Agreement supplements, and is in addition to, the Safety Lab Aero End User License Agreement (SL-EULA-0001), which you also accept; in the event of a conflict regarding subscription, seats, billing, or hosted-service operation, this License Agreement controls.</p>"
    + "<h4>1. License Grant</h4>"
    + "<p>Subject to your continuous compliance with this License Agreement and the EULA, and to your payment of all applicable fees, Licensor grants Licensee a limited, non-exclusive, non-transferable, non-sublicensable, revocable license, during the subscription term, to access and use the Service solely for Licensee&#x27;s internal engineering and certification work, and limited to the number of seats and the subscription tier for which Licensee has paid.</p>"
    + "<h4>2. Accounts and Seats</h4>"
    + "<p>Access to the Service is controlled by account credentials registered to an email address. Each paid seat authorizes one Authorized User. Licensee shall not share, resell, or sublicense account access beyond the authorized seat count, and is responsible for maintaining the confidentiality of its credentials and for all activity occurring under its accounts.</p>"
    + "<h4>3. Subscription Term, Renewal, and Cancellation</h4>"
    + "<p>The subscription is for the term set out in the applicable plan or order (monthly unless otherwise stated) and renews automatically for successive periods unless canceled. Licensee may cancel at any time through its account settings; cancellation takes effect at the end of the then-current paid billing period, and no pro-rated refund of pre-paid fees is provided except as required by applicable law. A ten-day free trial offered to new accounts converts automatically into a paid subscription at the end of the trial unless canceled before the conversion date.</p>"
    + "<h4>4. Fees and Payment</h4>"
    + "<p>Fees, seat counts, and the subscription tier are set out in the pricing published at safetylabaero.com or in the applicable order and are incorporated by reference. All fees are stated in United States dollars and are exclusive of taxes, duties, and bank-transfer fees, for which Licensee is responsible (other than taxes on Licensor&#x27;s net income). Payments are processed by Licensor&#x27;s payment processor (currently Stripe) and are non-refundable except as expressly stated herein or as required by applicable law.</p>"
    + "<h4>5. Hosted Data Handling; Confidentiality</h4>"
    + "<p>To provide the Service, Licensor hosts, stores, processes, and transmits the project data, files, analyses, and outputs that Licensee submits to or generates within the Service (&quot;Customer Data&quot;). Licensee retains all right, title, and interest in its Customer Data. Licensor will treat Customer Data as confidential, will not use it to train any machine-learning model, and will access it only as necessary to provide and secure the Service, to respond to support requests, or to comply with applicable law. Upon termination, Licensor will retain Customer Data for ninety (90) days to permit export, after which it may be deleted. Licensee is solely responsible for the accuracy, legality, and content of its Customer Data.</p>"
    + "<h4>6. AI-Assisted Features</h4>"
    + "<p>Where enabled, AI-assisted features route requests through Licensor&#x27;s hosted proxy to identified language-model providers on a stateless, per-request basis. AI output is advisory and non-deterministic; it does not compute or alter the deterministic quantitative safety results produced by the Service, and the Service constrains the AI from fabricating safety-critical claims (failure conditions, severity classifications, Development Assurance Level allocations, quantitative reliability values, or regulatory citations) not present in Licensee&#x27;s project data. <strong>Human verification by qualified personnel is required before final approval of all AI-generated artifacts: no AI-assisted output &mdash; including any analysis, computed or suggested value, severity classification, Development Assurance Level, safety requirement, fault-tree structure, or report &mdash; may be finalized, approved, released, or relied upon for any engineering, safety, or certification purpose until a qualified human engineer has independently reviewed, verified, and accepted it and assumed professional responsibility for it.</strong> Licensee is solely responsible for ensuring the fidelity, accuracy, completeness, and suitability of all AI-generated output, and Licensor shall not be responsible or liable for any data, analysis, classification, or other content produced by the AI features, or for any decision made or action taken in reliance on it. Licensor disclaims any warranty regarding the accuracy of AI-generated content.</p>"
    + "<h4>7. Export Control and ITAR</h4>"
    + "<p>The Service may be subject to United States export-control laws, including the Export Administration Regulations (EAR) and the International Traffic in Arms Regulations (ITAR). For any project flagged by Licensee as ITAR-controlled, the Service routes associated AI invocations through a United-States-only inference path; Licensee is solely responsible for accurately designating ITAR-controlled projects and for not transmitting controlled technical data to any non-United-States person through the Service. Licensor is not a registered exporter of defense articles or services, and the Service is not authorized as a means of exporting controlled data.</p>"
    + "<h4>8. Intellectual Property</h4>"
    + "<p>The Service, its underlying methods and algorithms, the Documentation, and all related trademarks remain the sole property of Licensor and its licensors. No source-code license and no patent license, express or implied, is granted. Aside from the limited license expressly granted in Section 1, Licensee acquires no right, title, or interest in or to the Service. Any unauthorized copying, reproduction, duplication, replication, decompilation, or re-implementation of the Service, its source or object code, its user interface, or its underlying methods and algorithms constitutes both a material breach of this License Agreement and an infringement of Licensor&#x27;s intellectual-property rights, and will be pursued to the fullest extent permitted by law, including injunctive relief, recovery of damages and Licensor&#x27;s costs and attorneys&#x27; fees, and referral for civil and, where applicable, criminal prosecution.</p><p>The Service and its source and object code, architecture, data schemas, prompt designs, algorithms, and user-interface workflows embody Licensor&#x27;s trade secrets and confidential and proprietary information, and no right or license is granted by implication, estoppel, or otherwise beyond the express license in Section 1. Licensee acknowledges that any actual or threatened copying, duplication, replication, reverse engineering, or other misappropriation of the Service would cause Licensor irreparable harm for which monetary damages would be inadequate, and Licensor shall be entitled to immediate injunctive and equitable relief without posting a bond or proving actual damages, in addition to all other cumulative remedies at law or in equity, including recovery of actual damages, lost profits, disgorgement of profits, statutory damages where available, costs and reasonable attorneys&#x27; fees, and referral for civil action and, where applicable, criminal prosecution under the United States Copyright Act (17 U.S.C. 506), the Defend Trade Secrets Act and Economic Espionage Act (18 U.S.C. 1831 through 1839), and the Computer Fraud and Abuse Act (18 U.S.C. 1030). Licensee shall indemnify and hold Licensor harmless from any loss arising out of Licensee&#x27;s breach of this Section 8 or the software-protection provisions of the EULA, and these obligations survive termination.</p>"
    + "<h4>9. Warranty Disclaimer</h4>"
    + "<p>THE SERVICE AND ALL OUTPUT ARE PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE,&quot; WITHOUT WARRANTY OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. LICENSOR DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE, OR THAT THE OUTPUT IS SUITABLE FOR SUBMISSION TO ANY REGULATORY AUTHORITY WITHOUT INDEPENDENT REVIEW BY QUALIFIED HUMAN PERSONNEL.</p>"
    + "<h4>10. Limitation of Liability</h4>"
    + "<p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LICENSOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, GOODWILL, OR DATA. LICENSOR&#x27;S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATED TO THE SERVICE SHALL NOT EXCEED THE TOTAL FEES PAID BY LICENSEE TO LICENSOR DURING THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE LIABILITY.</p>"
    + "<h4>11. Term and Termination</h4>"
    + "<p>This License Agreement is effective upon your first access to the Service and continues for so long as your subscription remains active. Either party may terminate as provided in the EULA. Licensor may suspend or terminate access immediately for non-payment or for any material breach of this License Agreement or the EULA. Upon termination, Licensee&#x27;s right to access the Service ceases; Sections 4 through 10 survive termination.</p>"
    + "<h4>12. General</h4>"
    + "<p>This License Agreement is governed by the laws of the State of Colorado, without regard to its conflict-of-laws principles, and any dispute shall be brought exclusively in the state or federal courts located in El Paso County, Colorado. Licensee may not assign this License Agreement without Licensor&#x27;s prior written consent; Licensor may assign freely. If any provision is held unenforceable, the remainder remains in full force and effect. This License Agreement, together with the EULA and the applicable order, constitutes the entire agreement between the parties regarding Licensee&#x27;s subscription to the Service.</p>"
    + "<h4>Contact</h4>"
    + "<p>Safety Lab Aero, Inc. &middot; waqas.nafees@safetylabaero.com &middot; https://safetylabaero.com</p>"
    + "<p>*By clicking &quot;Agree &amp; continue,&quot; you acknowledge that you have read, understood, and agreed to be bound by this Software License &amp; Subscription Agreement.*</p>";

  function getSb() {
    try { return (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : null; }
    catch (_) { return null; }
  }

  function ensureStyles() {
    if (document.getElementById('sl-license-style')) return;
    var css = [
      '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(6,8,12,.72);backdrop-filter:blur(3px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif;}',
      '#' + OVERLAY_ID + ' .sl-eula-card{background:#fff;color:#181b22;width:100%;max-width:680px;max-height:88vh;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;}',
      '#' + OVERLAY_ID + ' .sl-eula-head{padding:20px 26px 14px;border-bottom:1px solid #e7eaf1;}',
      '#' + OVERLAY_ID + ' .sl-eula-head h2{margin:0;font-size:19px;color:#0a1f44;}',
      '#' + OVERLAY_ID + ' .sl-eula-meta{margin-top:4px;font-size:12px;color:#6b7280;}',
      '#' + OVERLAY_ID + ' .sl-eula-body{padding:18px 26px;overflow-y:auto;font-size:13px;line-height:1.6;color:#2a2f3a;}',
      '#' + OVERLAY_ID + ' .sl-eula-body h4{margin:18px 0 4px;font-size:14px;color:#0a1f44;}',
      '#' + OVERLAY_ID + ' .sl-eula-body p{margin:0 0 9px;}',
      '#' + OVERLAY_ID + ' .sl-eula-body p.sub{margin-left:16px;}',
      '#' + OVERLAY_ID + ' .sl-eula-foot{padding:14px 26px 18px;border-top:1px solid #e7eaf1;background:#f7f8fb;}',
      '#' + OVERLAY_ID + ' .sl-eula-agree{display:flex;align-items:flex-start;gap:9px;font-size:13px;color:#181b22;margin-bottom:12px;cursor:pointer;}',
      '#' + OVERLAY_ID + ' .sl-eula-agree input{margin-top:2px;width:16px;height:16px;flex:none;cursor:pointer;}',
      '#' + OVERLAY_ID + ' .sl-eula-btns{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}',
      '#' + OVERLAY_ID + ' button{font:inherit;font-weight:600;border-radius:9px;padding:10px 18px;cursor:pointer;border:1px solid transparent;}',
      '#' + OVERLAY_ID + ' .sl-eula-decline{background:#fff;border-color:#d4d8e3;color:#555b6b;}',
      '#' + OVERLAY_ID + ' .sl-eula-accept{background:linear-gradient(135deg,#007aff,#af52de);color:#fff;}',
      '#' + OVERLAY_ID + ' .sl-eula-accept:disabled{opacity:.45;cursor:not-allowed;}',
      '@media (max-width:520px){#' + OVERLAY_ID + ' .sl-eula-card{max-height:94vh;}}'
    ].join('');
    var st = document.createElement('style'); st.id = 'sl-license-style'; st.textContent = css;
    document.head.appendChild(st);
  }

  function guard(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); } }

  function remove() {
    var el = document.getElementById(OVERLAY_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.removeEventListener('keydown', guard, true);
  }

  function persist(sb) {
    try { localStorage.setItem(LS_KEY, LICENSE_VERSION); } catch (_) {}
    try {
      if (sb && sb.auth && typeof sb.auth.updateUser === 'function') {
        sb.auth.updateUser({ data: { license_version: LICENSE_VERSION, license_accepted_at: new Date().toISOString() } });
      }
    } catch (_) {}
  }

  function show(sb) {
    ensureStyles();
    if (document.getElementById(OVERLAY_ID)) return;
    var ov = document.createElement('div'); ov.id = OVERLAY_ID;
    ov.innerHTML =
      '<div class="sl-eula-card" role="dialog" aria-modal="true" aria-label="Software License and Subscription Agreement">'
      + '<div class="sl-eula-head"><h2>Software License &amp; Subscription Agreement</h2>'
      + '<div class="sl-eula-meta">Safety Lab Aero &middot; SL-LICENSE-0001 Rev B &middot; please review before continuing</div></div>'
      + '<div class="sl-eula-body">' + LICENSE_HTML + '</div>'
      + '<div class="sl-eula-foot">'
      + '<label class="sl-eula-agree"><input type="checkbox" id="sl-license-cb"><span>I have read and agree to the Safety Lab Aero Software License &amp; Subscription Agreement.</span></label>'
      + '<div class="sl-eula-btns">'
      + '<button class="sl-eula-decline" id="sl-license-decline">Decline &amp; sign out</button>'
      + '<button class="sl-eula-accept" id="sl-license-accept" disabled>Agree &amp; continue</button>'
      + '</div></div></div>';
    document.body.appendChild(ov);
    document.addEventListener('keydown', guard, true);
    var cb = ov.querySelector('#sl-license-cb');
    var accept = ov.querySelector('#sl-license-accept');
    var decline = ov.querySelector('#sl-license-decline');
    cb.addEventListener('change', function () { accept.disabled = !cb.checked; });
    accept.addEventListener('click', function () { if (!cb.checked) return; persist(sb); remove(); });
    decline.addEventListener('click', function () {
      remove();
      try { if (sb && sb.auth && sb.auth.signOut) sb.auth.signOut(); } catch (_) {}
      try { setTimeout(function () { location.reload(); }, 150); } catch (_) {}
    });
  }

  async function checkLicense() {
    try { if (localStorage.getItem(LS_KEY) === LICENSE_VERSION) return; } catch (_) {}
    var sb = getSb();
    if (!sb || !sb.auth) return;
    var user = null;
    try { var r = await sb.auth.getUser(); user = r && r.data && r.data.user; } catch (_) {}
    if (!user) return; // only ever gate a signed-in user
    var accepted = user.user_metadata && user.user_metadata.license_version;
    if (accepted === LICENSE_VERSION) {
      try { localStorage.setItem(LS_KEY, LICENSE_VERSION); } catch (_) {}
      return;
    }
    show(sb);
  }

  // After the EULA modal is dealt with, present the License gate — but only if the
  // EULA was ACCEPTED (declining the EULA signs the user out, so we must not advance).
  function _afterEula() {
    if (document.getElementById('sl-license-overlay')) return;        // already up
    var ov = document.getElementById('sl-eula-overlay');
    if (!ov) {
      // EULA modal never appeared (already accepted previously) — go straight to license.
      checkLicense();
      return;
    }
    try {
      var obs = new MutationObserver(function () {
        if (document.getElementById('sl-eula-overlay')) return;        // still showing
        obs.disconnect();
        var eulaAccepted = false;
        try { eulaAccepted = localStorage.getItem(EULA_LS_KEY) === EULA_VERSION; } catch (_) {}
        if (eulaAccepted) setTimeout(checkLicense, 80);                 // accepted -> license gate
      });
      obs.observe(document.body, { childList: true });
    } catch (_) {
      setTimeout(function () { if (!document.getElementById('sl-eula-overlay')) checkLicense(); }, 1500);
    }
  }

  // Wrap the existing checkEula (defined in eula_modal.js, loaded just before this file)
  // so the auth gate's single liftGate -> checkEula() call runs BOTH gates in sequence.
  window.SafetyLab = window.SafetyLab || {};
  try {
    var _origCheckEula = (typeof window.SafetyLab.checkEula === 'function') ? window.SafetyLab.checkEula : null;
    window.SafetyLab.checkEula = function () {
      var rr = null;
      try { rr = _origCheckEula ? _origCheckEula.apply(this, arguments) : null; } catch (_) {}
      // _origCheckEula is async and settles once the EULA modal is shown (or skipped).
      try { Promise.resolve(rr).catch(function () {}).then(_afterEula); } catch (_) { setTimeout(_afterEula, 400); }
      return rr;
    };
  } catch (_) {}

  // Public hooks: checkLicense() runs the license gate alone; checkAgreements() runs
  // both EULA + License (handy if a caller wants to invoke the pair explicitly).
  window.SafetyLab.checkLicense = checkLicense;
  window.SafetyLab.checkAgreements = function () { try { window.SafetyLab.checkEula(); } catch (_) {} };
})();
