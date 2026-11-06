/**
 * Demo check-in posting. A current plan is recorded PAID; overdue, Pay2Play,
 * or unverified plans are recorded UNPAID for cashier follow-up.
 * Uses header names, locks the duplicate check/write, and never posts money.
 */
function processDemoBowlerCheckIn(identifier, sessionDate) {
  const result = lookupDemoBowler(identifier, sessionDate);
  if (!result || !result.ok || !result.data || !result.data.found) return result;

  const dateText = String(sessionDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return { ok: false, code: 'INVALID_SESSION_DATE', message: 'The session date is invalid.', data: null };
  }
  const planStatus = result.data.planStatus;
  const paymentStatus = planStatus === 'CURRENT' ? 'PAID' : 'UNPAID';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Attendance');
    if (!sheet || sheet.getLastColumn() < 1) {
      return { ok: false, code: 'ATTENDANCE_SHEET_MISSING', message: 'Attendance sheet or headers were not found.', data: null };
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const normalizedHeaders = headers.map(function(value) {
      return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    const findColumn = function(aliases) {
      for (let i = 0; i < aliases.length; i++) {
        const index = normalizedHeaders.indexOf(String(aliases[i]).toUpperCase().replace(/[^A-Z0-9]/g, ''));
        if (index >= 0) return index;
      }
      return -1;
    };
    const idCol = findColumn(['BOWLER_ID', 'BOWLERID', 'MEMBERID']);
    const dateCol = findColumn(['SESSION_DATE', 'SESSIONDATE', 'CHECKINDATE']);
    const paymentCol = findColumn(['PAYMENTSTATUS', 'PAYMENT_STATUS', 'CHECKINSTATUS']);
    if (idCol < 0 || dateCol < 0 || paymentCol < 0) {
      return { ok: false, code: 'ATTENDANCE_SCHEMA_MISMATCH', message: 'Attendance needs bowler ID, session date, and payment status headers.', data: { headers: headers } };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      for (let i = 0; i < existing.length; i++) {
        const row = existing[i];
        if (String(row[idCol] || '').trim().toUpperCase() !== String(result.data.bowlerId || '').trim().toUpperCase()) continue;
        let recordedDate = row[dateCol];
        if (recordedDate instanceof Date && !isNaN(recordedDate.getTime())) {
          recordedDate = Utilities.formatDate(recordedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        } else {
          recordedDate = String(recordedDate || '').slice(0, 10);
        }
        if (recordedDate === dateText) {
          const existingIdCol = findColumn(['TRANSACTION_ID', 'ATTENDANCEID', 'ATTENDANCE_ID', 'ATTID']);
          const attendanceId = existingIdCol >= 0 ? String(row[existingIdCol] || '') : '';
          const recordedStatus = String(row[paymentCol] || '').toUpperCase();
          return {
            ok: true, code: 'ALREADY_CHECKED_IN',
            message: 'This bowler already has an attendance record for this session.',
            data: Object.assign({}, result.data, { attendanceId: attendanceId, paymentStatus: recordedStatus, alreadyRecorded: true })
          };
        }
      }
    }

    const newRow = new Array(sheet.getLastColumn()).fill('');
    const setValue = function(aliases, value) {
      const index = findColumn(aliases);
      if (index >= 0) newRow[index] = value;
    };
    const attendanceSequence = RF_peekNextSequenceId('NEXTATTENDANCEID', 'ATT', 6);
    const attendanceId = attendanceSequence.id;
    const timestamp = new Date();
    setValue(['TRANSACTION_ID', 'ATTENDANCEID', 'ATTENDANCE_ID', 'ATTID'], attendanceId);
    setValue(['BOWLER_ID', 'BOWLERID', 'MEMBERID'], result.data.bowlerId);
    setValue(['PRODUCT_ID', 'PRODUCTID'], result.data.productId || '');
    setValue(['SESSION_DATE', 'SESSIONDATE', 'CHECKINDATE'], new Date(dateText + 'T00:00:00'));
    setValue(['SESSION_TYPE', 'SESSIONTYPE'], 'Demo session');
    setValue(['CHECK_IN_TIMESTAMP', 'CHECKINTIMESTAMP', 'CHECKINTIME'], timestamp);
    setValue(['PAYMENTSTATUS', 'PAYMENT_STATUS', 'CHECKINSTATUS'], paymentStatus);
    setValue(['ENTRY_METHOD', 'ENTRYMETHOD'], 'MobileKiosk');
    sheet.appendRow(newRow);
    RF_commitSequenceId(attendanceSequence);
    SpreadsheetApp.flush();

    return {
      ok: true,
      code: 'ATTENDANCE_RECORDED',
      message: paymentStatus === 'PAID' ? 'Check-in recorded as paid. Welcome to the session.' : 'Check-in recorded as unpaid. Please see the cashier.',
      data: Object.assign({}, result.data, { attendanceId: attendanceId, paymentStatus: paymentStatus, alreadyRecorded: false })
    };
  } catch (error) {
    return { ok: false, code: 'ATTENDANCE_WRITE_ERROR', message: 'Could not record attendance: ' + error.message, data: null };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}
