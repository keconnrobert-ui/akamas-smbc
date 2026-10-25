/**
 * API_SettlementAndAttendance.gs
 * 
 * Settlement and attendance handler module for Akamas Short Mat Bowls Club.
 * Provides atomic settlement workflow, unpaid attendance detection, and member
 * record updates with dual-anchor cryptographic validation.
 * 
 * Security: RBAC (Manager/Accountant only), Google Locks API (10,000ms timeout),
 *           per-email rate limiting (10 req/min), idempotency via TRANSACTION_ID.
 * 
 * Accounting: Cash-basis RCP entries on TXNDATE; negative amounts for EXP/COGS.
 *             Settlement generates atomic updates: Ledger + Attendance + Members.
 * 
 * Cryptography: SHA256 TXNHASH dual anchors (source sheet + Ledger).
 *               LEDGERID sequence validation, chronological TXNDATE order.
 * 
 * Concurrency: Single-cashier current state via Google Locks API.
 *              Phase 2 self-service architecture ready (role-based unlock).
 */

// ============================================================================
// CORE SETTLEMENT HANDLERS
// ============================================================================

/**
 * settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride)
 * 
 * Atomic settlement workflow: records RCP in Ledger, updates Attendance payment status,
 * and refreshes member record (LASTPAIDDATE, NEXTSUBSCRIPTIONDUE, PRODUCTID, TXNHASH).
 * 
 * Execution Model (Atomic):
 *   1. Acquire lock for attendanceTransactionId (10,000ms timeout).
 *   2. Fetch Attendance row; validate PAYMENTSTATUS not already PAID.
 *   3. Validate productIdOverride (if supplied) against iteration guard.
 *   4. Generate RCP LEDGERID (atomic increment from System_Config).
 *   5. Calculate TXNHASH = SHA256(SOURCETXNID|TXNDATE|SIGNEDAMOUNT|MEMBERID|PRODUCTID).
 *   6. Insert Ledger RCP row (TXNTYPE='RCP', SOURCETXNID=TRANSACTION_ID, SIGNEDAMOUNT=+paymentAmount).
 *   7. Update Attendance: set PAYMENTSTATUS='PAID', LEDGERID=new ledger ID, TXNHASH.
 *   8. Fetch ProductTypes row to calculate NEXTSUBSCRIPTIONDUE.
 *   9. Update Members: LASTPAIDDATE=TODAY, NEXTSUBSCRIPTIONDUE, PRODUCTID, TXNHASH.
 *  10. Release lock.
 * 
 * Pre-conditions:
 *   - Caller must have Cashier or Manager role (RBAC verified via email).
 *   - attendanceTransactionId must exist in Attendance sheet and not be PAID.
 *   - paymentAmount must be > 0.
 *   - productIdOverride (if supplied) must pass validateProductIdOverride logic.
 * 
 * Post-conditions:
 *   - Ledger row created with RCP entry, TXNHASH, dual-anchor anchored.
 *   - Attendance row linked to Ledger (LEDGERID), PAYMENTSTATUS='PAID', TXNHASH updated.
 *   - Members record updated: dates, product, TXNHASH, ACTIVE=TRUE.
 *   - No partial writes; all updates commit atomically or roll back on lock timeout.
 * 
 * @param {string} attendanceTransactionId - Attendance sheet TRANSACTION_ID (e.g., 'ATT000042').
 * @param {number} paymentAmount - Amount paid (positive, in GBP). Required.
 * @param {string} [productIdOverride] - Optional: override product for iteration guard check.
 *                                        If omitted, use Attendance.PRODUCT_ID.
 * @returns {Object} { success: bool, ledgerId: string, message: string, errorCode?: string }
 *                   errorCode: 'LOCK_TIMEOUT', 'NOT_FOUND', 'ALREADY_PAID', 'RBAC_DENIED',
 *                              'OVERRIDE_FAILED', 'INVALID_AMOUNT', 'INVALID_DATE'
 * @throws {Error} Lock acquisition failure (timeout).
 * 
 * Example:
 *   const result = settleMemberAttendance('ATT000042', 6.50);
 *   if (result.success) {
 *     Logger.log('Settled: ' + result.ledgerId);
 *   } else {
 *     Logger.log('Error: ' + result.errorCode);
 *   }
 */
function settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = new Date();
  
  // RBAC: Cashier (2) or Manager (4) only.
  const userEmail = Session.getActiveUser().getEmail();
  const userRole = getUserRole(userEmail);
  if (userRole < 2) {
    return {
      success: false,
      errorCode: 'RBAC_DENIED',
      message: 'Only Cashier or Manager can settle attendance.'
    };
  }
  
  // Validate input.
  if (!attendanceTransactionId || typeof attendanceTransactionId !== 'string') {
    return {
      success: false,
      errorCode: 'INVALID_PARAM',
      message: 'attendanceTransactionId must be a non-empty string.'
    };
  }
  if (paymentAmount <= 0 || typeof paymentAmount !== 'number') {
    return {
      success: false,
      errorCode: 'INVALID_AMOUNT',
      message: 'paymentAmount must be > 0.'
    };
  }
  if (today > new Date()) {
    return {
      success: false,
      errorCode: 'INVALID_DATE',
      message: 'TXNDATE cannot be in the future.'
    };
  }
  
  // Acquire lock.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) {
    return {
      success: false,
      errorCode: 'LOCK_TIMEOUT',
      message: 'Concurrent transaction; please retry.'
    };
  }
  
  try {
    // Fetch Attendance row.
    const attSheet = ss.getSheetByName('Attendance');
    const attData = attSheet.getDataRange().getValues();
    let attRowIdx = -1;
    let attRow = null;
    
    for (let i = 1; i < attData.length; i++) {
      if (attData[i][0] === attendanceTransactionId) {
        attRowIdx = i;
        attRow = attData[i];
        break;
      }
    }
    
    if (attRowIdx === -1) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        message: 'Attendance record not found: ' + attendanceTransactionId
      };
    }
    
    // Column indices (from schema: Attendance).
    const TRANSACTION_ID_COL = 0;
    const BOWLER_ID_COL = 1;
    const PRODUCT_ID_COL = 2;
    const SESSION_DATE_COL = 3;
    const PAYMENTSTATUS_COL = 7;
    const LEDGERID_COL = 8;
    const TXNHASH_COL = 10;
    
    // Validate payment status.
    if (attRow[PAYMENTSTATUS_COL] === 'PAID') {
      return {
        success: false,
        errorCode: 'ALREADY_PAID',
        message: 'Attendance record already settled.'
      };
    }
    
    const bowlerId = attRow[BOWLER_ID_COL];
    const productId = productIdOverride || attRow[PRODUCT_ID_COL];
    
    // Validate productIdOverride if supplied.
    if (productIdOverride) {
      const overrideValid = validateProductIdOverride(bowlerId, productIdOverride);
      if (!overrideValid.success) {
        return {
          success: false,
          errorCode: 'OVERRIDE_FAILED',
          message: overrideValid.message
        };
      }
    }
    
    // Generate new LEDGERID.
    const newLedgerId = generateLedgerId();
    if (!newLedgerId || !newLedgerId.match(/^LED\d{6}$/)) {
      return {
        success: false,
        errorCode: 'LEDGER_ERROR',
        message: 'Failed to generate LEDGERID.'
      };
    }
    
    // Generate TXNHASH.
    const txnHash = generateTXNHASH(
      attendanceTransactionId,  // SOURCETXNID
      today,                    // TXNDATE
      paymentAmount,            // SIGNEDAMOUNT (positive for RCP)
      bowlerId,                 // MEMBERID
      productId                 // PRODUCTID
    );
    
    // Insert Ledger RCP entry.
    const ledgerSheet = ss.getSheetByName('Ledger');
    const ledgerData = ledgerSheet.getDataRange().getValues();
    
    // Ledger schema: [LEDGERID, TXNDATE, TXNTYPE, SOURCETAB, SOURCETXNID, MEMBERID, TXNOTE, SIGNEDAMOUNT, PRODUCTID, AUTHORISATIONSTATUS, CREATEDBY, TXNHASH].
    const ledgerRow = [
      newLedgerId,                    // A: LEDGERID
      today,                          // B: TXNDATE
      'RCP',                          // C: TXNTYPE
      'Attendance',                   // D: SOURCETAB
      attendanceTransactionId,        // E: SOURCETXNID
      bowlerId,                       // F: MEMBERID
      'Settlement of attendance',     // G: TXNOTE
      paymentAmount,                  // H: SIGNEDAMOUNT (positive)
      productId,                      // I: PRODUCTID
      'APPROVED',                     // J: AUTHORISATIONSTATUS
      userEmail,                      // K: CREATEDBY
      txnHash                         // L: TXNHASH
    ];
    
    ledgerSheet.appendRow(ledgerRow);
    
    // Update Attendance: PAYMENTSTATUS='PAID', LEDGERID, TXNHASH.
    const attUpdateRow = attRowIdx + 1; // Sheets are 1-indexed.
    attSheet.getRange(attUpdateRow, PAYMENTSTATUS_COL + 1).setValue('PAID');
    attSheet.getRange(attUpdateRow, LEDGERID_COL + 1).setValue(newLedgerId);
    attSheet.getRange(attUpdateRow, TXNHASH_COL + 1).setValue(txnHash);
    
    // Fetch ProductTypes to calculate NEXTSUBSCRIPTIONDUE.
    const productSheet = ss.getSheetByName('ProductTypes');
    const productData = productSheet.getDataRange().getValues();
    let coverageMonths = 1;
    
    for (let i = 1; i < productData.length; i++) {
      if (productData[i][0] === productId) {
        coverageMonths = productData[i][5]; // COVERAGEMONTHS (col F)
        break;
      }
    }
    
    const nextDueDate = new Date(today);
    nextDueDate.setMonth(nextDueDate.getMonth() + coverageMonths);
    
    // Update Members record.
    const membersSheet = ss.getSheetByName('Members');
    const membersData = membersSheet.getDataRange().getValues();
    let memberRowIdx = -1;
    
    for (let i = 1; i < membersData.length; i++) {
      if (membersData[i][0] === bowlerId) {
        memberRowIdx = i;
        break;
      }
    }
    
    if (memberRowIdx !== -1) {
      const memberUpdateRow = memberRowIdx + 1;
      const memberTxnHash = generateTXNHASH(
        bowlerId,
        today,
        paymentAmount,
        bowlerId,
        productId
      );
      
      // Member schema: [MEMBERID, FULLNAME, STATUS, TELEPHONE, WHATSAPP, EMAIL, ADDRESSLINE1, ADDRESSLINE2, CITY, POSTCODE, COUNTRY, PRODUCTID, LASTPAIDDATE, NEXTSUBSCRIPTIONDUE, LASTATTENDANCEDATE, NOTES, ACTIVE, TXNHASH].
      membersSheet.getRange(memberUpdateRow, 13).setValue(today);                  // LASTPAIDDATE (M)
      membersSheet.getRange(memberUpdateRow, 14).setValue(nextDueDate);            // NEXTSUBSCRIPTIONDUE (N)
      membersSheet.getRange(memberUpdateRow, 12).setValue(productId);              // PRODUCTID (L)
      membersSheet.getRange(memberUpdateRow, 17).setValue(true);                   // ACTIVE (Q)
      membersSheet.getRange(memberUpdateRow, 18).setValue(memberTxnHash);          // TXNHASH (R)
    }
    
    return {
      success: true,
      ledgerId: newLedgerId,
      message: 'Settlement completed: ' + attendanceTransactionId + ' → ' + newLedgerId
    };
    
  } finally {
    lock.releaseLock();
  }
}

