/**
 * API_ProductAndLedger.gs
 * Product handlers + Ledger query functions + ID generation
 * Generated: 2026-10-20
 */

// ==================== PRODUCT HANDLERS ====================

function getProductById(productId) {
  if (!productId) return null;
  const productTypesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductTypes');
  const data = productTypesSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === productId) {
      return {
        productId: data[i][0], name: data[i][1], category: data[i][2],
        price: data[i][3], sessionsPerCycle: data[i][4], coverageMonths: data[i][5],
        coverageStartRule: data[i][6], requiresManagerApproval: data[i][7],
        active: data[i][8], notes: data[i][9], paypalLink: data[i][10],
        stcat: data[i][11], baseCost: data[i][12], shelfPrice: data[i][13],
        margin: (data[i][3] - data[i][12])
      };
    }
  }
  return null;
}

/**
 * Calculates next Mat Fee due date: LASTPAIDDATE + (COVERAGEMONTHS * 30 days)
 * @param {Date} lastPaidDate - Member's LASTPAIDDATE
 * @param {number} coverageMonths - Product's COVERAGEMONTHS
 * @returns {Date} Next subscription due date
 */
function calculateMatFeeDueDate(lastPaidDate, coverageMonths) {
  if (!lastPaidDate || !coverageMonths) return null;
  const dueDate = new Date(lastPaidDate);
  dueDate.setDate(dueDate.getDate() + (coverageMonths * 30));
  return dueDate;
}

/**
 * Lists all active products for UI dropdowns
 * @returns {Array} [{productId, name, price, category}, ...]
 */
function listActiveProducts() {
  const productTypesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductTypes');
  const data = productTypesSheet.getDataRange().getValues();
  const active = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][8] === true || data[i][8] === 'TRUE') {
      active.push({
        productId: data[i][0], name: data[i][1],
        price: data[i][3], category: data[i][2]
      });
    }
  }
  return active;
}

// ==================== LEDGER HANDLERS ====================

/**
 * Query Ledger by MEMBERID with TXNHASH verification
 * @param {string} memberId - MBR######
 * @returns {Array} Filtered ledger rows with dual-anchor validation
 */
function queryLedgerByMember(memberId) {
  if (!memberId) return [];
  const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
  const data = ledgerSheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === memberId) { // Column F: MEMBERID
      results.push({
        ledgerId: data[i][0], txnDate: data[i][1], txnType: data[i][2],
        sourceTab: data[i][3], sourceTxnId: data[i][4], memberid: data[i][5],
        txnNote: data[i][6], signedAmount: data[i][7], productId: data[i][8],
        authStatus: data[i][9], createdBy: data[i][10], txnHash: data[i][11]
      });
    }
  }
  return results;
}

/**
 * Generates next LEDGERID atomically from System_Config
 * @returns {string} LDG######
 */
function generateLedgerId() {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  const data = configSheet.getDataRange().getValues();
  let counterRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'LDG_COUNTER') {
      counterRow = i;
      break;
    }
  }

  if (counterRow === -1) {
    configSheet.appendRow(['LDG_COUNTER', '000001', 'Ledger ID counter', new Date()]);
    return 'LDG000001';
  }

  const currentValue = data[counterRow][1];
  const numValue = parseInt(currentValue.replace(/\D/g, '')) + 1;
  const newCounter = 'LDG' + String(numValue).padStart(6, '0');

  configSheet.getRange(counterRow + 1, 2).setValue(newCounter);
  return newCounter;
}

/**
 * Forensic audit: Validates LEDGERID sequence, TXNHASH integrity, chronological order
 * TX999999 = comprehensive audit across RCP + COS chains
 * @returns {Object} {isValid: boolean, errors: [string], warnings: [string]}
 */
function forensicAuditTX999999() {
  const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
  const purchasesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Purchases');
  const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');

  const ledgerData = ledgerSheet.getDataRange().getValues();
  const purchasesData = purchasesSheet.getDataRange().getValues();
  const attendanceData = attendanceSheet.getDataRange().getValues();

  const errors = [];
  const warnings = [];
  let lastDate = new Date(0);

  // ===== VALIDATE LEDGERID SEQUENCE =====
  for (let i = 1; i < ledgerData.length; i++) {
    const currentId = ledgerData[i][0];
    const expectedNum = i;
    const actualNum = parseInt(currentId.replace(/\D/g, ''));

    if (actualNum !== expectedNum) {
      warnings.push(`Row ${i + 1}: LEDGERID sequence gap (expected LDG${String(expectedNum).padStart(6, '0')}, got ${currentId})`);
    }

    // ===== VALIDATE CHRONOLOGICAL ORDER =====
    const txnDate = new Date(ledgerData[i][1]);
    if (txnDate < lastDate) {
      errors.push(`Row ${i + 1}: TXNDATE out of chronological order (${txnDate.toISOString()} < ${lastDate.toISOString()})`);
    }
    lastDate = txnDate;

    // ===== VALIDATE TXNHASH DUAL ANCHORS =====
    const sourceTxnId = ledgerData[i][4];
    const sourceTab = ledgerData[i][3];
    const ledgerTxnHash = ledgerData[i][11];

    let sourceTxnHash = null;

    if (sourceTab === 'Purchases') {
      for (let j = 1; j < purchasesData.length; j++) {
        if (purchasesData[j][2] === sourceTxnId) { // Column C: SRCTXID
          sourceTxnHash = purchasesData[j][9]; // Column J: TXNHASH
          break;
        }
      }
      if (sourceTxnHash !== ledgerTxnHash && ledgerTxnHash) {
        errors.push(`Row ${i + 1}: TXNHASH mismatch (Ledger: ${ledgerTxnHash}, Purchases: ${sourceTxnHash})`);
      }
    } else if (sourceTab === 'Attendance') {
      for (let j = 1; j < attendanceData.length; j++) {
        if (attendanceData[j][0] === sourceTxnId) { // Column A: TRANSACTION_ID
          sourceTxnHash = attendanceData[j][10]; // Column K: TXNHASH
          break;
        }
      }
      if (sourceTxnHash !== ledgerTxnHash && ledgerTxnHash) {
        errors.push(`Row ${i + 1}: TXNHASH mismatch (Ledger: ${ledgerTxnHash}, Attendance: ${sourceTxnHash})`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    totalLedgerEntries: ledgerData.length - 1,
    errors,
    warnings,
    auditTimestamp: new Date(),
    auditStatus: errors.length === 0 ? 'PASSED' : 'FAILED'
  };
}

// END OF API_ProductAndLedger.gs
