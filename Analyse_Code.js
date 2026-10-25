/* Audit.gs */

var AUDIT_CONFIG = {
  reportRecipient: 'keconn.robert@gmail.com',
  reportSubjectPrefix: 'Application Audit Report',
  bootstrapBaselineProperty: 'AUDIT_BOOTSTRAP_SHA256',
  maxIssues: 250,
  codePdfMaxPages: 15,
  codePdfLinesPerPage: 60
};

function runApplicationAudit() {
  var report = {
    auditVersion: '4.0.0',
    generatedAt: new Date().toISOString(),
    status: 'PASS',
    summary: {
      filesScanned: 0,
      serverFiles: 0,
      htmlFiles: 0,
      manifestFiles: 0,
      totalFindings: 0,
      applicationFindings: 0,
      auditToolFindings: 0,
      critical: 0,
      high: 0,
      medium: 0,
      review: 0,
      warning: 0,
      informational: 0,
      errors: 0,
      warnings: 0,
      blockingFindings: 0
    },
    files: [],
    issues: [],
    nextActions: [],
    suggestedDevelopmentWork: [],
    reportEmailSent: false,
    reportEmailRecipient: AUDIT_CONFIG.reportRecipient,
    codePdfAttached: false
  };

  try {
    /*
     * The old code incorrectly ended this statement with:
     *
     * var project = getProjectContent_();AX
     *
     * The undeclared AX token has been removed.
     */
    var project = getProjectContent_();

    var files = (project.files || [])
      .filter(function(file) {
        return file && file.name;
      })
      .map(function(file) {
        return {
          name: String(file.name),
          type: String(file.type || ''),
          source: String(file.source || '')
        };
      });

    report.summary.filesScanned = files.length;

    var bootstrap = files.find(function(file) {
      return /^(bootstrap|bootstrap\.gs)$/i.test(file.name);
    });

    if (!bootstrap) {
      addIssue_(
        report,
        'ERROR',
        'Bootstrap.gs',
        1,
        'BOOTSTRAP_MISSING',
        'Bootstrap.gs was not found.'
      );
    } else {
      verifyBootstrapIntegrity_(bootstrap, report);
    }

    var manifest = files.find(function(file) {
      return file.type === 'JSON' ||
        /^appsscript\.json$/i.test(file.name);
    });

    if (manifest) {
      report.summary.manifestFiles++;
      inspectManifest_(manifest, report);
    }

    var definedFunctions = collectDefinedFunctions_(files);

    files.forEach(function(file) {
      if (isServerFile_(file)) {
        report.summary.serverFiles++;
        inspectServerFile_(file, definedFunctions, report);
      } else if (isHtmlFile_(file)) {
        report.summary.htmlFiles++;
        inspectHtmlFile_(file, report);
      }

      report.files.push({
        name: file.name,
        type: file.type,
        lineCount: countLines_(file.source),
        hasSource: Boolean(file.source.trim())
      });
    });

    /*
     * Processing order:
     *
     * 1. Original Audit.gs analysis
     * 2. AuditExtensions analysis
     * 3. Project analysis
     * 4. Hardening analysis and replacement generation
     * 5. Suggested development work
     * 6. Final normalization
     * 7. Final deduplication
     * 8. Summary and status calculation
     */
    if (typeof AX_applyAuditExtensions_ === 'function') {
      AX_applyAuditExtensions_(files, definedFunctions, report);
    }

    if (typeof AX_applyProjectAnalysis_ === 'function') {
      AX_applyProjectAnalysis_(files, report);
    }

    if (typeof AH_applyHardeningGeneration_ === 'function') {
      AH_applyHardeningGeneration_(files, report);
    }

    if (typeof AX_buildSuggestedDevelopmentWork_ === 'function') {
      report.suggestedDevelopmentWork =
        AX_buildSuggestedDevelopmentWork_(files, report);
    }

  } catch (error) {
    addIssue_(
      report,
      'ERROR',
      'Audit.gs',
      1,
      'AUDIT_EXECUTION_FAILURE',
      String(error && error.message || error)
    );
  }

  limitIssues_(report);

  /*
   * This is the final normalization and deduplication point.
   * It runs after all analysis and hardening functions.
   */
  report.issues = AX_deduplicateFindings_(
    Array.isArray(report.issues) ? report.issues : []
  );

  updateSummaryAndStatus_(report);
  buildNextActions_(report);

  var delivery = sendAuditReport_(report);

  report.reportEmailSent = delivery.sent;
  report.codePdfAttached = delivery.codePdfAttached;

  if (!delivery.sent) {
    addIssue_(
      report,
      'ERROR',
      'Audit.gs',
      1,
      'REPORT_EMAIL_FAILED',
      delivery.error || 'The audit report could not be emailed.'
    );

    report.issues = AX_deduplicateFindings_(report.issues);
    updateSummaryAndStatus_(report);
  }

  return report;
}

function getProjectContent_() {
  var response = UrlFetchApp.fetch(
    'https://script.googleapis.com/v1/projects/' +
    encodeURIComponent(ScriptApp.getScriptId()) + '/content',
    {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
      },
      muteHttpExceptions: true
    }
  );

  var status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      'Project content request failed: HTTP ' + status
    );
  }

  return JSON.parse(response.getContentText());
}

