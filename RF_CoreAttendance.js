/**
 * RF_CoreAttendance.js
 * Canonical attendance and settlement logic.
 * SOURCEID is the source identity; legacy MEMBERID is compatibility-only.
 */

function RF_getSourceIdFromRow(row) {
  return row.SOURCEID || row.sourceId || row.MEMBERID || row.memberId || row.SUPPLIERID || row.supplierId || row.ATTENDANCEID || row.attendanceId || '';
}

function RF_validateProductIdOverride(sourceId, overrideProductId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName('Members');
  const productSheet = ss.getSheetByName('ProductTypes');
  const ledgerSheet = ss.getSheetByName('Ledger');

  if (!membersSheet || !productSheet || !ledgerSheet) {
    return { success: false, allowed: false, reason: 'Missing required sheets' };
  }

  const membersData = membersSheet.getDataRange().getValues();
  const productData = productSheet.getDataRange().getValues();
  const ledgerData = ledgerSheet.getDataRange().getValues();

  let currentProductId = null;
  for (let i = 1; i < membersData.length; i++) {
    if (membersData[i][0] === sourceId) {
      currentProductId = membersData[i][11];
      break;
    }
  }

  if (!currentProductId) {
    return { success: false, allowed: false, reason: 'Source identity not found or no current product assigned.' };
  }

  if (overrideProductId === currentProductId) {
    return { success: true, allowed: true, reason: 'Same product; override allowed.' };
  }

  let coverageMonths = 1;
  for (let i = 1; i < productData.length; i++) {
    if (productData[i][0] === overrideProductId) {
      coverageMonths = Number(productData[i][5] || 1);
      break;
    }
  }

  let paidCount = 0;
  for (let i = 1; i < ledgerData.length; i++) {
    const row = ledgerData[i];
    const txnType = row[5] || row[2] || '';
    const sourceIdentity = RF_getSourceIdFromRow({
      SOURCEID: row[3],
      MEMBERID: row[5],
      SUPPLIERID: row[3],
      ATTENDANCEID: row[3]
    });
    const productId = row[6] || row[8] || '';
    const authStatus = row[10] || row[9] || '';

    if (txnType === 'RCP' && sourceIdentity === sourceId && productId === currentProductId && authStatus === 'APPROVED') {
      paidCount++;
    }
  }

  if (paidCount < coverageMonths) {
    return {
      success: false,
      allowed: false,
      reason: 'Cannot override product. Completed ' + paidCount + ' of ' + coverageMonths + ' required cycles for current product.'
    };
  }

  return {
    success: true,
    allowed: true,
    reason: 'Override permitted. Source has completed ' + paidCount + ' cycles.'
  };
}

function RF_settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userEmail = Session.getActiveUser().getEmail();
  const userRoleLevel = RF_getUserRole(userEmail);

  if (userRoleLevel < 2) {
    return { success: false, errorCode: 'RBAC_DENIED', message: 'Only Cashier or Manager can settle attendance.' };
  }

  if (!attendanceTransactionId || typeof attendanceTransactionId !== 'string') {
    return { success: false, errorCode: 'INVALID_PARAM', message: 'attendanceTransactionId must be a non-empty string.' };
  }

  if (typeof paymentAmount !== 'number' || paymentAmount <= 0) {
    return { success: false, errorCode: 'INVALID_AMOUNT', message: 'paymentAmount must be > 0.' };
  }

  const attendanceSheet = ss.getSheetByName('Attendance');
  const membersSheet = ss.getSheetByName('Members');
  const productsSheet = ss.getSheetByName('ProductTypes');
  const ledgerSheet = ss.getSheetByName('Ledger');

  if (!attendanceSheet || !membersSheet || !productsSheet || !ledgerSheet) {
    return { success: false, errorCode: 'MISSING_SHEET', message: 'One or more required sheets are missing.' };
  }

  const attendanceData = attendanceSheet.getDataRange().getValues();
  let rowIndex = -1;
  let row = null;

  for (let i = 1; i < attendanceData.length; i++) {
    if (attendanceData[i][0] === attendanceTransactionId) {
      rowIndex = i;
      row = attendanceData[i];
      break;
    }
  }

  if (!row) {
    return { success: false, errorCode: 'NOT_FOUND', message: 'Attendance record not found: ' + attendanceTransactionId };
  }

  if (row[7] === 'PAID') {
    return { success: false, errorCode: 'ALREADY_PAID', message: 'Attendance record already settled.' };
  }

  const sourceId = row[1];
  const settlementProductId = productIdOverride || row[2];

  if (productIdOverride) {
    const overrideCheck = RF_validateProductIdOverride(sourceId, productIdOverride);
    if (!overrideCheck.success) {
      return { success: false, errorCode: 'OVERRIDE_FAILED', message: overrideCheck.reason };
    }
  }

  const productData = productsSheet.getDataRange().getValues();
  let productPrice = 0;
  let coverageMonths = 1;

  for (let i = 1; i < productData.length; i++) {
    if (productData[i][0] === settlementProductId) {
      productPrice = Number(productData[i][3] || 0);
      coverageMonths = Number(productData[i][5] || 1);
      break;
    }
  }

  if (!productPrice) {
    return { success: false, errorCode: 'PRODUCT_NOT_FOUND', message: 'Settlement product price not found.' };
  }

  const now = new Date();
  const sourceTxnId = attendanceTransactionId;
  const sourceTab = 'Attendance';
  const txnHash = RF_generateTXNHASH(sourceTab, sourceTxnId, sourceId, userEmail, now, now, paymentAmount, settlementProductId, 'RCP');
  const ledgerId = RF_generateLedgerId();

  ledgerSheet.appendRow([
    ledgerId,
    sourceTab,
    sourceTxnId,
    sourceId,
    'MEMBER',
    'RCP',
    settlementProductId,
    now,
    now,
    paymentAmount,
    userEmail,
    txnHash,
    'Settlement of attendance',
    'PENDING'
  ]);

  attendanceSheet.getRange(rowIndex + 1, 8).setValue('PAID');
  attendanceSheet.getRange(rowIndex + 1, 9).setValue(ledgerId);
  attendanceSheet.getRange(rowIndex + 1, 11).setValue(txnHash);

  const membersData = membersSheet.getDataRange().getValues();
  let memberRowIndex = -1;
  for (let i = 1; i < membersData.length; i++) {
    if (membersData[i][0] === sourceId) {
      memberRowIndex = i;
      break;
    }
  }

  if (memberRowIndex !== -1) {
    const dueDate = new Date(now);
    dueDate.setMonth(dueDate.getMonth() + coverageMonths);

    membersSheet.getRange(memberRowIndex + 1, 12).setValue(settlementProductId);
    membersSheet.getRange(memberRowIndex + 1, 13).setValue(now);
    membersSheet.getRange(memberRowIndex + 1, 14).setValue(dueDate);
    membersSheet.getRange(memberRowIndex + 1, 17).setValue(true);
    membersSheet.getRange(memberRowIndex + 1, 18).setValue(txnHash);
  }

  return {
    success: true,
    ledgerId: ledgerId,
    message: 'Settlement completed: ' + attendanceTransactionId + ' → ' + ledgerId,
    amount: paymentAmount,
    productId: settlementProductId
  };
}

