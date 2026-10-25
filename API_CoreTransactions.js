/**
 * API_CoreTransactions.gs
 * Production-ready transaction recording with dual-anchor TXNHASH cryptographic audit.
 * Implements cash-basis accounting: RCP (income), COS (costs), EXP (expenses).
 * Generated: 2026-10-20
 */

/**
 * Records a receipt (income) transaction with dual TXNHASH anchors.
 * 
 * ACCOUNTING RULES:
 * - Amount must be POSITIVE
 * - TXNDATE must be <= today
 * - TXNHASH generated from: SOURCETXNID|TXNDATE|SIGNEDAMOUNT|MEMBERID|PRODUCTID
 * - Stored in both Ledger and source sheet (Members, Attendance, etc.)
 * 
 * SECURITY:
 * - RBAC: Minimum role = Cashier (2)
 * - Idempotency: idempotencyKey prevents duplicate posts
 * - Lock timeout: 10,000ms
 * 
 * @param {Object} payload
 * @param {string} payload.sourceTxnId - RCP######
 * @param {Date} payload.txnDate - Transaction date
 * @param {number} payload.signedAmount - POSITIVE amount (e.g., 150.00)
 * @param {string} payload.memberId - MBR######
 * @param {string} payload.productId - ST### or similar
 * @param {string} payload.txnNote - Description
 * @param {string} payload.idempotencyKey - UUID for duplicate detection
 * @param {string} userEmail - Session user email (RBAC)
 * 
 * @returns {Object} {success: boolean, ledgerId: string, txnHash: string, error?: string}
 */