function verifyBootstrapIntegrity_(file, report) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    file.source,
    Utilities.Charset.UTF_8
  );

  var hash = digest.map(function(byte) {
    byte = byte < 0 ? byte + 256 : byte;
    return ('0' + byte.toString(16)).slice(-2);
  }).join('');

  var properties = PropertiesService.getScriptProperties();

  var baseline = properties.getProperty(
    AUDIT_CONFIG.bootstrapBaselineProperty
  );

  if (!baseline) {
    properties.setProperty(
      AUDIT_CONFIG.bootstrapBaselineProperty,
      hash
    );

    addIssue_(
      report,
      'INFO',
      file.name,
      1,
      'BOOTSTRAP_BASELINE_CREATED',
      'Bootstrap.gs has been recorded as immutable.'
    );
  } else if (baseline !== hash) {
    addIssue_(
      report,
      'ERROR',
      file.name,
      1,
      'BOOTSTRAP_CHANGED',
      'Bootstrap.gs differs from its approved immutable baseline.'
    );
  }
}

function inspectServerFile_(file, functions, report) {
  var source = file.source;

  if (!source.trim()) {
    addIssue_(
      report,
      'WARNING',
      file.name,
      1,
      'EMPTY_FILE',
      'The server-side file contains no source.'
    );
    return;
  }

  try {
    new Function(source);
  } catch (error) {
    addIssue_(
      report,
      'ERROR',
      file.name,
      getErrorLine_(error),
      'JAVASCRIPT_SYNTAX',
      'The file contains JavaScript syntax that cannot be compiled.'
    );
  }

  inspectBraceBalance_(file, report);
  inspectDuplicateDeclarations_(file, report);

  /*
   * Tracks lexical regions across source lines so that browser API names
   * inside strings, template literal text, and comments are not reported.
   */
  var lexicalState = {
    mode: 'code',
    quote: '',
    returnMode: 'code',
    escaped: false,
    blockComment: false,
    templateExpressionDepth: 0
  };

  function maskNonExecutableText_(line) {
    var masked = [];
    var i = 0;

    while (i < line.length) {
      var current = line.charAt(i);
      var next = line.charAt(i + 1);

      if (lexicalState.blockComment) {
        masked.push(' ');

        if (current === '*' && next === '/') {
          masked.push(' ');
          lexicalState.blockComment = false;
          i += 2;
        } else {
          i += 1;
        }

        continue;
      }

      if (lexicalState.mode === 'string') {
        masked.push(' ');

        if (lexicalState.escaped) {
          lexicalState.escaped = false;
        } else if (current === '\\') {
          lexicalState.escaped = true;
        } else if (current === lexicalState.quote) {
          lexicalState.mode = lexicalState.returnMode;
          lexicalState.quote = '';
        }

        i += 1;
        continue;
      }

      if (lexicalState.mode === 'template') {
        masked.push(' ');

        if (lexicalState.escaped) {
          lexicalState.escaped = false;
          i += 1;
          continue;
        }

        if (current === '\\') {
          lexicalState.escaped = true;
          i += 1;
          continue;
        }

        if (current === '`') {
          lexicalState.mode = lexicalState.returnMode;
          i += 1;
          continue;
        }

        if (current === '$' && next === '{') {
          masked.push(' ');
          lexicalState.mode = 'templateExpression';
          lexicalState.templateExpressionDepth = 1;
          i += 2;
          continue;
        }

        i += 1;
        continue;
      }

      if (current === '/' && next === '/') {
        while (i < line.length) {
          masked.push(' ');
          i += 1;
        }

        continue;
      }

      if (current === '/' && next === '*') {
        masked.push(' ');
        masked.push(' ');
        lexicalState.blockComment = true;
        i += 2;
        continue;
      }

      if (current === '\'' || current === '"') {
        var previousModeForString = lexicalState.mode;

        masked.push(' ');
        lexicalState.mode = 'string';
        lexicalState.quote = current;
        lexicalState.returnMode =
          previousModeForString === 'templateExpression'
            ? 'templateExpression'
            : 'code';
        lexicalState.escaped = false;
        i += 1;
        continue;
      }

      if (current === '`') {
        var previousModeForTemplate = lexicalState.mode;

        masked.push(' ');
        lexicalState.mode = 'template';
        lexicalState.returnMode =
          previousModeForTemplate === 'templateExpression'
            ? 'templateExpression'
            : 'code';
        lexicalState.escaped = false;
        i += 1;
        continue;
      }

      if (lexicalState.mode === 'templateExpression') {
        if (current === '{') {
          lexicalState.templateExpressionDepth += 1;
        } else if (current === '}') {
          lexicalState.templateExpressionDepth -= 1;

          if (lexicalState.templateExpressionDepth === 0) {
            lexicalState.mode = 'template';
          }
        }
      }

      masked.push(current);
      i += 1;
    }

    return masked.join('');
  }

  source.split(/\r?\n/).forEach(function(line, index) {
    if (/\b(TODO|FIXME|IMPLEMENT|INSERT_CODE|PLACEHOLDER)\b/i.test(line)) {
      addIssue_(
        report,
        'WARNING',
        file.name,
        index + 1,
        'PLACEHOLDER_FOUND',
        'The file contains a development placeholder.'
      );
    }

    if (
      /function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{\s*\}/.test(line) ||
      /=>\s*\{\s*\}/.test(line)
    ) {
      addIssue_(
        report,
        'WARNING',
        file.name,
        index + 1,
        'EMPTY_FUNCTION',
        'An empty function was found.'
      );
    }

    if (/for\s+each\s*\(/i.test(line)) {
      addIssue_(
        report,
        'ERROR',
        file.name,
        index + 1,
        'V8_INCOMPATIBILITY',
        'The legacy for each syntax is incompatible with V8.'
      );
    }

    var executableCode = maskNonExecutableText_(line);

    if (/\b(window|document)\s*\./.test(executableCode)) {
      addIssue_(
        report,
        'WARNING',
        file.name,
        index + 1,
        'SERVER_BROWSER_API',
        'Browser-only APIs appear in server-side code.'
      );
    }
  });

  inspectLikelyUnresolvedCalls_(file, functions, report);
}

function inspectHtmlFile_(file, report) {
  var source = file.source;

  if (!source.trim()) {
    addIssue_(
      report,
      'WARNING',
      file.name,
      1,
      'EMPTY_HTML',
      'The HTML file contains no content.'
    );
    return;
  }

  source.split(/\r?\n/).forEach(function(line, index) {
    if (/\b(TODO|FIXME|IMPLEMENT|INSERT_CODE|PLACEHOLDER)\b/i.test(line)) {
      addIssue_(
        report,
        'WARNING',
        file.name,
        index + 1,
        'PLACEHOLDER_FOUND',
        'The HTML file contains a development placeholder.'
      );
    }
  });

  var stack = [];

  var ignored = new Set([
    'meta', 'link', 'input', 'img', 'br', 'hr', 'area', 'base',
    'col', 'embed', 'param', 'source', 'track', 'wbr', 'doctype'
  ]);

  var pattern = /<\/?([A-Za-z][\w-]*)(?:\s[^<>]*?)?\/?>/g;
  var match;

  while ((match = pattern.exec(source)) !== null) {
    var tag = match[1].toLowerCase();
    var token = match[0];
    var line = countLines_(
      source.substring(0, match.index)
    );

    if (ignored.has(tag) || /\/>$/.test(token)) {
      continue;
    }

    if (/^<\//.test(token)) {
      if (stack.pop() !== tag) {
        addIssue_(
          report,
          'ERROR',
          file.name,
          line,
          'HTML_TAG_MISMATCH',
          'HTML tags are incorrectly nested or closed.'
        );
      }
    } else {
      stack.push(tag);
    }
  }

  if (stack.length) {
    addIssue_(
      report,
      'ERROR',
      file.name,
      countLines_(source),
      'HTML_UNCLOSED_TAG',
      'One or more HTML tags are not closed.'
    );
  }
}

function inspectBraceBalance_(file, report) {
  var source = String(file && file.source || '');
  var stack = [];
  var state = 'CODE';
  var quote = '';
  var escaped = false;

  for (var i = 0; i < source.length; i++) {
    var c = source.charAt(i);
    var n = source.charAt(i + 1);

    if (state === 'LINE_COMMENT') {
      if (c === '\n') {
        state = 'CODE';
      }
      continue;
    }

    if (state === 'BLOCK_COMMENT') {
      if (c === '*' && n === '/') {
        state = 'CODE';
        i++;
      }
      continue;
    }

    if (state === 'STRING') {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === quote) {
        state = 'CODE';
      }
      continue;
    }

    if (state === 'TEMPLATE') {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '`') {
        state = 'CODE';
      }
      continue;
    }

    if (state === 'REGEXP') {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '[') {
        state = 'REGEXP_CLASS';
      } else if (c === '/') {
        state = 'CODE';
      }
      continue;
    }

    if (state === 'REGEXP_CLASS') {
      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === ']') {
        state = 'REGEXP';
      }
      continue;
    }

    if (c === '/' && n === '/') {
      state = 'LINE_COMMENT';
      i++;
      continue;
    }

    if (c === '/' && n === '*') {
      state = 'BLOCK_COMMENT';
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      state = 'STRING';
      continue;
    }

    if (c === '`') {
      state = 'TEMPLATE';
      continue;
    }

    if (c === '/' && AX_canStartRegexp_(source, i)) {
      state = 'REGEXP';
      continue;
    }

    if (c === '(' || c === '[' || c === '{') {
      stack.push({
        character: c,
        index: i
      });
      continue;
    }

    if (c === ')' || c === ']' || c === '}') {
      var expected = c === ')' ? '(' : c === ']' ? '[' : '{';
      var opening = stack.pop();

      if (!opening || opening.character !== expected) {
        addIssue_(
          report,
          'ERROR',
          file.name,
          lineNumberAtIndex_(source, i),
          'UNMATCHED_BRACE',
          'An unmatched bracket, parenthesis, or brace was found.'
        );
        return;
      }
    }
  }

  if (stack.length) {
    var last = stack[stack.length - 1];

    addIssue_(
      report,
      'ERROR',
      file.name,
      lineNumberAtIndex_(source, last.index),
      'UNMATCHED_BRACE',
      'An opening bracket, parenthesis, or brace is not closed.'
    );
  }
}

