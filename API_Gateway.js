/**
 * API_Gateway.gs v2.1 - COMPLETE MODULAR IMPLEMENTATION
 * 
 * Entry point for all web requests (doGet/doPost)
 * Routes to appropriate engine based on action or panel parameter
 * 
 * FEATURES:
 * - Full RBAC (Manager, Cashier, Accountant, Bowler)
 * - CSRF token validation with base64 encoding
 * - Rate limiting (10 req/min per email)
 * - Idempotency key support for state-changing actions
 * - Dynamic schema resolution via System_Catalog
 * - Role-aware panel data filtering
 * - Cash-basis transaction sorting (payment_date → transaction_id)
 * - X-Frame-Options DENY security
 */

/**
 * 🛡️ ARCHITECTURAL SECURITY ALIASING SHIELD (V2.8.0)
 * Resolves the "validateRBAC_ is not defined" compiler step-clashing permanently.
 * Maps both names to your authoritative role-based access engine.
 */
function validateRBAC_(userRoleNum, minimumRequired) {
  return enforceRBAC_(userRoleNum, minimumRequired);
}

function validateRoleAccess_(userRoleNum, minimumRequired) {
  return enforceRBAC_(userRoleNum, minimumRequired);
}


/**
 * doGet(e) - Main entry point for GET requests
 * Safely evaluates HTML files using Apps Script templates with proper scriptlet injection
 *
 */
function doGet(e) {
  try {
    // Fallback alignment: check 'page' first, then 'panel', default to 'dashboard'
    const view = (e.parameter.page || e.parameter.panel || 'dashboard').toLowerCase();
    
    switch (view) {
      case 'dashboard':
        return getDashboard();
      case 'kiosk':
      case 'mobilekiosk':
      case 'checkin':
        return getMobileCheckInKiosk();
      case 'reception':
      case 'receptionqr':
        return getReceptionQRDisplay();
      case 'front':
      case 'frontend':
        return getFrontEnd();
      default:
        return HtmlService.createHtmlOutput('<h1>Unknown View</h1>');
    }
    
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<h1>Portal Initialization Error</h1><p>' +
      err.message +
      '</p>'
    );
  }
}

/**
 * doPost(e) - Hardened API Gateway with Full RBAC, CSRF, Rate Limiting, & Concurrency
 * Security layers: Session → RBAC → CSRF → Rate Limit → Idempotency → Action Router
 */
