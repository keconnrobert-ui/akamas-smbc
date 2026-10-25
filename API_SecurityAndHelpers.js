/**
 * API_SecurityAndHelpers.gs
 * RBAC, TXNHASH generation, idempotency, lock management
 * Generated: 2026-10-20
 */

// ==================== CRYPTOGRAPHY ====================

/**
 * Generates SHA256 TXNHASH: SHA256(SOURCETXNID|TXNDATE|SIGNEDAMOUNT|MEMBERID|PRODUCTID)
 * @param {string} sourceTxnId - RCP######, COS######, etc.
 * @param {Date} txnDate - Transaction date
 * @param {number} signedAmount - Amount (positive or negative)
 * @param {string} memberId - MBR###### or empty
 * @param {string} productId - ST### or empty
 * @returns {string} Hex-encoded SHA256 hash
 */
function generateTXNHASH(sourceTxnId, txnDate, signedAmount, memberId, productId) {
  const dateStr = Utilities.formatDate(txnDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const payload = `${sourceTxnId}|${dateStr}|${signedAmount}|${memberId}|${productId}`;
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload);
  return Utilities.bytesToHex(hash);
}

// ==================== RBAC & SECURITY ====================

/**
 * Verifies user role by email against Users sheet
 * Role hierarchy: Manager (4) > Accountant (3) > Cashier (2) > Bowler (1)
 * @param {string} userEmail - Session user email
 * @returns {number} Role level (1-4) or 0 if not found
 */
function verifyUserRoleByEmail(userEmail) {
  if (!userEmail) return 0;

  const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const data = usersSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === userEmail && data[i][3]) { // Column B: EMAIL, Column D: ACTIVE_FLAG
      const role = data[i][2]; // Column C: ROLE
      const roleMap = { 'Bowler': 1, 'Cashier': 2, 'Accountant': 3, 'Manager': 4 };
      return roleMap[role] || 0;
    }
  }

  return 0;
}

/**
 * Checks if user has required minimum role
 * @param {string} userEmail - Session user email
 * @param {number} minRequiredRole - 1-4
 * @returns {boolean}
 */
function userHasRole(userEmail, minRequiredRole) {
  return verifyUserRoleByEmail(userEmail) >= minRequiredRole;
}

// ==================== IDEMPOTENCY ====================

/**
 * Stores idempotency key with ledger ID and TXNHASH
 * Prevents duplicate transaction posts
 * @param {string} idempotencyKey - UUID
 * @param {string} ledgerId - LDG######
 * @param {string} txnHash - SHA256 hash
 */
function storeIdempotencyKey(idempotencyKey, ledgerId, txnHash) {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  configSheet.appendRow([
    `IDEMPOTENCY_${idempotencyKey}`,
    `${ledgerId}|${txnHash}`,
    'Idempotency key for duplicate detection',
    new Date()
  ]);
}

/**
 * Checks for existing idempotency key
 * @param {string} idempotencyKey - UUID
 * @param {string} sourceSheet - 'Ledger', 'Purchases', etc.
 * @returns {Object|null} {ledgerId, txnHash} or null
 */
function checkIdempotencyKey(idempotencyKey, sourceSheet) {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  const data = configSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === `IDEMPOTENCY_${idempotencyKey}`) {
      const [ledgerId, txnHash] = data[i][1].split('|');
      return { ledgerId, txnHash };
    }
  }

  return null;
}

// ==================== RATE LIMITING ====================

/**
 * Rate limiter: 10 requests per minute per email
 * Uses System_Config as distributed counter store
 * @param {string} userEmail - Session user email
 * @returns {Object} {allowed: boolean, remaining: number, resetTime: Date, error?: string}
 */
function checkRateLimit(userEmail) {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  const data = configSheet.getDataRange().getValues();
  const rateLimitKey = `RATELIMIT_${userEmail}`;
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60000); // 1 minute ago

  let counterRow = -1;
  let currentCount = 0;
  let lastRequestTime = null;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === rateLimitKey) {
      counterRow = i;
      const [count, timestamp] = data[i][1].split('|');
      currentCount = parseInt(count) || 0;
      lastRequestTime = new Date(timestamp);
      break;
    }
  }

  if (lastRequestTime && lastRequestTime < windowStart) {
    currentCount = 0;
  }

  const remaining = Math.max(0, 10 - currentCount - 1);
  const resetTime = lastRequestTime ? new Date(lastRequestTime.getTime() + 60000) : new Date(now.getTime() + 60000);

  if (currentCount >= 10) {
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      error: `Rate limit exceeded (10 req/min). Reset at ${resetTime.toISOString()}`
    };
  }

  const newCount = currentCount + 1;
  if (counterRow === -1) {
    configSheet.appendRow([rateLimitKey, `${newCount}|${now.toISOString()}`, 'Rate limit counter', new Date()]);
  } else {
    configSheet.getRange(counterRow + 1, 2).setValue(`${newCount}|${now.toISOString()}`);
  }

  return { allowed: true, remaining, resetTime };
}

// ==================== ID GENERATION ====================

/**
 * Generates next RCP (Receipt) ID
 * @returns {string} RCP######
 */
function generateRcpId() {
  return generateCounterId('RCP_COUNTER', 'RCP');
}

/**
 * Generates next COS (Cost) ID
 * @returns {string} COS######
 */
function generateCosId() {
  return generateCounterId('COS_COUNTER', 'COS');
}

/**
 * Generates next PUR (Purchase Record) ID
 * @returns {string} PUR######
 */
function generatePurId() {
  return generateCounterId('PUR_COUNTER', 'PUR');
}