function AX_canStartRegexp_(source, index) {
  var before = String(source || '')
    .substring(0, index)
    .replace(/\s+$/g, '');

  if (!before) {
    return true;
  }

  return /(?:[=(,:;!&|?{}\[\]]|=>|\b(?:return|case|throw|else|do|typeof|void|delete|new|in|of))$/
    .test(before);
}

function stripNonCode_(source) {
  var text = String(source || '');
  var output = '';
  var state = 'CODE';
  var quote = '';
  var escaped = false;

  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    var n = text.charAt(i + 1);

    if (state === 'LINE_COMMENT') {
      output += c === '\n' ? '\n' : ' ';
      if (c === '\n') {
        state = 'CODE';
      }
      continue;
    }

    if (state === 'BLOCK_COMMENT') {
      if (c === '*' && n === '/') {
        output += ' ';
        i++;
        state = 'CODE';
      } else {
        output += c === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (state === 'STRING') {
      output += c === '\n' ? '\n' : ' ';

      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === quote) {
        state = 'CODE';
      }

      continue;
    }

    if (state === 'TEMPLATE') {
      output += c === '\n' ? '\n' : ' ';

      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '`') {
        state = 'CODE';
      }

      continue;
    }

    if (state === 'REGEXP') {
      output += ' ';

      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === '[') {
        state = 'REGEXP_CLASS';
      } else if (c === '/') {
        state = 'CODE';
      }

      continue;
    }

    if (state === 'REGEXP_CLASS') {
      output += ' ';

      if (escaped) {
        escaped = false;
      } else if (c === '\\') {
        escaped = true;
      } else if (c === ']') {
        state = 'REGEXP';
      }

      continue;
    }

    if (c === '/' && n === '/') {
      output += ' ';
      i++;
      state = 'LINE_COMMENT';
      continue;
    }

    if (c === '/' && n === '*') {
      output += ' ';
      i++;
      state = 'BLOCK_COMMENT';
      continue;
    }

    if (c === '"' || c === "'") {
      output += ' ';
      quote = c;
      state = 'STRING';
      continue;
    }

    if (c === '`') {
      output += ' ';
      state = 'TEMPLATE';
      continue;
    }

    if (c === '/' && AX_canStartRegexp_(text, i)) {
      output += ' ';
      state = 'REGEXP';
      continue;
    }

    output += c;
  }

  return output;
}