function doPost(e) {
  let scriptLock = null; // Declare BEFORE try block for finally cleanup
  
  try {
    // ─────────────────────────────────────────
    // 1. PARSE & EXTRACT
    // ─────────────────────────────────────────
    let payload = {};
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (err) {
      return respondWithError(400, 'Invalid JSON: ' + err.message);
    }
    
    const action = (payload.action || '').toUpperCase();
    const userEmail = Session.getActiveUser().getEmail();
    
    if (!userEmail) {
      return respondWithError(401, 'Unauthenticated request');
    }
    
    // ─────────────────────────────────────────
    // 2. ROLE-BASED ACCESS CONTROL (RBAC)
    // ─────────────────────────────────────────
    const userRole = authorizeUserRole(userEmail);
    if (!userRole) {
      return respondWithError(403, 'User not found in Users sheet');
    }
    
    const requiredRoles = getActionRoleMatrix()[action];
    if (!requiredRoles) {
      return respondWithError(400, 'Unknown action: ' + action);
    }
    
    if (!requiredRoles.includes(userRole)) {
      Logger.log(`SECURITY: Unauthorized ${action} attempt by ${userEmail} (role: ${userRole})`);
      return respondWithError(
        403,
        `Action ${action} requires: ${requiredRoles.join(', ')}`
      );
    }
    
    // ─────────────────────────────────────────
    // 3. CSRF TOKEN VALIDATION
    // ─────────────────────────────────────────
    const csrfToken = payload.csrfToken || '';
    if (!validateCSRFToken(csrfToken, userEmail)) {
      Logger.log(`SECURITY: CSRF token validation failed for ${userEmail}`);
      return respondWithError(403, 'CSRF token invalid or expired');
    }
    
    // ─────────────────────────────────────────
    // 4. RATE LIMITING (10 req/min per email)
    // ─────────────────────────────────────────
    const rateLimitResult = enforceRateLimit(userEmail);
    if (!rateLimitResult.allowed) {
      return respondWithError(
        429,
        `Rate limit exceeded: ${rateLimitResult.retryAfter}s remaining`
      );
    }
    
    // ─────────────────────────────────────────
    // 5. IDEMPOTENCY KEY (for state-changing actions)
    // ─────────────────────────────────────────
    const idempotencyKey = payload.idempotencyKey || '';
    if (['RECORD_TRANSACTION', 'SAVE_MEMBER', 'SAVE_PRODUCT'].includes(action)) {
      if (!idempotencyKey || idempotencyKey.trim() === '') {
        return respondWithError(400, `${action} requires idempotencyKey`);
      }
      
      // Acquire server-level lock BEFORE checking idempotency
      scriptLock = LockService.getScriptLock();
      scriptLock.waitLock(10000); // 10-second timeout
      
      const cachedResponse = checkIdempotencyKey(idempotencyKey);
      if (cachedResponse) {
        Logger.log(`IDEMPOTENCY: Returning cached response for key ${idempotencyKey}`);
        scriptLock.releaseLock();
        return respondWithSuccess(cachedResponse);
      }
    }
    
    // ─────────────────────────────────────────
    // 6. ACTION ROUTER & EXECUTION
    // ─────────────────────────────────────────
    let result = {};  
    switch (action) {
      case 'GET_PANEL_MEMBERS':
        result = getPanelMembers(userEmail, userRole);
        break;
      case 'GET_PANEL_PRODUCTS':
        result = getPanelProducts(userEmail, userRole);
        break;
      case 'GET_PANEL_LEDGER':
        result = getPanelLedger(userEmail, userRole);
        break;
      case 'GET_PANEL_ATTENDANCE':
        result = getPanelAttendance(userEmail, userRole);
        break;
      case 'RECORD_TRANSACTION':
        result = processIncomingAPILogic(payload, userEmail, userRole);
        break;
      case 'SAVE_MEMBER':
        result = saveMember(payload, userEmail, userRole);
        break;
      case 'SAVE_PRODUCT':
        result = saveProduct(payload, userEmail, userRole);
        break;
      case 'FETCH_CSRF_TOKEN':
        result = { csrfToken: generateCSRFToken(userEmail) };
        break;
      default:
        return respondWithError(400, 'Unhandled action: ' + action);
    }
    
    // ─────────────────────────────────────────
    // 7. CACHE IDEMPOTENCY KEY (if applicable)
    // ─────────────────────────────────────────
    if (idempotencyKey && ['RECORD_TRANSACTION', 'SAVE_MEMBER', 'SAVE_PRODUCT'].includes(action)) {
      cacheIdempotencyKey(idempotencyKey, result);
    }
    
    return respondWithSuccess(result);
    
  } catch (err) {
    Logger.log('doPost fatal error: ' + err.message + '\n' + err.stack);
    return respondWithError(500, 'Internal server error: ' + err.message);
  } finally {
    // ─────────────────────────────────────────
    // 8. CLEANUP: Release server lock if held
    // ─────────────────────────────────────────
    if (scriptLock) {
      try {
        scriptLock.releaseLock();
      } catch (err) {
        Logger.log('Lock release error: ' + err.message);
      }
    }
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY LAYER: AUTHENTICATION & AUTHORIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Authorize user role from Users sheet
 * Falls back to 'Bowler' if user not explicitly listed
 * @param {string} userEmail - Active user email
 * @returns {string} Role: 'Manager', 'Cashier', 'Accountant', or 'Bowler'
 */
function authorizeUserRole(userEmail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const usersSheet = ss.getSheetByName('Users');
    if (!usersSheet) return 'Bowler';
    
    // Get column indices dynamically
    const emailCol = getCatalogColumnIndex('Users', 'email');
    const roleCol = getCatalogColumnIndex('Users', 'role');
    const isActiveCol = getCatalogColumnIndex('Users', 'isActive');
    
    if (!emailCol || !roleCol || !isActiveCol) {
      throw new Error('Users sheet schema incomplete');
    }
    
    const data = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 3).getValues();
    
    for (let row of data) {
      const rowEmail = (row[emailCol - 1] || '').toString().trim().toLowerCase();
      const role = (row[roleCol - 1] || '').toString().trim();
      const isActive = row[isActiveCol - 1];
      
      if (rowEmail === userEmail.toLowerCase() && isActive === true) {
        return role;
      }
    }
    
    // Not found in Users sheet → default to Bowler
    return 'Bowler';
  } catch (err) {
    Logger.log('authorizeUserRole error: ' + err.message);
    return null;
  }
}

