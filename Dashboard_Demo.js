/** Read-only demo dashboard data. Handles the known legacy sheet/header names. */
function getDashboardDemoData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const warnings = [];
  const findSheet = function(names) {
    for (let i = 0; i < names.length; i++) {
      const sheet = ss.getSheetByName(names[i]);
      if (sheet) return sheet;
    }
    return null;
  };
  const readRows = function(sheet, aliases) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    const values = sheet.getDataRange().getValues();
    const keys = values[0].map(function(value) {
      return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    const index = {};
    keys.forEach(function(key, i) { if (key) index[key] = i; });
    const rowValue = function(row, names) {
      for (let i = 0; i < names.length; i++) {
        const column = index[String(names[i]).toUpperCase().replace(/[^A-Z0-9]/g, '')];
        if (column !== undefined) return row[column];
      }
      return '';
    };
    return values.slice(1).filter(function(row) {
      return row.some(function(value) { return value !== '' && value !== null; });
    }).map(function(row) {
      const record = {};
      Object.keys(aliases).forEach(function(field) {
        record[field] = rowValue(row, aliases[field]);
      });
      return record;
    });
  };
  const safeDate = function(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? null : date;
  };
  const memberSheet = findSheet(['Bowlers', 'Members']);
  const attendanceSheet = findSheet(['Attendance']);
  const ledgerSheet = findSheet(['Ledger']);
  if (!memberSheet) warnings.push('Could not find Bowlers or Members sheet.');
  if (!attendanceSheet) warnings.push('Could not find Attendance sheet.');
  if (!ledgerSheet) warnings.push('Could not find Ledger sheet.');

  const members = readRows(memberSheet, {
    id: ['BOWLERID', 'MEMBERID'], name: ['FULLNAME', 'NAME'], status: ['STATUS'], active: ['ACTIVE', 'ACTIVEFLAG'],
    product: ['PRODUCTID', 'CURRENTPRODUCT'], due: ['NEXTSUBSCRIPTIONDUE', 'NEXTSUBSCRIPTIONDUEDATE', 'NEXTPAYMENTDUE']
  });
  const attendance = readRows(attendanceSheet, {
    date: ['SESSIONDATE', 'SESSION_DATE', 'CHECKINDATE', 'CHECKINTIMESTAMP'], status: ['PAYMENTSTATUS', 'CHECKINSTATUS', 'CHECK_IN_STATUS']
  });
  const ledger = readRows(ledgerSheet, {
    id: ['LEDGERID'], date: ['TXNDATE', 'TXDATE'], type: ['TXNTYPE'], amount: ['SIGNEDAMOUNT', 'SIGNED_AMOUNT', 'AMOUNT'], product: ['PRODUCTID', 'CATEGORY']
  });

  const activeMembers = members.filter(function(member) {
    const active = String(member.active).toUpperCase();
    return active ? active === 'TRUE' || active === 'ACTIVE' || active === 'YES' : String(member.status).toUpperCase() !== 'INACTIVE';
  });
  const overdue = activeMembers.filter(function(member) {
    const due = safeDate(member.due);
    return due && due < today;
  }).length;
  const pay2play = activeMembers.filter(function(member) {
    return /PAY\s*2\s*PLAY|PAY2PLAY/i.test(String(member.product));
  }).length;
  const todayAttendance = attendance.filter(function(record) {
    const date = safeDate(record.date);
    return date && date.toDateString() === today.toDateString();
  }).length;
  let net = 0;
  ledger.forEach(function(record) {
    const amount = Number(record.amount);
    if (isFinite(amount)) net += amount;
  });
  const recent = ledger.slice(-5).reverse().map(function(record) {
    const date = safeDate(record.date);
    return {
      id: String(record.id || '—'),
      date: date ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd MMM yyyy') : '—',
      type: String(record.type || record.product || 'Transaction'),
      amount: Number(record.amount) || 0
    };
  });
  return {
    ok: true,
    data: { activeBowlers: activeMembers.length, overduePlans: overdue, pay2playPlans: pay2play, attendanceToday: todayAttendance, ledgerNet: net, recentLedger: recent, warnings: warnings },
    meta: { demoOnly: true, readOnly: true }
  };
}

/** Web-app route target for the read-only dashboard demo. */
function getDashboardDemo() {
  return HtmlService.createHtmlOutputFromFile('Dashboard_Demo')
    .setTitle('Akamas SMBC — Demo Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
