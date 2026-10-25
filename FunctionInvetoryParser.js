// FunctionInventoryParser.gs
// CHUNK 1: Golden List Extraction & Initialization

/**
 * FunctionInventoryParser.gs
 * Extracts golden list from API_Gateway.gs switch/case structure
 * Validates all backend functions exist in codebase
 * Reports compliance gaps
 */

// Golden list extracted from API_Gateway.gs doPost() switch/case
const GOLDEN_LIST = {
  GET_PANEL_MEMBERS: {
    function: 'getPanelMembers',
    requiredRoles: ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    idempotencyRequired: false,
    stateChanging: false,
    description: 'Fetch members panel with role-aware filtering'
  },
  GET_PANEL_PRODUCTS: {
    function: 'getPanelProducts',
    requiredRoles: ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    idempotencyRequired: false,
    stateChanging: false,
    description: 'Fetch products panel; Manager sees COGS'
  },
  GET_PANEL_LEDGER: {
    function: 'getPanelLedger',
    requiredRoles: ['Manager', 'Cashier', 'Accountant'],
    idempotencyRequired: false,
    stateChanging: false,
    description: 'Fetch ledger; Bowler denied, Cashier sees own only'
  },
  GET_PANEL_ATTENDANCE: {
    function: 'getPanelAttendance',
    requiredRoles: ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    idempotencyRequired: false,
    stateChanging: false,
    description: 'Fetch attendance; Bowler sees self only'
  },
  RECORD_TRANSACTION: {
    function: 'recordReceiptTransaction',
    requiredRoles: ['Manager', 'Cashier'],
    idempotencyRequired: true,
    stateChanging: true,
    description: 'Record receipt transaction with idempotency'
  },
  SAVE_MEMBER: {
    function: 'saveMember',
    requiredRoles: ['Manager'],
    idempotencyRequired: true,
    stateChanging: true,
    description: 'Save/update member record'
  },
  SAVE_PRODUCT: {
    function: 'saveProduct',
    requiredRoles: ['Manager'],
    idempotencyRequired: true,
    stateChanging: true,
    description: 'Save/update product record'
  },
  FETCH_CSRF_TOKEN: {
    function: 'generateCSRFToken',
    requiredRoles: ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    idempotencyRequired: false,
    stateChanging: false,
    description: 'Generate CSRF token (public endpoint)'
  }
};

/**
 * Gets all .gs script files from the project
 * @returns {Array<{name: string, content: string}>}
 */
function getAllScriptFilesForInventory() {
  const scriptId = ScriptApp.getScriptId();
  const scriptFiles = [];
  
  try {
    // Use Apps Script API to list all files
    const result = Apps.Script.Projects.getContent(scriptId);
    
    if (result.files) {
      result.files.forEach(file => {
        if (file.name.endsWith('.gs')) {
          scriptFiles.push({
            name: file.name,
            content: file.source || ''
          });
        }
      });
    }
  } catch (e) {
    Logger.log('⚠️ Apps Script API unavailable, using fallback');
    return getAllScriptFilesManualFallback();
  }
  
  return scriptFiles;
}

/**
 * Fallback: hardcoded list of known script files
 * Uses PropertiesService to store file contents if available
 * @returns {Array<{name: string, content: string}>}
 */
function getAllScriptFilesManualFallback() {
  const knownFiles = [
    'API_Gateway', 'API_Security', 'API_LockManager', 'API_ResponseHandler',
    'API_ActionMatrix', 'API_AttendanceHandler', 'SchemaMigrator',
    'AtomicSchemaApplier', 'SchemaOrchestrator', 'API_ResponseHandlers',
    'API_TransactionLogic', 'API_CoreTransactions', 'API_ProductAndLedger',
    'API_SecurityAndHelpers', 'API_SettlementAndAttendance', 'CodebaseCatalog',
    'FunctionInventoryParser', 'HTMLFrontendValidator', 'ComplianceReportGenerator',
    'UI_Startup'
  ];
  
  const result = [];
  
  knownFiles.forEach(fileName => {
    // Attempt to access via PropertiesService cache
    const cacheKey = 'SCRIPT_' + fileName;
    const cachedContent = PropertiesService.getUserProperties().getProperty(cacheKey);
    
    if (cachedContent) {
      result.push({
        name: fileName + '.gs',
        content: cachedContent
      });
    } else {
      result.push({
        name: fileName + '.gs',
        content: '[File content not accessible - requires Apps Script API]'
      });
    }
  });
  
  return result;
}
/**
 * Extracts all function signatures from script files
 * @param {Array<{name: string, content: string}>} scriptFiles
 * @returns {Object} Map of functionName -> {file, signature, lineNumber}
 */
function extractAllFunctionSignatures(scriptFiles) {
  const functionMap = {};
  
  scriptFiles.forEach(file => {
    // Regex to match: function nameHere(param1, param2, ...)
    const functionRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\s*([^)]*)\s*\)/g;
    let match;
    
    while ((match = functionRegex.exec(file.content)) !== null) {
      const functionName = match[1];
      const parameters = match[2].split(',').map(p => p.trim()).filter(p => p);
      
      functionMap[functionName] = {
        file: file.name,
        signature: `${functionName}(${parameters.join(', ')})`,
        parameters: parameters,
        found: true
      };
    }
  });
  
  return functionMap;
}

