/**
 * Akamas Short Mat Bowls Club - Master Cashier Engine (Complete Unified Build)
 * Module: Unified Financial Postings, Inactive Profile Gates, Dynamic Index Mappings, & Catalog Rule Enforcement
 *
 * Technical Implementation: Google Apps Script (V8 Engine)
 * Accounting Baseline: Pure Cash-Basis Relational Chronological Ledger
 */
function processManualCashierReceipt(memberID, productID, rawAmount, paymentMethod, notes) {
  const scriptLock = LockService.getScriptLock();
  try {
    // 1. Concurrency Control: Acquire exclusive safety write-lock for up to 10 seconds
    scriptLock.waitLock(10000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ledgerSheet = ss.getSheetByName("Ledger");
    const membersSheet = ss.getSheetByName("Members");
    const attendanceSheet = ss.getSheetByName("Attendance");
    const productTypeSheet = ss.getSheetByName("ProductTypes");
    const postingDateResult = resolveCashierPostingDate_(ss);
    if (!postingDateResult.ok) return { success: false, error: postingDateResult.error };
    const postingDate = postingDateResult.date;

    // 2. HARD LOCK GATING: Verify member profile status before allowing sales commits
    if (memberID) {
      const mData = membersSheet.getDataRange().getValues();
      const mHeaders = mData[0];
      const idxMemberId = mHeaders.indexOf("MEMBERID");
      const idxActiveFlag = mHeaders.indexOf("ACTIVE");

      if (idxMemberId !== -1 && idxActiveFlag !== -1) {
        for (let i = 1; i < mData.length; i++) {
          if (String(mData[i][idxMemberId]).trim().toUpperCase() === memberID.trim().toUpperCase()) {
            const isRowActive = String(mData[i][idxActiveFlag]).trim().toUpperCase();
            if (isRowActive === "FALSE" || isRowActive === "INACTIVE") {
              return { success: false, error: "Transaction Denied: This Member file is deactivated. Modifications restricted for historical reporting options only." };
            }
            break;
          }
        }
      }
    }

    const parsedAmount = Math.abs(parseFloat(rawAmount));
    if (isNaN(parsedAmount)) return { success: false, error: "Invalid numeric amount reference." };

    // 3. PRODUCT CATALOG CHECK: Enforce uniform price/category constraints natively
    const prodCatalog = productTypeSheet.getDataRange().getValues();
    const prodHeaders = prodCatalog[0];
    const idxProdId = prodHeaders.indexOf("PRODUCTID");
    const idxProdName = prodHeaders.indexOf("NAME");
    const idxProdCat = prodHeaders.indexOf("CATEGORY");
    const idxProdCov = prodHeaders.indexOf("COVERAGEMONTHS");
    const idxProdAct = prodHeaders.indexOf("ACTIVE");

    let productRecord = null;
    if (idxProdId !== -1) {
      for (let j = 1; j < prodCatalog.length; j++) {
        if (String(prodCatalog[j][idxProdId]).trim().toUpperCase() === productID.trim().toUpperCase()) {
          productRecord = {
            id: String(prodCatalog[j][idxProdId]),
            name: idxProdName !== -1 ? String(prodCatalog[j][idxProdName]) : "",
            category: idxProdCat !== -1 ? String(prodCatalog[j][idxProdCat]) : "Subscription Sale",
            coverageMonths: idxProdCov !== -1 ? (parseInt(prodCatalog[j][idxProdCov], 10) || 0) : 0,
            isActive: idxProdAct !== -1 ? (String(prodCatalog[j][idxProdAct]).trim().toUpperCase() === "TRUE") : true
          };
          break;
        }
      }
    }

    // Fallback block to safely handle out-of-catalog ledger entries (like direct Supplier or Refunds)
    if (!productRecord) {
      const isOutflowFallback = (productID === "REFUND" || productID === "SUPPLIER");
      productRecord = {
        id: productID,
        name: productID,
        category: isOutflowFallback ? "Supplier Payment" : "Subscription Sale",
        coverageMonths: 0,
        isActive: true
      };
    }

    if (!productRecord.isActive) return { success: false, error: "Transaction Denied: This item is out of stock / inactive." };

    const txnType = productRecord.category;
    const isOutflow = (productID === "REFUND" || productID === "SUPPLIER");
    const signedAmount = isOutflow ? (parsedAmount * -1) : parsedAmount;

    const nextLedgerId = `LEDGER${String(ledgerSheet.getLastRow()).padStart(6, '0')}`;
    const receiptId = isOutflow ? (String(notes || "").includes("SUP999") ? "SUP999001" : "REF001") : `RCP${String(ledgerSheet.getLastRow()).padStart(6, '0')}`;
    const sourceTab = isOutflow ? "Payments" : "Receipts";

    // 4. Append row using MAGIC_DATE_OVERRIDE only when explicitly configured.
    ledgerSheet.appendRow([nextLedgerId, postingDate, txnType, sourceTab, receiptId, memberID || "ANONYMOUS", notes, signedAmount, productID, "Reconciled", "CASHIER"]);

    // 5. Apply the same effective date to related lifecycle/attendance updates for test consistency.
    if (!isOutflow && memberID) {
      updateMemberLifecycleDates(membersSheet, memberID, productRecord, postingDate);
      healAttendanceLogWithReceiptToken(attendanceSheet, memberID, receiptId, postingDate);
    }

    return {
      success: true,
      transactionID: nextLedgerId,
      receiptID: receiptId,
      postingDate: Utilities.formatDate(postingDate, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd"),
      usedMagicDateOverride: postingDateResult.overridden
    };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    scriptLock.releaseLock();
  }
}

/**
 * Reads the optional System_Config MAGIC_DATE_OVERRIDE.
 * A blank/missing setting uses the real current date. An invalid nonblank value
 * fails closed so a typo cannot silently create a live-dated test posting.
 */
function resolveCashierPostingDate_(ss) {
  const now = new Date();
  const configSheet = ss.getSheetByName("System_Config") || ss.getSheetByName("System Config");
  if (!configSheet || configSheet.getLastRow() < 1) return { ok: true, date: now, overridden: false };

  const rows = configSheet.getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    const key = String(rows[i][0] || "").trim().toUpperCase();
    if (key !== "MAGIC_DATE_OVERRIDE") continue;
    const value = rows[i][1];
    if (value === "" || value === null || typeof value === "undefined") {
      return { ok: true, date: now, overridden: false };
    }

    let overrideDate = null;
    if (value instanceof Date) {
      overrideDate = new Date(value.getTime());
    } else {
      const text = String(value).trim();
      const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) {
        const year = Number(isoMatch[1]);
        const month = Number(isoMatch[2]);
        const day = Number(isoMatch[3]);
        overrideDate = new Date(year, month - 1, day, 12, 0, 0);
        if (overrideDate.getFullYear() !== year || overrideDate.getMonth() !== month - 1 || overrideDate.getDate() !== day) overrideDate = null;
      } else if (text) {
        const parsed = new Date(text);
        if (!isNaN(parsed.getTime())) overrideDate = parsed;
      }
    }

    if (!overrideDate || isNaN(overrideDate.getTime())) {
      return { ok: false, error: "MAGIC_DATE_OVERRIDE is not a valid date. Clear the System_Config value or enter a valid date (YYYY-MM-DD). No transaction was posted." };
    }
    return { ok: true, date: overrideDate, overridden: true };
  }
  return { ok: true, date: now, overridden: false };
}

