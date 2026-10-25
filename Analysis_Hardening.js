/**
 * AuditHardening.gs
 *
 * Generates reviewed hardening artifacts for the project.
 *
 * This file does not modify project source files.
 * It produces complete proposed source files in:
 *
 *   report.hardenedArtifacts
 *
 * All generated artifacts must be reviewed before being copied into
 * production files.
 */

/**
 * Main extension entry point.
 *
 * Call this from AX_applyAuditExtensions_ after the existing checks
 * have completed.
 */
function AH_applyHardeningGeneration_(files, report) {
  if (!report || typeof report !== 'object') {
    return;
  }

  var fileList = Array.isArray(files) ? files : [];
  var issues = Array.isArray(report.issues) ? report.issues : [];

  var inventory = AH_buildInventory_(fileList);
  var plan = AH_buildHardeningPlan_(inventory, issues);

  report.hardening = {
    status: 'REVIEW_REQUIRED',
    generatedAt: new Date().toISOString(),
    sourceFilesModified: false,
    bootstrapModified: false,
    inventory: inventory,
    plan: plan
  };

  report.hardenedArtifacts = [
    AH_buildServerSecurityKernel_(),
    AH_buildFrontendSecurityKernel_(),
    AH_buildIntegrationGuide_(inventory, plan)
  ];

  report.hardeningReviewChecklist = AH_buildReviewChecklist_();
}

/**
 * Creates a simple project inventory for hardening decisions.
 */
function AH_buildInventory_(files) {
  var inventory = {
    serverFiles: [],
    htmlFiles: [],
    bootstrapFiles: [],
    webAppFiles: [],
    qrServerFiles: [],
    apiClientFiles: [],
    userInterfaceFiles: []
  };

  files.forEach(function(file) {
    var name = String(file && file.name || '');
    var lower = name.toLowerCase();

    if (/\.gs$/i.test(name) || file.type === 'SERVER_JS') {
      inventory.serverFiles.push(name);
    }

    if (/\.html?$/i.test(name) || file.type === 'HTML') {
      inventory.htmlFiles.push(name);
    }

    if (/bootstrap/i.test(lower)) {
      inventory.bootstrapFiles.push(name);
    }

    if (/webapp/i.test(lower)) {
      inventory.webAppFiles.push(name);
    }

    if (/qrserver/i.test(lower)) {
      inventory.qrServerFiles.push(name);
    }

    if (/ui[_-]?apiclient/i.test(lower)) {
      inventory.apiClientFiles.push(name);
    }

    if (/userinterface/i.test(lower)) {
      inventory.userInterfaceFiles.push(name);
    }
  });

  return inventory;
}

/**
 * Converts audit findings into a hardening work plan.
 */
function AH_buildHardeningPlan_(inventory, issues) {
  var plan = [];

  function hasRule(rule) {
    return issues.some(function(issue) {
      return issue && issue.rule === rule;
    });
  }

  function add(id, priority, title, files, reason, action) {
    plan.push({
      id: id,
      priority: priority,
      title: title,
      affectedFiles: files,
      reason: reason,
      action: action,
      status: 'REVIEW_REQUIRED'
    });
  }

  add(
    'HARDEN-001',
    1,
    'Install server-side contract and validation helpers',
    inventory.serverFiles,
    'Server functions require consistent success, failure and validation behaviour.',
    'Review and copy SecurityKernel.gs into the project, then route public operations through its helpers.'
  );

  if (inventory.webAppFiles.length) {
    add(
      'HARDEN-002',
      1,
      'Review WebApp entry-point authentication and authorisation',
      inventory.webAppFiles,
      'Web entry points are security boundaries and must not rely on frontend checks.',
      'Add explicit server-side identity, permission and input-validation checks to each mutating operation.'
    );
  }

  if (inventory.qrServerFiles.length) {
    add(
      'HARDEN-003',
      1,
      'Harden QR signature verification',
      inventory.qrServerFiles,
      'QR payloads must be authenticated before their contents are trusted.',
      'Use the generated HMAC and constant-time comparison helpers. Confirm expiry, payload canonicalisation and replay handling.'
    );
  }

  if (inventory.htmlFiles.length) {
    add(
      'HARDEN-004',
      1,
      'Install frontend output and error-handling helpers',
      inventory.htmlFiles,
      'Server responses and user-controlled values must not be inserted into the DOM unsafely.',
      'Review and copy FrontendSecurityKernel.html, then replace unsafe HTML insertion and standardise API failure handling.'
    );
  }

  if (inventory.apiClientFiles.length) {
    add(
      'HARDEN-005',
      2,
      'Review the frontend-to-server API bridge',
      inventory.apiClientFiles,
      'The bridge is responsible for transport failures and contract validation.',
      'Ensure every call has a failure handler and every successful response is checked for result.ok.'
    );
  }

  if (hasRule('POSSIBLE_UNRESOLVED_CALL')) {
    add(
      'HARDEN-006',
      2,
      'Resolve uncertain function references before deployment',
      inventory.serverFiles.concat(inventory.htmlFiles),
      'A missing or incorrectly named function can bypass intended security processing or break failure handling.',
      'Review every unresolved call manually and add confirmed external libraries or services to the audit configuration.'
    );
  }

  if (hasRule('JAVASCRIPT_SYNTAX') || hasRule('UNMATCHED_BRACE')) {
    add(
      'HARDEN-007',
      1,
      'Correct syntax defects before installing hardening code',
      inventory.serverFiles.concat(inventory.htmlFiles),
      'Security controls cannot be trusted when source parsing is incomplete.',
      'Fix syntax and brace findings first, then rerun Audit.'
    );
  }

  if (inventory.bootstrapFiles.length) {
    add(
      'HARDEN-008',
      1,
      'Protect Bootstrap from automatic modification',
      inventory.bootstrapFiles,
      'Bootstrap is a protected dependency for the project.',
      'Do not replace Bootstrap automatically. Review any proposed Bootstrap change separately and verify its hash before deployment.'
    );
  }

  return plan;
}

