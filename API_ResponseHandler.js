/**
 * API_ResponseHandlers.gs
 * Standardized HTTP response formatters for API Gateway
 * Supports both HtmlService and ContentService outputs
 * Role: Consistent error/success messaging, CORS headers, security headers
 */

/**
 * Success Response Handler
 * @param {Object} data - Payload to return (object, array, or primitive)
 * @param {string} message - Human-readable success message
 * @param {Object} options - {httpCode, contentType, corsOrigin, frameOptions}
 * @returns {HtmlService.HtmlOutput | ContentService.TextOutput}
 */
function respondWithSuccess(data, message = "Operation successful", options = {}) {
  const {
    httpCode = 200,
    contentType = "application/json",
    corsOrigin = "*",
    frameOptions = "DENY"
  } = options;

  const payload = {
    success: true,
    message: message,
    data: data,
    timestamp: new Date().toISOString(),
    requestId: Session.getActiveUser().getEmail() + "_" + Utilities.getUuid()
  };

  if (contentType === "application/json") {
    const output = ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
    
    // Apply security headers
    output.addHeader("Access-Control-Allow-Origin", corsOrigin);
    output.addHeader("X-Frame-Options", frameOptions);
    output.addHeader("Content-Security-Policy", "default-src 'self'");
    output.addHeader("X-Content-Type-Options", "nosniff");
    output.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    
    return output;
  } else if (contentType === "text/html") {
    return HtmlService.createHtmlOutput(JSON.stringify(payload))
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptions(HtmlService.XFrameOptions.DENY);
  }
}

/**
 * Error Response Handler
 * @param {string} errorCode - Machine-readable error code (e.g., "ERR_AUTH_FAILED")
 * @param {string} message - Human-readable error message
 * @param {Object} options - {httpCode, details, contentType, corsOrigin, logError}
 * @returns {HtmlService.HtmlOutput | ContentService.TextOutput}
 */
function respondWithError(errorCode, message, options = {}) {
  const {
    httpCode = 400,
    details = null,
    contentType = "application/json",
    corsOrigin = "*",
    frameOptions = "DENY",
    logError = true
  } = options;

  // Map error codes to HTTP status
  const statusMap = {
    "ERR_AUTH_FAILED": 401,
    "ERR_FORBIDDEN": 403,
    "ERR_NOT_FOUND": 404,
    "ERR_CONFLICT": 409,
    "ERR_RATE_LIMIT": 429,
    "ERR_INTERNAL": 500,
    "ERR_VALIDATION": 400,
    "ERR_IDEMPOTENCY": 409
  };

  const finalHttpCode = statusMap[errorCode] || httpCode;

  const payload = {
    success: false,
    errorCode: errorCode,
    message: message,
    details: details,
    timestamp: new Date().toISOString(),
    requestId: Session.getActiveUser().getEmail() + "_" + Utilities.getUuid()
  };

  // Log error if requested
  if (logError) {
    logAPIError(errorCode, message, details, finalHttpCode);
  }

  if (contentType === "application/json") {
    const output = ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
    
    // Apply security headers
    output.addHeader("Access-Control-Allow-Origin", corsOrigin);
    output.addHeader("X-Frame-Options", frameOptions);
    output.addHeader("Content-Security-Policy", "default-src 'self'");
    output.addHeader("X-Content-Type-Options", "nosniff");
    output.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    
    return output;
  } else if (contentType === "text/html") {
    return HtmlService.createHtmlOutput(JSON.stringify(payload))
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptions(HtmlService.XFrameOptions.DENY);
  }
}

/**
 * Validation Error Response (convenience wrapper)
 * @param {string} fieldName - Name of field that failed validation
 * @param {string} reason - Why it failed (e.g., "required", "invalid format")
 * @param {Object} options - {httpCode, contentType, corsOrigin}
 * @returns {ContentService.TextOutput}
 */
function respondWithValidationError(fieldName, reason, options = {}) {
  const message = `Validation failed: ${fieldName} – ${reason}`;
  const details = { field: fieldName, reason: reason };
  
  return respondWithError("ERR_VALIDATION", message, {
    ...options,
    details: details,
    httpCode: 400,
    logError: true
  });
}