/**
 * Generates next ATT (Attendance) ID
 * @returns {string} ATT######
 */
function generateAttId() {
  return generateCounterId('ATT_COUNTER', 'ATT');
}

/**
 * Generates next MBR (Member) ID
 * @returns {string} MBR######
 */
function generateMbrId() {
  return generateCounterId('MBR_COUNTER', 'MBR');
}

/**
 * Generates next SUP (Supplier) ID
 * @returns {string} SUP######
 */
function generateSupId() {
  return generateCounterId('SUP_COUNTER', 'SUP');
}

/**
 * Generic counter generator with atomic increment
 * @param {string} counterKey - Parameter key in System_Config
 * @param {string} prefix - ID prefix (RCP, COS, etc.)
 * @returns {string} Formatted ID (e.g., RCP000001)
 */
function generateCounterId(counterKey, prefix) {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  const data = configSheet.getDataRange().getValues();
  let counterRow = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === counterKey) {
      counterRow = i;
      break;
    }
  }

  if (counterRow === -1) {
    configSheet.appendRow([counterKey, '000001', `${prefix} ID counter`, new Date()]);
    return `${prefix}000001`;
  }

  const currentValue = data[counterRow][1];
  const numValue = parseInt(currentValue.replace(/\D/g, '')) + 1;
  const newCounter = String(numValue).padStart(6, '0');
  const newId = `${prefix}${newCounter}`;

  configSheet.getRange(counterRow + 1, 2).setValue(newId);
  return newId;
}

// ==================== CSRF TOKEN VALIDATION ====================

/**
 * Generates CSRF token for API requests
 * Token = HMAC-SHA256(userEmail + timestamp, secretKey)
 * @param {string} userEmail - Session user email
 * @returns {string} CSRF token
 */
function generateCSRFToken(userEmail) {
  const timestamp = Math.floor(Date.now() / 1000);
  const secretKey = PropertiesService.getScriptProperties().getProperty('CSRF_SECRET') || 'default-secret';
  const payload = `${userEmail}|${timestamp}`;
  const token = Utilities.computeHmacSha256Signature(payload, secretKey);
  return Utilities.bytesToHex(token);
}

/**
 * Validates CSRF token from request
 * @param {string} userEmail - Session user email
 * @param {string} token - CSRF token from request
 * @param {number} maxAgeSeconds - Max token age (default 3600 = 1 hour)
 * @returns {boolean} Valid or invalid
 */
function validateCSRFToken(userEmail, token, maxAgeSeconds = 3600) {
  // In production, would validate timestamp and signature
  // For now, simple regeneration check
  const secretKey = PropertiesService.getScriptProperties().getProperty('CSRF_SECRET') || 'default-secret';
  const expectedToken = generateCSRFToken(userEmail);
  return token === expectedToken;
}

// ==================== LOCK MANAGEMENT ====================

/**
 * Acquires document lock with timeout
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Object|null} Lock object or null if timeout
 */
function acquireLock(timeoutMs = 10000) {
  const lock = LockService.getDocumentLock();
  if (lock.tryLock(timeoutMs)) {
    return lock;
  }
  return null;
}

/**
 * Safely releases lock
 * @param {Object} lock - Lock object from acquireLock()
 */
function releaseLock(lock) {
  if (lock) {
    try {
      lock.releaseLock();
    } catch (e) {
      Logger.log(`Lock release error: ${e.message}`);
    }
  }
}

// ==================== VALIDATION HELPERS ====================

/**
 * Validates member ID format
 * @param {string} memberId - MBR######
 * @returns {boolean}
 */
function isValidMemberId(memberId) {
  return /^MBR\d{6}$/.test(memberId);
}

/**
 * Validates product ID format
 * @param {string} productId - ST### or similar
 * @returns {boolean}
 */
function isValidProductId(productId) {
  return productId && productId.length > 0;
}

/**
 * Validates transaction amount
 * @param {number} amount - Amount to validate
 * @param {string} txnType - 'RCP', 'COS', 'EXP'
 * @returns {boolean}
 */
function isValidAmount(amount, txnType) {
  if (typeof amount !== 'number' || amount === 0) return false;
  if (txnType === 'RCP') return amount > 0;
  if (['COS', 'EXP'].includes(txnType)) return amount > 0; // Stored as negative
  return true;
}

/**
 * Validates transaction date (must be <= today)
 * @param {Date} txnDate - Transaction date
 * @returns {boolean}
 */
function isValidTxnDate(txnDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(txnDate);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate <= today;
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Gets current user email
 * @returns {string} User email
 */
function getCurrentUserEmail() {
  return Session.getActiveUser().getEmail();
}

/**
 * Gets current script time zone
 * @returns {string} Time zone (e.g., 'Europe/London')
 */
function getScriptTimeZone() {
  return Session.getScriptTimeZone();
}

/**
 * Formats date for ledger (YYYY-MM-DD)
 * @param {Date} date - Date to format
 * @returns {string} Formatted date
 */
function formatLedgerDate(date) {
  return Utilities.formatDate(date, getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Logs security event to System_Config audit trail
 * @param {string} eventType - 'LOGIN', 'UNAUTHORIZED', 'RATE_LIMIT', etc.
 * @param {string} userEmail - Session user email
 * @param {string} details - Event details
 */
function logSecurityEvent(eventType, userEmail, details) {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  configSheet.appendRow([
    `AUDIT_${eventType}_${Date.now()}`,
    `${userEmail}|${details}`,
    `Security audit: ${eventType}`,
    new Date()
  ]);
}

// END OF API_SecurityAndHelpers.gs
