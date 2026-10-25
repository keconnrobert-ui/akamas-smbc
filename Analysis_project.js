/**
 * AuditProjectAnalysis.gs
 *
 * Read-only static analysis.
 *
 * This file:
 * - does not modify application source files;
 * - does not prove runtime behaviour;
 * - produces review-only replacement specifications;
 * - always sets automaticReplacementAllowed to false.
 */

var AX_ANALYSIS_CONFIG_ = {
  protectedFiles: ['Bootstrap.gs'],
  maxEvidenceLength: 700,
  maxSourceLengthPerFile: 100000,
  includeSourcePackage: true
};

function AX_applyProjectAnalysis_(files, report) {
  if (!report || typeof report !== 'object') {
    return;
  }

  var fileList = Array.isArray(files) ? files : [];
  var analysis = AX_analyseProject_(fileList);

  if (!analysis || typeof analysis !== 'object') {
    analysis = {
      generatedAt: new Date().toISOString(),
      status: 'REVIEW_REQUIRED',
      fileInventory: [],
      architecture: {},
      functions: [],
      serverCalls: [],
      frontendCalls: [],
      processingOrder: {},
      findings: [],
      assumptions: [],
      sourcePackage: []
    };
  }

  analysis.findings = AXPA_normalizeFindings_(
    analysis.findings
  );

  report.projectAnalysis = analysis;
  report.analysisSpecification =
    AX_buildAnalysisSpecification_(analysis);

  report.replacementSpecifications =
    AX_buildReplacementSpecifications_(
      fileList,
      analysis
    );

  if (!Array.isArray(report.issues)) {
    report.issues = [];
  }

  var existingKeys = Object.create(null);

  report.issues.forEach(function(finding) {
    if (!finding || typeof finding !== 'object') {
      return;
    }

    existingKeys[AXPA_findingKey_(finding)] = true;
  });

  analysis.findings.forEach(function(finding) {
    var key = AXPA_findingKey_(finding);

    if (existingKeys[key]) {
      return;
    }

    existingKeys[key] = true;
    report.issues.push(finding);
  });
}

function AX_analyseProject_(files) {
  var fileList = Array.isArray(files) ? files : [];
  var serverFiles = [];
  var htmlFiles = [];
  var allFiles = [];
  var functions = [];
  var serverCalls = [];
  var frontendCalls = [];
  var findings = [];
  var assumptions = [];
  var fileInventory = [];

  fileList.forEach(function(file) {
    var name = AX_fileName_(file);
    var source = AX_fileSource_(file);

    var isHtml =
      /\.html?$/i.test(name) ||
      String(file && file.type || '') === 'HTML';

    /*
     * This is deliberately not duplicated.
     */
    var isServer =
      /\.gs$/i.test(name) ||
      String(file && file.type || '') === 'SERVER_JS';

    var record = {
      name: name,
      type: isHtml
        ? 'HTML'
        : isServer
          ? 'SERVER_JS'
          : 'OTHER',
      lineCount: source
        ? source.split(/\r?\n/).length
        : 0,
      characterCount: source.length,
      protected: AX_isProtectedFile_(name),
      sha256: AX_hash_(source)
    };

    fileInventory.push(record);

    if (isHtml) {
      htmlFiles.push({
        name: name,
        source: source
      });
    } else if (isServer) {
      serverFiles.push({
        name: name,
        source: source
      });
    }

    allFiles.push({
      name: name,
      source: source,
      type: record.type
    });

    AX_extractFunctions_(name, source).forEach(
      function(item) {
        functions.push(item);
      }
    );
  });

  serverFiles.forEach(function(file) {
    AX_extractServerCalls_(
      file.name,
      file.source
    ).forEach(function(item) {
      serverCalls.push(item);
    });
  });

  htmlFiles.forEach(function(file) {
    AX_extractFrontendCalls_(
      file.name,
      file.source
    ).forEach(function(item) {
      frontendCalls.push(item);
    });
  });

  AX_addSecurityFindings_(
    allFiles,
    functions,
    serverCalls,
    frontendCalls,
    findings,
    assumptions
  );

  return {
    generatedAt: new Date().toISOString(),
    status: 'REVIEW_REQUIRED',
    fileInventory: fileInventory,
    architecture: AX_buildArchitecture_(
      fileInventory,
      functions,
      serverCalls,
      frontendCalls
    ),
    functions: functions,
    serverCalls: serverCalls,
    frontendCalls: frontendCalls,
    processingOrder: AX_buildProcessingOrder_(
      functions,
      serverCalls,
      frontendCalls
    ),
    findings: AXPA_normalizeFindings_(findings),
    assumptions: assumptions,
    sourcePackage: AX_buildSourcePackage_(allFiles)
  };
}