/**
 * Authorization Error Response (convenience wrapper)
 * @param {string} requiredRole - Role that is required
 * @param {string} userRole - Role the user actually has
 * @param {Object} options - {httpCode, contentType, corsOrigin}
 * @returns {ContentService.TextOutput}
 */
function respondWithAuthError(requiredRole, userRole = null, options = {}) {
  const message = `Authorization failed: ${requiredRole} role required`;
  const details = userRole ? { required: requiredRole, actual: userRole } : null;
  
  return respondWithError("ERR_FORBIDDEN", message, {
    ...options,
    details: details,
    httpCode: 403,
    logError: true
  });
}

/**
 * Rate Limit Error Response (convenience wrapper)
 * @param {string} userEmail - Email that hit limit
 * @param {number} limit - Request limit (e.g., 10 per minute)
 * @param {number} window - Time window in seconds
 * @param {Object} options - {httpCode, contentType, corsOrigin}
 * @returns {ContentService.TextOutput}
 */
function respondWithRateLimitError(userEmail, limit, window, options = {}) {
  const message = `Rate limit exceeded: ${limit} requests per ${window} seconds`;
  const details = { user: userEmail, limit: limit, windowSeconds: window };
  
  return respondWithError("ERR_RATE_LIMIT", message, {
    ...options,
    details: details,
    httpCode: 429,
    logError: true
  });
}

/**
 * Internal Error Response (convenience wrapper)
 * @param {Error} exception - JavaScript Error object
 * @param {string} context - Context where error occurred (e.g., "saveMember")
 * @param {Object} options - {httpCode, contentType, corsOrigin}
 * @returns {ContentService.TextOutput}
 */
function respondWithInternalError(exception, context = "unknown", options = {}) {
  const message = `Internal server error in ${context}`;
  const details = {
    context: context,
    error: exception.message,
    stack: exception.stack
  };
  
  return respondWithError("ERR_INTERNAL", message, {
    ...options,
    details: details,
    httpCode: 500,
    logError: true
  });
}

/**
 * Idempotency Conflict Response (convenience wrapper)
 * @param {string} idempotencyKey - The key that caused conflict
 * @param {Object} priorResult - Result from prior request
 * @param {Object} options - {httpCode, contentType, corsOrigin}
 * @returns {ContentService.TextOutput}
 */
function respondWithIdempotencyConflict(idempotencyKey, priorResult, options = {}) {
  const message = `Idempotency key conflict: duplicate request detected`;
  const details = { idempotencyKey: idempotencyKey, priorResult: priorResult };
  
  return respondWithError("ERR_IDEMPOTENCY", message, {
    ...options,
    details: details,
    httpCode: 409,
    logError: false // Don't log as error; this is expected behavior
  });
}

/**
 * Log API Error to System_Error_Log sheet
 * @param {string} errorCode - Error code
 * @param {string} message - Error message
 * @param {Object} details - Additional details
 * @param {number} httpCode - HTTP status code
 */
function logAPIError(errorCode, message, details, httpCode) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName("System_Error_Log");
    
    if (!logSheet) {
      // Create sheet if it doesn't exist
      const newSheet = ss.insertSheet("System_Error_Log");
      newSheet.appendRow([
        "TIMESTAMP",
        "ERROR_CODE",
        "MESSAGE",
        "DETAILS",
        "HTTP_CODE",
        "USER_EMAIL",
        "STACK_TRACE"
      ]);
      logSheet = newSheet;
    }

    const userEmail = Session.getActiveUser().getEmail();
    const timestamp = new Date().toISOString();
    const detailsStr = typeof details === "object" ? JSON.stringify(details) : String(details);

    logSheet.appendRow([
      timestamp,
      errorCode,
      message,
      detailsStr,
      httpCode,
      userEmail,
      "" // Stack trace if available
    ]);
  } catch (e) {
    // Silently fail if logging itself fails
    Logger.log("Error logging API error: " + e.message);
  }
}

// END OF API_ResponseHandlers.gs