function inspectDuplicateDeclarations_(file, report) {
  var source = stripNonCode_(file.source);
  var declarations = Object.create(null);
  var scopeStack = ['GLOBAL'];
  var events = [];
  var nextScopeId = 1;
  var eventIndex = 0;
  var match;

  var functionPattern =
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;

  var declarationPattern =
    /\b(?:var|let|const|class)\s+([A-Za-z_$][\w$]*)/g;

  while ((match = functionPattern.exec(source)) !== null) {
    events.push({
      index: match.index,
      type: 'FUNCTION',
      name: match[1]
    });
  }

  while ((match = declarationPattern.exec(source)) !== null) {
    events.push({
      index: match.index,
      type: 'DECLARATION',
      name: match[1]
    });
  }

  events.sort(function(a, b) {
    return a.index - b.index;
  });

  for (var i = 0; i < source.length; i++) {
    while (
      eventIndex < events.length &&
      events[eventIndex].index === i
    ) {
      var event = events[eventIndex];
      var scope = scopeStack.join('/');

      if (event.type === 'FUNCTION') {
        var functionKey = scope + ':FUNCTION:' + event.name;

        if (declarations[functionKey]) {
          addIssue_(
            report,
            'WARNING',
            file.name,
            lineNumberAtIndex_(source, event.index),
            'DUPLICATE_DECLARATION',
            'The function "' + event.name +
            '" is declared more than once in the same scope.'
          );
        }

        declarations[functionKey] = true;
      } else {
        var declarationKey = scope + ':' + event.name;

        if (declarations[declarationKey]) {
          addIssue_(
            report,
            'WARNING',
            file.name,
            lineNumberAtIndex_(source, event.index),
            'DUPLICATE_DECLARATION',
            'The declaration "' + event.name +
            '" appears more than once in the same scope.'
          );
        }

        declarations[declarationKey] = true;
      }

      eventIndex++;
    }

    var character = source.charAt(i);

    if (character === '{') {
      scopeStack.push('BLOCK' + nextScopeId++);
    } else if (character === '}') {
      if (scopeStack.length > 1) {
        scopeStack.pop();
      }
    }
  }
}

function inspectLikelyUnresolvedCalls_(file, functions, report) {
  var source = stripNonCode_(file.source);
  var known = getGlobalAllowlist_();
  var local = collectLocalNames_(file.source);
  var pattern = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  var match;

  while ((match = pattern.exec(source)) !== null) {
    var name = match[1];

    if (
      known.has(name) ||
      functions.has(name) ||
      local.has(name) ||
      /^(if|for|while|switch|catch|function|with|return|typeof|new)$/.test(name) ||
      /^(b|fn|cb|callback|handler|resolve|reject)$/.test(name)
    ) {
      continue;
    }

    addIssue_(
      report,
      'INFO',
      file.name,
      lineNumberAtIndex_(source, match.index),
      'POSSIBLE_UNRESOLVED_CALL',
      'Possible unresolved function "' + name +
      '". Confirm that it is declared, imported, triggered, or provided by Apps Script.'
    );
  }
}

function collectDefinedFunctions_(files) {
  var result = new Set();

  (files || []).forEach(function(file) {
    if (!isServerFile_(file)) {
      return;
    }

    var source = file.source;

    [
      /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
      /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g,
      /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
      /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm
    ].forEach(function(pattern) {
      var match;

      while ((match = pattern.exec(source)) !== null) {
        if (!isControlWord_(match[1])) {
          result.add(match[1]);
        }
      }
    });
  });

  return result;
}

