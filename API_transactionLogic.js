/**
 * API_TransactionLogic.gs
 * Core transaction recording engine with cryptographic integrity
 * Handles ledger entries, COGS pairing, settlement flows, and TXNHASH generation
 * Role: Atomic transaction recording, dual-anchor audit (LEDGERID + SOURCETXNID + TXNHASH)
 */

// Compatibility wrapper for legacy API_transactionLogic.js calls.
function generateTXNHASH(sourceTab, sourceTxnId, sourceId, userEmail, txnDate, txnTime, signedAmount, productId, txnType) {
  return RF_generateTXNHASH(sourceTab, sourceTxnId, sourceId, userEmail, txnDate, txnTime, signedAmount, productId, txnType);
}

function validateTXNHASH(row, userEmail) {
  return RF_validateTXNHASH(row, userEmail);
}

function generateLedgerId() {
  return RF_generateLedgerId();
}

function generateSourceTxnId(prefix) {
  return RF_generateSourceTxnId(prefix);
}

function recordToLedger(txn) {
  return RF_recordToLedger(txn);
}


/**
 * Generate SHA256 TXNHASH for transaction jigsaw integrity
 * Canonical: SOURCETXNID + PAYMENT_DATE + AMOUNT + PARTY_ID + CATEGORY
 * @param {string} sourceTxnId - Unique transaction ID (e.g., "RCP000001")
 * @param {Date} paymentDate - Date of transaction
 * @param {number} amount - Amount in pence (signed: + or -)
 * @param {string} partyId - Member/Supplier/Other ID
 * @param {string} category - Transaction category
 * @returns {string} SHA256 hash (64-char hex)
 */


/**
 * Validate TXNHASH integrity
 * Re-computes hash and compares with stored value
 * @param {string} storedHash - Hash stored in source or ledger
 * @param {string} sourceTxnId - Transaction ID
 * @param {Date} paymentDate - Payment date
 * @param {number} amount - Amount (signed)
 * @param {string} partyId - Party ID
 * @param {string} category - Category
 * @returns {boolean} True if hash matches
 */

/**
 * Get next LEDGERID from SystemConfig
 * Atomically increments NEXTLEDGERID counter
 * @returns {string} Next LEDGERID (e.g., "LDG000001")
 */
function getNextLEDGERID() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("System_Config");
  
  if (!configSheet) {
    throw new Error("System_Config sheet not found");
  }

  // Find NEXTLEDGERID row
  const data = configSheet.getDataRange().getValues();
  let nextLedgerId = null;
  let ledgerIdRowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === "NEXTLEDGERID") {
      nextLedgerId = data[i][1];
      ledgerIdRowIndex = i + 1; // Google Sheets uses 1-based indexing
      break;
    }
  }

  if (!nextLedgerId) {
    throw new Error("NEXTLEDGERID not found in System_Config");
  }

  // Extract numeric part and increment
  const numericPart = parseInt(nextLedgerId.replace(/\D/g, ""), 10);
  const newNumeric = numericPart + 1;
  const newId = "LDG" + String(newNumeric).padStart(6, "0");

  // Update in sheet
  configSheet.getRange(ledgerIdRowIndex, 2).setValue(newId);

  return nextLedgerId;
}

/**
 * Record transaction to Ledger sheet
 * Atomic write: single appendRow call
 * @param {Object} txn - Transaction object
 *   {sourceTxnId, paymentDate, sourceSheet, txnHash, type, partyId, amount, category, paymentMethod, txnote, reconciliationStatus}
 * @returns {string} Generated LEDGERID
 */