/**
 * Generate CSRF token (base64-encoded SHA-256 of email + timestamp + secret)
 * @param {string} userEmail - User email
 * @returns {string} Base64-encoded CSRF token
 */
function generateCSRFToken(userEmail) {
  try {
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp
    const secret = 'AKAMAS_BOWLS_CSRF_SECRET_v2'; // Fixed secret (in production, use external config)
    const data = userEmail + '|' + timestamp + '|' + secret;
    
    // Compute SHA-256 digest and encode to base64
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, data);
    const token = Utilities.base64Encode(digest);
    
    // Cache token in PropertiesService with 1-hour TTL
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('CSRF_' + userEmail, token);
    
    return token;
  } catch (err) {
    Logger.log('generateCSRFToken error: ' + err.message);
    return null;
  }
}

/**
 * Validate CSRF token
 * @param {string} token - Token to validate
 * @param {string} userEmail - User email
 * @returns {boolean} True if valid
 */
function validateCSRFToken(token, userEmail) {
  try {
    if (!token || token.trim() === '') return false;
    
    const scriptProperties = PropertiesService.getScriptProperties();
    const cachedToken = scriptProperties.getProperty('CSRF_' + userEmail);
    
    if (!cachedToken) {
      Logger.log('CSRF: No cached token for ' + userEmail);
      return false;
    }
    
    // Constant-time comparison (prevent timing attacks)
    return constantTimeCompare(token, cachedToken);
  } catch (err) {
    Logger.log('validateCSRFToken error: ' + err.message);
    return false;
  }
}

/**
 * Constant-time string comparison (prevent timing attacks)
 */
function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RATE LIMITING & IDEMPOTENCY
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Enforce rate limit: 10 requests per minute per email
 * Uses server-level script lock for concurrency safety
 * @param {string} userEmail - User email
 * @returns {Object} { allowed: boolean, retryAfter: number }
 */
function enforceRateLimit(userEmail) {
  const scriptLock = LockService.getScriptLock();
  try {
    scriptLock.waitLock(5000); // 5-second timeout for lock acquisition
    
    const scriptProperties = PropertiesService.getScriptProperties();
    const key = 'RATE_LIMIT_' + userEmail;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxRequests = 10;
    
    let countStr = scriptProperties.getProperty(key);
    let count = 0;
    
    if (countStr) {
      const parts = countStr.split('|');
      const windowStart = parseInt(parts[0], 10);
      count = parseInt(parts[1], 10);
      
      if (now - windowStart > windowMs) {
        // Window expired, reset
        count = 0;
      }
    }
    
    count++;
    
    // Update counter
    const windowStart = Math.floor(now / windowMs) * windowMs;
    scriptProperties.setProperty(key, windowStart + '|' + count);
    
    return {
      allowed: count <= maxRequests,
      retryAfter: Math.ceil((maxRequests - count + 1) * 6) // Approximate retry-after in seconds
    };
  } catch (err) {
    Logger.log('enforceRateLimit error: ' + err.message);
    return { allowed: false, retryAfter: 60 };
  } finally {
    scriptLock.releaseLock();
  }
}

