/**
 * Akamas Short Mat Bowls Club - Accounting Reports Engine (Part 1 of 2)
 * Module: Weekly Cash Book Statement, Rolling 7-Day Filter, and Itemised Line Detail Auditing
 * 
 * Technical Implementation: Google Apps Script (V8 Engine)
 * Accounting Model: Pure Cash-Basis Relational Chronological Ledger
 * Status: 1production Ready - Enhanced for Transaction Item Detail Sweeps
 */

/**
 * Calculates a rolling 7-day cash book summary and compiles an itemised transaction list.
 * Extracts individual entries for Pay2Play, Merchandise, and Donations dynamically.
 */
function generateWeeklyIncomeExpenditureReport(filterStartDateStr) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName("Ledger");
  if (!ledgerSheet) {
    return { success: false, error: "Database Error: Ledger tab sheet not found." };
  }

  // Define date parameters: default to rolling 7 days back from today if blank
  let startDate = new Date();
  if (filterStartDateStr) {
    startDate = new Date(filterStartDateStr);
  } else {
    startDate.setDate(startDate.getDate() - 7);
  }
  startDate.setHours(0,0,0,0);

  const endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + 7);
  endDate.setHours(23,59,59,999);

  const data = ledgerSheet.getDataRange().getValues();
  const headers = data[0];

  const idxId = headers.indexOf("LEDGERID");
  const idxDate = headers.indexOf("TXNDATE");
  const idxType = headers.indexOf("TXNTYPE");
  const idxSourceTab = headers.indexOf("SOURCETAB");
  const idxSourceId = headers.indexOf("SOURCETXNID");
  const idxMember = headers.indexOf("MEMBERID");
  const idxNote = headers.indexOf("TXNOTE");
  const idxAmount = headers.indexOf("SIGNEDAMOUNT");
  const idxProduct = headers.indexOf("PRODUCTID");
  const idxStatus = headers.indexOf("AUTHORISATIONSTATUS");

  // Summary aggregation metrics categories
  let summary = {
    reportMetaData: {
      generatedAt: Utilities.formatDate(new Date(), "Asia/Nicosia", "yyyy-MM-dd HH:mm:ss"),
      dateWindowStart: Utilities.formatDate(startDate, "Asia/Nicosia", "yyyy-MM-dd"),
      dateWindowEnd: Utilities.formatDate(endDate, "Asia/Nicosia", "yyyy-MM-dd")
    },
    receiptsInflow: {
      subscriptions: 0.00,
      pay2play: 0.00,
      merchandise: 0.00,
      donations: 0.00,
      miscellaneous: 0.00,
      totalReceipts: 0.00
    },
    paymentsOutflow: {
      supplierCosts: 0.00,
      memberRefunds: 0.00,
      totalPayments: 0.00
    },
    netCashPosition: 0.00,
    itemisedTransactions: [] // Holds the clean item rows for the cashier grid
  };

  // 1. Loop chronologically through all row ledger cells
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[idxDate]) continue;

    const txnDate = new Date(row[idxDate]);
    const txnStatus = String(row[idxStatus]).trim().toUpperCase();

    // Audit control: exclude records outside our date window or marked as queried
    if (txnDate < startDate || txnDate > endDate || txnStatus === "QUERIED") continue;

    const rawAmount = parseFloat(row[idxAmount]);
    if (isNaN(rawAmount)) continue;

    const txnType = String(row[idxType]).trim();
    const formattedDate = Utilities.formatDate(txnDate, "Asia/Nicosia", "yyyy-MM-dd");

    // 2. Classify rows based on signed value attributes
    if (rawAmount > 0) {
      if (txnType === "Subscription Sale") summary.receiptsInflow.subscriptions += rawAmount;
      else if (txnType === "Pay2Play") summary.receiptsInflow.pay2play += rawAmount;
      else if (txnType === "Merchandise Sale") summary.receiptsInflow.merchandise += rawAmount;
      else if (txnType === "Donation") summary.receiptsInflow.donations += rawAmount;
      else summary.receiptsInflow.miscellaneous += rawAmount;
      
      summary.receiptsInflow.totalReceipts += rawAmount;
    } else if (rawAmount < 0) {
      const positiveOutflowVal = Math.abs(rawAmount);
      if (txnType === "Supplier Payment") summary.paymentsOutflow.supplierCosts += positiveOutflowVal;
      else if (txnType === "Refund") summary.paymentsOutflow.memberRefunds += positiveOutflowVal;
      
      summary.paymentsOutflow.totalPayments += positiveOutflowVal;
    }

    // 3. Package the itemised row detail cleanly for the frontend presentation table
    summary.itemisedTransactions.push({
      ledgerId: String(row[idxId]),
      date: formattedDate,
      type: txnType,
      sourceTab: String(row[idxSourceTab]),
      sourceTxnId: String(row[idxSourceId]),
      memberId: String(row[idxMember]),
      note: String(row[idxNote]),
      amount: rawAmount, // Maintains native sign (+ for receipts, - for payments)
      productId: String(row[idxProduct]),
      status: txnStatus
    });
  }

  // 4. Compute final net cash position (Revenue minus Expenditures)
  summary.netCashPosition = summary.receiptsInflow.totalReceipts - summary.paymentsOutflow.totalPayments;
  
  return { success: true, reportData: summary };
}