/**
 * Complete server-side hardening artifact.
 */
function AH_buildServerSecurityKernel_() {
  var source = [
    '/**',
    ' * SecurityKernel.gs',
    ' * Generated by AuditHardening.gs.',
    ' * Review before installation.',
    ' */',
    '',
    'function SEC_ok_(data, message) {',
    '  return {',
    '    ok: true,',
    '    data: data === undefined ? null : data,',
    '    message: String(message || "OK")',
    '  };',
    '}',
    '',
    'function SEC_fail_(code, message) {',
    '  return {',
    '    ok: false,',
    '    error: String(code || "REQUEST_FAILED"),',
    '    message: SEC_safeMessage_(message)',
    '  };',
    '}',
    '',
    'function SEC_safeMessage_(message) {',
    '  var text = String(message || "The operation could not be completed.");',
    '  text = text.replace(/[\\r\\n\\t]+/g, " ");',
    '  text = text.replace(/\\s{2,}/g, " ");',
    '  return text.substring(0, 500);',
    '}',
    '',
    'function SEC_safeException_(exception, publicMessage) {',
    '  Logger.log(exception && exception.stack ? exception.stack : exception);',
    '  return SEC_fail_("INTERNAL_ERROR", publicMessage ||',
    '    "The operation could not be completed.");',
    '}',
    '',
    'function SEC_requireObject_(value, name) {',
    '  if (!value || typeof value !== "object" || Array.isArray(value)) {',
    '    throw new Error(String(name || "value") + " must be an object.");',
    '  }',
    '  return value;',
    '}',
    '',
    'function SEC_requireString_(value, name, maxLength) {',
    '  var field = String(name || "value");',
    '  var limit = Number(maxLength || 500);',
    '  if (typeof value !== "string" || !value.trim()) {',
    '    throw new Error(field + " is required.");',
    '  }',
    '  if (value.length > limit) {',
    '    throw new Error(field + " is too long.");',
    '  }',
    '  return value.trim();',
    '}',
    '',
    'function SEC_optionalString_(value, name, maxLength) {',
    '  if (value === null || value === undefined || value === "") {',
    '    return "";',
    '  }',
    '  return SEC_requireString_(String(value), name, maxLength);',
    '}',
    '',
    'function SEC_requireEnum_(value, name, allowed) {',
    '  var text = SEC_requireString_(String(value), name, 100);',
    '  var values = Array.isArray(allowed) ? allowed : [];',
    '  if (values.indexOf(text) === -1) {',
    '    throw new Error(String(name || "value") + " is invalid.");',
    '  }',
    '  return text;',
    '}',
    '',
    'function SEC_requireDateString_(value, name) {',
    '  var text = SEC_requireString_(String(value), name, 30);',
    '  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) {',
    '    throw new Error(String(name || "date") + " must use YYYY-MM-DD.");',
    '  }',
    '  var date = new Date(text + "T00:00:00Z");',
    '  if (isNaN(date.getTime())) {',
    '    throw new Error(String(name || "date") + " is invalid.");',
    '  }',
    '  return text;',
    '}',
    '',
    'function SEC_requireFiniteNumber_(value, name, min, max) {',
    '  var number = Number(value);',
    '  if (!isFinite(number)) {',
    '    throw new Error(String(name || "number") + " is invalid.");',
    '  }',
    '  if (min !== undefined && number < Number(min)) {',
    '    throw new Error(String(name || "number") + " is below the minimum.");',
    '  }',
    '  if (max !== undefined && number > Number(max)) {',
    '    throw new Error(String(name || "number") + " is above the maximum.");',
    '  }',
    '  return number;',
    '}',
    '',
    'function SEC_escapeHtml_(value) {',
    '  return String(value === null || value === undefined ? "" : value)',
    '    .replace(/&/g, "&amp;")',
    '    .replace(/</g, "&lt;")',
    '    .replace(/>/g, "&gt;")',
    '    .replace(/"/g, "&quot;")',
    '    .replace(/\\x27/g, "&#39;");',
    '}',
    '',
    'function SEC_constantTimeEqual_(left, right) {',
    '  var a = String(left || "");',
    '  var b = String(right || "");',
    '  var length = Math.max(a.length, b.length);',
    '  var difference = a.length ^ b.length;',
    '  var i;',
    '  for (i = 0; i < length; i++) {',
    '    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);',
    '  }',
    '  return difference === 0;',
    '}',
    '',
    'function SEC_hmacSha256Base64_(payload, secret) {',
    '  if (!secret) {',
    '    throw new Error("Signing secret is not configured.");',
    '  }',
    '  var bytes = Utilities.computeHmacSha256Signature(',
    '    String(payload),',
    '    String(secret),',
    '    Utilities.Charset.UTF_8',
    '  );',
    '  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, "");',
    '}',
    '',
    'function SEC_verifyHmacSha256_(payload, suppliedSignature, secret) {',
    '  var expected = SEC_hmacSha256Base64_(payload, secret);',
    '  return SEC_constantTimeEqual_(expected, suppliedSignature);',
    '}',
    '',
    'function SEC_getRequiredSecret_(propertyName) {',
    '  var name = SEC_requireString_(String(propertyName), "propertyName", 100);',
    '  var secret = PropertiesService.getScriptProperties().getProperty(name);',
    '  if (!secret) {',
    '    throw new Error("Required security property is missing.");',
    '  }',
    '  return secret;',
    '}',
    '',
    'function SEC_runSafely_(callback, publicMessage) {',
    '  try {',
    '    return callback();',
    '  } catch (error) {',
    '    return SEC_safeException_(error, publicMessage);',
    '  }',
    '}',
    '',
    'function SEC_assert_(condition, message) {',
    '  if (!condition) {',
    '    throw new Error(SEC_safeMessage_(message || "Validation failed."));',
    '  }',
    '}'
  ].join('\\n');

  return {
    name: 'SecurityKernel.gs',
    type: 'SERVER_JS',
    purpose: 'Common server-side validation, contract, error and cryptographic helpers.',
    source: source,
    reviewRequired: true,
    bootstrapChangeRequired: false,
    installationNotes: [
      'Do not expose script properties or signing secrets to HTML.',
      'Use SEC_runSafely_ at public server boundaries.',
      'Use SEC_requireObject_ and field validators before database operations.',
      'Use SEC_verifyHmacSha256_ only after constructing the exact canonical payload.',
      'Confirm that the project does not already define conflicting SEC_ functions.'
    ]
  };
}

