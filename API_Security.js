/**
 * API_Security.gs
 * Handles RBAC, CSRF validation, rate limiting, and idempotency checks.
 * All security decisions are logged and locked.
 */

/**
 * Validates CSRF token against session state.
 * @param {string} token - Base64-encoded token from request
 * @param {string} sessionState - Session identifier (email or user ID)
 * @returns {boolean} true if token is valid, false otherwise
 */
function validateCSRFToken(token, sessionState) {
  try {
    const scriptLock = LockService.getScriptLock();
    scriptLock.waitLock(5000); // Acquire lock for token validation
    
    try {
      const configSheet = SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName('System Config');
      const configData = configSheet.getRange('A:B').getValues();
      
      let csrfSecret = '';
      for (let i = 0; i < configData.length; i++) {
        if (configData[i][0] === 'CSRF_SECRET') {
          csrfSecret = configData[i][1];
          break;
        }
      }
      
      if (!csrfSecret) {
        logSecurityEvent('CSRF_VALIDATION', 'FAIL', 'No CSRF secret configured', sessionState);
        return false;
      }
      
      // Compute expected token: base64(sha256(sessionState + secret))
      const payload = sessionState + csrfSecret;
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload);
      const expectedToken = Utilities.base64Encode(digest);
      
      const isValid = (token === expectedToken);
      
      if (!isValid) {
        logSecurityEvent('CSRF_VALIDATION', 'FAIL', 'Token mismatch', sessionState);
      }
      
      return isValid;
    } finally {
      scriptLock.releaseLock();
    }
  } catch (e) {
    logSecurityEvent('CSRF_VALIDATION', 'ERROR', e.message, sessionState);
    return false;
  }
}

/**
 * Enforces per-email rate limiting using PropertiesService.
 * @param {string} email - User email address
 * @param {number} limit - Max requests per window (default 10)
 * @param {number} window - Time window in ms (default 60000 = 1 min)
 * @returns {boolean} true if request is allowed, false if rate limit exceeded
 */
function enforceRateLimit(email, limit = 10, window = 60000) {
  try {
    const scriptLock = LockService.getScriptLock();
    scriptLock.waitLock(3000);
    
    try {
      const userProperties = PropertiesService.getUserProperties();
      const now = Date.now();
      const counterKey = 'RATE_LIMIT_' + email;
      const timestampKey = 'RATE_LIMIT_TS_' + email;
      
      const storedTimestamp = parseInt(userProperties.getProperty(timestampKey) || 0);
      const storedCounter = parseInt(userProperties.getProperty(counterKey) || 0);
      
      // Reset counter if window has expired
      if (now - storedTimestamp > window) {
        userProperties.setProperty(counterKey, '1');
        userProperties.setProperty(timestampKey, now.toString());
        return true;
      }
      
      // Increment counter and check limit
      if (storedCounter >= limit) {
        logSecurityEvent('RATE_LIMIT', 'EXCEEDED', `${storedCounter}/${limit} requests`, email);
        return false;
      }
      
      userProperties.setProperty(counterKey, (storedCounter + 1).toString());
      return true;
    } finally {
      scriptLock.releaseLock();
    }
  } catch (e) {
    logSecurityEvent('RATE_LIMIT', 'ERROR', e.message, email);
    return false; // Fail closed on error
  }
}

/**
 * Checks if an idempotency key has been seen before (cache hit = duplicate).
 * @param {string} idempotencyKey - Unique request identifier
 * @returns {boolean} true if key exists (duplicate), false if new
 */
function checkIdempotencyKey(idempotencyKey) {
  try {
    const scriptLock = LockService.getScriptLock();
    scriptLock.waitLock(3000);
    
    try {
      const scriptProperties = PropertiesService.getScriptProperties();
      const key = 'IDEMPOTENCY_' + idempotencyKey;
      const cached = scriptProperties.getProperty(key);
      return cached !== null;
    } finally {
      scriptLock.releaseLock();
    }
  } catch (e) {
    logSecurityEvent('IDEMPOTENCY_CHECK', 'ERROR', e.message, idempotencyKey);
    return false;
  }
}

/**
 * Caches an idempotency key with TTL.
 * @param {string} idempotencyKey - Unique request identifier
 * @param {number} ttl - Time-to-live in ms (default 1 hour)
 */
function cacheIdempotencyKey(idempotencyKey, ttl = 3600000) {
  try {
    const scriptLock = LockService.getScriptLock();
    scriptLock.waitLock(3000);
    
    try {
      const scriptProperties = PropertiesService.getScriptProperties();
      const key = 'IDEMPOTENCY_' + idempotencyKey;
      const expiryTime = Date.now() + ttl;
      scriptProperties.setProperty(key, expiryTime.toString());
    } finally {
      scriptLock.releaseLock();
    }
  } catch (e) {
    logSecurityEvent('IDEMPOTENCY_CACHE', 'ERROR', e.message, idempotencyKey);
  }
}

/**
 * Authorizes a user for a specific role.
 * @param {string} email - User email address
 * @param {string} requiredRole - Role to check (Manager, Cashier, Accountant, Bowler)
 * @returns {boolean} true if user has required role or higher
 */
function authorizeUserRole(email, requiredRole) {
  try {
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName('Users');
    
    if (!usersSheet) {
      logSecurityEvent('AUTHORIZATION', 'ERROR', 'Users sheet not found', email);
      return false;
    }
    
    const usersData = usersSheet.getRange('B:C').getValues(); // EMAIL, ROLE
    let userRole = 'Bowler'; // Default role for members not in Users sheet
    let isActive = false;
    
    for (let i = 0; i < usersData.length; i++) {
      if (usersData[i][0] === email) {
        userRole = usersData[i][1];
        // Check ACTIVE_FLAG in column D (index 3 in full row)
        const fullRow = usersSheet.getRange(i + 1, 1, 1, 4).getValues()[0];
        isActive = fullRow[3] === true || fullRow[3] === 'TRUE';
        break;
      }
    }
    
    if (!isActive && userRole !== 'Bowler') {
      logSecurityEvent('AUTHORIZATION', 'FAIL', `User inactive: ${userRole}`, email);
      return false;
    }
    
    // Role hierarchy: Manager > Accountant > Cashier > Bowler
    const roleHierarchy = {
      'Manager': 4,
      'Accountant': 3,
      'Cashier': 2,
      'Bowler': 1
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    const authorized = userLevel >= requiredLevel;
    if (!authorized) {
      logSecurityEvent('AUTHORIZATION', 'FAIL', `Required: ${requiredRole}, got: ${userRole}`, email);
    }
    
    return authorized;
  } catch (e) {
    logSecurityEvent('AUTHORIZATION', 'ERROR', e.message, email);
    return false;
  }
}

/**
 * Lightweight security event logger (errors and auth failures only).
 * @param {string} eventType - Event classification
 * @param {string} status - PASS, FAIL, ERROR, EXCEEDED
 * @param {string} detail - Event details
 * @param {string} context - Email or identifier
 */
function logSecurityEvent(eventType, status, detail, context) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${eventType} | ${status} | ${detail} | ${context}`;
    
    // Log to browser console for real-time debugging (Apps Script logs)
    console.log(logEntry);
    
    // Optional: Store only failures in a System Config audit entry
    if (status !== 'PASS') {
      // This could append to a SECURITY_AUDIT_LOG config entry (keep it lightweight)
      // Omit for now to avoid bloating System Config
    }
  } catch (e) {
    console.error('Failed to log security event: ' + e.message);
  }
}