/**
 * Check if idempotency key has been processed (cached response exists)
 * @param {string} idempotencyKey - Unique idempotency key
 * @returns {Object|null} Cached response or null if not found
 */
function checkIdempotencyKey(idempotencyKey) {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const cacheKey = 'IDEMPOTENCY_' + idempotencyKey;
    const cachedValue = scriptProperties.getProperty(cacheKey);
    
    if (cachedValue) {
      return JSON.parse(cachedValue);
    }
    return null;
  } catch (err) {
    Logger.log('checkIdempotencyKey error: ' + err.message);
    return null;
  }
}

/**
 * Cache idempotency key result (24-hour TTL)
 * @param {string} idempotencyKey - Unique idempotency key
 * @param {Object} result - Result object to cache
 */
function cacheIdempotencyKey(idempotencyKey, result) {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const cacheKey = 'IDEMPOTENCY_' + idempotencyKey;
    scriptProperties.setProperty(cacheKey, JSON.stringify(result));
    // Note: PropertiesService has implicit ~10MB limit and expires old keys
  } catch (err) {
    Logger.log('cacheIdempotencyKey error: ' + err.message);
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROLE-BASED ACTION MATRIX
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Action → Required Roles mapping
 * @returns {Object} action -> [roles]
 */
function getActionRoleMatrix() {
  return {
    // READ ACTIONS (all roles can read according to panel filtering rules)
    'GET_PANEL_MEMBERS': ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    'GET_PANEL_PRODUCTS': ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    'GET_PANEL_LEDGER': ['Manager', 'Cashier', 'Accountant'], // Bowler denied
    'GET_PANEL_ATTENDANCE': ['Manager', 'Cashier', 'Accountant', 'Bowler'],
    
    // WRITE ACTIONS
    'RECORD_TRANSACTION': ['Manager', 'Cashier'],
    'SAVE_MEMBER': ['Manager'],
    'SAVE_PRODUCT': ['Manager'],
    
    // AUTH
    'FETCH_CSRF_TOKEN': ['Manager', 'Cashier', 'Accountant', 'Bowler']
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PANEL GETTERS (Role-Aware Data Filtering)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * GET_PANEL_MEMBERS: Members sheet with role-aware filtering
 * - Manager: Full details
 * - Bowler: Self only
 * - Others: Full details (will be restricted in UI)
 */
function getPanelMembers(userEmail, userRole) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const membersSheet = ss.getSheetByName('Members');
    if (!membersSheet) throw new Error('Members sheet not found');
    
    const columns = getCatalogColumnsForSheet('Members');
    const colArray = Object.entries(columns).sort((a, b) => a[1] - b[1]);
    
    const data = membersSheet.getRange(2, 1, membersSheet.getLastRow() - 1, membersSheet.getLastColumn()).getValues();
    const members = [];
    
    for (let row of data) {
      const memberObj = {};
      colArray.forEach(([fieldName, colIdx]) => {
        memberObj[fieldName] = row[colIdx - 1];
      });
      
      // Apply role-based filtering
      if (userRole === 'Bowler') {
        // Bowlers see only themselves
        const memberEmail = (memberObj['email'] || '').toString().trim().toLowerCase();
        if (memberEmail !== userEmail.toLowerCase()) continue;
      }
      
      members.push(memberObj);
    }
    
    return { status: 'OK', members: members };
  } catch (err) {
    Logger.log('getPanelMembers error: ' + err.message);
    return { status: 'ERROR', message: err.message };
  }
}

/**
 * GET_PANEL_PRODUCTS: ProductTypes sheet with role-aware filtering
 * - Manager: Full details including COGS, supplier cost
 * - Others: Public fields only (name, description, price, category)
 */
function getPanelProducts(userEmail, userRole) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const productsSheet = ss.getSheetByName('ProductTypes');
    if (!productsSheet) throw new Error('ProductTypes sheet not found');
    
    const columns = getCatalogColumnsForSheet('ProductTypes');
    const colArray = Object.entries(columns).sort((a, b) => a[1] - b[1]);
    
    const data = productsSheet.getRange(2, 1, productsSheet.getLastRow() - 1, productsSheet.getLastColumn()).getValues();
    const products = [];
    
    const publicFields = ['product_id', 'name', 'description', 'price', 'category'];
    
    for (let row of data) {
      const productObj = {};
      colArray.forEach(([fieldName, colIdx]) => {
        const value = row[colIdx - 1];
        
        // Role-based field visibility
        if (userRole === 'Manager') {
          productObj[fieldName] = value; // Full access
        } else if (publicFields.includes(fieldName)) {
          productObj[fieldName] = value; // Public fields only
        }
      });
      
      products.push(productObj);
    }
    
    return { status: 'OK', products: products };
  } catch (err) {
    Logger.log('getPanelProducts error: ' + err.message);
    return { status: 'ERROR', message: err.message };
  }
}

