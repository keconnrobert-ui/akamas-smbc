// API_MemberHandlers.gs
// Settlement function: Records single RCP entry, updates Attendance + Members atomically

// API_MemberHandlers.gs (continued)

// API_MemberHandlers.gs (continued)

function generateTXNHASH(sourceTxnId, txnDate, amount, memberId, productId) {
  const input = `${sourceTxnId}|${txnDate}|${amount}|${memberId}|${productId}`;
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input)
    .reduce((str, chr) => str + ('0' + chr.toString(16)).slice(-2), '');
}

function generateNextLedgerId(prefix) {
  const systemConfigSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
  const configData = systemConfigSheet.getDataRange().getValues();
  
  const keyRow = configData.find(row => row[0] === `${prefix}_COUNTER`);
  if (!keyRow) {
    // Initialize if not exists
    systemConfigSheet.appendRow([`${prefix}_COUNTER`, '1', `Auto-increment for ${prefix}`, new Date()]);
    return `${prefix}000001`;
  }

  let counter = parseInt(keyRow[1]) || 0;
  counter++;
  const rowIndex = configData.indexOf(keyRow) + 1;
  systemConfigSheet.getRange(rowIndex, 2).setValue(counter);
  
  return `${prefix}${String(counter).padStart(6, '0')}`;
}

// Compatibility wrapper for legacy API_MemberHandlers.js calls.
function getUserRole(userEmail) {
  return RF_getUserRole(userEmail);
}

function settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride) {
  return RF_settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride);
}

function validateProductIdOverride(sourceId, overrideProductId) {
  return RF_validateProductIdOverride(sourceId, overrideProductId);
}

function getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue) {
  return RF_getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue);
}
// END OF API_MemberHandlers.gs
