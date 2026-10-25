/**
 * Checkin_Engine.gs - BLOCK 1 OF 2
 * 
 * Server-side logic for member check-in workflow.
 * Implements blocking rules, attendance recording, and integration with Members sheet.
 * 
 * Key Functions:
 * - processMobileCheckInGate(memberId, checkInDate)
 * - processManualCheckInGate(memberId, checkInDate)
 * - getMemberByIdentifier(identifier)
 * - recordAttendance(memberId, checkInDate, subscriptionStatus, productId, paymentStatus)
 * 
 * Flaws Fixed:
 * - Correct column indices for Members sheet
 * - Proper date comparisons (no timezone issues)
 * - PaymentStatus field corrected (idxAttPayStatus instead of idxPayStatus)
 * - Full integration with Ledger and Attendance sheets
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();
const MEMBERS_SHEET = SS.getSheetByName("Members");
const ATTENDANCE_SHEET = SS.getSheetByName("Attendance");
const LEDGER_SHEET = SS.getSheetByName("Ledger");
const PRODUCTTYPES_SHEET = SS.getSheetByName("ProductTypes");

// Members sheet column indices (1-based)
const IDX_MEMBER_ID = 1;           // Column A
const IDX_MEMBER_NAME = 2;         // Column B
const IDX_MEMBER_STATUS = 3;       // Column C (Active, Suspended, Terminated)
const IDX_LAST_PAID = 10;          // Column J
const IDX_NEXT_SUB_DUE = 11;       // Column K
const IDX_CURRENT_PRODUCT = 12;    // Column L

// Attendance sheet column indices (1-based)
const IDX_ATT_ID = 1;              // Column A
const IDX_ATT_CHECKIN_DATE = 2;    // Column B
const IDX_ATT_MEMBER_ID = 3;       // Column C
const IDX_ATT_SUB_STATUS = 4;      // Column D (subscription status at check-in)
const IDX_ATT_PRODUCT_ID = 5;      // Column E
const IDX_ATT_PAY_STATUS = 6;      // Column F (PAID/UNPAID) - CORRECTED VARIABLE NAME

// Ledger sheet column indices (1-based)
const IDX_LEDGER_ID = 1;
const IDX_LEDGER_TXNDATE = 2;
const IDX_LEDGER_TXNTYPE = 3;
const IDX_LEDGER_SOURCETAB = 4;
const IDX_LEDGER_SOURCETXNID = 5;
const IDX_LEDGER_MEMBERID = 6;
const IDX_LEDGER_TXNOTE = 7;
const IDX_LEDGER_SIGNED_AMOUNT = 8;
const IDX_LEDGER_PRODUCTID = 9;
const IDX_LEDGER_AUTH_STATUS = 10;
const IDX_LEDGER_CREATEDBY = 11;

// ============================================================================
// PUBLIC CHECK-IN FUNCTIONS
// ============================================================================

/**
 * processMobileCheckInGate(memberId, checkInDate)
 * 
 * Server-side handler for mobile kiosk check-in requests.
 * Applies all blocking and admission rules.
 * 
 * Returns object: { success: boolean, status: string, message: string, memberName?: string }
 * 
 * Statuses:
 * - "ADMITTED"         - Member can enter
 * - "BLOCKED_TERMINATED" - Account terminated
 * - "BLOCKED_DUPLICATE" - Already checked in today
 * - "UNPAID"           - Redirect to cashier
 * - "ERROR"            - Internal error
 */
function processMobileCheckInGate(memberId, checkInDate) {
  try {
    const result = performCheckInLogic(memberId, checkInDate);
    return result;
  } catch (error) {
    Logger.log("Error in processMobileCheckInGate: " + error.message);
    return {
      success: false,
      status: "ERROR",
      message: "Internal server error: " + error.message
    };
  }
}

/**
 * processManualCheckInGate(memberId, checkInDate)
 * 
 * Server-side handler for manual check-in (staff entry at desk).
 * Same logic as mobile, but may be called from different UI.
 */
function processManualCheckInGate(memberId, checkInDate) {
  try {
    const result = performCheckInLogic(memberId, checkInDate);
    return result;
  } catch (error) {
    Logger.log("Error in processManualCheckInGate: " + error.message);
    return {
      success: false,
      status: "ERROR",
      message: "Internal server error: " + error.message
    };
  }
}

// ============================================================================
// CORE CHECK-IN LOGIC
// ============================================================================

/**
 * performCheckInLogic(memberId, checkInDate)
 * 
 * Implements blocking and admission rules:
 * 1. Block if member status is "Terminated"
 * 2. Block if member already checked in today
 * 3. Admit if LastPaidDate equals today
 * 4. Admit if NextSubscriptionDueDate is in the future
 * 5. Redirect to cashier and record as "UNPAID" if NextSubscriptionDueDate is today or in the past
 * 
 * checkInDate should be a Date object or ISO string (YYYY-MM-DD).
 */
