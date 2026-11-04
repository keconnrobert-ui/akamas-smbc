/** Read-only bowler lookup adapter for the demonstration kiosk. */
function lookupDemoBowler(identifier, sessionDate) {
  const query = String(identifier || '').trim();
  if (!query) return { ok: false, code: 'REQUIRED', message: 'Enter your bowler ID or contact details.', data: null };
  if (query.length > 100) return { ok: false, code: 'TOO_LONG', message: 'Please shorten the search value.', data: null };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Bowlers') || ss.getSheetByName('Members');
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, code: 'NO_BOWLER_DATA', message: 'Bowler records are not available.', data: null };

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const columns = {};
  headers.forEach(function(name, index) { if (name) columns[name] = index; });
  const column = function(names) {
    for (let i = 0; i < names.length; i++) {
      const key = String(names[i]).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (columns[key] !== undefined) return columns[key];
    }
    return -1;
  };
  const idCol = column(['BOWLERID', 'MEMBERID']);
  const nameCol = column(['FULLNAME', 'NAME']);
  const phoneCol = column(['TELEPHONE', 'PHONE', 'MOBILE']);
  const emailCol = column(['EMAIL']);
  const statusCol = column(['STATUS']);
  const activeCol = column(['ACTIVE', 'ACTIVEFLAG']);
  const productCol = column(['PRODUCTID', 'CURRENTPRODUCT']);
  const dueCol = column(['NEXTSUBSCRIPTIONDUE', 'NEXTSUBSCRIPTIONDUEDATE', 'NEXTPAYMENTDUE']);
  if (idCol < 0 && nameCol < 0 && phoneCol < 0 && emailCol < 0) {
    return { ok: false, code: 'SCHEMA_UNRECOGNIZED', message: 'Could not identify bowler search fields in the current sheet.', data: null };
  }

  const normalized = query.toLowerCase();
  const digits = query.replace(/\D/g, '');
  const matches = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = idCol < 0 ? '' : String(row[idCol] || '').trim();
    const name = nameCol < 0 ? '' : String(row[nameCol] || '').trim();
    const phone = phoneCol < 0 ? '' : String(row[phoneCol] || '').trim();
    const email = emailCol < 0 ? '' : String(row[emailCol] || '').trim();
    const activeValue = activeCol < 0 ? '' : String(row[activeCol] || '').trim().toUpperCase();
    const statusValue = statusCol < 0 ? '' : String(row[statusCol] || '').trim().toUpperCase();
    if (activeValue && !['TRUE', 'YES', 'ACTIVE'].includes(activeValue)) continue;
    if (statusValue === 'INACTIVE' || statusValue === 'TERMINATED' || statusValue === 'SUSPENDED') continue;

    const idExact = id && id.toLowerCase() === normalized;
    const contactExact = (email && email.toLowerCase() === normalized) || (phone && phone.replace(/\D/g, '') === digits && digits.length >= 5);
    const partial = (name && name.toLowerCase().includes(normalized)) || (email && email.toLowerCase().includes(normalized)) || (phone && digits.length >= 5 && phone.replace(/\D/g, '').includes(digits));
    if (idExact || contactExact || partial) matches.push({ row: row, id: id, name: name, exact: idExact || contactExact });
  }

  matches.sort(function(a, b) { return Number(b.exact) - Number(a.exact); });
  if (!matches.length) return { ok: true, code: 'NOT_FOUND', message: 'No active bowler matched those details. Please check the entry or see the cashier.', data: { found: false } };
  if (matches.length > 1 && !matches[0].exact) {
    return { ok: true, code: 'AMBIGUOUS', message: 'Several bowlers match. Please enter a more specific ID, telephone number or email.', data: { found: false, matches: matches.slice(0, 5).map(function(item) { return { id: item.id, name: item.name }; }) } };
  }

  const match = matches[0];
  const productId = productCol < 0 ? '' : String(match.row[productCol] || '').trim();
  const productName = lookupDemoProductName_(ss, productId);
  const dueValue = dueCol < 0 ? '' : match.row[dueCol];
  const timezone = Session.getScriptTimeZone();
  const todayText = /^\d{4}-\d{2}-\d{2}$/.test(String(sessionDate || '')) ? String(sessionDate) : Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  let dueText = '';
  if (dueValue instanceof Date && !isNaN(dueValue.getTime())) dueText = Utilities.formatDate(dueValue, timezone, 'yyyy-MM-dd');
  else if (dueValue) {
    const parsed = new Date(dueValue);
    if (!isNaN(parsed.getTime())) dueText = Utilities.formatDate(parsed, timezone, 'yyyy-MM-dd');
  }

  let planStatus = 'CHECK_REQUIRED';
  if (/PAY\s*2\s*PLAY|PAY2PLAY/i.test(productId + ' ' + productName)) planStatus = 'PAY2PLAY';
  else if (dueText) planStatus = dueText < todayText ? 'OVERDUE' : 'CURRENT';

  const messages = {
    CURRENT: 'Your Mat Fee plan is current. Welcome to the session.',
    OVERDUE: 'Your Mat Fee plan is overdue. Please see the cashier before playing.',
    PAY2PLAY: 'Pay2Play payment is due for this session. Please see the cashier.',
    CHECK_REQUIRED: 'We found your record, but could not confirm the plan dates. Please see the cashier.'
  };
  return {
    ok: true,
    code: planStatus,
    message: messages[planStatus],
    data: { found: true, bowlerId: match.id, name: match.name || match.id, productId: productId, productName: productName, dueDate: dueText, planStatus: planStatus }
  };
}

function lookupDemoProductName_(ss, productId) {
  if (!productId) return '';
  const sheet = ss.getSheetByName('ProductTypes') || ss.getSheetByName('Products');
  if (!sheet || sheet.getLastRow() < 2) return '';
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(function(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const idIndex = headers.indexOf('PRODUCTID');
  const nameIndex = headers.indexOf('NAME');
  if (idIndex < 0 || nameIndex < 0) return '';
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][idIndex] || '').trim().toUpperCase() === productId.toUpperCase()) return String(rows[i][nameIndex] || '');
  }
  return '';
}