function recordToLedger(txn) {
  // Validate date constraint: payment_date <= today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (new Date(txn.paymentDate) > today) {
    throw new Error("ERR_DATE_CONSTRAINT: payment_date cannot be in the future");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName("Ledger");
  
  if (!ledgerSheet) {
    throw new Error("Ledger sheet not found");
  }

  // Get next LEDGERID
  const ledgerId = getNextLEDGERID();

  // Build ledger row: [LEDGERID, PAYMENT_DATE, SOURCETXNID, SOURCE_SHEET, TXNHASH, TYPE, PARTY_ID, AMOUNT, CATEGORY, PAYMENT_METHOD, TXNOTE, RECONCILIATION_STATUS, CREATED_TIMESTAMP]
  const createdTimestamp = new Date().toISOString();
  const ledgerRow = [
    ledgerId,
    txn.paymentDate,
    txn.sourceTxnId,
    txn.sourceSheet,
    txn.txnHash,
    txn.type, // RCP, EXP, COGS, etc.
    txn.partyId,
    txn.amount, // Signed: + or -
    txn.category,
    txn.paymentMethod,
    txn.txnote || "",
    txn.reconciliationStatus || "PENDING",
    createdTimestamp
  ];

  // Atomic write
  ledgerSheet.appendRow(ledgerRow);

  return ledgerId;
}

// function recordCOGS() required here

/**
 * API_TransactionLogic.gs
 * Core transaction recording engine with cryptographic integrity
 * Handles ledger entries, COGS pairing, settlement flows, and TXNHASH generation
 * Role: Atomic transaction recording, dual-anchor audit (LEDGERID + SOURCETXNID + TXNHASH)
 */

/**
 * Generate SHA256 TXNHASH for transaction jigsaw integrity
 * Canonical: SOURCETXNID + PAYMENT_DATE + AMOUNT + PARTY_ID + CATEGORY
 * @param {string} sourceTxnId - Unique transaction ID (e.g., "RCP000001")
 * @param {Date} paymentDate - Date of transaction
 * @param {number} amount - Amount in pence (signed: + or -)
 * @param {string} partyId - Member/Supplier/Other ID
 * @param {string} category - Transaction category
 * @returns {string} SHA256 hash (64-char hex)
 */


/**
 * Validate TXNHASH integrity
 * Re-computes hash and compares with stored value
 * @param {string} storedHash - Hash stored in source or ledger
 * @param {string} sourceTxnId - Transaction ID
 * @param {Date} paymentDate - Payment date
 * @param {number} amount - Amount (signed)
 * @param {string} partyId - Party ID
 * @param {string} category - Category
 * @returns {boolean} True if hash matches
 */

/**
 * Get next LEDGERID from SystemConfig
 * Atomically increments NEXTLEDGERID counter
 * @returns {string} Next LEDGERID (e.g., "LDG000001")
 */
function getNextLEDGERID() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("System_Config");
  
  if (!configSheet) {
    throw new Error("System_Config sheet not found");
  }

  // Find NEXTLEDGERID row
  const data = configSheet.getDataRange().getValues();
  let nextLedgerId = null;
  let ledgerIdRowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === "NEXTLEDGERID") {
      nextLedgerId = data[i][1];
      ledgerIdRowIndex = i + 1; // Google Sheets uses 1-based indexing
      break;
    }
  }

  if (!nextLedgerId) {
    throw new Error("NEXTLEDGERID not found in System_Config");
  }

  // Extract numeric part and increment
  const numericPart = parseInt(nextLedgerId.replace(/\D/g, ""), 10);
  const newNumeric = numericPart + 1;
  const newId = "LDG" + String(newNumeric).padStart(6, "0");

  // Update in sheet
  configSheet.getRange(ledgerIdRowIndex, 2).setValue(newId);

  return nextLedgerId;
}

/**
 * Record transaction to Ledger sheet
 * Atomic write: single appendRow call
 * @param {Object} txn - Transaction object
 *   {sourceTxnId, paymentDate, sourceSheet, txnHash, type, partyId, amount, category, paymentMethod, txnote, reconciliationStatus}
 * @returns {string} Generated LEDGERID
 */