function AX_buildArchitecture_(
  fileInventory,
  functions,
  serverCalls,
  frontendCalls
) {
  var architecture = {
    protectedFiles: [],
    entryPoints: [],
    serverFiles: [],
    htmlFiles: [],
    apiBridgeFiles: [],
    qrFiles: [],
    bootstrapFiles: [],
    functionCount: functions.length,
    serverCallCount: serverCalls.length,
    frontendCallCount: frontendCalls.length
  };

  fileInventory.forEach(function(file) {
    var lower = String(file.name || '')
      .toLowerCase();

    if (file.protected) {
      architecture.protectedFiles.push(file.name);
    }

    if (file.type === 'SERVER_JS') {
      architecture.serverFiles.push(file.name);
    }

    if (file.type === 'HTML') {
      architecture.htmlFiles.push(file.name);
    }

    if (/bootstrap/i.test(lower)) {
      architecture.bootstrapFiles.push(file.name);
    }

    if (/qrserver/i.test(lower)) {
      architecture.qrFiles.push(file.name);
    }

    if (/api[_-]?client/i.test(lower)) {
      architecture.apiBridgeFiles.push(file.name);
    }
  });

  functions.forEach(function(fn) {
    if (
      /^(doGet|doPost|onOpen|onInstall)$/i.test(fn.name)
    ) {
      architecture.entryPoints.push({
        type: 'SERVER_ENTRY_POINT',
        functionName: fn.name,
        file: fn.file,
        line: fn.line,
        confidence: 'HIGH'
      });
    }
  });

  frontendCalls.forEach(function(call) {
    if (
      /DOMContentLoaded|window\.onload|onclick|onsubmit/i
        .test(call.context || '')
    ) {
      architecture.entryPoints.push({
        type: 'FRONTEND_ENTRY_POINT',
        functionName: call.clientFunction || '',
        file: call.file,
        line: call.line,
        confidence: 'MEDIUM'
      });
    }
  });

  return architecture;
}

function AX_extractFunctions_(fileName, source) {
  var results = [];

  var pattern =
    /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/g;

  var match;

  while ((match = pattern.exec(source)) !== null) {
    var name = match[1] || match[3];
    var parameters = match[2] || match[4] || '';

    results.push({
      file: fileName,
      name: name,
      parameters: parameters
        .split(',')
        .map(function(value) {
          return value.trim();
        })
        .filter(Boolean),
      line: AX_lineNumber_(source, match.index),
      entryPoint: /^(doGet|doPost|onOpen|onInstall)$/i
        .test(name),
      publicCandidate: !/_$/.test(name)
    });
  }

  return results;
}

function AX_extractServerCalls_(fileName, source) {
  var results = [];

  var keywords = {
    if: true,
    for: true,
    while: true,
    switch: true,
    catch: true,
    function: true,
    typeof: true,
    return: true,
    String: true,
    Number: true,
    Boolean: true,
    Array: true,
    Object: true,
    Date: true,
    Error: true,
    Math: true,
    JSON: true
  };

  var pattern = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  var match;

  while ((match = pattern.exec(source)) !== null) {
    var name = match[1];

    if (keywords[name]) {
      continue;
    }

    var before = source.substring(
      Math.max(0, match.index - 20),
      match.index
    );

    if (/function\s*$/.test(before)) {
      continue;
    }

    results.push({
      file: fileName,
      functionName: name,
      line: AX_lineNumber_(source, match.index),
      context: AX_evidence_(source, match.index)
    });
  }

  return results;
}