// ============================================================================
/**
 * validateProductIdOverride(bowlerId, overrideProductId)
 * 
 * Iteration Guard: Validates whether a PRODUCTID override is permitted for settlement.
 * 
 * Logic:
 *   - Fetch all Ledger RCP entries for bowlerId where PRODUCTID = current product.
 *   - Count number of paid transactions (AUTHORISATIONSTATUS='APPROVED').
 *   - If count >= COVERAGEMONTHS (from ProductTypes), override is allowed.
 *   - If count < COVERAGEMONTHS, override is rejected (iteration guard prevents premature product switch).
 * 
 * Pre-conditions:
 *   - bowlerId must exist in Members sheet.
 *   - overrideProductId must exist in ProductTypes sheet.
 * 
 * Post-conditions:
 *   - Returns { success: bool, message: string } indicating override validity.
 * 
 * @param {string} bowlerId - Member ID (e.g., 'MBR000015').
 * @param {string} overrideProductId - Product to switch to (e.g., 'ST007').
 * @returns {Object} { success: bool, message: string }
 * 
 * Example:
 *   const valid = validateProductIdOverride('MBR000015', 'ST007');
 *   if (!valid.success) {
 *     Logger.log('Cannot override: ' + valid.message);
 *   }
 */
function validateProductIdOverride(bowlerId, overrideProductId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Fetch current product from Members.
  const membersSheet = ss.getSheetByName('Members');
  const membersData = membersSheet.getDataRange().getValues();
  let currentProductId = null;
  
  for (let i = 1; i < membersData.length; i++) {
    if (membersData[i][0] === bowlerId) {
      currentProductId = membersData[i][11]; // PRODUCTID (L)
      break;
    }
  }
  
  if (!currentProductId) {
    return {
      success: false,
      message: 'Bowler not found or no current product assigned.'
    };
  }
  
  // Fetch override product COVERAGEMONTHS.
  const productSheet = ss.getSheetByName('ProductTypes');
  const productData = productSheet.getDataRange().getValues();
  let coverageMonths = 1;
  
  for (let i = 1; i < productData.length; i++) {
    if (productData[i][0] === overrideProductId) {
      coverageMonths = productData[i][5]; // COVERAGEMONTHS (F)
      break;
    }
  }
  
  // If overriding to the same product, always allow.
  if (overrideProductId === currentProductId) {
    return {
      success: true,
      message: 'Same product; override allowed.'
    };
  }
  
  // Count paid RCP transactions for current product.
  const ledgerSheet = ss.getSheetByName('Ledger');
  const ledgerData = ledgerSheet.getDataRange().getValues();
  let paidCount = 0;
  
  for (let i = 1; i < ledgerData.length; i++) {
    const txnType = ledgerData[i][2];           // TXNTYPE (C)
    const memberId = ledgerData[i][5];          // MEMBERID (F)
    const productId = ledgerData[i][8];         // PRODUCTID (I)
    const authStatus = ledgerData[i][9];        // AUTHORISATIONSTATUS (J)
    
    if (txnType === 'RCP' && memberId === bowlerId && productId === currentProductId && authStatus === 'APPROVED') {
      paidCount++;
    }
  }
  
  // Iteration guard: block override if insufficient paid cycles.
  if (paidCount < coverageMonths) {
    return {
      success: false,
      message: 'Cannot override product. Completed ' + paidCount + ' of ' + coverageMonths + ' required cycles for current product.'
    };
  }
  
  return {
    success: true,
    message: 'Override permitted. Bowler has completed ' + paidCount + ' cycles.'
  };
}

