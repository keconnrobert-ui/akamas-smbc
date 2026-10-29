/**
 * RF_CoreSecurity.js
 * Canonical security layer for the refactor.
 * Security is source-aware and catalog-driven.
 */

function RF_constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function RF_generateCSRFToken(userEmail) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = PropertiesService.getScriptProperties().getProperty('CSRF_SECRET') || 'AKAMAS_BOWLS_CSRF_SECRET_V2';
    const payload = String(userEmail || '') + '|' + String(timestamp) + '|' + secret;
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload);
    const token = Utilities.base64Encode(digest);
    PropertiesService.getScriptProperties().setProperty('CSRF_' + String(userEmail).trim(), token);
    return token;
  } catch (err) {
    Logger.log('RF_generateCSRFToken error: ' + err.message);
    return null;
  }
}

function RF_validateCSRFToken(token, userEmail) {
  try {
    if (!token || token.trim() === '') {
      return false;
    }

    const cached = PropertiesService.getScriptProperties().getProperty('CSRF_' + String(userEmail).trim());
    const generated = RF_generateCSRFToken(userEmail);

    if (cached && RF_constantTimeCompare(token, cached)) {
      return true;
    }

    if (generated && RF_constantTimeCompare(token, generated)) {
      return true;
    }

    return false;
  } catch (err) {
    Logger.log('RF_validateCSRFToken error: ' + err.message);
    return false;
  }
}

function RF_enforceRateLimit(userEmail, options) {
  const safeOptions = options || {};
  const windowMs = Number(safeOptions.windowMs) || 60000;
  const maxRequests = Number(safeOptions.maxRequests) || 10;

  const scriptLock = LockService.getScriptLock();
  try {
    scriptLock.waitLock(5000);
    const props = PropertiesService.getScriptProperties();
    const key = 'RF_RATE_LIMIT_' + String(userEmail).trim();
    const now = Date.now();
    const stored = props.getProperty(key);

    let windowStart = now;
    let count = 0;

    if (stored) {
      const parts = stored.split('|');
      windowStart = parseInt(parts[0], 10) || now;
      count = parseInt(parts[1], 10) || 0;
      if (now - windowStart > windowMs) {
        count = 0;
        windowStart = now;
      }
    }

    count += 1;
    props.setProperty(key, windowStart + '|' + count);

    if (count > maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((windowMs - (now - windowStart)) / 1000),
        count: count,
        windowMs: windowMs
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - count),
      retryAfter: 0,
      count: count,
      windowMs: windowMs
    };
  } catch (err) {
    Logger.log('RF_enforceRateLimit error: ' + err.message);
    return { allowed: false, remaining: 0, retryAfter: 60 };
  } finally {
    try {
      scriptLock.releaseLock();
    } catch (e) {
      // no-op
    }
  }
}

function RF_checkIdempotencyKey(idempotencyKey) {
  try {
    const cached = PropertiesService.getScriptProperties().getProperty('IDEMPOTENCY_' + String(idempotencyKey));
    if (!cached) {
      return null;
    }

    try {
      return JSON.parse(cached);
    } catch (e) {
      return cached;
    }
  } catch (err) {
    Logger.log('RF_checkIdempotencyKey error: ' + err.message);
    return null;
  }
}

function RF_cacheIdempotencyKey(idempotencyKey, result) {
  try {
    PropertiesService.getScriptProperties().setProperty('IDEMPOTENCY_' + String(idempotencyKey), JSON.stringify(result));
    return true;
  } catch (err) {
    Logger.log('RF_cacheIdempotencyKey error: ' + err.message);
    return false;
  }
}

function RF_authorizeUserRole(userEmail, requiredRole) {
  const roleHierarchy = {
    Manager: 4,
    Accountant: 3,
    Cashier: 2,
    Bowler: 1
  };

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    if (!usersSheet) {
      return false;
    }

    const rows = usersSheet.getDataRange().getValues();
    const emailKey = String(userEmail || '').trim().toLowerCase();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 4) {
        continue;
      }

      const rowEmail = (row[1] || '').toString().trim().toLowerCase();
      const role = (row[2] || '').toString().trim();
      const active = row[3] === true || row[3] === 'TRUE' || row[3] === 'true';

      if (rowEmail === emailKey && active) {
        const userLevel = roleHierarchy[role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;
        return userLevel >= requiredLevel;
      }
    }

    return requiredRole === 'Bowler';
  } catch (err) {
    Logger.log('RF_authorizeUserRole error: ' + err.message);
    return false;
  }
}

function RF_getUserRole(userEmail) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    return 0;
  }

  const rows = usersSheet.getDataRange().getValues();
  const emailKey = String(userEmail || '').trim().toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) {
      continue;
    }

    if ((row[1] || '').toString().trim().toLowerCase() === emailKey) {
      const active = row[3] === true || row[3] === 'TRUE' || row[3] === 'true';
      if (!active) {
        return 0;
      }

      const role = (row[2] || '').toString().trim();
      if (role === 'Manager') return 4;
      if (role === 'Accountant') return 3;
      if (role === 'Cashier') return 2;
      if (role === 'Bowler') return 1;
      return 0;
    }
  }

  return 0;
}

function RF_logSecurityEvent(eventType, status, detail, context) {
  try {
    const message = '[' + new Date().toISOString() + '] ' + eventType + ' | ' + status + ' | ' + detail + ' | ' + context;
    Logger.log(message);
    console.log(message);
  } catch (err) {
    Logger.log('RF_logSecurityEvent error: ' + err.message);
  }
}
