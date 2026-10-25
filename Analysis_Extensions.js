/**
 * AuditExtensions.gs
 *
 * Extensions for Audit.gs.
 *
 * Bootstrap.gs remains immutable.
 *
 * Provides:
 * - improved server-function discovery;
 * - self-audit false-positive suppression;
 * - JavaScript and Apps Script global allowlisting;
 * - HTML google.script.run callback checking;
 * - missing HTML-reference checking;
 * - suggested development work.
 */


/**
 * Main extension entry point.
 *
 * @param {Array} files
 * @param {Set} definedFunctions
 * @param {Object} report
 */
/* AuditExtensions.gs */

function AX_collectAllFunctions_(files) {
  var result = new Set();

  (files || []).forEach(function(file) {
    if (!AX_isServerFile_(file)) {
      return;
    }

    var source = String(file.source || '');

    [
      /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
      /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g,
      /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
      /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm
    ].forEach(function(pattern) {
      var match;

      while ((match = pattern.exec(source)) !== null) {
        if (!AX_isControlWord_(match[1])) {
          result.add(match[1]);
        }
      }
    });
  });

  return result;
}


function AX_checkHtmlServerCallbacks_(files, allFunctions, report) {
  (files || []).forEach(function(file) {
    if (!AX_isHtmlFile_(file)) {
      return;
    }


    var source = String(file.source || '');
    var pattern = /google\.script\.run[\s\S]*?(?:;|\n|$)/g;
    var expression;


    while ((expression = pattern.exec(source)) !== null) {
      var methodPattern = /\.([A-Za-z_$][\w$]*)\s*\(/g;
      var match;
      var methods = [];


      while ((match = methodPattern.exec(expression[0])) !== null) {
        if (!new Set([
          'run',
          'withSuccessHandler',
          'withFailureHandler',
          'withUserObject'
        ]).has(match[1])) {
          methods.push(match[1]);
        }
      }


      if (!methods.length) {
        continue;
      }


      var calledFunction = methods[methods.length - 1];


      if (!allFunctions.has(calledFunction)) {
        AX_addIssueIfMissing_(
          report,
          'WARNING',
          file.name,
          AX_lineNumberAtIndex_(source, expression.index),
          'HTML_SERVER_CALLBACK_MISSING',
          'The HTML file calls server function "' + calledFunction +
          '" through google.script.run, but that function was not found in the server-side project files.'
        );
      }
    }
  });
}


function AX_checkMissingHtmlReferences_(files, report) {
  var htmlNames = new Set();


  (files || []).forEach(function(file) {
    if (AX_isHtmlFile_(file)) {
      htmlNames.add(AX_normalizeHtmlName_(file.name));
    }
  });


  var pattern =
    /\b(?:createHtmlOutputFromFile|createTemplateFromFile|include)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;


  (files || []).forEach(function(file) {
    if (!AX_isServerFile_(file)) {
      return;
    }


    var source = String(file.source || '');
    var match;


    while ((match = pattern.exec(source)) !== null) {
      var name = AX_normalizeHtmlName_(match[1]);
      var lineNumber = AX_lineNumberAtIndex_(source, match.index);
      var line = AX_getSourceLine_(file, lineNumber);


      if (
        name === 'filename' ||
        htmlNames.has(name) ||
        AX_isDocumentationHtmlExampleLine_(line)
      ) {
        continue;
      }


      AX_addIssueIfMissing_(
        report,
        'WARNING',
        file.name,
        lineNumber,
        'MISSING_HTML_REFERENCE',
        'The server-side code references HTML file "' + match[1] +
        '", but that file was not found in the project.'
      );
    }
  });
}


function AX_removeKnownUnresolvedCalls_(allFunctions, report) {
  if (!report || !Array.isArray(report.issues)) {
    return;
  }


  var allowed = AX_getGlobalAllowlist_();


  report.issues = report.issues.filter(function(issue) {
    if (!issue || issue.rule !== 'POSSIBLE_UNRESOLVED_CALL') {
      return true;
    }


    var name = AX_extractFunctionNameFromMessage_(issue);


    return !name ||
      allFunctions.has(name) ||
      allowed.has(name);
  });
}


function AX_extractFunctionNameFromMessage_(issue) {
  var match = String(issue && issue.message || '')
    .match(/function\s+"?([A-Za-z_$][\w$]*)"?/i);


  return match ? match[1] : '';
}


function AX_removeAuditSelfFindings_(files, report) {
  if (!report || !Array.isArray(report.issues)) {
    return;
  }


  report.issues = report.issues.filter(function(issue) {
    var name = AX_baseName_(issue && issue.file);


    if (name !== 'audit' && name !== 'auditextensions') {
      return true;
    }


    var file = (files || []).find(function(candidate) {
      return AX_baseName_(candidate.name) === name;
    });


    if (!file) {
      return true;
    }


    if (
      issue.rule === 'PLACEHOLDER_FOUND' ||
      issue.rule === 'POSSIBLE_UNRESOLVED_CALL'
    ) {
      return !AX_isSelfDetectionLine_(
        AX_getSourceLine_(file, issue.line)
      );
    }


    return true;
  });
}


function AX_isSelfDetectionLine_(line) {
  var text = String(line || '');


  return /PLACEHOLDER_FOUND|PLACEHOLDER_ACTION/i.test(text) ||
    /POSSIBLE_UNRESOLVED_CALL/i.test(text) ||
    /MISSING_HTML_REFERENCE|HTML_SERVER_CALLBACK_MISSING/i.test(text) ||
    /development placeholder|incomplete implementation marker/i.test(text) ||
    /\bTODO\b|\bFIXME\b|\bIMPLEMENT\b|\bPLACEHOLDER\b/i.test(text) ||
    /javascript:\s*alert/i.test(text) ||
    /createHtmlOutputFromFile|createTemplateFromFile/i.test(text) ||
    /\binclude\s*\(/i.test(text);
}


function AX_buildSuggestedDevelopmentWork_(files, report) {
  var suggestions = [];
  var issues = report && Array.isArray(report.issues)
    ? report.issues
    : [];


  function has(rule) {
    return issues.some(function(issue) {
      return issue.rule === rule;
    });
  }


  if (has('HTML_SERVER_CALLBACK_MISSING')) {
    suggestions.push(
      'Implement or correct server functions called through google.script.run.'
    );
  }


  if (has('MISSING_HTML_REFERENCE')) {
    suggestions.push(
      'Create missing HTML files or correct the server-side references.'
    );
  }


  if (
    has('PLACEHOLDER_FOUND') ||
    has('PLACEHOLDER_ACTION') ||
    has('EMPTY_FUNCTION')
  ) {
    suggestions.push(
      'Replace remaining placeholders and empty functions with tested implementations.'
    );
  }


  if (has('POSSIBLE_UNRESOLVED_CALL')) {
    suggestions.push(
      'Review unresolved calls against project functions, libraries, triggers, and Apps Script services.'
    );
  }


  if (has('UNMATCHED_BRACE') || has('JAVASCRIPT_SYNTAX')) {
    suggestions.push(
      'Correct syntax, scope, and unmatched-brace errors before deployment.'
    );
  }


  if (has('DUPLICATE_DECLARATION')) {
    suggestions.push(
      'Remove or rename duplicate declarations to avoid scope conflicts.'
    );
  }


  if (!suggestions.length) {
    suggestions.push(
      'No additional development work was identified by the extension checks.'
    );
  }


  return suggestions.slice(0, 6);
}


function AX_addIssueIfMissing_(
  report,
  severity,
  file,
  line,
  rule,
  message
) {
  if (!report || !Array.isArray(report.issues)) {
    return;
  }


  var exists = report.issues.some(function(issue) {
    return issue.file === file &&
      issue.line === line &&
      issue.rule === rule &&
      issue.message === message;
  });


  if (!exists) {
    report.issues.push({
      severity: severity,
      file: file,
      line: line || 1,
      rule: rule,
      message: message
    });
  }
}


function AX_getGlobalAllowlist_() {
  return new Set([
    'Array', 'BigInt', 'Boolean', 'Date', 'Error', 'Function', 'Infinity',
    'JSON', 'Map', 'Math', 'Number', 'Object', 'parseFloat', 'parseInt',
    'Promise', 'RangeError', 'ReferenceError', 'Reflect', 'RegExp', 'Set',
    'String', 'SyntaxError', 'TypeError', 'URIError', 'Uint8Array',
    'WeakMap', 'WeakSet', 'decodeURI', 'decodeURIComponent', 'encodeURI',
    'encodeURIComponent', 'isFinite', 'isNaN', 'Browser', 'CalendarApp',
    'CacheService', 'CardService', 'Charts', 'ContactsApp',
    'ContentService', 'DocumentApp', 'DriveApp', 'FormApp', 'GmailApp',
    'GroupsApp', 'HtmlService', 'Jdbc', 'LanguageApp', 'LockService',
    'Logger', 'MailApp', 'Maps', 'PropertiesService', 'ScriptApp',
    'Session', 'SlidesApp', 'SpreadsheetApp', 'UrlFetchApp', 'Utilities',
    'XmlService', 'YouTube', 'console'
  ]);
}


function AX_isServerFile_(file) {
  return Boolean(file && (
    file.type === 'SERVER_JS' ||
    /\.gs$/i.test(String(file.name || ''))
  ));
}


function AX_isHtmlFile_(file) {
  return Boolean(file && (
    file.type === 'HTML' ||
    /\.html?$/i.test(String(file.name || ''))
  ));
}


function AX_baseName_(name) {
  return String(name || '')
    .replace(/\.(gs|html?)$/i, '')
    .trim()
    .toLowerCase();
}


function AX_normalizeHtmlName_(name) {
  return String(name || '')
    .replace(/\.html?$/i, '')
    .trim()
    .toLowerCase();
}


function AX_isControlWord_(name) {
  return new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function'
  ]).has(name);
}


