/**
 * SchemaMigrator.gs — PART A
 * 
 * Dual-stage drift detection and validation framework for Akamas SMBC database engine.
 * Compares live worksheet structures against SCHEMA_REGISTRY v1.2.0 baseline.
 * 
 * Concurrency: Safe for multi-user environments via LockService with 30-second timeout.
 */

// ============================================================================
// SCHEMA_REGISTRY v1.2.0
// ============================================================================
const SCHEMA_REGISTRY = {
  version: "1.2.0",
  lastUpdated: new Date("2026-10-18"),
  
  sheets: {
    "Ledger": {
      columns: [
        { name: "LEDGERID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "PAYMENT_DATE", type: "DATE", required: true, position: 1 },
        { name: "SOURCETXNID", type: "STRING", required: true, position: 2 },
        { name: "SOURCE_SHEET", type: "STRING", required: true, position: 3 },
        { name: "TXNHASH", type: "STRING", required: true, unique: true, position: 4 },
        { name: "TYPE", type: "STRING", required: true, position: 5 },
        { name: "PARTY_ID", type: "STRING", required: false, position: 6 },
        { name: "AMOUNT", type: "NUMBER", required: true, position: 7 },
        { name: "CATEGORY", type: "STRING", required: true, position: 8 },
        { name: "PAYMENT_METHOD", type: "STRING", required: true, position: 9 },
        { name: "TXNOTE", type: "STRING", required: false, position: 10 },
        { name: "RECONCILIATION_STATUS", type: "STRING", required: true, position: 11 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 12 }
      ],
      readOnly: true,
      minRows: 1
    },
    
    "Attendance": {
      columns: [
        { name: "ATTID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "SOURCETXNID", type: "STRING", required: false, position: 1 },
        { name: "TXNHASH", type: "STRING", required: false, unique: true, position: 2 },
        { name: "BOWLER_ID", type: "STRING", required: true, position: 3 },
        { name: "PRODUCT_ID", type: "STRING", required: true, position: 4 },
        { name: "SESSION_DATE", type: "DATE", required: true, position: 5 },
        { name: "SESSION_TYPE", type: "STRING", required: true, position: 6 },
        { name: "QR_CODE_HASH", type: "STRING", required: false, position: 7 },
        { name: "CHECK_IN_TIMESTAMP", type: "DATETIME", required: true, position: 8 },
        { name: "PAYMENTSTATUS", type: "STRING", required: true, position: 9 },
        { name: "LEDGERID", type: "STRING", required: false, position: 10 },
        { name: "ENTRY_METHOD", type: "STRING", required: true, position: 11 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 12 }
      ],
      readOnly: true,
      minRows: 1
    },
    
    "Purchases": {
      columns: [
        { name: "PURID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "SUPPLIERID", type: "STRING", required: true, position: 1 },
        { name: "SOURCETXNID", type: "STRING", required: true, position: 2 },
        { name: "TXNHASH", type: "STRING", required: true, unique: true, position: 3 },
        { name: "REFERENCEID", type: "STRING", required: false, position: 4 },
        { name: "TXDATE", type: "DATE", required: true, position: 5 },
        { name: "INVAMT", type: "NUMBER", required: true, position: 6 },
        { name: "AMTPAID", type: "NUMBER", required: true, position: 7 },
        { name: "DATEPAID", type: "DATE", required: false, position: 8 },
        { name: "PAYMENT_METHOD", type: "STRING", required: true, position: 9 },
        { name: "LEDGERID", type: "STRING", required: false, position: 10 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 11 },
        { name: "NOTES", type: "STRING", required: false, position: 12 }
      ],
      readOnly: true,
      minRows: 1
    },
    
    "Suppliers": {
      columns: [
        { name: "SUPID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "COMPANY_NAME", type: "STRING", required: true, position: 1 },
        { name: "CONTACT_NAME", type: "STRING", required: false, position: 2 },
        { name: "PHONE", type: "STRING", required: false, position: 3 },
        { name: "EMAIL", type: "STRING", required: false, position: 4 },
        { name: "POSTAL_ADDRESS", type: "STRING", required: false, position: 5 },
        { name: "TAX_ID", type: "STRING", required: false, position: 6 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 7 }
      ],
      readOnly: false,
      minRows: 1
    },
    
    "Bowlers": {
      columns: [
        { name: "BOWLER_ID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "FIRST_NAME", type: "STRING", required: true, position: 1 },
        { name: "LAST_NAME", type: "STRING", required: true, position: 2 },
        { name: "EMAIL", type: "STRING", required: false, position: 3 },
        { name: "PHONE", type: "STRING", required: false, position: 4 },
        { name: "MEMBERSHIP_STATUS", type: "STRING", required: true, position: 5 },
        { name: "MEMBER_TXNHASH", type: "STRING", required: false, position: 6 },
        { name: "LAST_PAID_DATE", type: "DATE", required: false, position: 7 },
        { name: "NEXT_MAT_FEE_DUE", type: "DATE", required: false, position: 8 },
        { name: "LAST_ATTENDANCE_DATE", type: "DATE", required: false, position: 9 },
        { name: "CURRENT_PRODUCT_CODE", type: "STRING", required: false, position: 10 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 11 },
        { name: "UPDATED_TIMESTAMP", type: "DATETIME", required: true, position: 12 }
      ],
      readOnly: true,
      minRows: 1
    },
    
    "Transactions": {
      columns: [
        { name: "TXID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "PAYMENT_DATE", type: "DATE", required: true, position: 1 },
        { name: "TYPE", type: "STRING", required: true, position: 2 },
        { name: "PARTY_ID", type: "STRING", required: false, position: 3 },
        { name: "AMOUNT", type: "NUMBER", required: true, position: 4 },
        { name: "CATEGORY", type: "STRING", required: true, position: 5 },
        { name: "PAYMENT_METHOD", type: "STRING", required: true, position: 6 },
        { name: "TXNHASH", type: "STRING", required: true, unique: true, position: 7 },
        { name: "SOURCETXNID", type: "STRING", required: false, position: 8 },
        { name: "TXNOTE", type: "STRING", required: false, position: 9 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 10 }
      ],
      readOnly: true,
      minRows: 1
    },
    
    "System_Config": {
      columns: [
        { name: "CONFIG_KEY", type: "STRING", required: true, unique: true, position: 0 },
        { name: "CONFIG_VALUE", type: "STRING", required: true, position: 1 },
        { name: "CONFIG_TYPE", type: "STRING", required: true, position: 2 },
        { name: "LAST_MODIFIED", type: "DATETIME", required: true, position: 3 },
        { name: "MODIFIED_BY", type: "STRING", required: true, position: 4 }
      ],
      readOnly: true,
      minRows: 1
    },
    
    "Users": {
      columns: [
        { name: "USERID", type: "STRING", required: true, unique: true, position: 0 },
        { name: "EMAIL", type: "STRING", required: true, unique: true, position: 1 },
        { name: "ROLE", type: "STRING", required: true, position: 2 },
        { name: "CREATED_TIMESTAMP", type: "DATETIME", required: true, position: 3 },
        { name: "UPDATED_TIMESTAMP", type: "DATETIME", required: true, position: 4 }
      ],
      readOnly: true,
      minRows: 1
    }
  }
};

// ============================================================================
// STAGE 1: LIVE INSPECTION & DRIFT DETECTION
// ============================================================================

/**
 * Inspects all live worksheets and detects deviations from SCHEMA_REGISTRY.
 * @returns {Object} Drift report keyed by sheet name
 */
function detectDrift() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driftReport = {};
  
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  
  try {
    Object.keys(SCHEMA_REGISTRY.sheets).forEach(sheetName => {
      const expectedSchema = SCHEMA_REGISTRY.sheets[sheetName];
      const sheet = ss.getSheetByName(sheetName);
      
      if (!sheet) {
        driftReport[sheetName] = {
          status: "SHEET_MISSING",
          details: `Sheet "${sheetName}" does not exist in workbook.`,
          severity: "CRITICAL"
        };
        return;
      }
      
      const liveHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const issues = [];
      
      // Check column count
      if (liveHeaders.length !== expectedSchema.columns.length) {
        issues.push({
          type: "COLUMN_COUNT_MISMATCH",
          expected: expectedSchema.columns.length,
          actual: liveHeaders.length
        });
      }
      
      // Check column names and order
      expectedSchema.columns.forEach((colDef, idx) => {
        if (liveHeaders[idx] !== colDef.name) {
          issues.push({
            type: "COLUMN_NAME_MISMATCH",
            position: idx,
            expected: colDef.name,
            actual: liveHeaders[idx] || "(missing)"
          });
        }
      });
      
      // Check sheet protection
      const protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
      const expectedProtection = expectedSchema.readOnly;
      const isProtected = protection && protection.isProtected();
      
      if (expectedProtection && !isProtected) {
        issues.push({
          type: "PROTECTION_MISMATCH",
          expected: "protected (read-only)",
          actual: "unprotected"
        });
      }
      
      driftReport[sheetName] = {
        status: issues.length === 0 ? "OK" : "DRIFT_DETECTED",
        issueCount: issues.length,
        issues: issues
      };
    });
  } finally {
    lock.releaseLock();
  }
  
  return driftReport;
}

// ============================================================================
// STAGE 2: VALIDATION RULES
// ============================================================================

/**
 * Validates critical business rules against live data and schema.
 * @returns {Object} Validation report
 */
function validateBusinessRules() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const validationReport = {};
  
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  
  try {
    // Ledger-specific validations
    const ledgerSheet = ss.getSheetByName("Ledger");
    if (ledgerSheet) {
      const ledgerValidation = {};
      const data = ledgerSheet.getDataRange().getValues();
      const ledgerIds = new Set();
      const txnHashes = new Set();
      const sequenceIssues = [];
      let lastLedgerId = 0;
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const ledgerId = row[0];
        const paymentDate = row[1];
        const txnHash = row[4];
        
        const numericId = parseInt(ledgerId.replace(/[^\d]/g, ''));
        
        if (ledgerIds.has(ledgerId)) {
          sequenceIssues.push(`Duplicate LEDGERID at row ${i + 1}: ${ledgerId}`);
        }
        ledgerIds.add(ledgerId);
        
        if (txnHashes.has(txnHash)) {
          sequenceIssues.push(`Duplicate TXNHASH at row ${i + 1}: ${txnHash}`);
        }
        txnHashes.add(txnHash);
        
        // Check LEDGERID sequence continuity
        if (numericId !== lastLedgerId + 1 && lastLedgerId > 0) {
          sequenceIssues.push(
            `LEDGERID sequence gap at row ${i + 1}: expected LEG${String(lastLedgerId + 1).padStart(6, '0')}, got ${ledgerId}`
          );
        }
        lastLedgerId = numericId;
        
        // Check date constraint: payment_date ≤ today
        if (paymentDate > new Date()) {
          sequenceIssues.push(`Future PAYMENT_DATE at row ${i + 1}: ${paymentDate}`);
        }
      }
      
      ledgerValidation.status = sequenceIssues.length === 0 ? "PASS" : "FAIL";
      ledgerValidation.issueCount = sequenceIssues.length;
      ledgerValidation.issues = sequenceIssues;
      validationReport.Ledger = ledgerValidation;
    }
    
    // Attendance-specific validations
    const attendanceSheet = ss.getSheetByName("Attendance");
    if (attendanceSheet) {
      const attValidation = {};
      const data = attendanceSheet.getDataRange().getValues();
      const attIds = new Set();
      const attIssues = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const attId = row[0];
        const sessionDate = row[5];
        const checkInTs = row[8];
        
        if (attIds.has(attId)) {
          attIssues.push(`Duplicate ATTID at row ${i + 1}: ${attId}`);
        }
        attIds.add(attId);
        
        // Check date constraint
        if (sessionDate > new Date()) {
          attIssues.push(`Future SESSION_DATE at row ${i + 1}: ${sessionDate}`);
        }
        
        // Check check-in timestamp is after session date
        if (checkInTs < sessionDate) {
          attIssues.push(
            `CHECK_IN_TIMESTAMP before SESSION_DATE at row ${i + 1}: ${checkInTs} < ${sessionDate}`
          );
        }
      }
      
      attValidation.status = attIssues.length === 0 ? "PASS" : "FAIL";
      attValidation.issueCount = attIssues.length;
      attValidation.issues = attIssues;
      validationReport.Attendance = attValidation;
    }
    
    // Purchases-specific validations
    const purchasesSheet = ss.getSheetByName("Purchases");
    if (purchasesSheet) {
      const purValidation = {};
      const data = purchasesSheet.getDataRange().getValues();
      const purIds = new Set();
      const purIssues = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const purId = row[0];
        const txDate = row[5];
        const datePaid = row[8];
        const invAmt = row[6];
        const amtPaid = row[7];
        
        if (purIds.has(purId)) {
          purIssues.push(`Duplicate PURID at row ${i + 1}: ${purId}`);
        }
        purIds.add(purId);
        
        // Check date constraint
        if (txDate > new Date()) {
          purIssues.push(`Future TXDATE at row ${i + 1}: ${txDate}`);
        }
        
        // If DATEPAID is set, must be >= TXDATE and ≤ today
        if (datePaid && datePaid !== '') {
          if (datePaid < txDate) {
            purIssues.push(
              `DATEPAID before TXDATE at row ${i + 1}: ${datePaid} < ${txDate}`
            );
          }
          if (datePaid > new Date()) {
            purIssues.push(`Future DATEPAID at row ${i + 1}: ${datePaid}`);
          }
        }
        
        // Amount validation: AMTPAID ≤ INVAMT
        if (amtPaid > invAmt) {
          purIssues.push(
            `AMTPAID exceeds INVAMT at row ${i + 1}: ${amtPaid} > ${invAmt}`
          );
        }
      }
      
      purValidation.status = purIssues.length === 0 ? "PASS" : "FAIL";
      purValidation.issueCount = purIssues.length;
      purValidation.issues = purIssues;
      validationReport.Purchases = purValidation;
    }
    
    // Bowlers-specific validations (unique constraints)
    const bowlersSheet = ss.getSheetByName("Bowlers");
    if (bowlersSheet) {
      const bowlValidation = {};
      const data = bowlersSheet.getDataRange().getValues();
      const bowlerIds = new Set();
      const emails = new Set();
      const bowlIssues = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const bowlerId = row[0];
        const email = row[3];
        const status = row[5];
        
        if (bowlerIds.has(bowlerId)) {
          bowlIssues.push(`Duplicate BOWLER_ID at row ${i + 1}: ${bowlerId}`);
        }
        bowlerIds.add(bowlerId);
        
        if (email && email !== '') {
          if (emails.has(email)) {
            bowlIssues.push(`Duplicate EMAIL at row ${i + 1}: ${email}`);
          }
          emails.add(email);
        }
        
        // Check valid membership status
        const validStatuses = ['ACTIVE', 'INACTIVE', 'LAPSED', 'SUSPENDED'];
        if (!validStatuses.includes(status)) {
          bowlIssues.push(
            `Invalid MEMBERSHIP_STATUS at row ${i + 1}: ${status}`
          );
        }
      }
      
      bowlValidation.status = bowlIssues.length === 0 ? "PASS" : "FAIL";
      bowlValidation.issueCount = bowlIssues.length;
      bowlValidation.issues = bowlIssues;
      validationReport.Bowlers = bowlValidation;
    }
    
  } finally {
    lock.releaseLock();
  }
  
  return validationReport;
}