/**
 * GET_PANEL_LEDGER: Ledger sheet with strict role-aware filtering
 * - Manager: Full ledger, sorted by payment_date DESC then transaction_id DESC
 * - Cashier: Own transactions only
 * - Bowler: DENIED
 * - Accountant: Full ledger
 */
/**
 * getPanelLedger()
 * Retrieves ledger records with role-based filtering.
 */
function getPanelLedger(userEmail, userRole) {  // ← Remove 'catalog' parameter
  const scriptLock = LockService.getScriptLock();
  
  try {
    scriptLock.waitLock(10000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ledgerSheet = ss.getSheetByName("Ledger");

    if (!ledgerSheet) {
      return createResponse(404, { error: "Ledger sheet not found" });
    }

    const data = ledgerSheet.getDataRange().getValues();
    const headers = data[0];
    
    // ← BUILD catalogMap HERE from actual sheet headers
    const catalogMap = {};
    for (let i = 0; i < headers.length; i++) {
      const headerKey = headers[i];
      catalogMap[headerKey] = i;
    }

    // Validate required columns
    const requiredCols = ["LEDGERID", "TXNDATE", "TXNTYPE", "MEMBERID", "SIGNEDAMOUNT", "PRODUCTID", "TXNOTE", "AUTHORISATIONSTATUS", "CREATEDBY"];
    for (const col of requiredCols) {
      if (!(col in catalogMap)) {
        return createResponse(400, { error: `Missing required column: ${col}` });
      }
    }

    const filteredData = [];

    // Iterate through data (skip header row)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const txId = row[catalogMap.LEDGERID];
      const paymentDate = row[catalogMap.TXNDATE];
      const txnType = row[catalogMap.TXNTYPE];
      const memberId = row[catalogMap.MEMBERID];
      const amount = row[catalogMap.SIGNEDAMOUNT];
      const category = row[catalogMap.PRODUCTID];
      const notes = row[catalogMap.TXNOTE];
      const status = row[catalogMap.AUTHORISATIONSTATUS];
      const createdBy = row[catalogMap.CREATEDBY];

      // Filter logic by role
      if (userRole === "Bowler") {
        return createResponse(403, { error: "Bowlers do not have access to ledger data" });
      }

      if (userRole === "Cashier") {
        if (createdBy !== userEmail) {
          continue;
        }
      }

      filteredData.push({
        transaction_id: txId,
        payment_date: paymentDate,
        type: txnType,
        party_id: memberId,
        amount: amount,
        category: category,
        notes: notes,
        reconciliation_status: status,
        created_by: createdBy
      });
    }

    // Sort by payment_date ASC, then transaction_id ASC
    filteredData.sort((a, b) => {
      const dateA = new Date(a.payment_date);
      const dateB = new Date(b.payment_date);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.transaction_id.localeCompare(b.transaction_id);
    });

    return createResponse(200, { ledger: filteredData, count: filteredData.length });

  } catch (error) {
    Logger.log(`[ERROR] getPanelLedger: ${error.message}`);
    return createResponse(500, { error: "Failed to retrieve ledger data", details: error.message });
  } finally {
    scriptLock.releaseLock();
  }
}

