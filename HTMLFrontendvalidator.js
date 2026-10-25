/**
 * HTMLFrontendValidator.gs - CHUNK 1: HTML Parser & google.script.run Extractor
 * 
 * Responsibility:
 * - Scan all HTML files in the Google Apps Script project
 * - Extract every google.script.run.actionName() call
 * - Parse parameters and return handlers
 * - Build frontend call inventory
 * 
 * Called by: ComplianceReportGenerator.gs
 */

/**
 * Main entry point: Scans all HTML files and extracts google.script.run calls.
 * 
 * @returns {Object} Frontend call inventory
 * {
 *   htmlFiles: [ { name, type, fileId, callCount, calls: [] } ],
 *   totalFiles: number,
 *   totalCalls: number,
 *   callTypes: { successHandlers, errorHandlers, withoutHandlers },
 *   endOfFile: "=== END HTMLFrontendValidator.CHUNK1 ==="
 * }
 */
function scanHTMLForScriptCalls() {
  const startTime = new Date();
  const inventory = {
    htmlFiles: [],
    totalFiles: 0,
    totalCalls: 0,
    callTypes: {
      successHandlers: 0,
      errorHandlers: 0,
      withoutHandlers: 0
    },
    scanTimestamp: new Date().toISOString()
  };
  
  try {
    Logger.log("🔍 HTMLFrontendValidator: Scanning for google.script.run calls...");
    
    // Get all files in Apps Script project
    const scriptFiles = ScriptApp.getProjectFiles();
    
    while (scriptFiles.hasNext()) {
      const file = scriptFiles.next();
      const fileName = file.getName();
      
      // Only process HTML files
      if (!fileName.endsWith(".html")) {
        continue;
      }
      
      const source = file.getSource();
      const fileId = file.getId();
      
      // Extract google.script.run calls
      const calls = extractScriptRunCalls(source);
      
      if (calls.length > 0) {
        inventory.htmlFiles.push({
          name: fileName,
          type: "HTML",
          fileId: fileId,
          callCount: calls.length,
          calls: calls,
          scanTimestamp: new Date().toISOString()
        });
        
        // Update counters
        inventory.totalCalls += calls.length;
        calls.forEach(call => {
          if (call.successHandler) inventory.callTypes.successHandlers++;
          if (call.errorHandler) inventory.callTypes.errorHandlers++;
          if (!call.successHandler && !call.errorHandler) inventory.callTypes.withoutHandlers++;
        });
        
        Logger.log(`   ✅ ${fileName}: ${calls.length} google.script.run calls found`);
      }
    }
    
    inventory.totalFiles = inventory.htmlFiles.length;
    
    Logger.log(`\n📊 Summary: ${inventory.totalCalls} total calls across ${inventory.totalFiles} HTML files`);
    Logger.log(`   • With success handlers: ${inventory.callTypes.successHandlers}`);
    Logger.log(`   • With error handlers: ${inventory.callTypes.errorHandlers}`);
    Logger.log(`   • Without handlers: ${inventory.callTypes.withoutHandlers}`);
    
    inventory.endOfFile = "=== END HTMLFrontendValidator.CHUNK1 ===";
    
    return inventory;
    
  } catch (error) {
    Logger.log(`❌ Scan failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      endOfFile: "=== END HTMLFrontendValidator.CHUNK1 (ERROR) ==="
    };
  }
}

// ============================================================================
// HELPER: Extract google.script.run Calls from HTML Source
// ============================================================================

/**
 * Uses regex to find all google.script.run.ACTION_NAME(...) patterns.
 * Extracts action name, parameters, and callback handlers.
 * 
 * @param {string} htmlSource - Raw HTML source code
 * @returns {Array} Array of call objects
 * 
 * Call Object Structure:
 * {
 *   lineNumber: number,
 *   actionName: string,
 *   parameters: string[],
 *   parameterCount: number,
 *   successHandler: string | null,
 *   errorHandler: string | null,
 *   fullExpression: string,
 *   hasWitClause: boolean
 * }
 */
function extractScriptRunCalls(htmlSource) {
  const calls = [];
  
  // REGEX PATTERNS
  // Pattern 1: google.script.run.ACTION_NAME(params).withSuccessHandler(handler)
  const withSuccessPattern = /google\.script\.run\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\.withSuccessHandler\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
  
  // Pattern 2: google.script.run.ACTION_NAME(params).withUserObject(obj).withSuccessHandler(handler)
  const withUserObjectPattern = /google\.script\.run\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\.withUserObject\s*\([^)]*\)\s*\.withSuccessHandler\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
  
  // Pattern 3: google.script.run.ACTION_NAME(params).withFailureHandler(handler)
  const withFailurePattern = /google\.script\.run\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\.withFailureHandler\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
  
  // Pattern 4: Both success and failure
  const withBothPattern = /google\.script\.run\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\.withSuccessHandler\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*\.withFailureHandler\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g;
  
  // Pattern 5: Bare call without handlers (ANTI-PATTERN)
  const barePattern = /google\.script\.run\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)(?!\s*\.with)/g;
  
  const lines = htmlSource.split('\n');
  
  // PASS 1: Match with success + failure handlers (most complete)
  let match;
  while ((match = withBothPattern.exec(htmlSource)) !== null) {
    calls.push({
      actionName: match[1],
      parameters: parseParameters(match[2]),
      parameterCount: parseParameters(match[2]).length,
      successHandler: match[3],
      errorHandler: match[4],
      fullExpression: match[0],
      hasWithClause: true,
      lineNumber: getLineNumber(htmlSource, withBothPattern.lastIndex),
      patternType: "withSuccessHandler + withFailureHandler"
    });
  }
  
  // PASS 2: Match with success handler only
  while ((match = withSuccessPattern.exec(htmlSource)) !== null) {
    // Skip if already captured in PASS 1
    if (!calls.some(c => c.fullExpression === match[0])) {
      calls.push({
        actionName: match[1],
        parameters: parseParameters(match[2]),
        parameterCount: parseParameters(match[2]).length,
        successHandler: match[3],
        errorHandler: null,
        fullExpression: match[0],
        hasWithClause: true,
        lineNumber: getLineNumber(htmlSource, withSuccessPattern.lastIndex),
        patternType: "withSuccessHandler"
      });
    }
  }
  
  // PASS 3: Match with user object + success handler
  while ((match = withUserObjectPattern.exec(htmlSource)) !== null) {
    if (!calls.some(c => c.fullExpression === match[0])) {
      calls.push({
        actionName: match[1],
        parameters: parseParameters(match[2]),
        parameterCount: parseParameters(match[2]).length,
        successHandler: match[3],
        errorHandler: null,
        fullExpression: match[0],
        hasWithClause: true,
        lineNumber: getLineNumber(htmlSource, withUserObjectPattern.lastIndex),
        patternType: "withUserObject + withSuccessHandler"
      });
    }
  }
  
  // PASS 4: Match with failure handler only
  while ((match = withFailurePattern.exec(htmlSource)) !== null) {
    if (!calls.some(c => c.fullExpression === match[0])) {
      calls.push({
        actionName: match[1],
        parameters: parseParameters(match[2]),
        parameterCount: parseParameters(match[2]).length,
        successHandler: null,
        errorHandler: match[3],
        fullExpression: match[0],
        hasWithClause: true,
        lineNumber: getLineNumber(htmlSource, withFailurePattern.lastIndex),
        patternType: "withFailureHandler"
      });
    }
  }
  
  // PASS 5: Match bare calls (ANTI-PATTERN - flag for remediation)
  while ((match = barePattern.exec(htmlSource)) !== null) {
    if (!calls.some(c => c.actionName === match[1])) {
      calls.push({
        actionName: match[1],
        parameters: parseParameters(match[2]),
        parameterCount: parseParameters(match[2]).length,
        successHandler: null,
        errorHandler: null,
        fullExpression: match[0],
        hasWithClause: false,
        lineNumber: getLineNumber(htmlSource, barePattern.lastIndex),
        patternType: "BARE (NO HANDLERS)",
        flagged: true,
        severity: "HIGH"
      });
    }
  }
  
  return calls;
}

// ============================================================================
// HELPER: Parse Function Parameters
// ============================================================================

/**
 * Extracts individual parameters from function call.
 * Handles nested objects and arrays with balanced bracket counting.
 * 
 * @param {string} paramString - Raw parameter string from regex match
 * @returns {Array} Array of parameter names/values
 */
function parseParameters(paramString) {
  if (!paramString || paramString.trim() === "") {
    return [];
  }
  
  const params = [];
  let current = "";
  let depth = 0;
  let inString = false;
  let stringChar = null;
  
  for (let i = 0; i < paramString.length; i++) {
    const char = paramString[i];
    const prevChar = i > 0 ? paramString[i - 1] : "";
    
    // Track string context
    if ((char === '"' || char === "'") && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    // Track bracket depth
    if (!inString) {
      if (char === "{" || char === "[" || char === "(") depth++;
      if (char === "}" || char === "]" || char === ")") depth--;
      
      // Split on comma only at depth 0
      if (char === "," && depth === 0) {
        params.push(current.trim());
        current = "";
        continue;
      }
    }
    
    current += char;
  }
  
  if (current.trim()) {
    params.push(current.trim());
  }
  
  return params;
}

// ============================================================================
// HELPER: Get Line Number from Regex Match
// ============================================================================

/**
 * Calculates line number where regex match occurs.
 * 
 * @param {string} source - Full source text
 * @param {number} matchIndex - Character index of match end
 * @returns {number} 1-based line number
 */
function getLineNumber(source, matchIndex) {
  return source.substring(0, matchIndex).split('\n').length;
}

// ============================================================================
// END OF CHUNK 1
// ============================================================================
/**
 * HTMLFrontendValidator.gs - CHUNK 2: Validation Engine
 * 
 * Responsibility:
 * - Cross-reference frontend calls against golden list from FunctionInventoryParser
 * - Validate each action exists in API_Gateway
 * - Check parameter counts match expected signatures
 * - Flag missing handlers, orphaned calls, invalid actions
 * 
 * Called by: ComplianceReportGenerator.gs
 */

/**
 * Validates all frontend calls against golden list.
 * 
 * @param {Object} htmlInventory - Output from scanHTMLForScriptCalls()
 * @param {Array} goldenList - Golden list actions from FunctionInventoryParser
 * @returns {Object} Comprehensive validation matrix
 * 
 * Validation Result:
 * {
 *   valid: [ { file, action, handler, parameters } ],
 *   invalid: [ { file, action, reason, severity } ],
 *   orphaned: [ { action, foundInFiles: [], recommendation } ],
 *   missingHandlers: [ { file, action, parameters } ],
 *   missingGoldenEntries: [ { file, action, reason } ],
 *   endOfFile: "=== END HTMLFrontendValidator.CHUNK2 ==="
 * }
 *//**
 * HTMLFrontendValidator.gs — CHUNK 4: Complete Validation Logic
 */

function validateFrontendCallsAgainstGoldenList(htmlInventory, goldenList) {
  const validation = {
    valid: [],
    invalid: [],
    orphaned: [],
    missingHandlers: [],
    missingGoldenEntries: [],
    validationTimestamp: new Date().toISOString()
  };
  
  try {
    Logger.log("✔️ HTMLFrontendValidator: Starting validation...");
    
    const goldenActionNames = goldenList.map(action => action.name);
    const frontendActionsFound = new Set();
    
    // PASS 1: Validate each HTML call
    htmlInventory.htmlFiles.forEach(htmlFile => {
      htmlFile.calls.forEach(call => {
        frontendActionsFound.add(call.actionName);
        
        const goldenEntry = goldenList.find(g => g.name === call.actionName);
        
        if (!goldenEntry) {
          validation.missingGoldenEntries.push({
            file: htmlFile.name,
            action: call.actionName,
            parameters: call.parameters,
            reason: `Action "${call.actionName}" called by frontend but NOT defined in API_Gateway golden list`,
            severity: "CRITICAL",
            remediation: `Add case '${call.actionName}': handler to API_Gateway.gs`
          });
          
          validation.invalid.push({
            file: htmlFile.name,
            action: call.actionName,
            reason: "Not in golden list",
            severity: "CRITICAL"
          });
        } else {
          if (call.flagged && !call.successHandler && !call.errorHandler) {
            validation.missingHandlers.push({
              file: htmlFile.name,
              action: call.actionName,
              parameters: call.parameters,
              severity: "HIGH",
              remediation: `Add .withSuccessHandler() and .withFailureHandler() to ${htmlFile.name}`
            });
            
            validation.invalid.push({
              file: htmlFile.name,
              action: call.actionName,
              reason: "Missing success/failure handlers",
              severity: "HIGH"
            });
          } else {
            validation.valid.push({
              file: htmlFile.name,
              action: call.actionName,
              handler: call.successHandler,
              errorHandler: call.errorHandler,
              parameters: call.parameters,
              parameterCount: call.parameterCount,
              goldenListHandler: goldenEntry.handler,
              patternType: call.patternType,
              lineNumber: call.lineNumber
            });
          }
        }
      });
    });
    
    // PASS 2: Find orphaned golden list actions (never called from frontend)
    goldenList.forEach(goldenAction => {
      const utilityPrefixes = ["INTERNAL_", "HELPER_", "VALIDATE_"];
      const isUtility = utilityPrefixes.some(prefix => 
        goldenAction.name.startsWith(prefix)
      );
      
      if (!frontendActionsFound.has(goldenAction.name) && !isUtility) {
        validation.orphaned.push({
          action: goldenAction.name,
          handler: goldenAction.handler,
          severity: "MEDIUM",
          reason: "Golden list action never called from any HTML frontend",
          remediation: `Either remove from golden list OR add frontend call in HTML files`
        });
      }
    });
    
    Logger.log(`✅ Validation complete: ${validation.valid.length} valid, ${validation.invalid.length} invalid, ${validation.orphaned.length} orphaned`);
    return validation;
    
  } catch (e) {
    Logger.log(`❌ Validation error: ${e.message}`);
    return validation;
  }
}

// ========== END CHUNK 4 ==========
// ========== END HTMLFrontendValidator.gs ==========

/**
 * HTMLFrontendValidator.gs
 * Scans all HTML files in the Apps Script project for google.script.run calls
 * and validates each call against the golden list extracted from API_Gateway.gs
 * 
 * Validates:
 * - All google.script.run.actionName() calls exist in golden list
 * - All calls use correct parameter structure
 * - No orphaned frontend calls to non-existent backend handlers
 * - RBAC enforcement on sensitive actions
 */

/**
 * CHUNK 1: HTML File Discovery & Extraction
 */

/**
 * Scan all HTML files in the project and extract google.script.run calls
 * @returns {Object} { fileName, calls: [{actionName, params, lineNumber}] }
 */
function scanHTMLForScriptCalls() {
  const htmlFiles = [];
  const ssFiles = DriveApp.getFilesByType('application/vnd.google-apps.script+json');
  
  // Get the bound Apps Script project
  const scriptId = ScriptApp.getScriptId();
  const apiUrl = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
  
  try {
    const response = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const content = JSON.parse(response.getContentText());
      
      // Filter for HTML files
      if (content.files) {
        content.files.forEach(file => {
          if (file.name.endsWith('.html')) {
            htmlFiles.push({
              name: file.name,
              source: file.source
            });
          }
        });
      }
    }
  } catch (e) {
    Logger.log(`Error fetching project files: ${e.message}`);
    return [];
  }
  
  // Extract google.script.run calls from each HTML file
  const results = [];
  htmlFiles.forEach(htmlFile => {
    const calls = extractScriptRunCalls(htmlFile.source);
    results.push({
      fileName: htmlFile.name,
      fileSize: htmlFile.source.length,
      calls: calls,
      callCount: calls.length
    });
  });
  
  return results;
}

/**
 * HTMLFrontendValidator.gs — CHUNK 2: Script Call Extraction

/**
 * Extract all google.script.run.* calls from HTML source
 * Handles: direct calls, handler chains, success/failure patterns
 * 
 * @param {string} htmlSource - Raw HTML source code
 * @returns {Array} Array of {actionName, params, pattern, fullMatch}
 */
function extractScriptRunCalls(htmlSource) {
  const calls = [];
  
  // Pattern 1: Direct call with params: google.script.run.actionName(param1, param2)
  const directPattern = /google\.script\.run\.(\w+)\s*\(\s*([^)]*)\s*\)/g;
  let match;
  
  while ((match = directPattern.exec(htmlSource)) !== null) {
    const actionName = match[1];
    const paramsStr = match[2].trim();
    
    // Skip handler chain patterns (withSuccessHandler, withFailureHandler, etc.)
    if (!actionName.startsWith('with')) {
      calls.push({
        actionName: actionName,
        params: paramsStr.split(',').map(p => p.trim()).filter(p => p),
        pattern: 'direct',
        fullMatch: match[0]
      });
    }
  }
  
  // Pattern 2: Chained handlers with success callback
  const chainedSuccessPattern = /google\.script\.run\.withSuccessHandler\s*\(\s*\w+\s*\)\.(\w+)\s*\(/g;
  while ((match = chainedSuccessPattern.exec(htmlSource)) !== null) {
    const actionName = match[1];
    if (!calls.find(c => c.actionName === actionName)) {
      calls.push({
        actionName: actionName,
        params: [],
        pattern: 'chained_success',
        fullMatch: match[0]
      });
    }
  }
  
  // Pattern 3: Chained handlers with both success and failure
  const chainedBothPattern = /google\.script\.run\.withSuccessHandler\s*\(\s*\w+\s*\)\.withFailureHandler\s*\(\s*\w+\s*\)\.(\w+)\s*\(/g;
  while ((match = chainedBothPattern.exec(htmlSource)) !== null) {
    const actionName = match[1];
    if (!calls.find(c => c.actionName === actionName)) {
      calls.push({
        actionName: actionName,
        params: [],
        pattern: 'chained_both',
        fullMatch: match[0]
      });
    }
  }
  
  return calls;
}

// ========== END CHUNK 2 ==========
/**
 * HTMLFrontendValidator.gs — CHUNK 3: Golden List Cross-Reference
 * Validate frontend calls against golden list from API_Gateway.gs
 */

/**
 * Validate frontend calls against golden list
 * @param {Array} htmlScanResults - Output from scanHTMLForScriptCalls()
 * @param {Array} goldenList - Output from parseFunctionInventory()
 * @returns {Object} {validCalls, orphanedCalls, riskFlags, summary}
 */
function validateFrontendCallsAgainstGoldenList(htmlScanResults, goldenList) {
  const validationReport = {
    timestamp: new Date().toISOString(),
    totalHTMLFiles: htmlScanResults.length,
    totalFrontendCalls: 0,
    validCalls: [],
    orphanedCalls: [],
    riskFlags: [],
    summary: {}
  };
  
  const goldenActionNames = goldenList.map(g => g.actionName);
  
  htmlScanResults.forEach(htmlFile => {
    validationReport.totalFrontendCalls += htmlFile.calls.length;
    
    htmlFile.calls.forEach(call => {
      const isInGolden = goldenActionNames.includes(call.actionName);
      
      if (isInGolden) {
        const goldenDef = goldenList.find(g => g.actionName === call.actionName);
        const expectedParamCount = goldenDef.params ? goldenDef.params.length : 0;
        const actualParamCount = call.params.length;
        
        validationReport.validCalls.push({
          actionName: call.actionName,
          htmlFile: htmlFile.fileName,
          pattern: call.pattern,
          paramMatch: actualParamCount === expectedParamCount,
          expectedParams: expectedParamCount,
          actualParams: actualParamCount,
          severity: actualParamCount !== expectedParamCount ? 'WARNING' : 'OK'
        });
        
        if (actualParamCount !== expectedParamCount) {
          validationReport.riskFlags.push({
            type: 'PARAM_MISMATCH',
            actionName: call.actionName,
            htmlFile: htmlFile.fileName,
            message: `Expected ${expectedParamCount} params, found ${actualParamCount}`
          });
        }
      } else {
        validationReport.orphanedCalls.push({
          actionName: call.actionName,
          htmlFile: htmlFile.fileName,
          pattern: call.pattern,
          params: call.params,
          suggestion: `Add case '${call.actionName}': to API_Gateway.gs doPost() handler`
        });
      }
    });
  });
  
  validationReport.summary = {
    valid: validationReport.validCalls.length,
    orphaned: validationReport.orphanedCalls.length,
    warnings: validationReport.riskFlags.length,
    passRate: validationReport.totalFrontendCalls > 0 
      ? ((validationReport.validCalls.length / validationReport.totalFrontendCalls) * 100).toFixed(2) + '%'
      : '0%'
  };
  
  return validationReport;
}

// ========== END CHUNK 3 ==========

/**
 * HTMLFrontendValidator.gs — CHUNK 4: Orphan Detection
 * Identify frontend orphans (calls not in golden list) and backend orphans
 */

/**
 * Identify frontend orphans and backend orphans
 * @param {Array} htmlScanResults - HTML scan output
 * @param {Array} goldenList - Golden list from API_Gateway
 * @returns {Object} {frontendOrphans, backendOrphans, potentialUtilities, severity}
 */
function analyzeOrphans(htmlScanResults, goldenList) {
  const orphanReport = {
    frontendOrphans: [],
    backendOrphans: [],
    potentialUtilities: [],
    severity: 'UNKNOWN'
  };
  
  // Collect all action names called from HTML
  const callsInHTML = new Set();
  htmlScanResults.forEach(htmlFile => {
    htmlFile.calls.forEach(call => {
      callsInHTML.add(call.actionName);
    });
  });
  
  // PASS 1: Find frontend orphans (HTML calls not in golden list)
  orphanReport.frontendOrphans = Array.from(callsInHTML)
    .filter(callName => !goldenList.find(g => g.actionName === callName))
    .map(callName => ({
      actionName: callName,
      type: 'FRONTEND_ORPHAN',
      severity: 'HIGH',
      resolution: 'Implement handler in API_Gateway.gs or remove call from HTML'
    }));
  
  // PASS 2: Find backend orphans (golden list actions never called from HTML)
  const utilityPrefixes = ["INTERNAL_", "HELPER_", "VALIDATE_", "ADMIN_"];
  
  orphanReport.backendOrphans = goldenList
    .filter(goldenAction => {
      const isNeverCalled = !callsInHTML.has(goldenAction.actionName);
      const isUtility = utilityPrefixes.some(prefix => 
        goldenAction.actionName.startsWith(prefix)
      );
      
      if (isNeverCalled && !isUtility) {
        return true;
      }
      
      if (isNeverCalled && isUtility) {
        orphanReport.potentialUtilities.push({
          actionName: goldenAction.actionName,
          rationale: 'Utility prefix detected; may be internal-only',
          rbac: goldenAction.rbac || 'N/A'
        });
      }
      
      return false;
    })
    .map(action => ({
      actionName: action.actionName,
      type: 'BACKEND_ORPHAN',
      severity: 'MEDIUM',
      rbac: action.rbac || 'N/A',
      resolution: 'Remove from golden list or add frontend call'
    }));
  
  // Determine overall severity
  if (orphanReport.frontendOrphans.length > 0) {
    orphanReport.severity = 'CRITICAL';
  } else if (orphanReport.backendOrphans.length > 3) {
    orphanReport.severity = 'HIGH';
  } else if (orphanReport.backendOrphans.length > 0) {
    orphanReport.severity = 'MEDIUM';
  } else {
    orphanReport.severity = 'NONE';
  }
  
  return orphanReport;
}

// ========== END CHUNK 4 ==========

/**
 * HTMLFrontendValidator.gs — CHUNK 5: RBAC Validation
 * Check RBAC enforcement on sensitive frontend calls
 */

/**
 * Validate RBAC enforcement on sensitive actions
 * @param {Array} validCalls - Valid calls from validation report
 * @param {Array} goldenList - Golden list with RBAC info
 * @returns {Array} RBAC compliance issues
 */
function validateRBACOnFrontendCalls(validCalls, goldenList) {
  const rbacIssues = [];
  const sensitiveActions = [
    'SAVE_MEMBER', 
    'SAVE_PRODUCT', 
    'RECORD_TRANSACTION', 
    'DELETE_MEMBER'
  ];
  
  validCalls.forEach(call => {
    if (sensitiveActions.includes(call.actionName)) {
      const goldenDef = goldenList.find(g => g.actionName === call.actionName);
      
      if (!goldenDef || !goldenDef.rbac) {
        rbacIssues.push({
          actionName: call.actionName,
          htmlFile: call.htmlFile,
          issue: 'Sensitive action missing RBAC enforcement',
          severity: 'CRITICAL'
        });
      } else if (goldenDef.rbac.minRole && goldenDef.rbac.minRole > 2) {
        rbacIssues.push({
          actionName: call.actionName,
          htmlFile: call.htmlFile,
          minRole: goldenDef.rbac.minRole,
          issue: `Sensitive action requires role >= ${goldenDef.rbac.minRole}`,
          severity: 'INFO'
        });
      }
    }
  });
  
  return rbacIssues;
}

// ========== END CHUNK 5 ==========

/**
 * HTMLFrontendValidator.gs — CHUNK 6: Integration & Master Validation
 * Orchestrates full frontend validation cycle
 */

/**
 * Master validation function: Full frontend integrity check
 * @returns {Object} Complete validation report
 */
function validateFrontendIntegrity() {
  try {
    // Step 1: Parse golden list from API_Gateway.gs
    const goldenList = parseFunctionInventory();
    if (!goldenList || goldenList.length === 0) {
      throw new Error('Failed to extract golden list from API_Gateway.gs');
    }
    
    // Step 2: Scan all HTML files
    const htmlScanResults = scanHTMLForScriptCalls();
    if (!htmlScanResults || htmlScanResults.length === 0) {
      throw new Error('No HTML files found in project');
    }
    
    // Step 3: Validate frontend calls against golden list
    const validationReport = validateFrontendCallsAgainstGoldenList(
      htmlScanResults, 
      goldenList
    );
    
    // Step 4: Analyze orphans
    const orphanAnalysis = analyzeOrphans(htmlScanResults, goldenList);
    validationReport.orphanAnalysis = orphanAnalysis;
    
    // Step 5: Check RBAC on sensitive actions
    const rbacIssues = validateRBACOnFrontendCalls(
      validationReport.validCalls, 
      goldenList
    );
    validationReport.rbacIssues = rbacIssues;
    
    // Step 6: Determine deployment readiness
    validationReport.completionStatus = determineCompletionStatus(validationReport);
    
    return validationReport;
  } catch (e) {
    return {
      error: true,
      message: e.message,
      timestamp: new Date().toISOString()
    };
  }
}

 /**
 * HTMLFrontendValidator.gs — CHUNK 6: Integration & Master Validation (COMPLETE)
 */

function determineCompletionStatus(validationReport) {
  const status = {
    readyForDeployment: true,
    criticalIssues: 0,
    recommendations: [],
    timestamp: new Date().toISOString()
  };
  
  if (validationReport.orphanAnalysis.frontendOrphans.length > 0) {
    status.readyForDeployment = false;
    status.criticalIssues += validationReport.orphanAnalysis.frontendOrphans.length;
    status.recommendations.push(
      `❌ Implement ${validationReport.orphanAnalysis.frontendOrphans.length} missing backend handlers`
    );
  }
  
  if (validationReport.riskFlags.length > 0) {
    status.readyForDeployment = false;
    status.recommendations.push(
      `⚠️ Fix ${validationReport.riskFlags.length} parameter mismatches`
    );
  }
  
  const criticalRbac = validationReport.rbacIssues.filter(i => i.severity === 'CRITICAL');
  if (criticalRbac.length > 0) {
    status.readyForDeployment = false;
    status.criticalIssues += criticalRbac.length;
    status.recommendations.push(
      `🔒 Add RBAC enforcement to ${criticalRbac.length} sensitive actions`
    );
  }
  
  if (status.readyForDeployment) {
    status.recommendations.push('✅ Frontend validation PASSED—ready for deployment');
  }
  
  return status;
}

// ========== END CHUNK 6 ==========


// ========== END HTMLFrontendValidator.gs ==========