// ============================================================================
// ORCHESTRATION: runFullMigrationCycle()
// ============================================================================

/**
 * Main entry point: runs full drift detection → validation → reporting cycle.
 * Call from menu or trigger.
 * 
 * @returns {Object} {success, driftReport, validationReport, timestamp}
 */
function runFullMigrationCycle() {
  const startTime = new Date();
  
  console.log("[SchemaMigrator] Starting full migration cycle...");
  
  // Stage 1: Drift Detection
  const driftReport = detectDrift();
  console.log("[SchemaMigrator] Drift detection complete", driftReport);
  
  // Stage 2: Validation
  const validationReport = validateBusinessRules();
  console.log("[SchemaMigrator] Validation complete", validationReport);
  
  // Summarize findings
  const driftSheetCount = Object.values(driftReport)
    .filter(r => r.status !== "OK").length;
  
  const validationFailCount = Object.values(validationReport)
    .filter(r => r.status !== "PASS").length;
  
  const result = {
    success: driftSheetCount === 0 && validationFailCount === 0,
    driftReport: driftReport,
    validationReport: validationReport,
    summary: {
      sheetsWithDrift: driftSheetCount,
      sheetsWithValidationFailures: validationFailCount,
      timestamp: startTime.toISOString(),
      duration_ms: new Date() - startTime
    }
  };
  
  // Log to console
  if (result.success) {
    console.log("[SchemaMigrator] ✓ All checks PASSED");
  } else {
    console.log("[SchemaMigrator] ✗ Issues detected:");
    console.log(JSON.stringify(result, null, 2));
  }
  
  return result;
}

/**
 * Menu helper: Creates menu item for migration cycle.
 */

function onOpen(e) {
  try {
    // System Catalog scan runs every time (needed for startup validation)
    runCatalogScan();  // ✅ This should always run
    
    // UI menu creation only in browser context
    try {
      const ui = SpreadsheetApp.getUi();
      const menu = ui.createMenu('Workbook Explorer');
      menu.addItem('Scan Catalog', 'runCatalogScan');
      menu.addToUi();
    } catch (uiError) {
      Logger.log("⚠ UI not available (non-browser context), but catalog scan completed");
    }
    
  } catch (e) {
    Logger.log("❌ onOpen error: " + e.toString());
  }
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Schema Tools')
    .addItem('Run Migration Cycle', 'runFullMigrationCycle')
    .addSeparator()
    .addItem('Detect Drift Only', 'detectDrift')
    .addItem('Validate Rules Only', 'validateBusinessRules')
    .addToUi();


}