/**
 * Complete frontend hardening artifact.
 */
function AH_buildFrontendSecurityKernel_() {
  var source = [
    '<!--',
    '  FrontendSecurityKernel.html',
    '  Generated by AuditHardening.gs.',
    '  Review before inclusion in the frontend.',
    '-->',
    '<script>',
    '(function (global) {',
    '  "use strict";',
    '',
    '  function text(value) {',
    '    return value === null || value === undefined ? "" : String(value);',
    '  }',
    '',
    '  function escapeHtml(value) {',
    '    return text(value)',
    '      .replace(/&/g, "&amp;")',
    '      .replace(/</g, "&lt;")',
    '      .replace(/>/g, "&gt;")',
    '      .replace(/"/g, "&quot;")',
    '      .replace(/\\x27/g, "&#39;");',
    '  }',
    '',
    '  function safeError(result, fallback) {',
    '    if (result && result.message) {',
    '      return text(result.message).substring(0, 500);',
    '    }',
    '    return fallback || "The operation could not be completed.";',
    '  }',
    '',
    '  function isContractSuccess(result) {',
    '    return Boolean(result && result.ok === true);',
    '  }',
    '',
    '  function isContractFailure(result) {',
    '    return Boolean(result && result.ok === false);',
    '  }',
    '',
    '  function setText(element, value) {',
    '    if (!element) {',
    '      return;',
    '    }',
    '    element.textContent = text(value);',
    '  }',
    '',
    '  function setBusy(element, busy) {',
    '    if (!element) {',
    '      return;',
    '    }',
    '    element.disabled = Boolean(busy);',
    '    element.setAttribute("aria-busy", busy ? "true" : "false");',
    '  }',
    '',
    '  function safeJson(value) {',
    '    return JSON.parse(JSON.stringify(value));',
    '  }',
    '',
    '  global.AppSecurity = Object.freeze({',
    '    text: text,',
    '    escapeHtml: escapeHtml,',
    '    safeError: safeError,',
    '    isContractSuccess: isContractSuccess,',
    '    isContractFailure: isContractFailure,',
    '    setText: setText,',
    '    setBusy: setBusy,',
    '    safeJson: safeJson',
    '  });',
    '})(window);',
    '</script>'
  ].join('\\n');

  return {
    name: 'FrontendSecurityKernel.html',
    type: 'HTML',
    purpose: 'Safe frontend output, contract and busy-state helpers.',
    source: source,
    reviewRequired: true,
    bootstrapChangeRequired: false,
    installationNotes: [
      'Include this file using the project include helper.',
      'Prefer textContent over innerHTML.',
      'If innerHTML is unavoidable, encode values with AppSecurity.escapeHtml.',
      'Do not place secrets, HMAC keys or privileged decisions in HTML.',
      'Every google.script.run call must have a failure handler.'
    ]
  };
}

