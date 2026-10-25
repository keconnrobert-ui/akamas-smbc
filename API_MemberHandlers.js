// API_MemberHandlers.gs
// Settlement function: Records single RCP entry, updates Attendance + Members atomically

function settleMemberAttendance(transactionId, overrideProductId, paymentMethod) {
  try {
    // RBAC: Cashier or Manager only
    const userRole = getUserRole(Session.getActiveUser().getEmail());
    if (!['Manager', 'Cashier'].includes(userRole)) {
      return { success: false, error: 'RBAC_DENIED', role: userRole };
    }

    // 1. Fetch Attendance record
    const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
    const attendanceData = attendanceSheet.getDataRange().getValues();
    const attRow = attendanceData.find(row => row[0] === transactionId); // TRANSACTION_ID is column A
    if (!attRow) {
      return { success: false, error: 'ATTENDANCE_NOT_FOUND', transactionId };
    }

    const bowlerId = attRow[1]; // BOWLER_ID (column B)
    const productId = attRow[2]; // PRODUCT_ID (column C)
    const sessionDate = attRow[3]; // SESSION_DATE (column D)
    const paymentStatus = attRow[7]; // PAYMENTSTATUS (column H)

    if (paymentStatus === 'PAID') {
      return { success: false, error: 'ALREADY_PAID', transactionId };
    }

    // 2. Fetch Members record
    const membersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    const membersData = membersSheet.getDataRange().getValues();
    const memberRow = membersData.find(row => row[0] === bowlerId); // MEMBERID is column A
    if (!memberRow) {
      return { success: false, error: 'MEMBER_NOT_FOUND', bowlerId };
    }

    const currentProductId = memberRow[11]; // PRODUCTID (column L)
    const settlementProductId = overrideProductId || currentProductId;

    // 3. Validate override if provided
    if (overrideProductId && overrideProductId !== currentProductId) {
      const overrideValid = validateProductIdOverride(bowlerId, overrideProductId);
      if (!overrideValid.allowed) {
        return { success: false, error: 'OVERRIDE_DENIED', reason: overrideValid.reason };
      }
    }

    // 4. Fetch ProductTypes for price
    const productsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductTypes');
    const productsData = productsSheet.getDataRange().getValues();
    const productRow = productsData.find(row => row[0] === settlementProductId); // PRODUCTID is column A
    if (!productRow) {
      return { success: false, error: 'PRODUCT_NOT_FOUND', productId: settlementProductId };
    }

    const price = productRow[3]; // PRICE (column D)
    const coverageMonths = productRow[5]; // COVERAGEMONTHS (column F)

    // 5. Generate TXNHASH
    const txnDate = new Date();
    const txnDateStr = Utilities.formatDate(txnDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const txnHash = generateTXNHASH(transactionId, txnDateStr, price, bowlerId, settlementProductId);

    // 6. Create RCP entry in Ledger
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
    const ledgerId = generateNextLedgerId('RCP'); // RCP000001, RCP000002, etc.
    const newLedgerRow = [
      ledgerId,           // LEDGERID (A)
      txnDateStr,         // TXNDATE (B)
      'RCP',              // TXNTYPE (C)
      'Attendance',       // SOURCETAB (D)
      transactionId,      // SOURCETXNID (E)
      bowlerId,           // MEMBERID (F)
      `Settlement: ${settlementProductId}`, // TXNOTE (G)
      price,              // SIGNEDAMOUNT (H) — positive for income
      settlementProductId,// PRODUCTID (I)
      'AUTHORISED',       // AUTHORISATIONSTATUS (J)
      Session.getActiveUser().getEmail(), // CREATEDBY (K)
      txnHash             // TXNHASH (L)
    ];
    ledgerSheet.appendRow(newLedgerRow);

    // 7. Update Attendance record
    const attRowIndex = attendanceData.indexOf(attRow) + 1; // +1 for sheet row (1-indexed)
    attendanceSheet.getRange(attRowIndex, 9).setValue(ledgerId); // LEDGERID (I)
    attendanceSheet.getRange(attRowIndex, 8).setValue('PAID'); // PAYMENTSTATUS (H)

    // 8. Update Members record
    const memberRowIndex = membersData.indexOf(memberRow) + 1;
    membersSheet.getRange(memberRowIndex, 13).setValue(txnDateStr); // LASTPAIDDATE (M)
    const nextDue = new Date(txnDate);
    nextDue.setMonth(nextDue.getMonth() + coverageMonths);
    membersSheet.getRange(memberRowIndex, 14).setValue(Utilities.formatDate(nextDue, Session.getScriptTimeZone(), 'yyyy-MM-dd')); // NEXTSUBSCRIPTIONDUE (N)
    membersSheet.getRange(memberRowIndex, 15).setValue(sessionDate); // LASTATTENDANCEDATE (O)
    membersSheet.getRange(memberRowIndex, 12).setValue(settlementProductId); // PRODUCTID (L)
    membersSheet.getRange(memberRowIndex, 18).setValue(txnHash); // TXNHASH (R)

    return {
      success: true,
      ledgerId,
      transactionId,
      bowlerId,
      amount: price,
      productId: settlementProductId,
      txnHash,
      nextDue: Utilities.formatDate(nextDue, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    };

  } catch (e) {
    Logger.log(`[settleMemberAttendance] ERROR: ${e.message}`);
    return { success: false, error: 'EXCEPTION', message: e.message };
  }
}

// END OF settleMemberAttendance()


// API_MemberHandlers.gs (continued)

function validateProductIdOverride(memberId, overrideProductId) {
  try {
    // Fetch current product from Members
    const membersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    const membersData = membersSheet.getDataRange().getValues();
    const memberRow = membersData.find(row => row[0] === memberId);
    if (!memberRow) {
      return { allowed: false, reason: 'MEMBER_NOT_FOUND' };
    }

    const currentProductId = memberRow[11]; // PRODUCTID (column L)

    // If override equals current, no guard needed
    if (overrideProductId === currentProductId) {
      return { allowed: true, iterationsRemaining: 999, reason: 'No override' };
    }

    // Fetch ProductTypes for duration
    const productsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductTypes');
    const productsData = productsSheet.getDataRange().getValues();
    const currentProductRow = productsData.find(row => row[0] === currentProductId);
    if (!currentProductRow) {
      return { allowed: false, reason: 'CURRENT_PRODUCT_NOT_IN_CATALOG' };
    }

    const coverageMonths = currentProductRow[5]; // COVERAGEMONTHS (column F)

    // Count paid transactions for this member on current product
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Ledger');
    const ledgerData = ledgerSheet.getDataRange().getValues();
    const paidCount = ledgerData.filter(row => 
      row[5] === memberId &&           // MEMBERID (F)
      row[8] === currentProductId &&   // PRODUCTID (I)
      row[2] === 'RCP' &&              // TXNTYPE (C) — only count income
      row[9] === 'AUTHORISED'          // AUTHORISATIONSTATUS (J)
    ).length;

    const iterationsRemaining = Math.max(0, coverageMonths - paidCount);

    if (iterationsRemaining > 0) {
      return { 
        allowed: true, 
        iterationsRemaining, 
        reason: `${iterationsRemaining} payment(s) remaining on ${currentProductId}` 
      };
    } else {
      return { 
        allowed: false, 
        iterationsRemaining: 0, 
        reason: `${currentProductId} plan expired after ${coverageMonths} payment(s). Renew first.` 
      };
    }

  } catch (e) {
    Logger.log(`[validateProductIdOverride] ERROR: ${e.message}`);
    return { allowed: false, reason: 'EXCEPTION', message: e.message };
  }
}

// END OF validateProductIdOverride()

// API_MemberHandlers.gs (continued)

function getUnpaidAttendanceList(sessionDate) {
  try {
    const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Attendance');
    const membersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Members');
    const productsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductTypes');

    const attendanceData = attendanceSheet.getDataRange().getValues();
    const membersData = membersSheet.getDataRange().getValues();
    const productsData = productsSheet.getDataRange().getValues();

    // Filter unpaid attendance for session date
    const unpaidRecords = attendanceData.filter(row => 
      row[3] === sessionDate &&        // SESSION_DATE (D)
      row[7] === 'UNPAID'              // PAYMENTSTATUS (H)
    );

    // Enrich with member info and product price
    const enriched = unpaidRecords.map(attRow => {
      const transactionId = attRow[0]; // TRANSACTION_ID (A)
      const bowlerId = attRow[1]; // BOWLER_ID (B)
      const productId = attRow[2]; // PRODUCT_ID (C)

      const memberRow = membersData.find(m => m[0] === bowlerId);
      const fullName = memberRow ? memberRow[1] : 'UNKNOWN'; // FULLNAME (B)
      const currentProductId = memberRow ? memberRow[11] : productId; // PRODUCTID (L)

      const productRow = productsData.find(p => p[0] === currentProductId);
      const price = productRow ? productRow[3] : 0; // PRICE (D)
      const baseCost = productRow ? productRow[12] : 0; // BASECOST (M)

      return {
        transactionId,
        bowlerId,
        fullName,
        sessionDate,
        currentProductId,
        amountDue: price,
        baseCost,
        margin: baseCost > 0 ? price - baseCost : null,
        overridable: true // UI can offer override
      };
    });

    // Sort by fullName
    enriched.sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { success: true, count: enriched.length, records: enriched };

  } catch (e) {
    Logger.log(`[getUnpaidAttendanceList] ERROR: ${e.message}`);
    return { success: false, error: 'EXCEPTION', message: e.message };
  }
}

// END OF getUnpaidAttendanceList()

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

function getUserRole(email) {
  const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  const usersData = usersSheet.getDataRange().getValues();
  const userRow = usersData.find(row => row[1] === email); // EMAIL (B)
  return userRow ? userRow[2] : 'Bowler'; // ROLE (C)
}

// END OF API_MemberHandlers.gs