function recordToLedger(txn) {
  // Validate date constraint: payment_date <= today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (new Date(txn.paymentDate) > today) {
    throw new Error("ERR_DATE_CONSTRAINT: payment_date cannot be in the future");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName("Ledger");
  
  if (!ledgerSheet) {
    throw new Error("Ledger sheet not found");
  }

  // Get next LEDGERID
  const ledgerId = getNextLEDGERID();

  // Build ledger row: [LEDGERID, PAYMENT_DATE, SOURCETXNID, SOURCE_SHEET, TXNHASH, TYPE, PARTY_ID, AMOUNT, CATEGORY, PAYMENT_METHOD, TXNOTE, RECONCILIATION_STATUS, CREATED_TIMESTAMP]
  const createdTimestamp = new Date().toISOString();
  const ledgerRow = [
    ledgerId,
    txn.paymentDate,
    txn.sourceTxnId,
    txn.sourceSheet,
    txn.txnHash,
    txn.type, // RCP, EXP, COGS, etc.
    txn.partyId,
    txn.amount, // Signed: + or -
    txn.category,
    txn.paymentMethod,
    txn.txnote || "",
    txn.reconciliationStatus || "PENDING",
    createdTimestamp
  ];

  // Atomic write
  ledgerSheet.appendRow(ledgerRow);

  return ledgerId;
}

/**
 * Record COGS pair (merchandise sale requires dual entries)
 * Atomic: two ledger rows for same sourceTxnId on same paymentDate
 * @param {Object} params
 *   {sourceTxnId, paymentDate, productId, shelfPrice, baseCost, partyId, paymentMethod, txnote}
 * @returns {Object} {revenueledgerId, cogsLedgerId}
 */
function recordCOGSPair(params) {
  const {
    sourceTxnId,
    paymentDate,
    productId,
    shelfPrice,
    baseCost,
    partyId,
    paymentMethod,
    txnote
  } = params;

  // Validate that baseCost <= shelfPrice
  if (baseCost > shelfPrice) {
    throw new Error("ERR_VALIDATION: baseCost cannot exceed shelfPrice");
  }

  // Revenue entry: +shelfPrice
  const revenueTxnHash = generateTXNHASH(
    sourceTxnId,
    paymentDate,
    shelfPrice,
    partyId,
    "MERCHANDISE"
  );

  const revenueLedgerId = recordToLedger({
    sourceTxnId: sourceTxnId,
    paymentDate: paymentDate,
    sourceSheet: "Attendance", // Merchandise sales come from check-in
    txnHash: revenueTxnHash,
    type: "RCP", // Receipt
    partyId: partyId,
    amount: shelfPrice, // Positive
    category: "MERCHANDISE",
    paymentMethod: paymentMethod,
    txnote: txnote || `Merchandise sale: ${productId}`,
    reconciliationStatus: "PENDING"
  });

  // COGS entry: -baseCost
  const cogsTxnHash = generateTXNHASH(
    sourceTxnId,
    paymentDate,
    -baseCost,
    partyId,
    "COGS"
  );

  const cogsLedgerId = recordToLedger({
    sourceTxnId: sourceTxnId,
    paymentDate: paymentDate,
    sourceSheet: "Attendance",
    txnHash: cogsTxnHash,
    type: "COGS",
    partyId: partyId,
    amount: -baseCost, // Negative
    category: "COGS",
    paymentMethod: paymentMethod,
    txnote: txnote || `COGS offset: ${productId}`,
    reconciliationStatus: "PENDING"
  });

  return {
    revenueledgerId: revenueLedgerId,
    cogsLedgerId: cogsLedgerId,
    grossProfit: shelfPrice - baseCost
  };
}

/**
 * Atomic Settlement Flow
 * Handles unpaid attendee settlement: calculates amount, updates Ledger, Attendance, and Members
 * @param {Object} params
 *   {attendanceId, bowlerId, sessionDate, productCodeOverride}
 * @returns {Object} {success, ledgerId, message}
 */