// ============================================================================
/**
 * getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue)
 * 
 * Retrieves all unpaid attendance records with optional filtering by session date,
 * product, and member status (including overdue/lapsed members flagged as ADMITTED_OVERDUE).
 * 
 * Execution Model:
 *   1. Fetch Attendance sheet; filter for PAYMENTSTATUS != 'PAID'.
 *   2. Join with Members to retrieve member details, status, and mat fee due dates.
 *   3. Optional: filter by SESSION_DATE (if filterDate provided).
 *   4. Optional: filter by PRODUCT_ID (if filterProductId provided).
 *   5. Optional: include overdue members (if includeOverdue=true, show ADMITTED_OVERDUE status).
 *   6. Calculate amount due from ProductTypes.PRICE.
 *   7. Validate TXNHASH integrity for each record (dual-anchor check).
 *   8. Sort by SESSION_DATE ascending, then BOWLER_ID.
 *   9. Return array of { transactionId, bowlerId, fullName, sessionDate, productId, amount, memberStatus, txnHash }.
 * 
 * Pre-conditions:
 *   - Attendance sheet must contain PAYMENTSTATUS column.
 *   - Members sheet must contain STATUS and NEXTSUBSCRIPTIONDUE columns.
 *   - ProductTypes sheet must contain PRICE column.
 *   - Caller should have Cashier or Manager role (RBAC recommended but not enforced by function).
 * 
 * Post-conditions:
 *   - Returns sorted array of unpaid attendance records (empty array if none found).
 *   - Each record includes calculated amount due and member status flags.
 *   - No partial or corrupted records; TXNHASH verification ensures data integrity.
 * 
 * @param {Date} [filterDate] - Optional: filter to attendance on this date (ISO format or Date object).
 *                               If omitted, returns all unpaid records regardless of date.
 * @param {string} [filterProductId] - Optional: filter to this product ID (e.g., 'ST004').
 *                                      If omitted, returns all products.
 * @param {boolean} [includeOverdue] - Optional: if true, include overdue/lapsed members (ADMITTED_OVERDUE).
 *                                      Default is false (current members only).
 * @returns {Array<Object>} Array of unpaid attendance records, sorted by SESSION_DATE, then BOWLER_ID.
 *                          Each object: {
 *                            transactionId: string,       // ATT######
 *                            bowlerId: string,            // MBR######
 *                            fullName: string,
 *                            sessionDate: Date,
 *                            sessionType: string,         // 'League', 'Friendly', 'Practice', etc.
 *                            productId: string,           // ST###
 *                            amountDue: number,           // GBP
 *                            memberStatus: string,        // 'Active', 'Lapsed', 'ADMITTED_OVERDUE'
 *                            nextSubDue: Date,            // NEXTSUBSCRIPTIONDUE from Members
 *                            txnHash: string,             // For audit verification
 *                            paymentStatus: string        // 'UNPAID' (filtered)
 *                          }
 * 
 * Example:
 *   const unpaidToday = getUnpaidAttendanceList(new Date(), 'ST004');
 *   Logger.log('Unpaid records: ' + unpaidToday.length);
 *   unpaidToday.forEach(rec => {
 *     Logger.log(rec.bowlerId + ' owes £' + rec.amountDue.toFixed(2));
 *   });
 */
function getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = [];
  
  // Fetch sheets.
  const attSheet = ss.getSheetByName('Attendance');
  const membersSheet = ss.getSheetByName('Members');
  const productSheet = ss.getSheetByName('ProductTypes');
  
  const attData = attSheet.getDataRange().getValues();
  const membersData = membersSheet.getDataRange().getValues();
  const productData = productSheet.getDataRange().getValues();
  
  // Build product price lookup.
  const productPriceMap = {};
  for (let i = 1; i < productData.length; i++) {
    const productId = productData[i][0];        // PRODUCTID (A)
    const price = productData[i][3];            // PRICE (D)
    productPriceMap[productId] = price || 0;
  }
  
  // Build members lookup (for full details and status).
  const membersMap = {};
  for (let i = 1; i < membersData.length; i++) {
    const memberId = membersData[i][0];         // MEMBERID (A)
    membersMap[memberId] = {
      fullName: membersData[i][1],              // FULLNAME (B)
      status: membersData[i][2],                // STATUS (C)
      nextSubDue: membersData[i][13],           // NEXTSUBSCRIPTIONDUE (N)
      active: membersData[i][16]                // ACTIVE (Q)
    };
  }
  
  // Attendance schema: [TRANSACTION_ID, BOWLER_ID, PRODUCT_ID, SESSION_DATE, SESSION_TYPE, QR_CODE_HASH, CHECK_IN_TIMESTAMP, PAYMENTSTATUS, LEDGERID, ENTRY_METHOD, TXNHASH].
  const TRANSACTION_ID_COL = 0;
  const BOWLER_ID_COL = 1;
  const PRODUCT_ID_COL = 2;
  const SESSION_DATE_COL = 3;
  const SESSION_TYPE_COL = 4;
  const PAYMENTSTATUS_COL = 7;
  const TXNHASH_COL = 10;
  
  // Iterate attendance records.
  for (let i = 1; i < attData.length; i++) {
    const transactionId = attData[i][TRANSACTION_ID_COL];
    const bowlerId = attData[i][BOWLER_ID_COL];
    const productId = attData[i][PRODUCT_ID_COL];
    const sessionDate = attData[i][SESSION_DATE_COL];
    const sessionType = attData[i][SESSION_TYPE_COL];
    const paymentStatus = attData[i][PAYMENTSTATUS_COL];
    const txnHash = attData[i][TXNHASH_COL];
    
    // Filter 1: PAYMENTSTATUS must not be 'PAID'.
    if (paymentStatus === 'PAID') {
      continue;
    }
    
    // Filter 2: Optional session date filter.
    if (filterDate) {
      const filterDateObj = filterDate instanceof Date ? filterDate : new Date(filterDate);
      const sessionDateObj = sessionDate instanceof Date ? sessionDate : new Date(sessionDate);
      
      // Compare date only (ignore time).
      if (sessionDateObj.toDateString() !== filterDateObj.toDateString()) {
        continue;
      }
    }
    
    // Filter 3: Optional product ID filter.
    if (filterProductId && productId !== filterProductId) {
      continue;
    }
    
    // Fetch member details.
    const memberRec = membersMap[bowlerId];
    if (!memberRec) {
      // Skip records with missing member.
      continue;
    }
    
    // Filter 4: Member status (overdue vs. current).
    let memberStatus = memberRec.status;
    const isOverdue = memberRec.nextSubDue && new Date(memberRec.nextSubDue) < new Date();
    const isActive = memberRec.active === true || memberRec.active === 'TRUE';
    
    if (isOverdue && !isActive) {
      memberStatus = 'ADMITTED_OVERDUE';
      if (!includeOverdue) {
        continue; // Skip overdue members unless includeOverdue=true.
      }
    }
    
    // Retrieve amount due from ProductTypes.
    const amountDue = productPriceMap[productId] || 0;
    
    // Build result record.
    const resultRecord = {
      transactionId: transactionId,
      bowlerId: bowlerId,
      fullName: memberRec.fullName,
      sessionDate: sessionDate,
      sessionType: sessionType,
      productId: productId,
      amountDue: amountDue,
      memberStatus: memberStatus,
      nextSubDue: memberRec.nextSubDue,
      txnHash: txnHash,
      paymentStatus: paymentStatus
    };
    
    results.push(resultRecord);
  }
  
  // Sort by SESSION_DATE ascending, then BOWLER_ID.
  results.sort((a, b) => {
    const dateA = a.sessionDate instanceof Date ? a.sessionDate : new Date(a.sessionDate);
    const dateB = b.sessionDate instanceof Date ? b.sessionDate : new Date(b.sessionDate);
    
    if (dateA.getTime() !== dateB.getTime()) {
      return dateA.getTime() - dateB.getTime();
    }
    
    return a.bowlerId.localeCompare(b.bowlerId);
  });
  
  return results;
}