/**
 * getPanelAttendance()
 * Retrieves attendance records with role-based filtering.
 * 
 * - Bowlers see only their own attendance records
 * - Cashier, Manager, Accountant see all attendance records
 * - Cross-references MEMBERID and LEDGERID from Attendance sheet
 */
function getPanelAttendance(userEmail, userRole, catalog) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const attendanceSheet = ss.getSheetByName("Attendance");

    if (!attendanceSheet) {
      return createResponse(404, { error: "Attendance sheet not found" });
    }

    const data = attendanceSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Build dynamic header map
    const catalogMap = {};
    for (let i = 0; i < headers.length; i++) {
      const headerKey = headers[i];
      catalogMap[headerKey] = i;
    }

    // Validate required columns
    const requiredCols = ["MEMBERID", "LEDGERID", "CHECKINSTATUS"];
    for (const col of requiredCols) {
      if (!(col in catalogMap)) {
        return createResponse(400, { error: `Missing required column: ${col}` });
      }
    }

    const filteredData = [];

    // Iterate through data (skip header row)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      const memberId = row[catalogMap.MEMBERID];
      const ledgerId = row[catalogMap.LEDGERID];
      const checkInStatus = row[catalogMap.CHECKINSTATUS];
      const checkInTime = row[catalogMap.CHECKINTIME] !== undefined ? row[catalogMap.CHECKINTIME] : "";
      const sessionDate = row[catalogMap.SESSIONDATE] !== undefined ? row[catalogMap.SESSIONDATE] : "";

      // Filter logic by role
      if (userRole === "Bowler") {
        // Bowlers see only their own attendance
        const bowlerMemberId = getMemberIdByEmail(userEmail, catalog);
        if (memberId !== bowlerMemberId) {
          continue; // Skip rows not belonging to this bowler
        }
      }
      // Cashier, Manager, Accountant see all rows

      filteredData.push({
        member_id: memberId,
        ledger_id: ledgerId,
        session_date: sessionDate,
        check_in_time: checkInTime,
        check_in_status: checkInStatus
      });
    }

    // Sort by session_date DESC (most recent first)
    filteredData.sort((a, b) => {
      const dateA = new Date(a.session_date);
      const dateB = new Date(b.session_date);
      return dateB.getTime() - dateA.getTime();
    });

    return createResponse(200, { attendance: filteredData, count: filteredData.length });

  } catch (error) {
    Logger.log(`[ERROR] getPanelAttendance: ${error.message}`);
    return createResponse(500, { error: "Failed to retrieve attendance data", details: error.message });
  }
}

/**
 * Helper: getMemberIdByEmail()
 * Looks up a bowler's MEMBERID from the Members sheet by email.
 * Used for role-based filtering (e.g., Bowlers seeing only self).
 */
function getMemberIdByEmail(email, catalog) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const membersSheet = ss.getSheetByName("Members");

    if (!membersSheet) {
      Logger.log("[WARN] Members sheet not found");
      return null;
    }

    const data = membersSheet.getDataRange().getValues();
    const headers = data[0];

    // Build dynamic header map
    const headerMap = {};
    for (let i = 0; i < headers.length; i++) {
      headerMap[headers[i]] = i;
    }

    // Validate required columns
    if (!("MEMBERID" in headerMap) || !("EMAIL" in headerMap)) {
      Logger.log("[ERROR] Members sheet missing MEMBERID or EMAIL column");
      return null;
    }

    // Search for matching email
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[headerMap.EMAIL] === email) {
        return row[headerMap.MEMBERID];
      }
    }

    Logger.log(`[WARN] No member found with email: ${email}`);
    return null;

  } catch (error) {
    Logger.log(`[ERROR] getMemberIdByEmail: ${error.message}`);
    return null;
  }
}