function performCheckInLogic(memberId, checkInDate) {
  // Normalize checkInDate to midnight UTC (compare only dates, not times)
  const checkInDateObj = normalizeDate(checkInDate);
  
  // Fetch member record
  const member = getMemberByIdentifier(memberId);
  if (!member) {
    return {
      success: false,
      status: "ERROR",
      message: "Member not found: " + memberId
    };
  }

  // Rule 1: Block if Terminated
  if (member.status && member.status.toUpperCase() === "TERMINATED") {
    return {
      success: false,
      status: "BLOCKED_TERMINATED",
      message: "This membership account has been terminated.",
      memberName: member.name
    };
  }

  // Rule 2: Block if already checked in today
  if (hasCheckedInToday(memberId, checkInDateObj)) {
    return {
      success: false,
      status: "BLOCKED_DUPLICATE",
      message: "Member has already checked in today.",
      memberName: member.name
    };
  }

  // Fetch subscription dates
  const lastPaidDate = member.lastPaidDate ? normalizeDate(member.lastPaidDate) : null;
  const nextSubDueDate = member.nextSubscriptionDueDate ? normalizeDate(member.nextSubscriptionDueDate) : null;
  const currentProduct = member.currentProduct || null;

  // Rule 3: Admit if LastPaidDate equals today
  if (lastPaidDate && datesEqual(lastPaidDate, checkInDateObj)) {
    recordAttendance(memberId, checkInDateObj, "PAID", currentProduct, "PAID");
    return {
      success: true,
      status: "ADMITTED",
      message: "Welcome! Payment confirmed for today.",
      memberName: member.name
    };
  }

  // Rule 4: Admit if NextSubscriptionDueDate is in the future
  if (nextSubDueDate && isAfter(nextSubDueDate, checkInDateObj)) {
    recordAttendance(memberId, checkInDateObj, "PAID", currentProduct, "PAID");
    return {
      success: true,
      status: "ADMITTED",
      message: "Welcome! Subscription is current.",
      memberName: member.name
    };
  }

  // Rule 5: Redirect to cashier if NextSubscriptionDueDate is today or in the past
  recordAttendance(memberId, checkInDateObj, "UNPAID", currentProduct, "UNPAID");
  return {
    success: false,
    status: "UNPAID",
    message: "Payment required. Please see the cashier.",
    memberName: member.name
  };
}

// ============================================================================
// MEMBER LOOKUP
// ============================================================================

/**
 * getMemberByIdentifier(identifier)
 * 
 * Fetches a member record by MemberID.
 * identifier can be a string like "MBR001" or numeric ID.
 * 
 * Returns object with keys:
 * - id, name, status, lastPaidDate, nextSubscriptionDueDate, currentProduct
 * or null if not found
 */
function getMemberByIdentifier(identifier) {
  if (!identifier) return null;

  const data = MEMBERS_SHEET.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const memberId = row[IDX_MEMBER_ID - 1];
    
    // Compare as strings to handle both "MBR001" and partial matches
    if (String(memberId).trim().toUpperCase() === String(identifier).trim().toUpperCase()) {
      return {
        id: row[IDX_MEMBER_ID - 1],
        name: row[IDX_MEMBER_NAME - 1],
        status: row[IDX_MEMBER_STATUS - 1],
        lastPaidDate: row[IDX_LAST_PAID - 1],
        nextSubscriptionDueDate: row[IDX_NEXT_SUB_DUE - 1],
        currentProduct: row[IDX_CURRENT_PRODUCT - 1]
      };
    }
  }

  return null;
}

// ============================================================================
// ATTENDANCE RECORDING
// ============================================================================

/**
 * recordAttendance(memberId, checkInDate, subscriptionStatus, productId, paymentStatus)
 * 
 * Records an attendance entry in the Attendance sheet.
 * 
 * @param {string} memberId - Member ID (e.g., "MBR001")
 * @param {Date} checkInDate - Date of check-in (normalized to midnight UTC)
 * @param {string} subscriptionStatus - "PAID" or "UNPAID"
 * @param {string} productId - Product ID (e.g., "ST001")
 * @param {string} paymentStatus - "PAID" or "UNPAID"
 */
function recordAttendance(memberId, checkInDate, subscriptionStatus, productId, paymentStatus) {
  if (!ATTENDANCE_SHEET) {
    Logger.log("Attendance sheet not found");
    return false;
  }

  // Generate unique AttendanceID
  const attendanceId = "ATT" + Utilities.getUuid().substring(0, 8).toUpperCase();

  // Format checkInDate as YYYY-MM-DD string
  const checkInDateStr = Utilities.formatDate(checkInDate, "UTC", "yyyy-MM-dd");

  // Append new row to Attendance sheet
  const newRow = [
    attendanceId,
    checkInDateStr,
    memberId,
    subscriptionStatus,
    productId || "",
    paymentStatus
  ];

  ATTENDANCE_SHEET.appendRow(newRow);
  
  // Force flush to ensure data is written
  SpreadsheetApp.flush();

  Logger.log("Recorded attendance: " + attendanceId + " for member " + memberId);
  return true;
}

// ============================================================================
// HELPER FUNCTIONS - DATE UTILITIES
// ============================================================================

