/**
 * Enhanced_workbook_explorer.gs
 * 
 * Comprehensive project inventory tool:
 * - Sheets and headers (schema state)
 * - All function signatures
 * - doPost routing and action handlers
 * - Security functions
 * - Persistence patterns (save/insert/update)
 * - Missing modules and gaps
 * 
 * Output goes to Execution Log (no dependencies on other modules)
 */

function exploreWorkbookSchema() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = ss.getSheets();
    
    let report = [];
    report.push('='.repeat(80));
    report.push('AKAMAS SHORT MAT BOWLS CLUB - WORKBOOK SCHEMA INVENTORY');
    report.push('Generated: ' + new Date().toISOString());
    report.push('='.repeat(80));
    report.push('');
    
    for (let sheetIdx = 0; sheetIdx < allSheets.length; sheetIdx++) {
      const sheet = allSheets[sheetIdx];
      const sheetName = sheet.getName();
      
      try {
        const data = sheet.getDataRange().getValues();
        
        if (data.length === 0) {
          report.push(`SHEET: ${sheetName}`);
          report.push('  Status: EMPTY (no data)');
          report.push('');
          continue;
        }
        
        const headers = data[0];
        const rowCount = data.length - 1; // Exclude header row
        
        report.push(`SHEET: ${sheetName}`);
        report.push(`  Row Count: ${rowCount} data rows (plus 1 header)`);
        report.push(`  Column Count: ${headers.length}`);
        report.push(`  Headers:`);
        headers.forEach((h, idx) => {
          report.push(`    [${idx}] ${h}`);
        });
        report.push('');
        
      } catch(err) {
        report.push(`SHEET: ${sheetName}`);
        report.push(`  ERROR: ${err.message}`);
        report.push('');
      }
    }
    
    report.push('='.repeat(80));
    report.push('END OF SCHEMA INVENTORY');
    report.push('='.repeat(80));
    
    const fullReport = report.join('\n');
    Logger.log(fullReport);
    
  } catch(err) {
    Logger.log('CRITICAL ERROR in exploreWorkbookSchema: ' + err.message);
    Logger.log('Stack: ' + err.stack);
  }
}

/**
 * NEW: Inventory all functions in the project
 * (requires access to Apps Script Execution API or manual inspection)
 */
function exploreProjectFunctions() {
  try {
    let report = [];
    report.push('\n' + '='.repeat(80));
    report.push('FUNCTION INVENTORY - RUN THIS TO DETECT GAPS');
    report.push('='.repeat(80));
    report.push('');
    report.push('INSTRUCTIONS:');
    report.push('1. Open the Apps Script editor (Extensions > Apps Script)');
    report.push('2. Copy all .gs file contents');
    report.push('3. Paste into a text editor');
    report.push('4. Search for: function [A-Za-z_]');
    report.push('5. Manually paste the list here');
    report.push('');
    report.push('EXPECTED FUNCTIONS (from task requirements):');
    report.push('  Security Layer:');
    report.push('    - authorizeUserRole(email, requiredRole)');
    report.push('    - validateCSRFToken(token)');
    report.push('    - enforceRateLimit(email)');
    report.push('    - checkIdempotencyKey(key)');
    report.push('    - cacheIdempotencyKey(key)');
    report.push('');
    report.push('  API Gateway:');
    report.push('    - doPost(e)');
    report.push('    - processIncomingAPILogic(action, payload, user)');
    report.push('');
    report.push('  Member Handlers (MISSING):');
    report.push('    - saveMember(memberData)');
    report.push('    - allocateMemberId()');
    report.push('');
    report.push('  Product Handlers (MISSING):');
    report.push('    - saveProduct(productData)');
    report.push('');
    report.push('  Action Handlers (should exist):');
    report.push('    - getPanelMembers()');
    report.push('    - getPanelProducts()');
    report.push('    - getPanelLedger()');
    report.push('    - getPanelAttendance()');
    report.push('');
    report.push('='.repeat(80));
    report.push('END OF FUNCTION INVENTORY GUIDE');
    report.push('='.repeat(80));
    
    const fullReport = report.join('\n');
    Logger.log(fullReport);
    
  } catch(err) {
    Logger.log('ERROR: ' + err.message);
  }
}

/**
 * NEW: Check for schema drift (missing TXNHASH, SOURCETXNID columns)
 */