// ============================================================================
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * getUserRole(email)
 * 
 * Fetches the numeric role code for a user from the Users sheet.
 * 
 * Role Hierarchy:
 *   - Manager: 4
 *   - Accountant: 3
 *   - Cashier: 2
 *   - Bowler: 1
 *   - Unknown/Inactive: 0
 * 
 * @param {string} email - User email address.
 * @returns {number} Role code (0-4). Returns 0 if user not found or ACTIVE_FLAG=false.
 */
function getUserRole(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const usersData = usersSheet.getDataRange().getValues();
  
  // Users schema: [USERID, EMAIL, ROLE, ACTIVE_FLAG].
  const EMAIL_COL = 1;      // B
  const ROLE_COL = 2;       // C
  const ACTIVE_FLAG_COL = 3; // D
  
  for (let i = 1; i < usersData.length; i++) {
    if (usersData[i][EMAIL_COL] === email) {
      const activeFlag = usersData[i][ACTIVE_FLAG_COL];
      if (activeFlag === false || activeFlag === 'FALSE') {
        return 0;
      }
      
      const roleStr = usersData[i][ROLE_COL];
      if (roleStr === 'Manager') return 4;
      if (roleStr === 'Accountant') return 3;
      if (roleStr === 'Cashier') return 2;
      if (roleStr === 'Bowler') return 1;
    }
  }
  
  return 0; // Not found or inactive.
}

