/**
 * Marks an existing demo Attendance row as PAID.
 * This function changes only the payment-status cell; it does not post to Ledger.
 * Access is limited to active Cashier or Manager users listed in Users.
 */
function markDemoAttendancePaid(attendanceId) {
  const id = String(attendanceId || '').trim();
  if (!id) return { ok: false, code: 'ID_REQUIRED', message: 'Attendance ID is required.' };

  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Sign in with an authorized club Google account to mark payments.' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const users = ss.getSheetByName('Users');
  if (!users || users.getLastRow() < 2) return { ok: false, code: 'ACCESS_LIST_UNAVAILABLE', message: 'Cashier access could not be verified.' };
  const userRows = users.getDataRange().getValues();
  const norm = function(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const userHeaders = userRows[0].map(norm);
  const emailCol = userHeaders.indexOf('EMAIL');
  const roleCol = userHeaders.indexOf('ROLE');
  const activeCol = userHeaders.indexOf('ACTIVEFLAG') >= 0 ? userHeaders.indexOf('ACTIVEFLAG') : userHeaders.indexOf('ACTIVE');
  if (emailCol < 0 || roleCol < 0) return { ok: false, code: 'ACCESS_SCHEMA_MISMATCH', message: 'Users sheet needs EMAIL and ROLE columns.' };
  let authorized = false;
  for (let i = 1; i < userRows.length; i++) {
    const rowEmail = String(userRows[i][emailCol] || '').trim().toLowerCase();
    const role = String(userRows[i][roleCol] || '').trim().toUpperCase();
    const active = activeCol < 0 ? true : ['TRUE', 'YES', 'ACTIVE', '1'].includes(String(userRows[i][activeCol] || '').trim().toUpperCase());
    if (rowEmail === email && active && (role === 'CASHIER' || role === 'MANAGER')) {
      authorized = true;
      break;
    }
  }
  if (!authorized) return { ok: false, code: 'FORBIDDEN', message: 'Only an active Cashier or Manager can mark an attendance record paid.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = ss.getSheetByName('Attendance');
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) {
      return { ok: false, code: 'ATTENDANCE_NOT_FOUND', message: 'Attendance records were not found.' };
    }
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(norm);
    const idCol = ['TRANSACTIONID', 'ATTENDANCEID', 'ATTID'].map(function(name) { return headers.indexOf(name); }).find(function(index) { return index >= 0; });
    const statusCol = ['PAYMENTSTATUS', 'CHECKINSTATUS'].map(function(name) { return headers.indexOf(name); }).find(function(index) { return index >= 0; });
    if (idCol === undefined || statusCol === undefined) {
      return { ok: false, code: 'ATTENDANCE_SCHEMA_MISMATCH', message: 'Attendance needs an attendance ID and payment-status column.' };
    }

    let sheetRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol] || '').trim().toUpperCase() === id.toUpperCase()) {
        sheetRow = i + 1;
        if (String(values[i][statusCol] || '').trim().toUpperCase() === 'PAID') {
          return { ok: true, code: 'ALREADY_PAID', message: 'This attendance record is already marked PAID.', data: { attendanceId: id, paymentStatus: 'PAID' } };
        }
        if (String(values[i][statusCol] || '').trim().toUpperCase() !== 'UNPAID') {
          return { ok: false, code: 'INVALID_STATUS', message: 'Only UNPAID attendance records can be marked PAID.' };
        }
        break;
      }
    }
    if (sheetRow < 0) return { ok: false, code: 'ATTENDANCE_NOT_FOUND', message: 'No attendance record matches that ID.' };

    sheet.getRange(sheetRow, statusCol + 1).setValue('PAID');
    SpreadsheetApp.flush();
    return { ok: true, code: 'MARKED_PAID', message: 'Attendance marked PAID. No ledger entry was created.', data: { attendanceId: id, paymentStatus: 'PAID' } };
  } catch (error) {
    return { ok: false, code: 'UPDATE_FAILED', message: 'Could not update attendance: ' + error.message };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}