function RF_getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheet = ss.getSheetByName('Attendance');
  const membersSheet = ss.getSheetByName('Members');
  const productsSheet = ss.getSheetByName('ProductTypes');

  if (!attendanceSheet || !membersSheet || !productsSheet) {
    return [];
  }

  const attendanceData = attendanceSheet.getDataRange().getValues();
  const membersData = membersSheet.getDataRange().getValues();
  const productData = productsSheet.getDataRange().getValues();

  const productMap = {};
  for (let i = 1; i < productData.length; i++) {
    productMap[productData[i][0]] = Number(productData[i][3] || 0);
  }

  const membersMap = {};
  for (let i = 1; i < membersData.length; i++) {
    membersMap[membersData[i][0]] = {
      fullName: membersData[i][1],
      status: membersData[i][2],
      nextSubDue: membersData[i][13],
      active: membersData[i][16]
    };
  }

  const results = [];
  for (let i = 1; i < attendanceData.length; i++) {
    const row = attendanceData[i];
    if (!row || row.length < 11) {
      continue;
    }

    const transactionId = row[0];
    const sourceId = row[1];
    const productId = row[2];
    const sessionDate = row[3];
    const paymentStatus = row[7];

    if (paymentStatus === 'PAID') {
      continue;
    }

    if (filterProductId && productId !== filterProductId) {
      continue;
    }

    if (filterDate) {
      const targetDate = filterDate instanceof Date ? filterDate : new Date(filterDate);
      const currentDate = sessionDate instanceof Date ? sessionDate : new Date(sessionDate);
      if (currentDate.toDateString() !== targetDate.toDateString()) {
        continue;
      }
    }

    const member = membersMap[sourceId];
    if (!member) {
      continue;
    }

    let memberStatus = member.status;
    const isOverdue = member.nextSubDue && new Date(member.nextSubDue) < new Date();
    const isActive = member.active === true || member.active === 'TRUE';

    if (isOverdue && !isActive) {
      memberStatus = 'ADMITTED_OVERDUE';
      if (!includeOverdue) {
        continue;
      }
    }

    results.push({
      transactionId: transactionId,
      sourceId: sourceId,
      fullName: member.fullName,
      sessionDate: sessionDate,
      productId: productId,
      amountDue: productMap[productId] || 0,
      memberStatus: memberStatus,
      nextSubDue: member.nextSubDue,
      txnHash: row[10],
      paymentStatus: paymentStatus
    });
  }

  results.sort(function(a, b) {
    const dateA = a.sessionDate instanceof Date ? a.sessionDate : new Date(a.sessionDate);
    const dateB = b.sessionDate instanceof Date ? b.sessionDate : new Date(b.sessionDate);
    if (dateA.getTime() !== dateB.getTime()) {
      return dateA.getTime() - dateB.getTime();
    }
    return String(a.sourceId).localeCompare(String(b.sourceId));
  });

  return results;
}