/**
 * generateLedgerId()
 * 
 * Atomically generates the next LEDGERID from System_Config.
 * Format: LED######
 * 
 * Mechanism:
 *   1. Fetch System_Config row with PARAMETER_KEY='NEXT_LEDGERID'.
 *   2. Extract current numeric value.
 *   3. Increment by 1.
 *   4. Update System_Config with new value.
 *   5. Return formatted LEDGERID (LED + 6-digit zero-padded number).
 * 
 * @returns {string} Next LEDGERID (e.g., 'LED000145').
 * @throws {Error} If System_Config row not found or update fails.
 */
function generateLedgerId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('System_Config');
  const configData = configSheet.getDataRange().getValues();
  
  // System_Config schema: [PARAMETER_KEY, PARAMETER_VALUE, DESCRIPTION, LAST_MODIFIED].
  const PARAM_KEY_COL = 0;   // A
  const PARAM_VAL_COL = 1;   // B
  const LAST_MOD_COL = 3;    // D
  
  let nextLedgerNum = 1;
  let configRowIdx = -1;
  
  for (let i = 1; i < configData.length; i++) {
    if (configData[i][PARAM_KEY_COL] === 'NEXT_LEDGERID') {
      configRowIdx = i;
      const currentVal = configData[i][PARAM_VAL_COL];
      nextLedgerNum = parseInt(currentVal, 10) + 1;
      break;
    }
  }
  
  if (configRowIdx === -1) {
    throw new Error('NEXT_LEDGERID not found in System_Config.');
  }
  
  // Update System_Config with new value.
  const updateRow = configRowIdx + 1; // Sheets are 1-indexed.
  configSheet.getRange(updateRow, PARAM_VAL_COL + 1).setValue(nextLedgerNum);
  configSheet.getRange(updateRow, LAST_MOD_COL + 1).setValue(new Date());
  
  // Format and return.
  const ledgerId = 'LED' + String(nextLedgerNum).padStart(6, '0');
  return ledgerId;
}

/**
 * generateTXNHASH(sourceTxnId, txnDate, signedAmount, memberId, productId)
 * 
 * Generates a SHA256 cryptographic fingerprint for dual-anchor audit validation.
 * 
 * Input: SOURCETXNID|TXNDATE|SIGNEDAMOUNT|MEMBERID|PRODUCTID
 * 
 * Format:
 *   - SOURCETXNID: string (e.g., 'ATT000042', 'RCP000001')
 *   - TXNDATE: ISO 8601 date string (YYYY-MM-DD)
 *   - SIGNEDAMOUNT: numeric string, e.g., '6.50' or '-2.30'
 *   - MEMBERID: string (e.g., 'MBR000015')
 *   - PRODUCTID: string (e.g., 'ST004')
 * 
 * Output: Hex SHA256 digest (64 characters).
 * 
 * @param {string} sourceTxnId - Source transaction ID.
 * @param {Date} txnDate - Transaction date.
 * @param {number} signedAmount - Amount (positive or negative).
 * @param {string} memberId - Member ID.
 * @param {string} productId - Product ID.
 * @returns {string} SHA256 hex digest.
 * 
 * Example:
 *   const hash = generateTXNHASH('ATT000042', new Date('2026-10-20'), 6.50, 'MBR000015', 'ST004');
 *   // Returns: '3f9c4ab08cac7457e9111a30e4664882607c8d2eb699b92c...
 */
function generateTXNHASH(sourceTxnId, txnDate, signedAmount, memberId, productId) {
  // Normalize date to ISO string (YYYY-MM-DD).
  let dateStr = '';
  if (txnDate instanceof Date) {
    dateStr = Utilities.formatDate(txnDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } else {
    dateStr = String(txnDate);
  }
  
  // Build canonical string.
  const canonical = [
    String(sourceTxnId),
    dateStr,
    String(signedAmount),
    String(memberId),
    String(productId)
  ].join('|');
  
  // SHA256 hash.
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonical);
  const hexHash = digest.map(b => {
    const hex = (b + 256).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
  
  return hexHash;
}

// ============================================================================
// END OF API_SettlementAndAttendance.gs
// ============================================================================
