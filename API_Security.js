/**
 * API_Security.gs
 * Handles RBAC, CSRF validation, rate limiting, and idempotency checks.
 * All security decisions are logged and locked.
 */

// Compatibility wrapper for legacy API_Security.js calls.


function validateCSRFToken(token, userEmail) {
  return RF_validateCSRFToken(token, userEmail);
}

function enforceRateLimit(userEmail, options) {
  return RF_enforceRateLimit(userEmail, options);
}

function authorizeUserRole(userEmail, requiredRole) {
  return RF_authorizeUserRole(userEmail, requiredRole);
}

function getUserRole(userEmail) {
  return RF_getUserRole(userEmail);
}

/**
 * Validates CSRF token against session state.
 * @param {string} token - Base64-encoded token from request
 * @param {string} sessionState - Session identifier (email or user ID)
 * @returns {boolean} true if token is valid, false otherwise
 */

/**
 * Enforces per-email rate limiting using PropertiesService.
 * @param {string} email - User email address
 * @param {number} limit - Max requests per window (default 10)
 * @param {number} window - Time window in ms (default 60000 = 1 min)
 * @returns {boolean} true if request is allowed, false if rate limit exceeded
 */

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