function AX_lineNumberAtIndex_(source, index) {
  return String(source || '')
    .substring(0, Math.max(0, index))
    .split(/\r?\n/).length;
}


function AX_getSourceLine_(file, lineNumber) {
  var lines = String(file && file.source || '').split(/\r?\n/);
  return lines[Math.max(0, Number(lineNumber || 1) - 1)] || '';
}

function AX_isDocumentationHtmlExampleLine_(line) {
  var text = String(line || '');


  return /['"]FileName['"]/i.test(text) ||
    /Recognised references include|Recognized references include/i.test(text);
}

function AX_applyAuditExtensions_(files, allFunctions, report) {
  files = Array.isArray(files) ? files : [];
  report = report || {};

  if (!Array.isArray(report.issues)) {
    report.issues = [];
  }

  var discoveredFunctions = allFunctions;

  if (!(discoveredFunctions instanceof Set)) {
    discoveredFunctions = AX_collectAllFunctions_(files);
  }

  AX_checkHtmlServerCallbacks_(
    files,
    discoveredFunctions,
    report
  );

  AX_checkMissingHtmlReferences_(
    files,
    report
  );

  AX_removeKnownUnresolvedCalls_(
    discoveredFunctions,
    report
  );

  AX_removeAuditSelfFindings_(
    files,
    report
  );
}