function AX_extractFrontendCalls_(fileName, source) {
  var results = [];

  var pattern =
    /google\.script\.run([\s\S]{0,500}?)\.([A-Za-z_$][\w$]*)\s*\(/g;

  var match;

  while ((match = pattern.exec(source)) !== null) {
    var chain = match[1] || '';
    var serverFunction = match[2];

    if (
      /^(withSuccessHandler|withFailureHandler|withUserObject)$/
        .test(serverFunction)
    ) {
      var later = source.substring(
        match.index,
        match.index + 700
      );

      var laterMatch = later.match(
        /\.(?!withSuccessHandler|withFailureHandler|withUserObject)([A-Za-z_$][\w$]*)\s*\(/
      );

      if (laterMatch) {
        serverFunction = laterMatch[1];
      }
    }

    results.push({
      file: fileName,
      serverFunction: serverFunction,
      line: AX_lineNumber_(source, match.index),
      hasSuccessHandler: /\.withSuccessHandler\s*\(/.test(chain),
      hasFailureHandler: /\.withFailureHandler\s*\(/.test(chain),
      context: AX_evidence_(source, match.index),
      confidence: 'MEDIUM'
    });
  }

  return results;
}

function AX_buildProcessingOrder_(
  functions,
  serverCalls,
  frontendCalls
) {
  var nodes = {};
  var edges = [];

  functions.forEach(function(fn) {
    var key = fn.file + ':' + fn.name;

    nodes[key] = {
      id: key,
      type: 'SERVER_FUNCTION',
      file: fn.file,
      name: fn.name,
      line: fn.line,
      entryPoint: fn.entryPoint
    };
  });

  serverCalls.forEach(function(call) {
    var callers = functions.filter(function(fn) {
      return fn.file === call.file &&
        fn.line <= call.line;
    });

    var caller = callers.length
      ? callers[callers.length - 1]
      : null;

    if (!caller) {
      return;
    }

    var from = caller.file + ':' + caller.name;

    var possibleTargets = functions.filter(function(fn) {
      return fn.name === call.functionName;
    });

    possibleTargets.forEach(function(target) {
      edges.push({
        from: from,
        to: target.file + ':' + target.name,
        kind: 'STATIC_SERVER_CALL',
        line: call.line,
        confidence: possibleTargets.length === 1
          ? 'HIGH'
          : 'MEDIUM'
      });
    });
  });

  frontendCalls.forEach(function(call) {
    edges.push({
      from: call.file + ':FRONTEND',
      to: call.serverFunction,
      kind: 'FRONTEND_TO_SERVER_CALL',
      line: call.line,
      confidence: 'MEDIUM',
      hasSuccessHandler: call.hasSuccessHandler,
      hasFailureHandler: call.hasFailureHandler
    });
  });

  return {
    nodes: Object.keys(nodes).map(function(key) {
      return nodes[key];
    }),
    edges: edges,
    note:
      'This is static analysis. It represents possible processing paths and does not prove runtime behaviour.'
  };
}

function AX_addSecurityFindings_(
  files,
  functions,
  serverCalls,
  frontendCalls,
  findings,
  assumptions
) {
  var existing = Object.create(null);

  function add(
    rule,
    severity,
    title,
    file,
    line,
    evidence,
    action,
    message
  ) {
    var finding = {
      rule: rule,
      severity: severity,
      status: 'REVIEW_REQUIRED',
      title: title,
      message: message || title,
      file: file || '',
      line: Number(line) || 1,
      evidence: AX_limit_(evidence || ''),
      recommendedAction: action || '',
      findingOrigin: 'project-analysis',
      classification: AXASF_classification_(file),
      confidence: 'high',
      automaticReplacementAllowed: false
    };

    var key = AXPA_findingKey_(finding);

    if (existing[key]) {
      return;
    }

    existing[key] = true;
    findings.push(finding);
  }

  frontendCalls.forEach(function(call) {
    if (!call.hasFailureHandler) {
      add(
        'FRONTEND_MISSING_FAILURE_HANDLER',
        'HIGH',
        'Frontend server call has no visible failure handler',
        call.file,
        call.line,
        call.context,
        'Add withFailureHandler and display a controlled error.',
        'Static analysis found no visible failure handler for this frontend server call.'
      );
    }

    if (!call.hasSuccessHandler) {
      add(
        'FRONTEND_MISSING_SUCCESS_HANDLER',
        'MEDIUM',
        'Frontend server call has no visible success handler',
        call.file,
        call.line,
        call.context,
        'Add a success handler and validate result.ok before using data.',
        'Static analysis found no visible success handler for this frontend server call.'
      );
    }
  });

  files.forEach(function(file) {
    var source = String(file.source || '');
    var fileName = String(file.name || '');

    AX_findAll_(source, /innerHTML\s*=/g)
      .forEach(function(index) {
        add(
          'POSSIBLE_UNSAFE_INNERHTML',
          'HIGH',
          'Possible unsafe HTML insertion',
          fileName,
          AX_lineNumber_(source, index),
          AX_evidence_(source, index),
          'Prefer textContent or ensure the value is safely encoded.',
          'Static analysis detected an innerHTML assignment. The complete data flow requires review.'
        );
      });

    AX_findAll_(
      source,
      /\beval\s*\(|new\s+Function\s*\(/g
    ).forEach(function(index) {
      add(
        'DYNAMIC_CODE_EXECUTION',
        'CRITICAL',
        'Dynamic JavaScript execution detected',
        fileName,
        AX_lineNumber_(source, index),
        AX_evidence_(source, index),
        'Remove dynamic execution or document and isolate the unavoidable case.',
        'Static analysis detected dynamic JavaScript execution.'
      );
    });

    AX_findAll_(
      source,
      /getScriptProperties|getUserProperties|getDocumentProperties/g
    ).forEach(function(index) {
      add(
        'PROPERTY_STORE_ACCESS',
        'REVIEW',
        'Properties service access detected',
        fileName,
        AX_lineNumber_(source, index),
        AX_evidence_(source, index),
        'Confirm secrets are never returned to HTML or included in reports.',
        'Static analysis detected access to an Apps Script Properties service.'
      );
    });

    AX_findAll_(
      source,
      /innerHTML|outerHTML|document\.write|insertAdjacentHTML/g
    ).forEach(function(index) {
      if (/\.html?$/i.test(fileName)) {
        add(
          'FRONTEND_HTML_SINK',
          'HIGH',
          'Frontend HTML sink detected',
          fileName,
          AX_lineNumber_(source, index),
          AX_evidence_(source, index),
          'Review the complete data flow and prefer safe DOM APIs where possible.',
          'Static analysis detected a frontend HTML output sink.'
        );
      }
    });

    AX_findAll_(
      source,
      /CLUB_SECRET_TOKEN|SECRET|API_KEY|PASSWORD|PRIVATE_KEY/g
    ).forEach(function(index) {
      add(
        'POSSIBLE_SECRET_REFERENCE',
        'HIGH',
        'Possible secret or credential reference detected',
        fileName,
        AX_lineNumber_(source, index),
        AX_evidence_(source, index),
        'Confirm that the value is retrieved server-side and never emitted to HTML.',
        'Static analysis detected a possible secret, credential, or sensitive configuration reference.'
      );
    });
  });

  functions.forEach(function(fn) {
    if (fn.entryPoint) {
      assumptions.push({
        type: 'UNVERIFIED_ASSUMPTION',
        file: fn.file,
        line: fn.line,
        confidence: 'medium',
        classification: AXASF_classification_(fn.file),
        statement:
          'This entry point may be reachable externally. Runtime deployment settings and identity requirements have not been proven by static analysis.'
      });
    }

    if (fn.publicCandidate && !fn.entryPoint) {
      assumptions.push({
        type: 'UNVERIFIED_ASSUMPTION',
        file: fn.file,
        line: fn.line,
        confidence: 'low',
        classification: AXASF_classification_(fn.file),
        statement:
          'This function appears public by naming convention, but actual exposure depends on how it is called.'
      });
    }
  });
}

function AXPA_normalizeFindings_(findings) {
  var result = [];
  var seen = Object.create(null);

  (Array.isArray(findings) ? findings : [])
    .forEach(function(finding) {
      if (!finding || typeof finding !== 'object') {
        return;
      }

      var normalized = {
        rule: String(
          finding.rule || 'UNSPECIFIED_RULE'
        ),
        severity: String(
          finding.severity || 'INFO'
        ).toUpperCase(),
        status: String(
          finding.status || 'REVIEW_REQUIRED'
        ),
        title: String(
          finding.title || finding.rule || 'Finding'
        ),
        message: String(
          finding.message || finding.title || ''
        ),
        file: String(
          finding.file || finding.fileName || ''
        ),
        line: Number(
          finding.line || finding.lineNumber
        ) || 1,
        evidence: String(
          finding.evidence || ''
        ),
        recommendedAction: String(
          finding.recommendedAction ||
          finding.action ||
          ''
        ),
        findingOrigin: String(
          finding.findingOrigin ||
          'project-analysis'
        ),
        classification: String(
          finding.classification ||
          AXASF_classification_(
            finding.file || finding.fileName
          )
        ),
        confidence: String(
          finding.confidence || 'medium'
        ),
        automaticReplacementAllowed: false
      };

      var key = AXPA_findingKey_(normalized);

      if (seen[key]) {
        return;
      }

      seen[key] = true;
      result.push(normalized);
    });

  return result;
}

function AXPA_findingKey_(finding) {
  if (!finding || typeof finding !== 'object') {
    return 'invalid-finding';
  }

  return [
    AXPA_part_(finding.rule),
    AXPA_part_(finding.file || finding.fileName),
    AXPA_part_(finding.line || finding.lineNumber),
    AXPA_part_(
      finding.message ||
      finding.finding ||
      finding.description ||
      finding.title
    )
  ].join('|');
}

function AXPA_part_(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function AXASF_classification_(fileName) {
  var name = String(fileName || '');

  if (
    /^Audit(?:\.gs)?$/i.test(name) ||
    /^Audit(?:Extensions|Hardening|ProjectAnalysis)(?:\.gs)?$/i
      .test(name)
  ) {
    return 'audit-tool';
  }

  if (/^Bootstrap(?:\.gs)?$/i.test(name)) {
    return 'protected-application';
  }

  if (/\.html?$/i.test(name)) {
    return 'application-frontend';
  }

  if (/^(WebApp|QrServer)(?:\.gs)?$/i.test(name)) {
    return 'application-server';
  }

  if (/^appsscript(?:\.json)?$/i.test(name)) {
    return 'application-configuration';
  }

  return /\.gs$/i.test(name)
    ? 'application-server'
    : 'application';
}

function AX_buildReplacementSpecifications_(files, analysis) {
  var results = [];

  (files || []).forEach(function(file) {
    var name = AX_fileName_(file);
    var source = AX_fileSource_(file);

    if (!source) {
      return;
    }

    var relatedFindings = analysis.findings.filter(
      function(finding) {
        return finding.file === name;
      }
    );

    results.push({
      file: name,
      originalSha256: AX_hash_(source),
      protected: AX_isProtectedFile_(name),
      replacementStatus: AX_isProtectedFile_(name)
        ? 'NO_AUTOMATIC_REPLACEMENT'
        : 'REVIEW_REQUIRED',
      findings: relatedFindings.map(function(finding) {
        return finding.rule;
      }),
      proposedChanges: AX_proposedChangesForFile_(
        name,
        relatedFindings
      ),
      completeOriginalSource: source,
      proposedSource: null,
      automaticReplacementAllowed: false,
      note:
        'This is a review-only replacement specification. No replacement source has been generated or applied.'
    });
  });

  return results;
}

function AX_proposedChangesForFile_(fileName, findings) {
  var changes = [];

  (findings || []).forEach(function(finding) {
    changes.push({
      finding: finding.rule,
      action: finding.recommendedAction,
      status: 'NOT_APPLIED',
      automaticReplacementAllowed: false
    });
  });

  if (/bootstrap/i.test(fileName)) {
    changes.push({
      finding: 'BOOTSTRAP_PROTECTION',
      action: 'Do not replace or rewrite Bootstrap.gs.',
      status: 'PROTECTED',
      automaticReplacementAllowed: false
    });
  }

  if (/webapp/i.test(fileName)) {
    changes.push({
      finding: 'WEBAPP_BOUNDARY_REVIEW',
      action:
        'Review every externally reachable entry point for identity, authorisation, and input validation.',
      status: 'REVIEW_REQUIRED',
      automaticReplacementAllowed: false
    });
  }

  if (/qrserver/i.test(fileName)) {
    changes.push({
      finding: 'QR_SECURITY_REVIEW',
      action:
        'Review canonical payload construction, HMAC validation, expiry, and replay behaviour.',
      status: 'REVIEW_REQUIRED',
      automaticReplacementAllowed: false
    });
  }

  if (/\.html?$/i.test(fileName)) {
    changes.push({
      finding: 'HTML_OUTPUT_REVIEW',
      action:
        'Review every DOM output path and prefer textContent over HTML insertion.',
      status: 'REVIEW_REQUIRED',
      automaticReplacementAllowed: false
    });
  }

  return changes;
}

function AX_buildAnalysisSpecification_(analysis) {
  analysis = analysis || {};

  var findings = Array.isArray(analysis.findings)
    ? analysis.findings
    : [];

  var lines = [];

  lines.push('PROJECT ANALYSIS SPECIFICATION');
  lines.push('==============================');
  lines.push('');
  lines.push('Generated: ' + String(
    analysis.generatedAt || 'unspecified'
  ));
  lines.push('Status: ' + String(
    analysis.status || 'REVIEW_REQUIRED'
  ));
  lines.push('');
  lines.push('FILES: ' + (
    Array.isArray(analysis.fileInventory)
      ? analysis.fileInventory.length
      : 0
  ));
  lines.push('FUNCTIONS: ' + (
    Array.isArray(analysis.functions)
      ? analysis.functions.length
      : 0
  ));
  lines.push('SERVER CALLS: ' + (
    Array.isArray(analysis.serverCalls)
      ? analysis.serverCalls.length
      : 0
  ));
  lines.push('FRONTEND CALLS: ' + (
    Array.isArray(analysis.frontendCalls)
      ? analysis.frontendCalls.length
      : 0
  ));
  lines.push('FINDINGS: ' + findings.length);
  lines.push('');
  lines.push('FINDINGS');
  lines.push('--------');

  if (!findings.length) {
    lines.push('(none identified)');
  } else {
    findings.forEach(function(finding) {
      lines.push(
        finding.rule + ' [' +
        finding.severity + '] ' +
        finding.file + ':' +
        finding.line
      );
      lines.push(
        ' Origin: ' + finding.findingOrigin
      );
      lines.push(
        ' Classification: ' +
        finding.classification
      );
      lines.push(
        ' Confidence: ' +
        finding.confidence
      );
      lines.push(
        ' Message: ' +
        finding.message
      );
      lines.push(
        ' Action: ' +
        finding.recommendedAction
      );
      lines.push(
        ' Automatic replacement allowed: false'
      );
    });
  }

  lines.push('');
  lines.push('IMPORTANT');
  lines.push('---------');
  lines.push(
    'This is static analysis. It does not prove runtime behaviour or runtime processing order.'
  );
  lines.push(
    'Inferred callers, callees, and processing edges require review.'
  );
  lines.push(
    'All replacement specifications are review-only.'
  );
  lines.push(
    'Protected files must not be automatically modified or replaced.'
  );

  return lines.join('\n');
}

function AX_buildSourcePackage_(files) {
  if (!AX_ANALYSIS_CONFIG_.includeSourcePackage) {
    return [];
  }

  return (files || []).map(function(file) {
    return {
      name: file.name,
      type: file.type,
      sha256: AX_hash_(file.source),
      source: AX_limitSource_(file.source)
    };
  });
}

function AX_findAll_(source, pattern) {
  var indexes = [];
  var match;

  pattern.lastIndex = 0;

  while ((match = pattern.exec(source)) !== null) {
    indexes.push(match.index);

    if (!pattern.global) {
      break;
    }
  }

  return indexes;
}

function AX_lineNumber_(source, index) {
  return String(source || '')
    .substring(0, Math.max(0, index))
    .split(/\r?\n/)
    .length;
}

function AX_evidence_(source, index) {
  var text = String(source || '');
  var start = Math.max(0, index - 220);
  var end = Math.min(text.length, index + 480);

  return AX_limit_(text.substring(start, end));
}

function AX_fileName_(file) {
  return String(
    file && (
      file.name ||
      file.title ||
      file.fileName
    ) || ''
  );
}

function AX_fileSource_(file) {
  return String(
    file && (
      file.source ||
      file.content ||
      file.code ||
      file.text
    ) || ''
  );
}

function AX_isProtectedFile_(fileName) {
  var target = String(fileName || '')
    .toLowerCase();

  return AX_ANALYSIS_CONFIG_.protectedFiles.some(
    function(name) {
      return String(name).toLowerCase() === target;
    }
  );
}

function AX_limitSource_(source) {
  var text = String(source || '');
  var limit = AX_ANALYSIS_CONFIG_.maxSourceLengthPerFile;

  if (text.length <= limit) {
    return text;
  }

  return text.substring(0, limit) +
    '\n\n/* SOURCE TRUNCATED BY AUDIT REPORT */\n';
}

function AX_limit_(value) {
  var text = String(value || '');
  var limit = AX_ANALYSIS_CONFIG_.maxEvidenceLength;

  return text.length <= limit
    ? text
    : text.substring(0, limit) + '...';
}

function AX_hash_(source) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(source || ''),
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    var value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}
