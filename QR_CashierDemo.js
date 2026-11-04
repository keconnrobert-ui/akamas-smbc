/** Read-only list for cashier follow-up. No attendance or ledger cells are changed. */
function getDemoUnpaidAttendance() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendance = ss.getSheetByName('Attendance');
  if (!attendance || attendance.getLastRow() < 2) return { ok: true, data: [], message: 'No attendance records found.' };

  const normalize = function(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const read = function(sheet) {
    if (!sheet || sheet.getLastRow() < 2) return { rows: [], columns: {} };
    const rows = sheet.getDataRange().getValues();
    const columns = {};
    rows[0].forEach(function(value, index) { const key = normalize(value); if (key) columns[key] = index; });
    return { rows: rows.slice(1), columns: columns };
  };
  const attendanceData = read(attendance);
  const c = attendanceData.columns;
  const find = function(names) { for (let i = 0; i < names.length; i++) if (c[normalize(names[i])] !== undefined) return c[normalize(names[i])]; return -1; };
  const idCol = find(['TRANSACTION_ID', 'ATTENDANCEID', 'ATTENDANCE_ID', 'ATTID']);
  const bowlerCol = find(['BOWLER_ID', 'BOWLERID', 'MEMBERID']);
  const productCol = find(['PRODUCT_ID', 'PRODUCTID']);
  const dateCol = find(['SESSION_DATE', 'SESSIONDATE', 'CHECKINDATE']);
  const statusCol = find(['PAYMENTSTATUS', 'PAYMENT_STATUS', 'CHECKINSTATUS']);
  if (bowlerCol < 0 || statusCol < 0) return { ok: false, code: 'ATTENDANCE_SCHEMA_MISMATCH', message: 'Attendance needs bowler ID and payment status headers.', data: null };

  const membersSheet = ss.getSheetByName('Bowlers') || ss.getSheetByName('Members');
  const memberData = read(membersSheet);
  const mc = memberData.columns;
  const memberIdCol = mc[normalize('BOWLERID')] !== undefined ? mc[normalize('BOWLERID')] : mc[normalize('MEMBERID')];
  const nameCol = mc[normalize('FULLNAME')] !== undefined ? mc[normalize('FULLNAME')] : mc[normalize('NAME')];
  const names = {};
  if (memberIdCol !== undefined && memberIdCol >= 0) {
    memberData.rows.forEach(function(row) { names[String(row[memberIdCol] || '').trim().toUpperCase()] = nameCol !== undefined && nameCol >= 0 ? String(row[nameCol] || '') : ''; });
  }
  const timezone = Session.getScriptTimeZone();
  const unpaid = [];
  attendanceData.rows.forEach(function(row) {
    if (String(row[statusCol] || '').trim().toUpperCase() !== 'UNPAID') return;
    const bowlerId = String(row[bowlerCol] || '').trim();
    const rawDate = dateCol >= 0 ? row[dateCol] : '';
    let date = '';
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) date = Utilities.formatDate(rawDate, timezone, 'dd MMM yyyy');
    else if (rawDate) date = String(rawDate).slice(0, 10);
    unpaid.push({
      attendanceId: idCol >= 0 ? String(row[idCol] || '') : '',
      bowlerId: bowlerId,
      bowlerName: names[bowlerId.toUpperCase()] || '',
      productId: productCol >= 0 ? String(row[productCol] || '') : '',
      sessionDate: date,
      paymentStatus: 'UNPAID'
    });
  });
  unpaid.reverse();
  return { ok: true, data: unpaid, message: unpaid.length ? 'Unpaid check-ins ready for cashier review.' : 'No unpaid attendees to settle.' };
}