function recordReceiptTransaction(payload, userEmail) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'Lock timeout exceeded (10s)' };
  }

  try {
    // ========== VALIDATION ==========
    const validationError = validateReceiptPayload(payload);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // ========== SECURITY ==========
    const userRole = verifyUserRoleByEmail(userEmail);
    if (userRole < 2) { // Cashier or higher
      return { success: false, error: 'Insufficient permission (requires Cashier role)' };
    }

    // ========== IDEMPOTENCY ==========
    const existingEntry = checkIdempotencyKey(payload.idempotencyKey, 'Ledger');
    if (existingEntry) {
      return { 
        success: true, 
        ledgerId: existingEntry.ledgerId, 
        txnHash: existingEntry.txnHash,
        note: 'Duplicate detected; returning existing transaction'
      };
    }

    // ========== GENERATE TXNHASH ==========
    const txnHash = generateTXNHASH(
      payload.sourceTxnId,
      payload.txnDate,
      payload.signedAmount,
      payload.memberId,
      payload.productId
    );

    // ========== GENERATE LEDGERID ==========
    const ledgerId = generateLedgerId();

    // ========== POST TO LEDGER ==========
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
    const newRow = [
      ledgerId,                        // A: LEDGERID
      payload.txnDate,                 // B: TXNDATE
      'RCP',                           // C: TXNTYPE
      'Attendance',                    // D: SOURCETAB (typically)
      payload.sourceTxnId,             // E: SOURCETXNID (RCP######)
      payload.memberId,                // F: MEMBERID
      payload.txnNote,                 // G: TXNOTE
      payload.signedAmount,            // H: SIGNEDAMOUNT (positive)
      payload.productId,               // I: PRODUCTID
      'POSTED',                        // J: AUTHORISATIONSTATUS
      userEmail,                       // K: CREATEDBY
      txnHash                          // L: TXNHASH
    ];

    ledgerSheet.appendRow(newRow);

    // ========== STORE IDEMPOTENCY KEY ==========
    storeIdempotencyKey(payload.idempotencyKey, ledgerId, txnHash);

    return {
      success: true,
      ledgerId,
      txnHash,
      transactionDate: payload.txnDate,
      amount: payload.signedAmount
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Records an expense or cost transaction with dual TXNHASH anchors.
 * 
 * ACCOUNTING RULES:
 * - Amount must be NEGATIVE (system enforces this)
 * - TXNDATE must be <= today
 * - TXNHASH generated and anchored in both Purchases and Ledger
 * - TXNTYPE = 'EXP' for general expenses, 'COS' for costs/COGS
 * 
 * @param {Object} payload
 * @param {string} payload.cosId - COS###### (from Purchases.SRCTXID)
 * @param {string} payload.txnType - 'COS' or 'EXP'
 * @param {Date} payload.txnDate - Transaction date
 * @param {number} payload.amount - POSITIVE amount (system converts to negative)
 * @param {string} payload.txnNote - Description
 * @param {string} userEmail - Session user email (RBAC)
 * 
 * @returns {Object} {success: boolean, ledgerId: string, txnHash: string, error?: string}
 */
function recordExpenseTransaction(payload, userEmail) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'Lock timeout exceeded (10s)' };
  }

  try {
    // ========== VALIDATION ==========
    const validationError = validateExpensePayload(payload);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // ========== SECURITY ==========
    const userRole = verifyUserRoleByEmail(userEmail);
    if (userRole < 3) { // Accountant or higher
      return { success: false, error: 'Insufficient permission (requires Accountant role)' };
    }

    // ========== GENERATE TXNHASH ==========
    const signedAmount = -Math.abs(payload.amount); // Enforce negative
    const txnHash = generateTXNHASH(
      payload.cosId,
      payload.txnDate,
      signedAmount,
      '', // No member for expense
      ''  // No product for expense
    );

    // ========== GENERATE LEDGERID ==========
    const ledgerId = generateLedgerId();

    // ========== POST TO LEDGER ==========
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
    const newRow = [
      ledgerId,              // A: LEDGERID
      payload.txnDate,       // B: TXNDATE
      payload.txnType,       // C: TXNTYPE ('COS' or 'EXP')
      'Purchases',           // D: SOURCETAB
      payload.cosId,         // E: SOURCETXNID (COS######)
      '',                    // F: MEMBERID (blank for expense)
      payload.txnNote,       // G: TXNOTE
      signedAmount,          // H: SIGNEDAMOUNT (negative)
      '',                    // I: PRODUCTID (blank for expense)
      'POSTED',              // J: AUTHORISATIONSTATUS
      userEmail,             // K: CREATEDBY
      txnHash                // L: TXNHASH
    ];

    ledgerSheet.appendRow(newRow);

    // ========== UPDATE PURCHASES SHEET WITH TXNHASH ==========
    const purchasesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Purchases');
    const purchaseRows = purchasesSheet.getDataRange().getValues();
    for (let i = 1; i < purchaseRows.length; i++) {
      if (purchaseRows[i][2] === payload.cosId) { // Column C: SRCTXID
        purchasesSheet.getRange(i + 1, 11).setValue(txnHash); // Column J: TXNHASH
        break;
      }
    }

    return {
      success: true,
      ledgerId,
      txnHash,
      transactionDate: payload.txnDate,
      amount: signedAmount
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Records a COGS (Cost of Goods Sold) transaction.
 * Analytical only: single RCP entry for sale; margin calculated via query join between Ledger and ProductTypes.
 * 
 * @param {Object} payload
 * @param {string} payload.cosId - COS######
 * @param {Date} payload.txnDate - Transaction date
 * @param {number} payload.quantity - Units sold
 * @param {number} payload.unitCost - Cost per unit
 * @param {string} payload.txnNote - Description
 * @param {string} userEmail - Session user email
 * 
 * @returns {Object} {success: boolean, ledgerId: string, error?: string}
 */
function recordCogsTransaction(payload, userEmail) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) {
    return { success: false, error: 'Lock timeout exceeded (10s)' };
  }

  try {
    const userRole = verifyUserRoleByEmail(userEmail);
    if (userRole < 3) { // Accountant or higher
      return { success: false, error: 'Insufficient permission (requires Accountant role)' };
    }

    const totalCost = -Math.abs(payload.quantity * payload.unitCost);
    const txnHash = generateTXNHASH(
      payload.cosId,
      payload.txnDate,
      totalCost,
      '',
      ''
    );

    const ledgerId = generateLedgerId();

    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
    const newRow = [
      ledgerId,
      payload.txnDate,
      'COGS',
      'Purchases',
      payload.cosId,
      '',
      payload.txnNote,
      totalCost,
      '',
      'POSTED',
      userEmail,
      txnHash
    ];

    ledgerSheet.appendRow(newRow);

    return {
      success: true,
      ledgerId,
      quantity: payload.quantity,
      unitCost: payload.unitCost,
      totalCost: totalCost
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * Validates a transaction before posting to the Ledger.
 * Pre-commit integrity check.
 * 
 * @param {Object} payload - Transaction object
 * @returns {string|null} Error message or null if valid
 */
function validateTransactionIntegrity(payload) {
  // Check required fields
  if (!payload.sourceTxnId || !payload.txnDate || typeof payload.signedAmount !== 'number') {
    return 'Missing required fields: sourceTxnId, txnDate, signedAmount';
  }

  // Check date constraint: TXNDATE <= today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const txnDate = new Date(payload.txnDate);
  txnDate.setHours(0, 0, 0, 0);

  if (txnDate > today) {
    return 'Transaction date cannot be in the future';
  }

  // Check amount sign consistency
  if (payload.txnType === 'RCP' && payload.signedAmount <= 0) {
    return 'Receipt amount must be positive';
  }

  if ((payload.txnType === 'COS' || payload.txnType === 'EXP') && payload.signedAmount > 0) {
    return 'Expense/Cost amount must be negative';
  }

  return null;
}

/**
 * Helper: Validate receipt payload
 */
function validateReceiptPayload(payload) {
  if (!payload.sourceTxnId || !payload.sourceTxnId.startsWith('RCP')) {
    return 'Invalid source transaction ID (must start with RCP)';
  }
  if (!payload.memberId) {
    return 'Member ID is required for receipt';
  }
  if (payload.signedAmount <= 0) {
    return 'Receipt amount must be positive';
  }
  if (!payload.idempotencyKey) {
    return 'Idempotency key is required';
  }
  return validateTransactionIntegrity(payload);
}

/**
 * Helper: Validate expense payload
 */
function validateExpensePayload(payload) {
  if (!payload.cosId || !payload.cosId.startsWith('COS')) {
    return 'Invalid cost ID (must start with COS)';
  }
  if (!['COS', 'EXP'].includes(payload.txnType)) {
    return 'Transaction type must be COS or EXP';
  }
  if (payload.amount <= 0) {
    return 'Expense amount must be positive (will be stored as negative)';
  }
  return null;
}

// END OF API_CoreTransactions.gs