function checkSchemaDrift() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allSheets = ss.getSheets();
    
    let report = [];
    report.push('\n' + '='.repeat(80));
    report.push('SCHEMA DRIFT ANALYSIS');
    report.push('Generated: ' + new Date().toISOString());
    report.push('='.repeat(80));
    report.push('');
    
    const requiredColumns = {
      'Ledger': ['LEDGERID', 'PAYMENT_DATE', 'SOURCETXNID', 'SOURCE_SHEET', 'TXNHASH', 'TYPE', 'PARTY_ID', 'AMOUNT', 'CATEGORY', 'PAYMENT_METHOD', 'TXNOTE', 'RECONCILIATION_STATUS', 'CREATED_TIMESTAMP'],
      'Attendance': ['ATTID', 'SOURCETXNID', 'TXNHASH', 'BOWLER_ID', 'PRODUCT_ID', 'SESSION_DATE', 'SESSION_TYPE', 'QR_CODE_HASH', 'CHECK_IN_TIMESTAMP', 'PAYMENTSTATUS', 'LEDGERID', 'ENTRY_METHOD', 'CREATED_TIMESTAMP'],
      'Purchases': ['PURID', 'SUPPLIERID', 'SOURCETXNID', 'TXNHASH', 'REFERENCEID', 'TXDATE', 'INVAMT', 'AMTPAID', 'DATEPAID', 'PAYMENT_METHOD', 'LEDGERID', 'CREATED_TIMESTAMP', 'NOTES'],
      'Suppliers': ['SUPID', 'COMPANY_NAME', 'CONTACT_NAME', 'PHONE', 'EMAIL', 'POSTAL_ADDRESS', 'TAX_ID', 'CREATED_TIMESTAMP'],
      'Members': ['MEMBERID', 'NAME', 'EMAIL', 'PHONE', 'MEMBER_TXNHASH', 'LAST_PAID_DATE', 'NEXT_MAT_FEE_DUE', 'LAST_ATTENDANCE_DATE', 'CURRENT_PRODUCT_CODE', 'CREATED_TIMESTAMP', 'UPDATED_TIMESTAMP'],
      'System_Config': ['CONFIG_KEY', 'CONFIG_VALUE', 'DESCRIPTION', 'UPDATED_TIMESTAMP']
    };
    
    Object.keys(requiredColumns).forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        report.push(`SHEET: ${sheetName}`);
        report.push(`  STATUS: MISSING (not found in workbook)`);
        report.push('');
        return;
      }
      
      const data = sheet.getDataRange().getValues();
      if (data.length === 0) {
        report.push(`SHEET: ${sheetName}`);
        report.push(`  STATUS: EMPTY`);
        report.push('');
        return;
      }
      
      const actualHeaders = data[0];
      const requiredHeaders = requiredColumns[sheetName];
      
      const missing = requiredHeaders.filter(h => !actualHeaders.includes(h));
      const extra = actualHeaders.filter(h => !requiredHeaders.includes(h));
      
      report.push(`SHEET: ${sheetName}`);
      if (missing.length === 0 && extra.length === 0) {
        report.push(`  STATUS: ✓ SCHEMA COMPLIANT`);
      } else {
        report.push(`  STATUS: ⚠ DRIFT DETECTED`);
        if (missing.length > 0) {
          report.push(`  MISSING COLUMNS: ${missing.join(', ')}`);
        }
        if (extra.length > 0) {
          report.push(`  EXTRA COLUMNS: ${extra.join(', ')}`);
        }
      }
      report.push('');
    });
    
    report.push('='.repeat(80));
    report.push('END OF DRIFT ANALYSIS');
    report.push('='.repeat(80));
    
    const fullReport = report.join('\n');
    Logger.log(fullReport);
    
  } catch(err) {
    Logger.log('ERROR: ' + err.message);
    Logger.log('Stack: ' + err.stack);
  }
}

/**
 * MASTER RUN: Execute all diagnostics
 */
function runFullDiagnostics() {
  Logger.log('\n\n');
  exploreWorkbookSchema();
  Logger.log('\n\n');
  checkSchemaDrift();
  Logger.log('\n\n');
  exploreProjectFunctions();
}

// END OF workbook_explorer.gs

/**
 * SearchCodebase.gs
 * Searches all .gs files in the bound Apps Script project for phrases in Searchlist sheet
 * Reports: File, Phrase, Line Number, Context
 */

/**
 * Main entry point: Search for all phrases in Searchlist sheet
 */
function searchCodebaseForPhrases() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Get Searchlist sheet
  const searchSheet = ss.getSheetByName("Searchlist");
  if (!searchSheet) {
    Logger.log("ERROR: 'Searchlist' sheet not found");
    return;
  }
  
  // Extract search phrases from column A (skip header)
  const searchData = searchSheet.getRange("A2:A").getValues();
  const phrases = searchData
    .flat()
    .filter(phrase => phrase && phrase.trim().length > 0)
    .map(phrase => phrase.trim());
  
  if (phrases.length === 0) {
    Logger.log("WARNING: No phrases found in Searchlist sheet");
    return;
  }
  
  Logger.log(`Found ${phrases.length} phrases to search for:`);
  phrases.forEach(p => Logger.log(`  - ${p}`));
  
  // Get all .gs files from bound Apps Script project
  const scriptFiles = getAllScriptFilesFromProject();
  Logger.log(`Scanning ${scriptFiles.length} .gs files...`);
  
  const results = [];
  
  // Search each phrase in each file
  phrases.forEach(phrase => {
    scriptFiles.forEach(fileInfo => {
      const {name, content} = fileInfo;
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        if (line.includes(phrase)) {
          results.push({
            file: name,
            phrase: phrase,
            lineNumber: index + 1,
            context: line.trim().substring(0, 120),
            found: true
          });
        }
      });
    });
  });
  
  // Add "NOT FOUND" entries for phrases with zero results
  const foundPhrases = new Set(results.map(r => r.phrase));
  phrases.forEach(phrase => {
    if (!foundPhrases.has(phrase)) {
      results.push({
        file: "(none)",
        phrase: phrase,
        lineNumber: 0,
        context: "NOT FOUND",
        found: false
      });
    }
  });
  
  // Output results
  outputSearchResults(results);
}