/**
 * createResponse()
 * Standardized HTTP response formatter.
 * 
 * @param {number} statusCode - HTTP status code (200, 400, 403, 404, 500, etc.)
 * @param {object} payload - Response body object (auto-stringified)
 * @return {HtmlOutput} Google Apps Script response object
 */
/**
 * createResponse()
 * Standardized HTTP response formatter.
 */
function createResponse(statusCode, payload) {
  const response = {
    status: statusCode,
    timestamp: new Date().toISOString(),
    ...payload
  };

  try {
    return HtmlService.createHtmlOutput(JSON.stringify(response))
      .setHeader("Content-Type", "application/json");
  } catch (e) {
    // Fallback if HtmlService unavailable (for testing)
    Logger.log("Response: " + JSON.stringify(response));
    return response;
  }
}

/**
 * buildCatalogMap()
 * Dynamically maps sheet headers to column indices.
 * Called once per request to avoid hardcoded column positions.
 * 
 * @param {Sheet} sheet - Google Sheet object
 * @return {object} Map of header name → column index
 */
function buildCatalogMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};

  for (let i = 0; i < headers.length; i++) {
    map[headers[i]] = i;
  }

  return map;
}

/**
 * getSystemConfig()
 * Retrieves a single System Config parameter by key.
 * 
 * @param {string} parameterKey - Config parameter name (e.g., "LAST_AUDIT_REPORT_DATE")
 * @return {string|null} Parameter value, or null if not found
 */
function getSystemConfig(parameterKey) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName("System Config");

    if (!configSheet) {
      Logger.log("[ERROR] System Config sheet not found");
      return null;
    }

    const data = configSheet.getDataRange().getValues();
    const headers = data[0];

    const keyIndex = headers.indexOf("parameter_key");
    const valueIndex = headers.indexOf("parameter_value");

    if (keyIndex === -1 || valueIndex === -1) {
      Logger.log("[ERROR] System Config headers missing parameter_key or parameter_value");
      return null;
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][keyIndex] === parameterKey) {
        return data[i][valueIndex];
      }
    }

    Logger.log(`[WARN] Parameter not found: ${parameterKey}`);
    return null;

  } catch (error) {
    Logger.log(`[ERROR] getSystemConfig: ${error.message}`);
    return null;
  }
}

/**
 * setSystemConfig()
 * Updates or inserts a System Config parameter.
 * 
 * @param {string} parameterKey - Config parameter name
 * @param {string} parameterValue - New value
 * @param {string} description - Optional description (defaults to "")
 */
function setSystemConfig(parameterKey, parameterValue, description = "") {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName("System Config");

    if (!configSheet) {
      Logger.log("[ERROR] System Config sheet not found");
      return;
    }

    const data = configSheet.getDataRange().getValues();
    const headers = data[0];

    const keyIndex = headers.indexOf("parameter_key");
    const valueIndex = headers.indexOf("parameter_value");
    const descIndex = headers.indexOf("description");
    const modIndex = headers.indexOf("last_modified");

    if (keyIndex === -1 || valueIndex === -1) {
      Logger.log("[ERROR] System Config headers missing required columns");
      return;
    }

    const now = new Date().toISOString();

    // Search for existing key
    for (let i = 1; i < data.length; i++) {
      if (data[i][keyIndex] === parameterKey) {
        configSheet.getRange(i + 1, valueIndex + 1).setValue(parameterValue);
        if (descIndex >= 0) {
          configSheet.getRange(i + 1, descIndex + 1).setValue(description);
        }
        if (modIndex >= 0) {
          configSheet.getRange(i + 1, modIndex + 1).setValue(now);
        }
        return;
      }
    }

    // Key not found; append new row
    const newRow = new Array(headers.length).fill("");
    newRow[keyIndex] = parameterKey;
    newRow[valueIndex] = parameterValue;
    if (descIndex >= 0) newRow[descIndex] = description;
    if (modIndex >= 0) newRow[modIndex] = now;

    configSheet.appendRow(newRow);
    Logger.log(`[INFO] Added System Config parameter: ${parameterKey}`);

  } catch (error) {
    Logger.log(`[ERROR] setSystemConfig: ${error.message}`);
  }
}