function collectLocalNames_(source) {
  var names = new Set();
  var clean = stripNonCode_(source);
  var match;

  var declarations =
    /\b(?:var|let|const|function|class|catch)\s+([A-Za-z_$][\w$]*)/g;

  while ((match = declarations.exec(clean)) !== null) {
    names.add(match[1]);
  }

  var parameters =
    /\(([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)?\)\s*(?:=>|\{)/g;

  while ((match = parameters.exec(clean)) !== null) {
    String(match[1] || '').split(',').forEach(function(name) {
      name = name.trim();

      if (name) {
        names.add(name);
      }
    });
  }

  return names;
}

function getGlobalAllowlist_() {
  return new Set([
    'Array', 'BigInt', 'Boolean', 'Date', 'Error', 'Function',
    'Infinity', 'JSON', 'Map', 'Math', 'Number', 'Object',
    'parseFloat', 'parseInt', 'Promise', 'RangeError',
    'ReferenceError', 'Reflect', 'RegExp', 'Set', 'String',
    'SyntaxError', 'TypeError', 'URIError', 'Uint8Array',
    'WeakMap', 'WeakSet', 'decodeURI', 'decodeURIComponent',
    'encodeURI', 'encodeURIComponent', 'isFinite', 'isNaN',
    'Browser', 'CalendarApp', 'CacheService', 'CardService',
    'Charts', 'ContactsApp', 'ContentService', 'DocumentApp',
    'DriveApp', 'FormApp', 'GmailApp', 'GroupsApp', 'HtmlService',
    'Jdbc', 'LanguageApp', 'LockService', 'Logger', 'MailApp',
    'Maps', 'PropertiesService', 'ScriptApp', 'Session',
    'SlidesApp', 'SpreadsheetApp', 'UrlFetchApp', 'Utilities',
    'XmlService', 'YouTube', 'console'
  ]);
}

function inspectManifest_(file, report) {
  try {
    var manifest = JSON.parse(file.source);

    if (
      manifest.runtimeVersion &&
      manifest.runtimeVersion !== 'V8'
    ) {
      addIssue_(
        report,
        'ERROR',
        file.name,
        1,
        'NON_V8_RUNTIME',
        'The project does not specify the V8 runtime.'
      );
    }

    if (!manifest.timeZone) {
      addIssue_(
        report,
        'WARNING',
        file.name,
        1,
        'TIME_ZONE_MISSING',
        'The manifest does not specify a project time zone.'
      );
    }
  } catch (error) {
    addIssue_(
      report,
      'ERROR',
      file.name,
      1,
      'MANIFEST_SYNTAX',
      'The Apps Script manifest is not valid JSON.'
    );
  }
}

function addIssue_(report, severity, file, line, rule, message) {
  if (!report || !Array.isArray(report.issues)) {
    return;
  }

  var candidate = {
    severity: severity,
    file: file,
    line: line || 1,
    rule: rule,
    message: message,
    title: rule,
    status: 'OPEN',
    evidence: '',
    recommendedAction: '',
    findingOrigin: 'audit-tool',
    classification: 'audit-tool',
    confidence: 'medium',
    automaticReplacementAllowed: false
  };

  var key = AX_getFindingKey_(candidate);

  var exists = report.issues.some(function(issue) {
    return AX_getFindingKey_(issue) === key;
  });

  if (!exists) {
    report.issues.push(candidate);
  }
}

function limitIssues_(report) {
  return;
}

function AX_normalizeFindingText_(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function AX_normalizeSeverity_(severity) {
  var value = AX_normalizeFindingText_(severity).toUpperCase();

  if (value === 'ERROR') return 'ERROR';
  if (value === 'CRITICAL') return 'CRITICAL';
  if (value === 'HIGH') return 'HIGH';
  if (value === 'MEDIUM') return 'MEDIUM';
  if (value === 'REVIEW') return 'REVIEW';
  if (value === 'WARNING' || value === 'WARN') return 'WARNING';

  if (
    value === 'INFO' ||
    value === 'INFORMATIONAL' ||
    value === 'INFORMATION'
  ) {
    return 'INFO';
  }

  return value || 'INFO';
}

function AX_isAuditToolFinding_(finding) {
  if (!finding) {
    return false;
  }

  if (
    AX_normalizeFindingText_(finding.classification) === 'audit-tool'
  ) {
    return true;
  }

  var origin = AX_normalizeFindingText_(
    finding.findingOrigin
  );

  if (
    origin === 'audit' ||
    origin === 'audit-extension' ||
    origin === 'audit-tool'
  ) {
    return true;
  }

  var file = String(finding.file || '').toLowerCase();

  return (
    /^audit(?:\.gs)?$/.test(file) ||
    /^auditextensions?(?:\.gs)?$/.test(file) ||
    /^audithardening(?:\.gs)?$/.test(file) ||
    /^auditprojectanalysis(?:\.gs)?$/.test(file) ||
    /^auditproject(?:analysis)?(?:\.gs)?$/.test(file)
  );
}

function AX_classifyFinding_(finding) {
  if (!finding) {
    return 'application';
  }

  if (AX_isAuditToolFinding_(finding)) {
    return 'audit-tool';
  }

  if (finding.classification) {
    return String(finding.classification);
  }

  var file = String(finding.file || '').toLowerCase();

  if (/\.html?$/.test(file)) {
    return 'application-frontend';
  }

  if (/\.gs$/.test(file)) {
    return 'application-server';
  }

  return 'application';
}

function AX_normalizeFinding_(finding) {
  finding = finding || {};

  var normalized = {};

  Object.keys(finding).forEach(function(key) {
    normalized[key] = finding[key];
  });

  normalized.severity = AX_normalizeSeverity_(
    finding.severity
  );

  normalized.rule = String(
    finding.rule || 'UNSPECIFIED_RULE'
  );

  normalized.file = String(finding.file || '');
  normalized.line = Number(finding.line) || 1;
  normalized.message = String(finding.message || '');
  normalized.title = String(
    finding.title || normalized.rule
  );

  normalized.status = String(
    finding.status || 'OPEN'
  );

  normalized.evidence = String(
    finding.evidence || ''
  );

  normalized.recommendedAction = String(
    finding.recommendedAction || ''
  );

  normalized.findingOrigin = String(
    finding.findingOrigin || 'audit'
  );

  normalized.classification = AX_classifyFinding_(
    normalized
  );

  normalized.confidence = String(
    finding.confidence || 'medium'
  );

  /*
   * Replacement specifications are review-only.
   * Automatic replacement is always disabled.
   */
  normalized.automaticReplacementAllowed = false;

  return normalized;
}

function AX_getFindingKey_(finding) {
  finding = AX_normalizeFinding_(finding);

  return [
    AX_normalizeFindingText_(finding.rule),
    AX_normalizeFindingText_(finding.file),
    AX_normalizeFindingText_(finding.line),
    AX_normalizeFindingText_(finding.message)
  ].join('|');
}

function AX_deduplicateFindings_(findings) {
  var unique = [];
  var seen = Object.create(null);

  (Array.isArray(findings) ? findings : []).forEach(
    function(finding) {
      var normalized = AX_normalizeFinding_(finding);
      var key = AX_getFindingKey_(normalized);

      if (seen[key]) {
        return;
      }

      seen[key] = true;
      unique.push(normalized);
    }
  );

  return unique;
}

function AX_isBlockingFinding_(finding) {
  var severity = AX_normalizeSeverity_(
    finding && finding.severity
  );

  return (
    severity === 'CRITICAL' ||
    severity === 'ERROR' ||
    severity === 'HIGH'
  );
}

function updateSummaryAndStatus_(report) {
  if (!report) {
    return;
  }

  var previousSummary = report.summary || {};

  report.issues = AX_deduplicateFindings_(
    Array.isArray(report.issues) ? report.issues : []
  );

  var summary = {
    /*
     * These fields must be preserved. The previous implementation
     * discarded them, which produced "Files scanned: undefined".
     */
    filesScanned: Number(previousSummary.filesScanned) || 0,
    serverFiles: Number(previousSummary.serverFiles) || 0,
    htmlFiles: Number(previousSummary.htmlFiles) || 0,
    manifestFiles: Number(previousSummary.manifestFiles) || 0,

    totalFindings: report.issues.length,
    applicationFindings: 0,
    auditToolFindings: 0,
    critical: 0,
    high: 0,
    medium: 0,
    review: 0,
    warning: 0,
    informational: 0,
    errors: 0,
    warnings: 0,
    blockingFindings: 0
  };

  report.issues.forEach(function(issue) {
    var normalized = AX_normalizeFinding_(issue);

    if (normalized.classification === 'audit-tool') {
      summary.auditToolFindings++;
    } else {
      summary.applicationFindings++;
    }

    switch (normalized.severity) {
      case 'CRITICAL':
        summary.critical++;
        break;

      case 'HIGH':
        summary.high++;
        break;

      case 'MEDIUM':
        summary.medium++;
        break;

      case 'REVIEW':
        summary.review++;
        break;

      case 'WARNING':
        summary.warning++;
        summary.warnings++;
        break;

      case 'INFO':
        summary.informational++;
        break;

      case 'ERROR':
        summary.errors++;
        break;
    }

    if (AX_isBlockingFinding_(normalized)) {
      summary.blockingFindings++;
    }
  });

  report.summary = summary;

  if (
    summary.critical > 0 ||
    summary.errors > 0 ||
    summary.high > 0
  ) {
    report.status = 'BLOCKED';
  } else if (
    summary.medium > 0 ||
    summary.review > 0 ||
    summary.warning > 0 ||
    summary.informational > 0
  ) {
    report.status = 'PASS_WITH_WARNINGS';
  } else {
    report.status = 'PASS';
  }
}

function buildNextActions_(report) {
  report.nextActions = [];

  if (
    report.summary.errors ||
    report.summary.critical ||
    report.summary.high
  ) {
    report.nextActions.push(
      'Resolve all blocking findings before deployment.'
    );
  }

  if (report.issues.some(function(issue) {
    return issue.rule === 'BOOTSTRAP_CHANGED';
  })) {
    report.nextActions.push(
      'Restore Bootstrap.gs from its approved immutable baseline.'
    );
  }

  if (report.issues.some(function(issue) {
    return issue.rule === 'POSSIBLE_UNRESOLVED_CALL';
  })) {
    report.nextActions.push(
      'Review unresolved calls against project functions, libraries, triggers, and Apps Script services.'
    );
  }

  if (!report.nextActions.length) {
    report.nextActions.push(
      'No blocking findings. Continue development and testing.'
    );
  }
}

function sendAuditReport_(report) {
  try {
    var attachments = [];
    var codePdf = buildCurrentCodePdf_();

    if (codePdf) {
      attachments.push(codePdf);
    }

    var options = {
      to: AUDIT_CONFIG.reportRecipient,
      subject: AUDIT_CONFIG.reportSubjectPrefix +
        ' - ' + report.status,
      body: 'Application audit completed. Status: ' +
        report.status,
      htmlBody: buildAuditHtmlReport_(report)
    };

    if (attachments.length) {
      options.attachments = attachments;
    }

    MailApp.sendEmail(options);

    return {
      sent: true,
      codePdfAttached: Boolean(codePdf)
    };
  } catch (error) {
    return {
      sent: false,
      codePdfAttached: false,
      error: String(error && error.message || error)
    };
  }
}

function buildCurrentCodePdf_() {
  var project = getProjectContent_();

  var files = (project.files || []).filter(function(file) {
    return file &&
      /^(audit|auditextensions|audithardening|auditprojectanalysis)(\.gs)?$/i
        .test(String(file.name || ''));
  });

  if (!files.length) {
    return null;
  }

  var html = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<style>',
    '@page{size:A4;margin:14mm}',
    'body{font-family:monospace;font-size:8pt;white-space:pre-wrap}',
    'h1,h2{font-family:Arial;white-space:normal}',
    '.page{page-break-after:always}',
    '.page:last-child{page-break-after:auto}',
    '</style></head><body>'
  ].join('');

  var pageCount = 0;

  files.forEach(function(file) {
    var lines = String(file.source || '').split(/\r?\n/);

    for (
      var start = 0;
      start < lines.length;
      start += AUDIT_CONFIG.codePdfLinesPerPage
    ) {
      if (pageCount >= AUDIT_CONFIG.codePdfMaxPages) {
        break;
      }

      var end = Math.min(
        start + AUDIT_CONFIG.codePdfLinesPerPage,
        lines.length
      );

      html += '<section class="page">';
      html += '<h2>' + escapeHtml_(file.name) +
        ' — lines ' + (start + 1) + '-' + end + '</h2>';
      html += escapeHtml_(
        lines.slice(start, end).join('\n')
      );
      html += '</section>';

      pageCount++;
    }
  });

  html += '</body></html>';

  return Utilities.newBlob(
    html,
    'text/html',
    'Audit source files.html'
  ).getAs(MimeType.PDF).setName(
    'Audit source files.pdf'
  );
}

function buildAuditHtmlReport_(report) {
  report = report || {};

  var summary = report.summary || {};
  var files = Array.isArray(report.files) ? report.files : [];
  var issues = Array.isArray(report.issues) ? report.issues : [];
  var nextActions = Array.isArray(report.nextActions)
    ? report.nextActions
    : [];
  var suggestedWork = Array.isArray(report.suggestedDevelopmentWork)
    ? report.suggestedDevelopmentWork
    : [];

  var html = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<style>',
    'body{font-family:Arial;color:#222}',
    'table{border-collapse:collapse;width:100%;margin-bottom:18px}',
    'th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}',
    'th{background:#eee}',
    '.CRITICAL,.ERROR,.HIGH{color:#b00020;font-weight:bold}',
    '.WARNING,.MEDIUM,.REVIEW{color:#936000;font-weight:bold}',
    '.INFO{color:#1769aa;font-weight:bold}',
    '.blocked{color:#b00020;font-weight:bold}',
    '.passWarnings{color:#936000;font-weight:bold}',
    '.pass{color:#1769aa;font-weight:bold}',
    '</style></head><body>',
    '<h2>Application Audit Report</h2>',
    '<p>',
    '<b>Status:</b> ' +
      escapeHtml_(report.status || 'UNKNOWN'),
    '<br><b>Generated:</b> ' +
      escapeHtml_(report.generatedAt || ''),
    '</p>',

    '<h3>Summary</h3>',
    '<table>',
    '<tr><th>Measure</th><th>Count</th></tr>',
    '<tr><td>Files scanned</td><td>' +
      escapeHtml_(summary.filesScanned || 0) +
      '</td></tr>',
    '<tr><td>Server files</td><td>' +
      escapeHtml_(summary.serverFiles || 0) +
      '</td></tr>',
    '<tr><td>HTML files</td><td>' +
      escapeHtml_(summary.htmlFiles || 0) +
      '</td></tr>',
    '<tr><td>Manifest files</td><td>' +
      escapeHtml_(summary.manifestFiles || 0) +
      '</td></tr>',
    '<tr><td>Total unique findings</td><td>' +
      escapeHtml_(summary.totalFindings || 0) +
      '</td></tr>',
    '<tr><td>Application findings</td><td>' +
      escapeHtml_(summary.applicationFindings || 0) +
      '</td></tr>',
    '<tr><td>Audit-tool findings</td><td>' +
      escapeHtml_(summary.auditToolFindings || 0) +
      '</td></tr>',
    '<tr><td>Blocking findings</td><td>' +
      escapeHtml_(summary.blockingFindings || 0) +
      '</td></tr>',
    '</table>',

    '<h3>Severity totals</h3>',
    '<table>',
    '<tr><th>Severity</th><th>Count</th></tr>',
    '<tr><td class="CRITICAL">CRITICAL</td><td>' +
      escapeHtml_(summary.critical || 0) +
      '</td></tr>',
    '<tr><td class="ERROR">ERROR</td><td>' +
      escapeHtml_(summary.errors || 0) +
      '</td></tr>',
    '<tr><td class="HIGH">HIGH</td><td>' +
      escapeHtml_(summary.high || 0) +
      '</td></tr>',
    '<tr><td class="MEDIUM">MEDIUM</td><td>' +
      escapeHtml_(summary.medium || 0) +
      '</td></tr>',
    '<tr><td class="REVIEW">REVIEW</td><td>' +
      escapeHtml_(summary.review || 0) +
      '</td></tr>',
    '<tr><td class="WARNING">WARNING</td><td>' +
      escapeHtml_(summary.warning || 0) +
      '</td></tr>',
    '<tr><td class="INFO">INFO</td><td>' +
      escapeHtml_(summary.informational || 0) +
      '</td></tr>',
    '</table>',

    '<h3>Files scanned</h3>',
    '<table><tr>',
    '<th>File</th><th>Type</th><th>Lines</th><th>Source</th></tr>'
  ].join('');

  files.forEach(function(file) {
    file = file || {};

    html += '<tr><td>' +
      escapeHtml_(file.name || '') +
      '</td><td>' +
      escapeHtml_(file.type || '') +
      '</td><td>' +
      escapeHtml_(file.lineCount || 0) +
      '</td><td>' +
      (file.hasSource ? 'Yes' : 'No') +
      '</td></tr>';
  });

  html += '</table><h3>Defects and findings</h3><table>' +
    '<tr><th>Severity</th><th>Classification</th>' +
    '<th>File</th><th>Line</th><th>Rule</th>' +
    '<th>Finding</th></tr>';

  if (!issues.length) {
    html += '<tr><td colspan="6">' +
      'No defects or findings were identified.</td></tr>';
  } else {
    issues.forEach(function(issue) {
      issue = issue || {};

      var severity = String(issue.severity || '');
      var classification = String(issue.classification || '');
      var fileName = String(issue.file || '');
      var line = issue.line == null ? '' : String(issue.line);
      var rule = String(issue.rule || '');
      var message = String(issue.message || '');

      html += '<tr><td class="' +
        escapeHtml_(severity) + '">' +
        escapeHtml_(severity) +
        '</td><td>' +
        escapeHtml_(classification) +
        '</td><td>' +
        escapeHtml_(fileName) +
        '</td><td>' +
        escapeHtml_(line) +
        '</td><td>' +
        escapeHtml_(rule) +
        '</td><td>' +
        escapeHtml_(message) +
        '</td></tr>';
    });
  }

  html += '</table><h3>Recommended next actions</h3><ul>';

  if (!nextActions.length) {
    html += '<li>No additional actions were identified.</li>';
  } else {
    nextActions.forEach(function(item) {
      html += '<li>' + escapeHtml_(item) + '</li>';
    });
  }

  html += '</ul><h3>Suggested development work</h3><ul>';

  if (!suggestedWork.length) {
    html += '<li>No additional development work was identified.</li>';
  } else {
    suggestedWork.forEach(function(item) {
      html += '<li>' + escapeHtml_(item) + '</li>';
    });
  }

  html += '</ul></body></html>';

  return html;
}


function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function countLines_(text) {
  return text
    ? String(text).split(/\r?\n/).length
    : 1;
}

function getErrorLine_(error) {
  var text = String(
    error && (error.stack || error.message) || ''
  );

  var match = text.match(
    /(?:anonymous|line)\D+(\d+)/i
  );

  return match ? Number(match[1]) : 1;
}

function lineNumberAtIndex_(source, index) {
  return String(source || '')
    .substring(0, Math.max(0, index))
    .split(/\r?\n/)
    .length;
}

function isServerFile_(file) {
  return Boolean(file && (
    file.type === 'SERVER_JS' ||
    /\.gs$/i.test(String(file.name || ''))
  ));
}

function isHtmlFile_(file) {
  return Boolean(file && (
    file.type === 'HTML' ||
    /\.html?$/i.test(String(file.name || ''))
  ));
}

function isControlWord_(name) {
  return new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function'
  ]).has(name);
}
/**
 * Compares two .gs files to find unique and overlapping functions.
 * Use this to resolve the naming conflict between API_TransactionLogic and APItransactionLogic.
 */