/**
 * Validates golden list functions exist in codebase
 * @param {Object} functionMap - from extractAllFunctionSignatures()
 * @returns {Object} Validation report with gaps
 */
function validateGoldenListFunctions(functionMap) {
  const report = {
    timestamp: new Date().toISOString(),
    totalActions: Object.keys(GOLDEN_LIST).length,
    foundFunctions: 0,
    missingFunctions: [],
    orphanedFunctions: [],
    details: {}
  };
  
  // Check if each golden list function exists
  Object.entries(GOLDEN_LIST).forEach(([action, spec]) => {
    const functionName = spec.function;
    
    if (functionMap[functionName]) {
      report.foundFunctions++;
      report.details[action] = {
        status: '✅ FOUND',
        action: action,
        function: functionName,
        file: functionMap[functionName].file,
        signature: functionMap[functionName].signature,
        requiredRoles: spec.requiredRoles,
        idempotencyRequired: spec.idempotencyRequired
      };
    } else {
      report.missingFunctions.push({
        action: action,
        expectedFunction: functionName,
        description: spec.description
      });
      report.details[action] = {
        status: '❌ MISSING',
        action: action,
        function: functionName,
        description: spec.description
      };
    }
  });
  
  // Find functions that exist but are NOT in golden list (orphaned)
  Object.entries(functionMap).forEach(([funcName, details]) => {
    const isInGolden = Object.values(GOLDEN_LIST).some(spec => spec.function === funcName);
    
    if (!isInGolden) {
      // Exclude common utility functions
      if (!isUtilityFunction(funcName)) {
        report.orphanedFunctions.push({
          function: funcName,
          file: details.file,
          signature: details.signature
        });
      }
    }
  });
  
  return report;
}

/**
 * Determines if a function is a common utility (not tracked in golden list)
 * @param {string} functionName
 * @returns {boolean}
 */
function isUtilityFunction(functionName) {
  const utilityPatterns = [
    'log', 'debug', 'trace', 'error', 'warn',
    'parse', 'stringify', 'format', 'sanitize',
    'validate', 'check', 'ensure', 'verify',
    'get', 'set', 'init', 'setup', 'teardown',
    'helper', 'util', 'test'
  ];
  
  return utilityPatterns.some(pattern => 
    functionName.toLowerCase().includes(pattern)
  );
}

// END OF FunctionInventoryParser.gs - CHUNK 2

/**
 * Main function: Run complete function inventory audit
 * Generates comprehensive validation report
 * @returns {Object} Complete audit report
 */
function runFunctionInventoryAudit() {
  Logger.log('🔍 Starting Function Inventory Audit...');
  
  const scriptFiles = getAllScriptFilesForInventory();
  Logger.log(`📁 Retrieved ${scriptFiles.length} script files`);
  
  const functionMap = extractAllFunctionSignatures(scriptFiles);
  Logger.log(`📋 Extracted ${Object.keys(functionMap).length} function signatures`);
  
  const validationReport = validateGoldenListFunctions(functionMap);
  Logger.log(`✅ Validation complete: ${validationReport.foundFunctions}/${validationReport.totalActions} golden list functions found`);
  
  // Enhance report with file inventory
  validationReport.scriptFilesScanned = scriptFiles.map(f => f.name);
  validationReport.totalFunctionsInCodebase = Object.keys(functionMap).length;
  
  return validationReport;
}

/**
 * Generates human-readable audit report and logs to console
 * @param {Object} report - from runFunctionInventoryAudit()
 * @returns {string} Formatted report text
 */