/**
 * Akamas Short Mat Bowls Club - Accounting Reports Engine (Part 2 of 2)
 * Module: Itemised Text Cash Book Formatter Macro
 */

/**
 * Run-Ready Macro Tool: Outputs the rolling Weekly Statement and Itemised Details directly onto your log screen.
 * Run this function from the dropdown menu toolbar to audit individual transactions.
 */
function printWeeklyCashBookStatementToLog() {
  const result = generateWeeklyIncomeExpenditureReport("2026-10-01");
  
  if (!result.success) {
    Logger.log(`Report Generation Failed: ${result.error}`);
    return;
  }
  
  const r = result.reportData;
  
  Logger.log("=================================================================");
  Logger.log("      AKAMAS SHORT MAT BOWLS CLUB - WEEKLY CASH BOOK STATEMENT    ");
  Logger.log(`      Reporting Period Window: ${r.reportMetaData.dateWindowStart} to ${r.reportMetaData.dateWindowEnd} `);
  Logger.log("=================================================================");
  Logger.log(" RECEIPTS INFLOW INCOME:");
  Logger.log(`   (+) Member Subscriptions                 : €${r.receiptsInflow.subscriptions.toFixed(2)}`);
  Logger.log(`   (+) Pay2Play Daily Rink Passes           : €${r.receiptsInflow.pay2play.toFixed(2)}`);
  Logger.log(`   (+) Merchandise Apparel Sales            : €${r.receiptsInflow.merchandise.toFixed(2)}`);
  Logger.log(`   (+) Generous Club Donations              : €${r.receiptsInflow.donations.toFixed(2)}`);
  Logger.log(`   (+) Other Miscellaneous Items            : €${r.receiptsInflow.miscellaneous.toFixed(2)}`);
  Logger.log(" ---------------------------------------------------------------");
  Logger.log(`   TOTAL OPERATIONAL RECEIPTS REVENUE       : €${r.receiptsInflow.totalReceipts.toFixed(2)}`);
  Logger.log("=================================================================");
  Logger.log(" PAYMENTS OUTFLOW EXPENDITURE:");
  Logger.log(`   (-) Trade Supplier Disbursements (Lysos) : €${r.paymentsOutflow.supplierCosts.toFixed(2)}`);
  Logger.log(`   (-) Approved Bowler Account Refunds      : €${r.paymentsOutflow.memberRefunds.toFixed(2)}`);
  Logger.log(" ---------------------------------------------------------------");
  Logger.log(`   TOTAL CASH DISBURSEMENTS EXPENDITURES    : €${r.paymentsOutflow.totalPayments.toFixed(2)}`);
  Logger.log("=================================================================");
  Logger.log(` NET WEEKLY INCOME OVER EXPENDITURE SURPLUS : €${r.netCashPosition.toFixed(2)}`);
  Logger.log("=================================================================");
  
  Logger.log("\n=================================================================");
  Logger.log("            CHRONOLOGICAL ITEMISED TRANSACTION AUDIT DETAILED LIST     ");
  Logger.log("=================================================================");
  
  r.itemisedTransactions.forEach(function(tx) {
    Logger.log(`ID: ${tx.ledgerId} | Date: ${tx.date} | Type: ${tx.type.padEnd(20, ' ')} | Member: ${tx.memberId.padEnd(8, ' ')} | Amount: €${tx.amount.toFixed(2).padEnd(8, ' ')} | Note: ${tx.note}`);
  });
  
  Logger.log("=================================================================");
}