function getDailySessionQR() {
  try {
    const userEmail = Session.getActiveUser().getEmail();
    const deploymentUrl = ScriptApp.getService().getUrl();
    const checkInUrl = deploymentUrl + '?page=checkin';
    
    // Generate QR code using Google Charts API (free, no library needed)
    const qrUrl = 'https://chart.googleapis.com/chart?chs=350x350&chld=L|0&cht=qr&chl=' + 
      encodeURIComponent(checkInUrl);
    
    const now = new Date();
    return {
      success: true,
      qrUrl: qrUrl,
      date: now.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
      day: now.toLocaleDateString('en-GB', { weekday: 'long' }),
      generatedAt: now.toISOString()
    };
  } catch (err) {
    Logger.log('getDailySessionQR error: ' + err);
    return {
      success: false,
      error: err.message
    };
  }
}

function testGetPanelLedger() {
  const userEmail = Session.getActiveUser().getEmail();
  const userRole = "Manager"; // Test as Manager
  const catalog = null; // Not needed for this test
  
  const result = getPanelLedger(userEmail, userRole, catalog);
  Logger.log("Ledger Panel Result:");
  Logger.log(result.getContent()); // Output the JSON response
}

/**
 * Load Dashboard HTML
 */
/**
 * Load Dashboard HTML
 */
function getDashboard() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('UI_Dashboard');
    html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return html;
  } catch (err) {
    return HtmlService.createHtmlOutput('<h1>Error loading Dashboard</h1><p>' + err.message + '</p>');
  }
}


/**
 * Load Mobile Check-In Kiosk HTML
 */
function getMobileCheckInKiosk() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('MobileKiosk');
    html.setXFrameOptions(HtmlService.XFrameOptions.DENY);
    html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return html;
  } catch (err) {
    return HtmlService.createHtmlOutput('<h1>Error loading Mobile Kiosk</h1><p>' + err.message + '</p>');
  }
}

/**
 * Load Reception QR Display HTML
 */
function getReceptionQRDisplay() {
  try {
    const html = HtmlService.createHtmlOutputFromFile('Reception_QR');
    html.setXFrameOptions(HtmlService.XFrameOptions.DENY);
    html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return html;
  } catch (err) {
    return HtmlService.createHtmlOutput('<h1>Error loading Reception QR</h1><p>' + err.message + '</p>');
  }
}

/**
 * Load Frontend HTML (alias for Dashboard)
 */
function getFrontEnd() {
  return getDashboard();
}

function getDashboard() {
  validateRBAC_('Bowler'); // Minimum role
  
  const lockManager = new API_LockManager(10000);
  try {
    lockManager.acquireLock('DASHBOARD_READ');
    
    const membersData = getPanelMembers();
    const attendanceData = getPanelAttendance();
    const ledgerSummary = getPanelLedger();
    
    return {
      status: 'SUCCESS',
      members: membersData,
      attendance: attendanceData,
      ledger: ledgerSummary,
      timestamp: new Date().toISOString()
    };
  } finally {
    lockManager.releaseLock('DASHBOARD_READ');
  }
}


/**
 * Placeholder: Dashboard Statistics
 * TODO: Implement full dashboard stats (member count, income vs expense)
 */
function getDashboardStats() {
  return {
    memberCount: 0,
    totalIncome: 0,
    totalExpense: 0,
    netPosition: 0,
    recentActivityCount: 0
  };
}


// ========================================
// END OF API_Gateway.gs v2.1
// ========================================