function auditTransactionFunctions() {
  const fileA = "API_TransactionLogic"; // The primary file
  const fileB = "APItransactionLogic"; // The duplicate/conflicting file
  
  const funcsA = getFunctionsFromFile(fileA);
  const funcsB = getFunctionsFromFile(fileB);
  
  const allFuncs = new Set([...funcsA, ...funcsB]);
  const uniqueToA = funcsA.filter(f => !funcsB.includes(f));
  const uniqueToB = funcsB.filter(f => !funcsA.includes(f));
  const overlaps = funcsA.filter(f => funcsB.includes(f));
  
  Logger.log(`--- ANALYSIS REPORT ---`);
  Logger.log(`Total Unique Functions Across Both: ${allFuncs.size}`);
  Logger.log(`Overlapping (Duplicates): ${overlaps.length} -> [${overlaps.join(', ')}]`);
  Logger.log(`Unique to ${fileA}: ${uniqueToA.length} -> [${uniqueToA.join(', ')}]`);
  Logger.log(`Unique to ${fileB}: ${uniqueToB.length} -> [${uniqueToB.join(', ')}]`);
  
  if (uniqueToB.length > 0) {
    Logger.log(`⚠️ WARNING: ${fileB} contains unique logic that must be migrated before deletion.`);
  } else {
    Logger.log(`✅ SAFE: ${fileB} contains no unique functions. It can be deleted.`);
  }
}

/**
 * Uses Regular Expressions to find function declarations in a file.
 */
function getFunctionsFromFile(fileName) {
  // This retrieves the content of the script file via the Apps Script API 
  // or by accessing the file if you have a catalog utility that reads script content.
  // If CodebaseCatalog.gs already has a 'getFileContent' method, use that here.
  const content = CodebaseCatalog.getFileContent(fileName); 
  
  if (!content) {
    throw new Error(`Could not find content for file: ${fileName}`);
  }
  
  // Regex looks for "function functionName("
  const regex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
  const functions = [];
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    functions.push(match[1]);
  }
  
  return functions;
}