function atomicSettlementFlow(params) {
  const {
    attendanceId,
    bowlerId,
    sessionDate,
    productCodeOverride = null
  } = params;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheet = ss.getSheetByName("Attendance");
  const membersSheet = ss.getSheetByName("Members");
  const ledgerSheet = ss.getSheetByName("Ledger");

  if (!attendanceSheet || !membersSheet || !ledgerSheet) {
    throw new Error("Required sheets not found");
  }

  // Step 1: Fetch attendance record
  const attData = attendanceSheet.getDataRange().getValues();
  let attRecord = null;
  let attRowIndex = -1;

  for (let i = 1; i < attData.length; i++) {
    if (attData[i][0] === attendanceId) {
      attRecord = attData[i];
      attRowIndex = i + 1;
      break;
    }
  }

  if (!attRecord) {
    throw new Error(`Attendance record ${attendanceId} not found`);
  }

  // Check if already paid
  if (attRecord[9] === "PAID") {
    return {
      success: false,
      message: `Attendance ${attendanceId} already settled`
    };
  }

  // Step 2: Fetch member record
  const mbData = membersSheet.getDataRange().getValues();
  let mbRecord = null;
  let mbRowIndex = -1;

  for (let i = 1; i < mbData.length; i++) {
    if (mbData[i][0] === bowlerId) {
      mbRecord = mbData[i];
      mbRowIndex = i + 1;
      break;
    }
  }

  if (!mbRecord) {
    throw new Error(`Member ${bowlerId} not found`);
  }

  // Step 3: Determine product code (override or current)
  let productCode = productCodeOverride || mbRecord[12]; // CURRENT_PRODUCT_CODE
  if (!productCode) {
    productCode = "ST004"; // Default to Pay2Play
  }

  // Step 4: Look up product price
  const productPrice = getProductPrice(productCode);
  if (!productPrice) {
    throw new Error(`Product code ${productCode} not found`);
  }

  // Step 5: Create receipt transaction
  const sourceTxnId = generateSourceTxnId("RCP");
  const paymentDate = new Date();
  paymentDate.setHours(0, 0, 0, 0);

  const txnHash = generateTXNHASH(
    sourceTxnId,
    paymentDate,
    productPrice,
    bowlerId,
    "MAT_FEE"
  );

  // Record to Ledger
  const ledgerId = recordToLedger({
    sourceTxnId: sourceTxnId,
    paymentDate: paymentDate,
    sourceSheet: "Attendance",
    txnHash: txnHash,
    type: "RCP",
    partyId: bowlerId,
    amount: productPrice,
    category: "MAT_FEE",
    paymentMethod: "CASH", // Cashier settlement
    txnote: `Settlement: ${attendanceId} for ${productCode}`,
    reconciliationStatus: "RECONCILED"
  });

  // Step 6: Update Attendance record
  attendanceSheet.getRange(attRowIndex, 10).setValue("PAID");
  attendanceSheet.getRange(attRowIndex, 11).setValue(ledgerId);

  // Also update SOURCETXNID and TXNHASH if columns exist
  attendanceSheet.getRange(attRowIndex, 2).setValue(sourceTxnId);
  attendanceSheet.getRange(attRowIndex, 3).setValue(txnHash);

  // Step 7: Update Members record
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  membersSheet.getRange(mbRowIndex, 6).setValue(today); // LAST_PAID_DATE
  membersSheet.getRange(mbRowIndex, 7).setValue(calculateNextMatFeeDue(productCode, today)); // NEXT_MAT_FEE_DUE
  membersSheet.getRange(mbRowIndex, 12).setValue(productCode); // CURRENT_PRODUCT_CODE
  membersSheet.getRange(mbRowIndex, 14).setValue(new Date().toISOString()); // UPDATED_TIMESTAMP

  return {
    success: true,
    ledgerId: ledgerId,
    sourceTxnId: sourceTxnId,
    amount: productPrice,
    message: `Settlement complete: ${bowlerId} charged ${productPrice}p for ${productCode}`
  };
}