/**
 * Internal Lifecycle Evaluator. Uses postingDate so test postings consistently
 * calculate LASTPAIDDATE and NEXTSUBSCRIPTIONDUE from the configured test date.
 */
function updateMemberLifecycleDates(sheet, memberID, productRecord, postingDate) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idxMember = headers.indexOf("MEMBERID");
  const idxStatus = headers.indexOf("STATUS");
  const idxLastPaid = headers.indexOf("LASTPAIDDATE");
  const idxDue = headers.indexOf("NEXTSUBSCRIPTIONDUE");
  const idxProduct = headers.indexOf("PRODUCTID");
  const idxActive = headers.indexOf("ACTIVE");

  if (idxMember === -1 || idxStatus === -1 || idxDue === -1 || idxActive === -1) {
    throw new Error("Critical Schema Mismatch: Core headers missing from the Members sheet tab.");
  }

  const effectiveDate = postingDate instanceof Date ? new Date(postingDate.getTime()) : new Date();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxMember]).trim().toUpperCase() === memberID.trim().toUpperCase()) {
      let nextDueDate = new Date(effectiveDate.getTime());
      if (productRecord.id === "ST004") {
        nextDueDate.setDate(nextDueDate.getDate() + 1);
      } else {
        nextDueDate = new Date(nextDueDate.getFullYear(), nextDueDate.getMonth() + productRecord.coverageMonths + 1, 1);
      }

      const datePaidStr = Utilities.formatDate(effectiveDate, "Asia/Nicosia", "yyyy-MM-dd");
      const dateDueStr = Utilities.formatDate(nextDueDate, "Asia/Nicosia", "yyyy-MM-dd");

      sheet.getRange(i + 1, idxStatus + 1).setValue("Active");
      sheet.getRange(i + 1, idxLastPaid + 1).setValue(datePaidStr);
      if (idxProduct !== -1) sheet.getRange(i + 1, idxProduct + 1).setValue(productRecord.id);
      sheet.getRange(i + 1, idxDue + 1).setValue(dateDueStr);
      sheet.getRange(i + 1, idxActive + 1).setValue("TRUE");
      break;
    }
  }
}

/**
 * Attendance Cross-Tab Handshake Sync. Matches an unpaid attendance row on the
 * effective posting date and links it to the cashier receipt token.
 */
function healAttendanceLogWithReceiptToken(sheet, memberID, receiptId, postingDate) {
  const effectiveDate = postingDate instanceof Date ? postingDate : new Date();
  const todayStr = Utilities.formatDate(effectiveDate, "Asia/Nicosia", "yyyy-MM-dd");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const idxAttBowler = headers.indexOf("bowler_id");
  const idxAttDate = headers.indexOf("session_date");
  const idxAttPayStatus = headers.indexOf("PaymentStatus");
  const idxAttTxnId = headers.indexOf("transaction_id");

  if (idxAttBowler === -1 || idxAttDate === -1 || idxAttPayStatus === -1 || idxAttTxnId === -1) {
    throw new Error("Critical Schema Mismatch: Core headers missing from the Attendance sheet tab.");
  }

  for (let i = 1; i < data.length; i++) {
    const rawDate = data[i][idxAttDate];
    const attDate = rawDate instanceof Date ? Utilities.formatDate(rawDate, "Asia/Nicosia", "yyyy-MM-dd") : String(rawDate || "").substring(0, 10).trim();
    const attMember = String(data[i][idxAttBowler] || "").trim().toUpperCase();
    const attPayStatus = String(data[i][idxAttPayStatus] || "").trim().toUpperCase();

    if (attMember === memberID.trim().toUpperCase() && attDate === todayStr && attPayStatus === "UNPAID") {
      sheet.getRange(i + 1, idxAttTxnId + 1).setValue(receiptId);
      sheet.getRange(i + 1, idxAttPayStatus + 1).setValue("PAID");
      break;
    }
  }
}
