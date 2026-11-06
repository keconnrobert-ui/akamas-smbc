/**
 * Posts an authorized cashier payment for an existing demo Attendance row.
 * The product and amount come from the row and ProductTypes; posting is idempotent
 * by Attendance ID. The ledger receipt is written before Attendance is marked PAID.
 */
function markDemoAttendancePaid(attendanceId) {
  const id = String(attendanceId || '').trim();
  if (!id) return { ok: false, code: 'ID_REQUIRED', message: 'Attendance ID is required.' };

  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return { ok: false, code: 'SIGN_IN_REQUIRED', message: 'Sign in with an authorized club Google account to post a payment.' };

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
  if (!authorized) return { ok: false, code: 'FORBIDDEN', message: 'Only an active Cashier or Manager can post this payment.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const attendance = ss.getSheetByName('Attendance');
    const ledger = ss.getSheetByName('Ledger');
    const products = ss.getSheetByName('ProductTypes');
    if (!attendance || attendance.getLastRow() < 2) return { ok: false, code: 'ATTENDANCE_NOT_FOUND', message: 'Attendance records were not found.' };
    if (!ledger || ledger.getLastColumn() < 1) return { ok: false, code: 'LEDGER_NOT_FOUND', message: 'Ledger sheet or headers were not found; no payment was posted.' };
    if (!products || products.getLastRow() < 2) return { ok: false, code: 'PRODUCTS_NOT_FOUND', message: 'ProductTypes records were not found; no payment was posted.' };

    const attendanceValues = attendance.getDataRange().getValues();
    const attendanceHeaders = attendanceValues[0].map(norm);
    const findAttendanceColumn = function(aliases) {
      for (let i = 0; i < aliases.length; i++) {
        const index = attendanceHeaders.indexOf(norm(aliases[i]));
        if (index >= 0) return index;
      }
      return -1;
    };
    const attendanceIdCol = findAttendanceColumn(['TRANSACTION_ID', 'ATTENDANCEID', 'ATTENDANCE_ID', 'ATTID']);
    const bowlerCol = findAttendanceColumn(['BOWLER_ID', 'BOWLERID', 'MEMBERID']);
    const productCol = findAttendanceColumn(['PRODUCT_ID', 'PRODUCTID']);
    const statusCol = findAttendanceColumn(['PAYMENTSTATUS', 'PAYMENT_STATUS', 'CHECKINSTATUS']);
    const ledgerLinkCol = findAttendanceColumn(['LEDGERID', 'LEDGER_ID']);
    if (attendanceIdCol < 0 || bowlerCol < 0 || productCol < 0 || statusCol < 0 || ledgerLinkCol < 0) {
      return { ok: false, code: 'ATTENDANCE_SCHEMA_MISMATCH', message: 'Attendance needs attendance ID, bowler ID, product ID, payment status, and ledger ID columns; no payment was posted.' };
    }

    let attendanceRowIndex = -1;
    for (let i = 1; i < attendanceValues.length; i++) {
      if (String(attendanceValues[i][attendanceIdCol] || '').trim().toUpperCase() === id.toUpperCase()) {
        attendanceRowIndex = i;
        break;
      }
    }
    if (attendanceRowIndex < 0) return { ok: false, code: 'ATTENDANCE_NOT_FOUND', message: 'No attendance record matches that ID.' };

    const attendanceRow = attendanceValues[attendanceRowIndex];
    const existingStatus = String(attendanceRow[statusCol] || '').trim().toUpperCase();
    const existingLedgerId = String(attendanceRow[ledgerLinkCol] || '').trim();
    if (existingStatus === 'PAID' && existingLedgerId) {
      return { ok: true, code: 'ALREADY_PAID', message: 'This attendance record is already paid and linked to a ledger receipt.', data: { attendanceId: id, paymentStatus: 'PAID', ledgerId: existingLedgerId } };
    }
    if (existingStatus !== 'UNPAID' && existingStatus !== 'PAID') {
      return { ok: false, code: 'INVALID_STATUS', message: 'Only UNPAID attendance records can be settled.' };
    }

    const bowlerId = String(attendanceRow[bowlerCol] || '').trim();
    const productId = String(attendanceRow[productCol] || '').trim();
    if (!bowlerId || !productId) return { ok: false, code: 'ATTENDANCE_DATA_MISSING', message: 'Attendance is missing bowler or product information; no payment was posted.' };

    const productValues = products.getDataRange().getValues();
    const productHeaders = productValues[0].map(norm);
    const productIdCol = productHeaders.indexOf('PRODUCTID');
    const priceCol = productHeaders.indexOf('PRICE') >= 0 ? productHeaders.indexOf('PRICE') : productHeaders.indexOf('SHELFPRICE');
    const activeColProduct = productHeaders.indexOf('ACTIVE');
    if (productIdCol < 0 || priceCol < 0) return { ok: false, code: 'PRODUCT_SCHEMA_MISMATCH', message: 'ProductTypes needs PRODUCTID and PRICE (or SHELFPRICE); no payment was posted.' };

    let amount = null;
    for (let i = 1; i < productValues.length; i++) {
      if (String(productValues[i][productIdCol] || '').trim().toUpperCase() !== productId.toUpperCase()) continue;
      if (activeColProduct >= 0 && !['TRUE', 'YES', 'ACTIVE', '1'].includes(String(productValues[i][activeColProduct] || '').trim().toUpperCase())) {
        return { ok: false, code: 'PRODUCT_INACTIVE', message: 'The attendance product is inactive; no payment was posted.' };
      }
      amount = Number(productValues[i][priceCol]);
      break;
    }
    if (amount === null || !isFinite(amount) || amount <= 0) return { ok: false, code: 'PRODUCT_PRICE_INVALID', message: 'A valid positive price for the attendance product was not found; no payment was posted.' };

    const ledgerValues = ledger.getDataRange().getValues();
    const ledgerHeaders = ledgerValues[0].map(norm);
    const findLedgerColumn = function(aliases) {
      for (let i = 0; i < aliases.length; i++) {
        const index = ledgerHeaders.indexOf(norm(aliases[i]));
        if (index >= 0) return index;
      }
      return -1;
    };
    const ledgerIdCol = findLedgerColumn(['LEDGERID']);
    const sourceTabCol = findLedgerColumn(['SOURCETAB']);
    const sourceTxnCol = findLedgerColumn(['SOURCETXNID']);
    const sourceIdCol = findLedgerColumn(['SOURCEID', 'MEMBERID']);
    const roleColLedger = findLedgerColumn(['SOURCEROLE', 'PARTYROLE']);
    const typeCol = findLedgerColumn(['TXNTYPE']);
    const ledgerProductCol = findLedgerColumn(['PRODUCTID']);
    const txnDateCol = findLedgerColumn(['TXNDATE', 'PAYMENTDATE']);
    const txnTimeCol = findLedgerColumn(['TXNTIME']);
    const amountCol = findLedgerColumn(['SIGNEDAMOUNT', 'AMOUNT']);
    const userEmailCol = findLedgerColumn(['USEREMAIL', 'CREATEDBY']);
    const hashCol = findLedgerColumn(['TXNHASH']);
    const noteCol = findLedgerColumn(['TXNNOTE', 'NOTE', 'DESCRIPTION']);
    const statusLedgerCol = findLedgerColumn(['AUTHORISATIONSTATUS', 'RECONCILIATIONSTATUS', 'STATUS']);
    if ([ledgerIdCol, sourceTabCol, sourceTxnCol, sourceIdCol, typeCol, ledgerProductCol, txnDateCol, amountCol, userEmailCol, hashCol].some(function(index) { return index < 0; })) {
      return { ok: false, code: 'LEDGER_SCHEMA_MISMATCH', message: 'Ledger is missing required posting columns; no payment was posted.' };
    }

    // Reuse a receipt for this Attendance ID if a prior attempt wrote the Ledger row
    // but stopped before updating Attendance, preventing a duplicate charge on retry.
    let receiptId = '';
    for (let i = 1; i < ledgerValues.length; i++) {
      if (String(ledgerValues[i][sourceTabCol] || '').trim().toUpperCase() === 'ATTENDANCE' &&
          String(ledgerValues[i][sourceTxnCol] || '').trim().toUpperCase() === id.toUpperCase()) {
        receiptId = String(ledgerValues[i][ledgerIdCol] || '').trim();
        break;
      }
    }

    let ledgerSequence = null;
    if (!receiptId) {
      ledgerSequence = RF_peekNextSequenceId('NEXTLEDGERID', 'LEDGER', 6);
      const now = new Date();
      const txnHash = RF_generateTXNHASH('Attendance', id, bowlerId, email, now, now, amount, productId, 'RCP');
      const ledgerRow = new Array(ledger.getLastColumn()).fill('');
      ledgerRow[ledgerIdCol] = ledgerSequence.id;
      ledgerRow[sourceTabCol] = 'Attendance';
      ledgerRow[sourceTxnCol] = id;
      ledgerRow[sourceIdCol] = bowlerId;
      if (roleColLedger >= 0) ledgerRow[roleColLedger] = 'MEMBER';
      ledgerRow[typeCol] = 'RCP';
      ledgerRow[ledgerProductCol] = productId;
      ledgerRow[txnDateCol] = now;
      if (txnTimeCol >= 0) ledgerRow[txnTimeCol] = now;
      ledgerRow[amountCol] = amount;
      ledgerRow[userEmailCol] = email;
      ledgerRow[hashCol] = txnHash;
      if (noteCol >= 0) ledgerRow[noteCol] = 'QR check-in payment settlement';
      if (statusLedgerCol >= 0) ledgerRow[statusLedgerCol] = 'PENDING';
      receiptId = String(ledgerRow[ledgerIdCol]);
      ledger.appendRow(ledgerRow);
      RF_commitSequenceId(ledgerSequence);
      SpreadsheetApp.flush();
    }

    attendance.getRange(attendanceRowIndex + 1, ledgerLinkCol + 1).setValue(receiptId);
    attendance.getRange(attendanceRowIndex + 1, statusCol + 1).setValue('PAID');
    SpreadsheetApp.flush();
    return { ok: true, code: 'PAYMENT_POSTED', message: 'Payment posted to Ledger and attendance marked PAID.', data: { attendanceId: id, paymentStatus: 'PAID', ledgerId: receiptId, productId: productId, amount: amount } };
  } catch (error) {
    return { ok: false, code: 'UPDATE_FAILED', message: 'Could not post payment: ' + error.message };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}
