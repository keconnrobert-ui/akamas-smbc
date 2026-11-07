/** Read-only membership maintenance preview for active cashiers and managers. */
function getDemoMembersForMaintenance() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return { ok: false, message: 'Sign in with an authorized club Google account to view members.' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const users = ss.getSheetByName('Users');
  if (!users || users.getLastRow() < 2) return { ok: false, message: 'Cashier or manager access could not be verified.' };
  const normalize = function(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const userRows = users.getDataRange().getValues();
  const userHeaders = userRows[0].map(normalize);
  const emailCol = userHeaders.indexOf('EMAIL');
  const roleCol = userHeaders.indexOf('ROLE');
  const activeCol = userHeaders.indexOf('ACTIVEFLAG') >= 0 ? userHeaders.indexOf('ACTIVEFLAG') : userHeaders.indexOf('ACTIVE');
  if (emailCol < 0 || roleCol < 0 || activeCol < 0) return { ok: false, message: 'Users needs EMAIL, ROLE and ACTIVE_FLAG columns.' };
  const allowed = userRows.slice(1).some(function(row) {
    return String(row[emailCol] || '').trim().toLowerCase() === email &&
      ['CASHIER', 'MANAGER'].includes(String(row[roleCol] || '').trim().toUpperCase()) &&
      ['TRUE', 'YES', 'ACTIVE', '1'].includes(String(row[activeCol] || '').trim().toUpperCase());
  });
  if (!allowed) return { ok: false, message: 'Only an active Cashier or Manager can view membership maintenance.' };

  const sheet = ss.getSheetByName('Members');
  if (!sheet) return { ok: false, message: 'Members sheet not found.' };
  const rows = sheet.getDataRange().getDisplayValues();
  const headers = rows[0].map(normalize);
  const fields = ['MEMBERID', 'FULLNAME', 'STATUS', 'TELEPHONE', 'WHATSAPP', 'EMAIL', 'ADDRESSLINE1', 'ADDRESSLINE2', 'CITY', 'POSTCODE', 'COUNTRY', 'PRODUCTID', 'LASTPAIDDATE', 'NEXTPAYMENTDUE', 'LASTATTENDANCEDATE', 'NOTES', 'ACTIVE'];
  const missing = fields.filter(function(field) { return headers.indexOf(field) < 0; });
  if (missing.length) return { ok: false, message: 'Members sheet is missing columns: ' + missing.join(', ') + '.' };
  const members = rows.slice(1).filter(function(row) { return String(row[headers.indexOf('MEMBERID')] || '').trim(); }).map(function(row) {
    const member = {};
    fields.forEach(function(field) { member[field] = String(row[headers.indexOf(field)] || ''); });
    return member;
  });
  return { ok: true, data: members, message: members.length ? 'Select a member to preview changes.' : 'No members found.' };
}

function getDemoMembershipPage() {
  return HtmlService.createHtmlOutputFromFile('Membership_Demo')
    .setTitle('Akamas SMBC — Membership Maintenance')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