/**
 * Get product price in pence
 * @param {string} productCode - Product code (e.g., "ST001")
 * @returns {number} Price in pence, or null if not found
 */
function getProductPrice(productCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const productsSheet = ss.getSheetByName("Products");
  
  if (!productsSheet) {
    return null;
  }

  const data = productsSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === productCode) {
      return data[i][2]; // PRICE column
    }
  }

  return null;
}

/**
 * Calculate next Mat Fee due date based on product code and payment date
 * Duration-based: add coverage months to payment date
 * @param {string} productCode - Product code (ST001, ST002, ST003, ST004)
 * @param {Date} paymentDate - Date payment was made
 * @returns {Date} Next due date
 */
function calculateNextMatFeeDue(productCode, paymentDate) {
  const dueDate = new Date(paymentDate);

  const durationMap = {
    "ST001": 12, // Annual
    "ST002": 3,  // Quarterly
    "ST003": 1,  // Monthly
    "ST004": 0   // Pay2Play (no recurring due date)
  };

  const months = durationMap[productCode] || 0;
  dueDate.setMonth(dueDate.getMonth() + months);

  return dueDate;
}

/**
 * Generate source transaction ID (receipt, expense, cogs, etc.)
 * Atomically increments from System_Config
 * @param {string} prefix - Prefix (RCP, EXP, COGS)
 * @returns {string} Source transaction ID (e.g., "RCP000001")
 */
function generateSourceTxnId(prefix = "RCP") {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("System_Config");
  
  if (!configSheet) {
    throw new Error("System_Config sheet not found");
  }

  const configKey = `NEXT${prefix}ID`;
  const data = configSheet.getDataRange().getValues();
  let currentId = null;
  let idRowIndex = -1;

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === configKey) {
      currentId = data[i][1];
      idRowIndex = i + 1;
      break;
    }
  }

  if (!currentId) {
    throw new Error(`${configKey} not found in System_Config`);
  }
  const numericPart = parseInt(currentId.replace(/\D/g, ""), 10);
  const newNumeric = numericPart + 1;
  const newId = prefix + String(newNumeric).padStart(6, "0");

  // Update in sheet
  configSheet.getRange(idRowIndex, 2).setValue(newId);

  return currentId;
}

/**
 * Validate transaction consistency (TX999999 audit logic stub)
 * Phase 1: Basic checks; Phase 2: Full forensic jigsaw
 * @param {string} ledgerId - LEDGERID to validate
 * @returns {Object} {valid, issues}
 */
function validateTransactionIntegrity(ledgerId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName("Ledger");
  
  const data = ledgerSheet.getDataRange().getValues();
  let ledgerRecord = null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === ledgerId) {
      ledgerRecord = data[i];
      break;
    }
  }

  if (!ledgerRecord) {
    return { valid: false, issues: ["LEDGERID not found"] };
  }

  const issues = [];

  // Check TXNHASH validity
  const storedHash = ledgerRecord[4];
  const isHashValid = validateTXNHASH(
    storedHash,
    ledgerRecord[2], // SOURCETXNID
    ledgerRecord[1], // PAYMENT_DATE
    ledgerRecord[7], // AMOUNT
    ledgerRecord[6], // PARTY_ID
    ledgerRecord[8]  // CATEGORY
  );

  if (!isHashValid) {
    issues.push("TXNHASH mismatch");
  }

  // Check date constraint
  const paymentDate = new Date(ledgerRecord[1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (paymentDate > today) {
    issues.push("payment_date exceeds today");
  }

  return {
    valid: issues.length === 0,
    issues: issues
  };
}

// END OF API_TransactionLogic.gs