function generateInventoryReport(report) {
  let output = '\n' + '='.repeat(80) + '\n';
  output += '🔐 FUNCTION INVENTORY AUDIT REPORT\n';
  output += '='.repeat(80) + '\n\n';
  
  output += `📅 Timestamp: ${report.timestamp}\n`;
  output += `📁 Script Files Scanned: ${report.scriptFilesScanned.length}\n`;
  output += `📋 Total Functions in Codebase: ${report.totalFunctionsInCodebase}\n\n`;
  
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `GOLDEN LIST COMPLIANCE\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  output += `✅ Found: ${report.foundFunctions}/${report.totalActions}\n`;
  output += `❌ Missing: ${report.missingFunctions.length}\n`;
  output += `⚠️  Orphaned: ${report.orphanedFunctions.length}\n\n`;
  
  // List missing functions
  if (report.missingFunctions.length > 0) {
    output += `❌ MISSING FUNCTIONS (Action → Expected Function):\n`;
    output += '─'.repeat(80) + '\n';
    report.missingFunctions.forEach(item => {
      output += `  ${item.action.padEnd(25)} → ${item.expectedFunction}\n`;
      output += `    Description: ${item.description}\n\n`;
    });
  }
  
  // List orphaned functions
  if (report.orphanedFunctions.length > 0) {
    output += `\n⚠️  ORPHANED FUNCTIONS (Not in Golden List):\n`;
    output += '─'.repeat(80) + '\n';
    report.orphanedFunctions.forEach(item => {
      output += `  ${item.function} (${item.file})\n`;
      output += `    Signature: ${item.signature}\n\n`;
    });
  }
  
  // List all found functions
  output += `\n✅ FOUND FUNCTIONS:\n`;
  output += '─'.repeat(80) + '\n';
  Object.entries(report.details).forEach(([action, detail]) => {
    if (detail.status === '✅ FOUND') {
      output += `  ${action.padEnd(25)} → ${detail.function}\n`;
      output += `    File: ${detail.file}\n`;
      output += `    Roles: ${detail.requiredRoles.join(', ')}\n`;
      output += `    Idempotency: ${detail.idempotencyRequired ? '🔒 Required' : '⊘ Not required'}\n\n`;
    }
  });
  
  output += '='.repeat(80) + '\n';
  output += `✨ Audit Complete\n`;
  output += '='.repeat(80) + '\n';
  
  return output;
}

/**
 * Public entry point: Run audit and display report
 * Call this from menu or as standalone
 */
function auditFunctionInventory() {
  const report = runFunctionInventoryAudit();
  const formattedReport = generateInventoryReport(report);
  
  Logger.log(formattedReport);
  
  // Also save to a temporary sheet for viewing
  saveAuditReportToSheet(report, formattedReport);
  
  return report;
}

/**
 * Saves audit report to a temporary "Audit_Report" sheet
 * @param {Object} report
 * @param {string} formattedText
 */
function saveAuditReportToSheet(report, formattedText) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Audit_Report');
  
  if (!sheet) {
    sheet = ss.insertSheet('Audit_Report');
  } else {
    sheet.clear();
  }
  
  // Write formatted text
  sheet.getRange('A1').setValue(formattedText);
  sheet.getRange('A1').setFontFamily('Courier New').setFontSize(10);
  
  // Write JSON for detailed analysis
  sheet.getRange('B1').setValue(JSON.stringify(report, null, 2));
}

// END OF FunctionInventoryParser.gs - CHUNK 3

/**
 * Validates RBAC (Role-Based Access Control) matrix
 * Ensures each action has consistent role requirements across API_Gateway
 * @param {Object} functionMap - from extractAllFunctionSignatures()
 * @returns {Object} RBAC validation report
 */
function validateRBACMatrix(functionMap) {
  const rbacReport = {
    timestamp: new Date().toISOString(),
    roleHierarchy: {
      'Manager': 4,
      'Accountant': 3,
      'Cashier': 2,
      'Bowler': 1
    },
    actions: {},
    inconsistencies: []
  };
  
  Object.entries(GOLDEN_LIST).forEach(([action, spec]) => {
    rbacReport.actions[action] = {
      function: spec.function,
      requiredRoles: spec.requiredRoles,
      minRoleLevel: Math.max(
        ...spec.requiredRoles.map(role => rbacReport.roleHierarchy[role] || 0)
      ),
      idempotencyRequired: spec.idempotencyRequired,
      stateChanging: spec.stateChanging
    };
    
    // Flag state-changing actions without idempotency
    if (spec.stateChanging && !spec.idempotencyRequired) {
      rbacReport.inconsistencies.push({
        severity: '⚠️ WARNING',
        action: action,
        issue: 'State-changing action without idempotency requirement',
        recommendation: 'Enable idempotencyRequired: true'
      });
    }
  });
  
  return rbacReport;
}

/**
 * Cross-references function signatures with expected parameters
 * Validates function can accept payload from API_Gateway
 * @param {Object} functionMap
 * @returns {Object} Parameter validation report
 */
function validateFunctionParameters(functionMap) {
  const paramReport = {
    timestamp: new Date().toISOString(),
    validations: [],
    warnings: []
  };
  
  Object.entries(GOLDEN_LIST).forEach(([action, spec]) => {
    const funcName = spec.function;
    const funcDetails = functionMap[funcName];
    
    if (!funcDetails) {
      paramReport.validations.push({
        action: action,
        function: funcName,
        status: '❌ MISSING',
        parameters: 'N/A'
      });
      return;
    }
    
    // Check if function accepts at least one parameter (payload)
    if (funcDetails.parameters.length === 0) {
      paramReport.warnings.push({
        severity: '⚠️ WARNING',
        action: action,
        function: funcName,
        issue: 'Function has no parameters; cannot accept payload from API_Gateway',
        recommendation: `Add parameter: function ${funcName}(payload) { ... }`
      });
    }
    
    paramReport.validations.push({
      action: action,
      function: funcName,
      status: '✅ OK',
      parameters: funcDetails.parameters.length,
      parameterNames: funcDetails.parameters
    });
  });
  
  return paramReport;
}

/**
 * Generates comprehensive compliance matrix (HTML/JSON)
 * @param {Object} inventoryReport
 * @param {Object} rbacReport
 * @param {Object} paramReport
 * @returns {string} HTML table for visualization
 */
function generateComplianceMatrix(inventoryReport, rbacReport, paramReport) {
  let html = '<table border="1" cellpadding="8" cellspacing="0" style="font-family: monospace; font-size: 11px;">\n';
  html += '<tr style="background-color: #333; color: white;">\n';
  html += '<th>Action</th>\n';
  html += '<th>Function</th>\n';
  html += '<th>Status</th>\n';
  html += '<th>Required Roles</th>\n';
  html += '<th>Idempotency</th>\n';
  html += '<th>State-Changing</th>\n';
  html += '<th>Parameters</th>\n';
  html += '</tr>\n';
  
  Object.entries(GOLDEN_LIST).forEach(([action, spec]) => {
    const funcName = spec.function;
    const funcExists = inventoryReport.foundFunctions > 0 && 
                       Object.values(inventoryReport.details).some(d => d.function === funcName);
    const status = funcExists ? '✅ FOUND' : '❌ MISSING';
    const statusColor = funcExists ? '#d4edda' : '#f8d7da';
    
    const paramData = paramReport.validations.find(p => p.function === funcName);
    const paramCount = paramData ? paramData.parameters : '?';
    
    html += `<tr style="background-color: ${statusColor};">\n`;
    html += `<td><strong>${action}</strong></td>\n`;
    html += `<td>${funcName}</td>\n`;
    html += `<td>${status}</td>\n`;
    html += `<td>${spec.requiredRoles.join(', ')}</td>\n`;
    html += `<td>${spec.idempotencyRequired ? '🔒 Yes' : '⊘ No'}</td>\n`;
    html += `<td>${spec.stateChanging ? '🔴 Yes' : '🟢 No'}</td>\n`;
    html += `<td>${paramCount}</td>\n`;
    html += '</tr>\n';
  });
  
  html += '</table>\n';
  
  return html;
}

/**
 * Exports audit results to JSON
 * Useful for integration with external tools (CI/CD, linting)
 * @returns {string} JSON string of complete audit
 */
function exportAuditAsJSON() {
  const inventoryReport = runFunctionInventoryAudit();
  const rbacReport = validateRBACMatrix({});
  const paramReport = validateFunctionParameters(extractAllFunctionSignatures(getAllScriptFilesForInventory()));
  
  const combined = {
    audit: inventoryReport,
    rbac: rbacReport,
    parameters: paramReport,
    exportedAt: new Date().toISOString()
  };
  
  return JSON.stringify(combined, null, 2);
}

// END OF FunctionInventoryParser.gs - CHUNK 4

/**
 * FunctionInventoryParser.gs - CHUNK 5: Final Integration Wrapper
 * 
 * Responsibility:
 * - Orchestrate all four parsing modules (Chunks 1-4)
 * - Aggregate results into unified report structure
 * - Validate cross-module consistency
 * - Format output for console & document export
 * - Provide summary metrics & forensic insights
 * 
 * Entry Point: parseFunctionInventory()
 * Called by: ComplianceReportGenerator.gs (Phase 2C)
 */

// ============================================================================
// MAIN ENTRY POINT: Parse & Report Function Inventory
// ============================================================================

/**
 * Main orchestrator function. Coordinates extraction, validation, and reporting.
 * 
 * @returns {Object} Unified report object with all analysis results
 * 
 * Output Structure:
 * {
 *   timestamp: "2026-10-20T14:32:15Z",
 *   environment: { projectId, spreadsheetId, locale },
 *   goldenList: { actions[], count, extracted_from },
 *   functionInventory: { functions[], count, locations[] },
 *   validationMatrix: { valid[], invalid[], orphaned[], missing[] },
 *   rbacMatrix: { roles[], permissions[] },
 *   missingFunctions: { gaps[], severity[] },
 *   crossModuleConsistency: { alerts[] },
 *   summary: { metrics, health_score, recommendations },
 *   endOfFile: "=== END OF REPORT ==="
 * }
 */
function parseFunctionInventory() {
  const startTime = new Date();
  const report = {};
  
  try {
    // ========================================================================
    // 1. ENVIRONMENT CAPTURE
    // ========================================================================
    report.timestamp = new Date().toISOString();
    report.environment = captureEnvironment();
    
    Logger.log("🔍 FunctionInventoryParser: Starting comprehensive scan...");
    Logger.log(`   Timestamp: ${report.timestamp}`);
    Logger.log(`   Project ID: ${report.environment.projectId}`);
    
    // ========================================================================
    // 2. EXTRACT GOLDEN LIST (CHUNK 1)
    // ========================================================================
    Logger.log("\n📋 PHASE 1: Golden List Extraction...");
    const goldenListResult = extractGoldenList();
    
    if (!goldenListResult.success) {
      throw new Error(`Golden list extraction failed: ${goldenListResult.error}`);
    }
    
    report.goldenList = {
      actions: goldenListResult.actions,
      count: goldenListResult.actions.length,
      extracted_from: "API_Gateway.gs (doPost switch/case)",
      extraction_method: "Regex-based case statement parsing",
      timestamp: new Date().toISOString()
    };
    
    Logger.log(`   ✅ Extracted ${report.goldenList.count} golden list actions`);
    goldenListResult.actions.forEach(action => {
      Logger.log(`      • ${action.name} → ${action.handler}`);
    });
    
    // ========================================================================
    // 3. SCAN FUNCTION INVENTORY (CHUNK 2)
    // ========================================================================
    Logger.log("\n🔎 PHASE 2: Function Inventory Scan...");
    const inventoryResult = scanFunctionInventory();
    
    if (!inventoryResult.success) {
      throw new Error(`Inventory scan failed: ${inventoryResult.error}`);
    }
    
    report.functionInventory = {
      functions: inventoryResult.functions,
      count: inventoryResult.functions.length,
      locations: inventoryResult.locations,
      scan_method: "Apps Script Introspection API",
      timestamp: new Date().toISOString()
    };
    
    Logger.log(`   ✅ Scanned ${report.functionInventory.count} functions across ${report.functionInventory.locations.length} files`);
    report.functionInventory.locations.forEach(loc => {
      Logger.log(`      • ${loc.file}: ${loc.functionCount} functions`);
    });
    
    // ========================================================================
    // 4. VALIDATE MAPPING (CHUNK 3)
    // ========================================================================
    Logger.log("\n✔️  PHASE 3: Cross-Module Validation...");
    const validationResult = validateFunctionMapping(
      report.goldenList.actions,
      report.functionInventory.functions
    );
    
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${validationResult.error}`);
    }
    
    report.validationMatrix = {
      valid: validationResult.valid,
      invalid: validationResult.invalid,
      orphaned: validationResult.orphaned,
      missing: validationResult.missing,
      validation_timestamp: new Date().toISOString(),
      total_validations: validationResult.valid.length + validationResult.invalid.length
    };
    
    Logger.log(`   ✅ Valid mappings: ${report.validationMatrix.valid.length}`);
    Logger.log(`   ⚠️  Invalid mappings: ${report.validationMatrix.invalid.length}`);
    Logger.log(`   ❌ Orphaned functions: ${report.validationMatrix.orphaned.length}`);
    Logger.log(`   🔴 Missing functions: ${report.validationMatrix.missing.length}`);
    
    // ========================================================================
    // 5. RBAC MATRIX GENERATION (CHUNK 4)
    // ========================================================================
    Logger.log("\n👥 PHASE 4: RBAC Matrix Analysis...");
    const rbacResult = generateRBACMatrix(
      report.goldenList.actions,
      report.functionInventory.functions
    );
    
    if (!rbacResult.success) {
      throw new Error(`RBAC analysis failed: ${rbacResult.error}`);
    }
    
    report.rbacMatrix = {
      roles: rbacResult.roles,
      permissions: rbacResult.permissions,
      role_hierarchy: {
        "Manager": 4,
        "Accountant": 3,
        "Cashier": 2,
        "Bowler": 1
      },
      rbac_timestamp: new Date().toISOString()
    };
    
    Logger.log(`   ✅ RBAC Matrix complete:`);
    rbacResult.roles.forEach(role => {
      const perms = report.rbacMatrix.permissions.filter(p => p.role === role.name);
      Logger.log(`      • ${role.name} (Level ${role.level}): ${perms.length} permissions`);
    });
    
    // ========================================================================
    // 6. IDENTIFY MISSING FUNCTIONS
    // ========================================================================
    Logger.log("\n🔴 PHASE 5: Missing Function Analysis...");
    const missingResult = identifyMissingFunctions(report);
    
    report.missingFunctions = {
      gaps: missingResult.gaps,
      severity_count: {
        critical: missingResult.gaps.filter(g => g.severity === "CRITICAL").length,
        high: missingResult.gaps.filter(g => g.severity === "HIGH").length,
        medium: missingResult.gaps.filter(g => g.severity === "MEDIUM").length,
        low: missingResult.gaps.filter(g => g.severity === "LOW").length
      },
      analysis_timestamp: new Date().toISOString()
    };
    
    if (report.missingFunctions.gaps.length > 0) {
      Logger.log(`   ⚠️  Identified ${report.missingFunctions.gaps.length} gaps by severity:`);
      Logger.log(`      • CRITICAL: ${report.missingFunctions.severity_count.critical}`);
      Logger.log(`      • HIGH: ${report.missingFunctions.severity_count.high}`);
      Logger.log(`      • MEDIUM: ${report.missingFunctions.severity_count.medium}`);
      Logger.log(`      • LOW: ${report.missingFunctions.severity_count.low}`);
    } else {
      Logger.log(`   ✅ No missing functions detected!`);
    }
    
    // ========================================================================
    // 7. CROSS-MODULE CONSISTENCY CHECKS
    // ========================================================================
    Logger.log("\n🔗 PHASE 6: Cross-Module Consistency...");
    const consistencyReport = validateCrossModuleConsistency(report);
    
    report.crossModuleConsistency = {
      alerts: consistencyReport.alerts,
      checks_performed: consistencyReport.checksPerformed,
      consistency_score: consistencyReport.score,
      consistency_timestamp: new Date().toISOString()
    };
    
    Logger.log(`   Consistency Score: ${report.crossModuleConsistency.consistency_score}/100`);
    if (consistencyReport.alerts.length > 0) {
      Logger.log(`   ⚠️  ${consistencyReport.alerts.length} alerts found:`);
      consistencyReport.alerts.slice(0, 5).forEach(alert => {
        Logger.log(`      • [${alert.level}] ${alert.message}`);
      });
    }
    
    // ========================================================================
    // 8. GENERATE SUMMARY & RECOMMENDATIONS
    // ========================================================================
    Logger.log("\n📊 PHASE 7: Summary & Recommendations...");
    const summary = generateSummary(report, startTime);
    report.summary = summary;
    
    Logger.log(`\n${'='.repeat(80)}`);
    Logger.log("📈 FINAL REPORT METRICS");
    Logger.log(`${'='.repeat(80)}`);
    Logger.log(`Total Actions (Golden List): ${report.goldenList.count}`);
    Logger.log(`Total Functions Scanned: ${report.functionInventory.count}`);
    Logger.log(`Valid Mappings: ${report.validationMatrix.valid.length}`);
    Logger.log(`Coverage: ${((report.validationMatrix.valid.length / report.goldenList.count) * 100).toFixed(1)}%`);
    Logger.log(`Health Score: ${report.summary.health_score}/100`);
    Logger.log(`Execution Time: ${summary.execution_time_ms}ms`);
    Logger.log(`${'='.repeat(80)}\n`);
    
    // ========================================================================
    // 9. END-OF-FILE MARKER
    // ========================================================================
    report.endOfFile = "=== END FunctionInventoryParser REPORT ===";
    
    return report;
    
  } catch (error) {
    Logger.log(`\n❌ FATAL ERROR: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
    
    return {
      timestamp: new Date().toISOString(),
      success: false,
      error: error.message,
      stack: error.stack,
      endOfFile: "=== END FunctionInventoryParser REPORT (ERROR) ==="
    };
  }
}

// ============================================================================
// HELPER: Capture Environment Metadata
// ============================================================================

/**
 * Captures execution environment details for audit trail.
 * 
 * @returns {Object} Environment metadata
 */
function captureEnvironment() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptProperties = PropertiesService.getScriptProperties();
  
  return {
    projectId: ScriptApp.getScriptId(),
    spreadsheetId: ss ? ss.getId() : "UNKNOWN",
    spreadsheetName: ss ? ss.getName() : "UNKNOWN",
    locale: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "zzz"),
    timezone: Session.getScriptTimeZone(),
    executedBy: Session.getActiveUser().getEmail(),
    scriptProperties: scriptProperties.getKeys().length
  };
}

// ============================================================================
// HELPER: Validate Cross-Module Consistency
// ============================================================================

/**
 * Performs comprehensive consistency checks across all four modules.
 * 
 * @param {Object} report - Unified report object
 * @returns {Object} Consistency validation results
 */
function validateCrossModuleConsistency(report) {
  const alerts = [];
  let checksPerformed = 0;
  
  // CHECK 1: Golden list action count matches validation matrix
  checksPerformed++;
  if (report.goldenList.count !== (report.validationMatrix.valid.length + report.validationMatrix.invalid.length + report.validationMatrix.missing.length)) {
    alerts.push({
      level: "MEDIUM",
      module: "Golden List ↔ Validation Matrix",
      message: `Action count mismatch: ${report.goldenList.count} in golden list vs ${report.validationMatrix.valid.length + report.validationMatrix.invalid.length + report.validationMatrix.missing.length} in validation matrix`,
      timestamp: new Date().toISOString()
    });
  }
  
  // CHECK 2: All valid mappings reference existing functions
  checksPerformed++;
  const functionNames = report.functionInventory.functions.map(f => f.name);
  const invalidMappings = report.validationMatrix.valid.filter(
    v => !functionNames.includes(v.handler)
  );
  if (invalidMappings.length > 0) {
    alerts.push({
      level: "CRITICAL",
      module: "Function Inventory ↔ Validation Matrix",
      message: `${invalidMappings.length} valid mappings reference non-existent functions`,
      affected_mappings: invalidMappings.map(m => m.action)
    });
  }
  
  // CHECK 3: RBAC roles align with role hierarchy
  checksPerformed++;
  const expectedRoles = ["Manager", "Accountant", "Cashier", "Bowler"];
  const actualRoles = report.rbacMatrix.roles.map(r => r.name);
  const missingRoles = expectedRoles.filter(r => !actualRoles.includes(r));
  if (missingRoles.length > 0) {
    alerts.push({
      level: "HIGH",
      module: "RBAC Matrix",
      message: `Expected roles missing from RBAC: ${missingRoles.join(", ")}`
    });
  }
  
  // CHECK 4: All missing functions have severity assigned
  checksPerformed++;
  const missingSeverity = report.missingFunctions.gaps.filter(g => !["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(g.severity));
  if (missingSeverity.length > 0) {
    alerts.push({
      level: "LOW",
      module: "Missing Functions",
      message: `${missingSeverity.length} missing functions lack valid severity classification`
    });
  }
  
  // CHECK 5: No orphaned functions belong to golden list handlers
  checksPerformed++;
  const orphanedInGoldenList = report.validationMatrix.orphaned.filter(
    o => report.goldenList.actions.some(g => g.handler === o.name)
  );
  if (orphanedInGoldenList.length > 0) {
    alerts.push({
      level: "CRITICAL",
      module: "Validation Matrix ↔ Golden List",
      message: `${orphanedInGoldenList.length} functions are marked orphaned but appear as golden list handlers`
    });
  }
  
  // CALCULATE CONSISTENCY SCORE
  const baseScore = 100;
  const criticalPenalty = alerts.filter(a => a.level === "CRITICAL").length * 25;
  const highPenalty = alerts.filter(a => a.level === "HIGH").length * 10;
  const mediumPenalty = alerts.filter(a => a.level === "MEDIUM").length * 5;
  
  const score = Math.max(0, baseScore - criticalPenalty - highPenalty - mediumPenalty);
  
  return {
    alerts,
    checksPerformed,
    score,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// HELPER: Identify Missing Functions
// ============================================================================

/**
 * Analyzes gaps between golden list and actual function implementations.
 * 
 * @param {Object} report - Unified report object
 * @returns {Object} Missing functions with severity ratings
 */
function identifyMissingFunctions(report) {
  const gaps = [];
  const functionNames = report.functionInventory.functions.map(f => f.name);
  
  // Check each golden list action for corresponding handler
  report.goldenList.actions.forEach(action => {
    if (!functionNames.includes(action.handler)) {
      
      // SEVERITY CLASSIFICATION
      let severity = "LOW";
      let reason = "Function missing but not high priority";
      
      // State-changing actions = CRITICAL
      if (["RECORD_TRANSACTION", "SAVE_MEMBER", "SAVE_PRODUCT"].includes(action.name)) {
        severity = "CRITICAL";
        reason = "State-changing action requires backend handler";
      }
      // Fetch/read actions = HIGH
      else if (action.name.startsWith("GET_PANEL_")) {
        severity = "HIGH";
        reason = "Data retrieval action blocks UI rendering";
      }
      // Token/auth actions = MEDIUM
      else if (["FETCH_CSRF_TOKEN", "VALIDATE_SESSION"].includes(action.name)) {
        severity = "MEDIUM";
        reason = "Security function affects user session validity";
      }
      
      gaps.push({
        action_name: action.name,
        missing_handler: action.handler,
        severity,
        reason,
        golden_list_entry: action,
        impact: `No backend handler available for ${action.name}`,
        remediation: `Implement function: ${action.handler}()`
      });
    }
  });
  
  return { gaps };
}

// ============================================================================
// HELPER: Generate Summary & Recommendations
// ============================================================================

/**
 * Synthesizes all analysis phases into actionable summary.
 * 
 * @param {Object} report - Unified report object
 * @param {Date} startTime - Execution start time
 * @returns {Object} Summary metrics and recommendations
 */
function generateSummary(report, startTime) {
  const endTime = new Date();
  const executionTimeMs = endTime - startTime;
  
  // CALCULATE COVERAGE
  const totalActions = report.goldenList.count;
  const validMappings = report.validationMatrix.valid.length;
  const coverage = totalActions > 0 ? (validMappings / totalActions) * 100 : 0;
  
  // CALCULATE HEALTH SCORE
  let healthScore = 100;
  
  // Deductions for gaps
  healthScore -= report.missingFunctions.gaps.length * 15;
  healthScore -= report.validationMatrix.invalid.length * 10;
  healthScore -= report.validationMatrix.orphaned.length * 5;
  
  // Deductions for consistency issues
  healthScore -= report.crossModuleConsistency.alerts.filter(a => a.level === "CRITICAL").length * 25;
  healthScore -= report.crossModuleConsistency.alerts.filter(a => a.level === "HIGH").length * 10;
  
  healthScore = Math.max(0, Math.min(100, healthScore));
  
  // GENERATE RECOMMENDATIONS
  const recommendations = [];
  
  if (report.missingFunctions.severity_count.critical > 0) {
    recommendations.push({
      priority: "CRITICAL",
      action: "Implement missing state-changing handlers",
      affected_actions: report.missingFunctions.gaps
        .filter(g => g.severity === "CRITICAL")
        .map(g => g.action_name),
      impact: "UI will fail to save data without these functions"
    });
  }
  
  if (report.validationMatrix.invalid.length > 0) {
    recommendations.push({
      priority: "HIGH",
      action: "Review and fix invalid function mappings",
      affected_mappings: report.validationMatrix.invalid.length,
      impact: "API calls will fail or route to wrong handlers"
    });
  }
  
  if (report.validationMatrix.orphaned.length > 0) {
    recommendations.push({
      priority: "MEDIUM",
      action: "Evaluate orphaned functions for removal or integration",
      orphaned_count: report.validationMatrix.orphaned.length,
      impact: "Dead code increases maintenance burden"
    });
  }
  
  if (coverage < 100) {
    recommendations.push({
      priority: "HIGH",
      action: "Achieve 100% golden list coverage",
      current_coverage: coverage.toFixed(1) + "%",
      missing_count: totalActions - validMappings,
      impact: "Incomplete API surface exposes security risk"
    });
  }
  
  if (report.crossModuleConsistency.consistency_score < 80) {
    recommendations.push({
      priority: "MEDIUM",
      action: "Resolve cross-module consistency alerts",
      alerts_count: report.crossModuleConsistency.alerts.length,
      impact: "Module dependencies may have hidden coupling"
    });
  }
  
  // DETERMINE OVERALL STATUS
  let overallStatus = "🟢 HEALTHY";
  if (healthScore >= 80 && coverage >= 95) {
    overallStatus = "🟢 HEALTHY";
  } else if (healthScore >= 60 && coverage >= 80) {
    overallStatus = "🟡 CAUTION";
  } else if (healthScore >= 40 && coverage >= 60) {
    overallStatus = "🟠 AT RISK";
  } else {
    overallStatus = "🔴 CRITICAL";
  }
  
  return {
    status: overallStatus,
    health_score: healthScore,
    coverage_percent: coverage.toFixed(1),
    execution_time_ms: executionTimeMs,
    metrics: {
      total_actions: totalActions,
      valid_mappings: validMappings,
      invalid_mappings: report.validationMatrix.invalid.length,
      orphaned_functions: report.validationMatrix.orphaned.length,
      missing_functions: report.missingFunctions.gaps.length,
      total_functions_scanned: report.functionInventory.count,
      consistency_score: report.crossModuleConsistency.consistency_score,
      rbac_roles_covered: report.rbacMatrix.roles.length
    },
    recommendations,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// EXPORT FUNCTION: Save Report to Google Doc
// ============================================================================

/**
 * Exports the parsed function inventory to a Google Doc for archival.
 * Useful for auditing changes across sessions.
 * 
 * @param {Object} report - Unified report object from parseFunctionInventory()
 * @param {string} folderName - Optional Google Drive folder name (defaults to "Akamas Audit")
 * @returns {Object} Document creation result
 */
function exportReportToDocument(report, folderName) {
  folderName = folderName || "Akamas Audit";
  
  try {
    // Find or create folder
    const folders = DriveApp.getFoldersByName(folderName);
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    // Create document
    const docName = `FunctionInventory_${new Date().toISOString().split('T')[0]}.doc`;
    const doc = DocumentApp.create(docName);
    const body = doc.getBody();
    
    // Move to folder
    const file = DriveApp.getFileById(doc.getId());
    file.moveTo(folder);
    
    // Add title
    body.appendParagraph(`Function Inventory Report`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Generated: ${report.timestamp}`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    
    // Add summary section
    body.appendParagraph("Executive Summary")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(`Status: ${report.summary.status}`);
    body.appendParagraph(`Health Score: ${report.summary.health_score}/100`);
    body.appendParagraph(`Coverage: ${report.summary.coverage_percent}%`);
    body.appendParagraph(`Execution Time: ${report.summary.execution_time_ms}ms`);
    
    // Add metrics
    body.appendParagraph("Metrics")
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const metricsText = `
Total Actions: ${report.summary.metrics.total_actions}
Valid Mappings: ${report.summary.metrics.valid_mappings}
Invalid Mappings: ${report.summary.metrics.invalid_mappings}
Orphaned Functions: ${report.summary.metrics.orphaned_functions}
Missing Functions: ${report.summary.metrics.missing_functions}
Total Functions Scanned: ${report.summary.metrics.total_functions_scanned}
Consistency Score: ${report.summary.metrics.consistency_score}/100
RBAC Roles Covered: ${report.summary.metrics.rbac_roles_covered}
    `;
    body.appendParagraph(metricsText);
    
    // Add recommendations
    if (report.summary.recommendations.length > 0) {
      body.appendParagraph("Recommendations")
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      report.summary.recommendations.forEach(rec => {
        body.appendParagraph(`[${rec.priority}] ${rec.action}`)
          .setBold(true);
        body.appendParagraph(`Impact: ${rec.impact}`);
      });
    }
    
    // Add missing functions detail
    if (report.missingFunctions.gaps.length > 0) {
      body.appendParagraph("Missing Functions (By Severity)")
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      
      ["CRITICAL", "HIGH", "MEDIUM", "LOW"].forEach(sev => {
        const gaps = report.missingFunctions.gaps.filter(g => g.severity === sev);
        if (gaps.length > 0) {
          body.appendParagraph(`${sev} (${gaps.length})`)
            .setHeading(DocumentApp.ParagraphHeading.HEADING3);
          gaps.forEach(gap => {
            body.appendParagraph(`${gap.action_name} → ${gap.missing_handler}`)
              .setBold(true);
            body.appendParagraph(`Reason: ${gap.reason}`);
          });
        }
      });
    }
    
    // End of file marker
    body.appendParagraph("\n" + report.endOfFile);
    
    Logger.log(`✅ Report exported to: ${doc.getUrl()}`);
    
    return {
      success: true,
      documentId: doc.getId(),
      documentUrl: doc.getUrl(),
      exportTimestamp: new Date().toISOString()
    };
    
  } catch (error) {
    Logger.log(`❌ Export failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// TEST FUNCTION: Validate Parser Output Structure
// ============================================================================

/**
 * Quick validation that parser output conforms to expected schema.
 * Run this after any parser modifications.
 * 
 * @returns {Object} Validation result
 */
function validateParserOutput() {
  const report = parseFunctionInventory();
  const requiredFields = [
    "timestamp",
    "environment",
    "goldenList",
    "functionInventory",
    "validationMatrix",
    "rbacMatrix",
    "missingFunctions",
    "crossModuleConsistency",
    "summary",
    "endOfFile"
  ];
  
  const missingFields = requiredFields.filter(field => !(field in report));
  
  if (missingFields.length === 0) {
    Logger.log("✅ Parser output structure is valid");
    return { valid: true, missingFields: [] };
  } else {
    Logger.log(`❌ Parser output missing fields: ${missingFields.join(", ")}`);
    return { valid: false, missingFields };
  }
}

// ============================================================================
// END OF FILE
// ============================================================================
// FunctionInventoryParser.gs - CHUNK 5 COMPLETE
// Last Modified: 2026-10-20
// Status: Ready for integration with HTMLFrontendValidator.gs
// =============================================================================