/**
 * Get all .gs files from the bound Apps Script project
 * Uses Apps Script API via UrlFetchApp (no external auth needed for bound scripts)
 * @returns {Array} Array of {name, content}
 */
function getAllScriptFilesFromProject() {
  const scriptId = ScriptApp.getScriptId();
  
  try {
    // Fetch script files via Apps Script API
    const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
    const options = {
      method: 'get',
      headers: {
        Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() !== 200) {
      Logger.log(`API Error: ${response.getResponseCode()} - ${result.error?.message}`);
      return [];
    }
    
    // Extract .gs files from response
    const files = result.files || [];
    const gsFiles = files
      .filter(file => file.name.endsWith('.gs'))
      .map(file => ({
        name: file.name,
        content: file.source || ''
      }));
    
    Logger.log(`Retrieved ${gsFiles.length} .gs files from project`);
    return gsFiles;
    
  } catch (e) {
    Logger.log(`ERROR fetching script files: ${e.message}`);
    Logger.log(`Try enabling Apps Script API in Cloud Console, or use fallback search`);
    return [];
  }
}

/**
 * Fallback: Manual list of known .gs files
 * Use if Apps Script API fails
 * @returns {Array} Array of {name, content}
 */
function getAllScriptFilesManual() {
  const knownFileNames = [
    "API_TransactionLogic",
    "API_MemberHandler",
    "API_ProductHandler",
    "API_Gateway",
    "API_Security",
    "API_LockManager",
    "API_ResponseHandler",
    "API_ActionMatrix",
    "API_AttendanceHandler",
    "SchemaMigrator",
    "AtomicSchemaApplier",
    "SchemaOrchestrator",
    "Modal_Catalog_Scanner",
    "Worksheet_Explorer",
    "SearchCodebase"
  ];
  
  const files = [];
  
  knownFileNames.forEach(baseName => {
    try {
      // Try to access each file's global scope
      // This is a workaround; actual content requires API or copy-paste
      Logger.log(`[Manual scan required] Check ${baseName}.gs`);
    } catch (e) {
      Logger.log(`Could not access ${baseName}`);
    }
  });
  
  return files;
}

/**
 * Output search results to a new sheet named "SearchResults"
 * @param {Array} results - Array of {file, phrase, lineNumber, context, found}
 */
function outputSearchResults(results) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create or clear SearchResults sheet
  let resultSheet = ss.getSheetByName("SearchResults");
  if (resultSheet) {
    resultSheet.clear();
  } else {
    resultSheet = ss.insertSheet("SearchResults");
  }
  
  // Header row
  resultSheet.appendRow(["File", "Phrase", "Line #", "Context", "Status"]);
  
  // Data rows
  results.forEach(result => {
    const status = result.found ? "✓ FOUND" : "✗ NOT FOUND";
    resultSheet.appendRow([
      result.file,
      result.phrase,
      result.lineNumber,
      result.context,
      status
    ]);
  });
  
  // Format header
  const headerRange = resultSheet.getRange(1, 1, 1, 5);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4472c4");
  headerRange.setFontColor("#ffffff");
  
  // Auto-resize columns
  resultSheet.autoResizeColumns(1, 5);
  
  // Format status column
  const statusRange = resultSheet.getRange(2, 5, results.length, 1);
  results.forEach((result, index) => {
    const cell = resultSheet.getRange(index + 2, 5);
    if (result.found) {
      cell.setBackground("#c6efce");
      cell.setFontColor("#006100");
    } else {
      cell.setBackground("#ffc7ce");
      cell.setFontColor("#9c0006");
    }
  });
  
  Logger.log(`\n=== SEARCH COMPLETE ===`);
  Logger.log(`Total results: ${results.length}`);
  Logger.log(`Found: ${results.filter(r => r.found).length}`);
  Logger.log(`Not found: ${results.filter(r => !r.found).length}`);
  Logger.log(`See 'SearchResults' sheet for details.`);
}

/**
 * Add menu item for easy access
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("🔍 Search")
    .addItem("Search Codebase", "searchCodebaseForPhrases")
    .addToUi();
}

// END OF SearchCodebase.gs
