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

// Compatibility wrapper for legacy API_SettlementAndAttendance.js calls.

function validateProductIdOverride(sourceId, overrideProductId) {
  return RF_validateProductIdOverride(sourceId, overrideProductId);
}

function getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue) {
  return RF_getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue);
}

function getUserRole(userEmail) {
  return RF_getUserRole(userEmail);
}


function settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride) {
  return RF_settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride);
{

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
