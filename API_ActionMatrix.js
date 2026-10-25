// TEST: If this runs, the file loads successfully
function testActionMatrixLoad() {
  Logger.log("✓ API_ActionMatrix.gs loaded successfully");
  Logger.log("Manager permissions: " + JSON.stringify(getRolePermissions('Manager')));
}


/**
 * API_ActionMatrix.gs
 * RBAC permission matrix: maps roles to allowed actions.
 * Compact, maintainable, and extensible.
 */
/**
 * Returns permissions for a given role.
 * @param {string} role - Role (Manager, Accountant, Cashier, Bowler)
 * @returns {object} Set of allowed actions with true value
 */
function getRolePermissions(role) {
  const permissionMatrix = {
    'Manager': {
      'VIEW_LEDGER': true,
      'RECORD_TRANSACTION': true,
      'RECONCILE_TRANSACTION': true,
      'VIEW_ALL_MEMBERS': true,
      'MANAGE_USERS': true,
      'VIEW_SYSTEM_CONFIG': true,
      'EDIT_SYSTEM_CONFIG': true,
      'GENERATE_AUDIT_REPORT': true,
      'VIEW_ATTENDANCE': true,
      'CHECK_IN_MEMBER': true,
      'VIEW_PRODUCTS': true,
      'EDIT_PRODUCTS': true
    },
    'Accountant': {
      'VIEW_LEDGER': true,
      'RECORD_TRANSACTION': true,
      'RECONCILE_TRANSACTION': true,
      'VIEW_ALL_MEMBERS': true,
      'GENERATE_AUDIT_REPORT': true,
      'VIEW_SYSTEM_CONFIG': true,
      'VIEW_ATTENDANCE': true,
      'VIEW_PRODUCTS': true
    },
    'Cashier': {
      'VIEW_LEDGER': true,
      'RECORD_TRANSACTION': true,
      'VIEW_MEMBERS_BASIC': true,
      'VIEW_ATTENDANCE': true,
      'CHECK_IN_MEMBER': true,
      'VIEW_PRODUCTS': true
    },
    'Bowler': {
      'VIEW_SELF_LEDGER': true,
      'VIEW_SELF_ATTENDANCE': true,
      'VIEW_PRODUCTS': true
    }
  };
  
  return permissionMatrix[role] || {};
}

/**
 * Checks if a user can perform a specific action.
 * @param {string} email - User email
 * @param {string} action - Action identifier (e.g., 'RECORD_TRANSACTION')
 * @returns {boolean} true if user is authorized
 */
function canUserPerformAction(email, action) {
  try {
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName('Users');
    
    if (!usersSheet) {
      return false;
    }
    
    const usersData = usersSheet.getRange('B:C').getValues();
    let userRole = 'Bowler';
    for (let i = 0; i < usersData.length; i++) {
      if (usersData[i][0] === email) {
        userRole = usersData[i][1];
        break;
      }
    }
    
    const permissions = getRolePermissions(userRole);
    return permissions[action] === true;
  } catch (e) {
    console.error('canUserPerformAction error: ' + e.message);
    return false;
  }
}

/**
 * Enforces action authorization; throws error if unauthorized.
 * @param {string} email - User email
 * @param {string} action - Action identifier
 * @throws {Error} if user lacks permission
 */
function enforceActionAuthorization(email, action) {
  if (!canUserPerformAction(email, action)) {
    throw new Error(`UNAUTHORIZED: User ${email} cannot perform ${action}`);
  }
}
