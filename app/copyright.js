/**
 * Safety Lab Aero — Copyright module
 * ============================================================================
 * Centralizes copyright + registration metadata so it's referenced from a
 * single place instead of being hard-coded in the footer, About panel, PDF
 * watermark, JSON saves, exports, and marketing materials.
 *
 * When the USCO issues the formal certificate (TX-#######), update
 * REGISTRATION.certificateNumber and REGISTRATION.status — every consumer
 * picks up the new value automatically.
 *
 * Filed: 2026-05-25
 *   Author of record: Muhammad Waqas Nafees
 *   Claimant of record: (whoever you listed — update below)
 *   Work: Safety Lab Aero (computer program)
 *   USCO Service Request Number: 1-15170855611
 *
 * Drop this file in alongside safety_lab.js (or paste its contents at the
 * top of safety_lab.js). It exposes `window.SafetyLab.copyright`.
 * ============================================================================
 */
(function () {
  'use strict';

  const FIRST_YEAR = 2025;          // year of first creation
  const CURRENT_YEAR = new Date().getFullYear();
  const HOLDER = 'Safety Lab Aero, Inc.';
  const PRODUCT = 'Safety Lab Aero';

  const REGISTRATION = {
    // Status timeline:
    //   "unregistered"  → before filing
    //   "filed"         → filing date logged with USCO; cert not yet issued (3-12 months wait)
    //   "registered"   → certificate issued; certificateNumber populated
    status: 'filed',

    // Date the application was submitted to USCO (effective registration date
    // for damages purposes is this date, even before the certificate issues).
    filingDate: '2026-05-25',

    // Service Request Number from the USCO confirmation email.
    serviceRequestNumber: '1-15170855611',

    // Populated AFTER USCO issues the certificate (typically 3-12 months later).
    certificateNumber: null,       // e.g., "TX 9-123-456"
    certificateDate: null,         // e.g., "2026-09-15"
  };

  // ---------------------------------------------------------------------------
  // Year range helper: "2025" or "2025-2026" depending on whether the current
  // year has advanced past the year of first creation.
  // ---------------------------------------------------------------------------
  function yearRange() {
    return CURRENT_YEAR > FIRST_YEAR
      ? `${FIRST_YEAR}–${CURRENT_YEAR}`   // en-dash between years
      : `${FIRST_YEAR}`;
  }

  // ---------------------------------------------------------------------------
  // Short notice — for footers, headers, watermarks. Single line, no period.
  //   Example: "© 2025–2026 Muhammad Waqas Nafees. All rights reserved."
  // ---------------------------------------------------------------------------
  function shortNotice() {
    return `© ${yearRange()} ${HOLDER}. All rights reserved.`;
  }

  // ---------------------------------------------------------------------------
  // Product-attributed notice — for About panel, splash, marketing copy.
  //   Example: "Safety Lab Aero. © 2025–2026 Muhammad Waqas Nafees. All rights reserved."
  // ---------------------------------------------------------------------------
  function productNotice() {
    return `${PRODUCT}. © ${yearRange()} ${HOLDER}. All rights reserved.`;
  }

  // ---------------------------------------------------------------------------
  // Long notice with registration status — for PDF cover pages, dossier docs,
  // marketing materials. Adapts based on REGISTRATION.status.
  // ---------------------------------------------------------------------------
  function longNotice() {
    const base = `© ${yearRange()} ${HOLDER}. All rights reserved. ${PRODUCT} is a proprietary software product of ${HOLDER}.`;
    if (REGISTRATION.status === 'registered' && REGISTRATION.certificateNumber) {
      return `${base} Registered with the United States Copyright Office (Registration No. ${REGISTRATION.certificateNumber}, issued ${REGISTRATION.certificateDate}).`;
    }
    if (REGISTRATION.status === 'filed') {
      return `${base} Copyright registration filed with the United States Copyright Office on ${REGISTRATION.filingDate}.`;
    }
    return base;
  }

  // ---------------------------------------------------------------------------
  // JSON save watermark — embedded as a property on every saved project so
  // copies inherit attribution. Compact + machine-parseable.
  // ---------------------------------------------------------------------------
  function saveWatermark() {
    return {
      copyright: shortNotice(),
      product: PRODUCT,
      holder: HOLDER,
      registration: {
        status: REGISTRATION.status,
        filingDate: REGISTRATION.filingDate,
        certificateNumber: REGISTRATION.certificateNumber,
      },
      schemaVersion: 1,
    };
  }

  // ---------------------------------------------------------------------------
  // PDF watermark — the line that goes at the bottom of every exported page.
  // Includes the build identifier so the version that produced the export is
  // traceable.
  // ---------------------------------------------------------------------------
  function pdfFooter() {
    const build =
      window.SAFETY_LAB_VERSION ||
      window.BETA_BUILD_ID ||
      (window.SafetyLab && window.SafetyLab.BUILD_ID) ||
      '';
    const reg = REGISTRATION.status === 'registered' && REGISTRATION.certificateNumber
      ? `  •  Reg. ${REGISTRATION.certificateNumber}`
      : '';
    return `${shortNotice()}${reg}${build ? '  •  Build ' + build : ''}`;
  }

  // ---------------------------------------------------------------------------
  // Source-file header — drop-in block for the top of every .js / .css / .html
  // source file when you bump build versions or add new source files.
  // ---------------------------------------------------------------------------
  function sourceHeader() {
    return `/*\n * ${productNotice()}\n * ${REGISTRATION.status === 'filed' ? 'U.S. Copyright registration filed ' + REGISTRATION.filingDate + '.' : (REGISTRATION.status === 'registered' && REGISTRATION.certificateNumber ? 'U.S. Copyright Registration No. ' + REGISTRATION.certificateNumber + '.' : '')}\n * Confidential and proprietary. Unauthorized copying prohibited.\n */`;
  }

  // ---------------------------------------------------------------------------
  // Convenience: paint the page footer immediately when this module loads, so
  // any element with id="sl-copyright-footer" is auto-populated.
  // ---------------------------------------------------------------------------
  function paintDomFooter() {
    const el = document.getElementById('sl-copyright-footer');
    if (el) el.textContent = shortNotice();
    // Also paint the About panel notice if present
    const aboutEl = document.getElementById('sl-about-copyright');
    if (aboutEl) aboutEl.textContent = longNotice();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', paintDomFooter);
    } else {
      paintDomFooter();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  window.SafetyLab = window.SafetyLab || {};
  window.SafetyLab.copyright = {
    // Raw fields (read-only by convention)
    FIRST_YEAR,
    HOLDER,
    PRODUCT,
    REGISTRATION,           // mutable: update certificateNumber here when issued

    // Formatted variants
    yearRange,
    shortNotice,
    productNotice,
    longNotice,
    pdfFooter,
    saveWatermark,
    sourceHeader,
  };
})();