/**
 * Generates a project-specific integration document.
 */
function AH_buildIntegrationGuide_(inventory, plan) {
  var lines = [
    'AUDIT HARDENING INTEGRATION GUIDE',
    '=================================',
    '',
    'This document was generated as part of the Audit report.',
    'It is guidance only. No project source file was changed.',
    '',
    'PROTECTED FILES',
    '---------------',
    'Bootstrap files: ' + inventory.bootstrapFiles.join(', '),
    '',
    'Bootstrap must not be replaced automatically.',
    'Any Bootstrap change requires a separate review and hash comparison.',
    '',
    'GENERATED ARTIFACTS',
    '-------------------',
    '1. SecurityKernel.gs',
    '2. FrontendSecurityKernel.html',
    '',
    'RECOMMENDED ORDER',
    '-----------------',
    '1. Save a complete project backup.',
    '2. Review the generated server kernel.',
    '3. Review the generated frontend kernel.',
    '4. Confirm that generated function names do not collide with the project.',
    '5. Install the kernels as new files first.',
    '6. Update one server operation at a time.',
    '7. Test success, validation failure, authorisation failure and internal failure.',
    '8. Rerun Audit after each change.',
    '9. Only then consider replacing an existing file.',
    '',
    'FILES REQUIRING INDIVIDUAL REVIEW',
    '----------------------------------',
    'WebApp files: ' + inventory.webAppFiles.join(', '),
    'QrServer files: ' + inventory.qrServerFiles.join(', '),
    'API client files: ' + inventory.apiClientFiles.join(', '),
    'User interface files: ' + inventory.userInterfaceFiles.join(', '),
    '',
    'IMPORTANT',
    '---------',
    'The generated helpers do not prove that authentication, authorisation,',
    'QR replay protection or business-rule validation is correctly implemented.',
    'Those controls must be checked against the actual project source.'
  ];

  plan.forEach(function(item) {
    lines.push('');
    lines.push(item.id + ' - PRIORITY ' + item.priority);
    lines.push(item.title);
    lines.push('Action: ' + item.action);
  });

  return {
    name: 'HardeningIntegrationGuide.txt',
    type: 'TEXT',
    purpose: 'Installation, review and rollback guidance.',
    source: lines.join('\\n'),
    reviewRequired: true,
    bootstrapChangeRequired: false
  };
}

/**
 * Review checklist included in the report.
 */
function AH_buildReviewChecklist_() {
  return [
    'Confirm a complete project backup exists.',
    'Confirm Bootstrap.gs has not been modified.',
    'Confirm generated function names do not collide with existing functions.',
    'Confirm no generated code exposes script properties or secrets.',
    'Confirm each public server operation validates input server-side.',
    'Confirm each mutating operation checks authorisation server-side.',
    'Confirm QR payloads are verified before their values are trusted.',
    'Confirm QR expiry and replay behaviour are appropriate.',
    'Confirm all google.script.run calls have failure handlers.',
    'Confirm frontend output uses textContent or correctly encoded values.',
    'Confirm contract responses are checked using result.ok.',
    'Run the project test plan before replacing any existing file.',
    'Rerun Audit after installation and compare findings.'
  ];
}