/**
 * normalizeDate(dateInput)
 * 
 * Converts a date input (Date object, string, or serial number) to a Date object
 * normalized to midnight UTC for consistent date-only comparisons.
 */
function normalizeDate(dateInput) {
  if (!dateInput) return null;

  let dateObj;

  if (dateInput instanceof Date) {
    dateObj = dateInput;
  } else if (typeof dateInput === "string") {
    // Parse ISO format (YYYY-MM-DD) or other standard formats
    dateObj = new Date(dateInput);
  } else if (typeof dateInput === "number") {
    // Google Sheets serial date (days since Dec 30, 1899)
    dateObj = new Date((dateInput - 25569) * 86400 * 1000);
  } else {
    return null;
  }

  // Return midnight UTC
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

/**
 * datesEqual(date1, date2)
 * 
 * Compares two normalized dates (date-only, ignoring time).
 */
function datesEqual(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getTime() === date2.getTime();
}

/**
 * isAfter(date1, date2)
 * 
 * Returns true if date1 is after date2 (both normalized to date-only).
 */
function isAfter(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getTime() > date2.getTime();
}
/**
 * isBefore(date1, date2)
 * 
 * Returns true if date1 is before date2 (both normalized to date-only).
 */
function isBefore(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getTime() < date2.getTime();
}

/**
 * isSameOrAfter(date1, date2)
 * 
 * Returns true if date1 is same as or after date2.
 */
function isSameOrAfter(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getTime() >= date2.getTime();
}

/**
 * isSameOrBefore(date1, date2)
 * 
 * Returns true if date1 is same as or before date2.
 */
function isSameOrBefore(date1, date2) {
  if (!date1 || !date2) return false;
  return date1.getTime() <= date2.getTime();
}

// ============================================================================
// HELPER FUNCTIONS - ATTENDANCE QUERIES
// ============================================================================

/**
 * hasCheckedInToday(memberId, checkInDate)
 * 
 * Checks if the member already has an attendance record for the given date.
 * Returns true if a matching record exists, false otherwise.
 */
function hasCheckedInToday(memberId, checkInDate) {
  if (!ATTENDANCE_SHEET) return false;

  const data = ATTENDANCE_SHEET.getDataRange().getValues();
  const checkInDateStr = Utilities.formatDate(checkInDate, "UTC", "yyyy-MM-dd");

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const attMemberId = row[IDX_ATT_MEMBER_ID - 1];
    const attCheckInDate = row[IDX_ATT_CHECKIN_DATE - 1];

    // Compare member ID and date
    if (String(attMemberId).trim() === String(memberId).trim()) {
      const attDateStr = Utilities.formatDate(new Date(attCheckInDate), "UTC", "yyyy-MM-dd");
      if (attDateStr === checkInDateStr) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// TEST & DEBUG FUNCTIONS
// ============================================================================

/**
 * testCheckInLogic()
 * 
 * Test function to verify check-in logic with sample data.
 * Run this via Apps Script editor to debug.
 */
function testCheckInLogic() {
  const testDate = new Date("2026-10-16");
  
  Logger.log("=== Testing Check-In Logic ===");
  Logger.log("Test Date: " + testDate);
  
  // Test with MBR001
  const result1 = processMobileCheckInGate("MBR001", testDate);
  Logger.log("MBR001 Result: " + JSON.stringify(result1));

  // Test with MBR999 (should not exist)
  const result2 = processMobileCheckInGate("MBR999", testDate);
  Logger.log("MBR999 Result: " + JSON.stringify(result2));
}

/**
 * testGetMemberByIdentifier()
 * 
 * Test the member lookup function.
 */
function testGetMemberByIdentifier() {
  Logger.log("=== Testing Member Lookup ===");
  
  const member = getMemberByIdentifier("MBR001");
  Logger.log("MBR001: " + JSON.stringify(member));
  
  const noMember = getMemberByIdentifier("MBR999");
  Logger.log("MBR999: " + JSON.stringify(noMember));
}

/**
 * testRecordAttendance()
 * 
 * Test recording an attendance entry.
 */
function testRecordAttendance() {
  Logger.log("=== Testing Attendance Recording ===");
  
  const testDate = new Date("2026-10-16");
  const success = recordAttendance("MBR001", testDate, "PAID", "ST001", "PAID");
  Logger.log("Record attendance result: " + success);
}

/**
 * testDateNormalization()
 * 
 * Test date normalization and comparison functions.
 */
function testDateNormalization() {
  Logger.log("=== Testing Date Normalization ===");
  
  const date1 = normalizeDate("2026-10-16");
  const date2 = normalizeDate(new Date("2026-10-16T10:30:00"));
  const date3 = normalizeDate("2026-10-17");
  
  Logger.log("Date 1: " + date1);
  Logger.log("Date 2: " + date2);
  Logger.log("Date 3: " + date3);
  
  Logger.log("date1 equals date2: " + datesEqual(date1, date2));
  Logger.log("date1 before date3: " + isBefore(date1, date3));
  Logger.log("date3 after date1: " + isAfter(date3, date1));
}
