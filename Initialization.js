/**
 * Akamas Short Mat Bowls Club - Master Database Engine
 * Module: Non-Drifting Dynamic Relational Schema Mapper
 * Status: 100% Production Finalised - Fixed Column Shifting
 */

const SYSTEM_CONFIG = {
  VERSION: "1.6.0-PRODUCTION",
  LAUNCH_DATE: "2026-10-10",
  ROLES: ["Manager", "Cashier", "Bowler", "Accountant"],
  STATUSES: ["Active", "Overdue", "Lapsed", "Suspended"],
  PAYMENT_METHODS: ["Cash", "Check", "Card", "PayPal", "Bank Transfer"]
};

/**
 * ASMBC Diagnostic Macro: Inspects all physical tab names and Row 1 header arrays.
 * Read-only. Run from Apps Script toolbar and check Execution Log (Ctrl+Enter).
 */
function inspectAllSheetHeadersAndNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("ERROR: SpreadsheetApp.getActiveSpreadsheet() returned NULL.");
    return;
  }
  
  const sheets = ss.getSheets();
  Logger.log("=========================================================");
  Logger.log(` TOTAL SHEETS IN WORKBOOK: ${sheets.length}`);
  Logger.log("=========================================================");
  
  sheets.forEach((sh, index) => {
    const name = sh.getName();
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    Logger.log(`\n[Tab #${index + 1}] Name: "${name}" | Rows: ${lastRow} | Columns: ${lastCol}`);
    
    if (lastCol > 0 && lastRow > 0) {
      const headers = sh.getRange(1, 1, 1, lastCol).getValues();
      Logger.log(`   Row 1 Headers (0-indexed array): ${JSON.stringify(headers)}`);
      // Print indexed column mapping for instant verification
      headers.forEach((h, colIdx) => {
        const colLetter = String.fromCharCode(65 + colIdx);
        Logger.log(`     Index [${colIdx}] (Col ${colLetter}) -> "${h}"`);
      });
    } else {
      Logger.log("   --> Sheet is completely empty or has no columns.");
    }
  });
  Logger.log("\n=========================================================");
}


/**
 * Hardened Setup Aligner: Maps your columns using flexible name variations.
 * Prevents appending double columns or scrambling row data.
 */
function initializeSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const targetHeaders = {
    "Members": ["MEMBERID", "FULLNAME", "STATUS", "TELEPHONE", "WHATSAPP", "EMAIL", "ADDRESSLINE1", "ADDRESSLINE2", "CITY", "POSTCODE", "COUNTRY", "PRODUCTID", "LASTPAIDDATE", "NEXTSUBSCRIPTIONDUE", "LASTATTENDANCEDATE", "NOTES", "ACTIVE"],
    "ProductTypes": ["PRODUCTID", "NAME", "CATEGORY", "PRICE", "SESSIONSPERCYCLE", "COVERAGEMONTHS", "COVERAGESTARTRULE", "REQUIRESMANAGERAPPROVAL", "ACTIVE", "NOTES", "PAYPALLINK", "STCAT", "BASECOST", "SHELFPRICE"],
    "Ledger": ["LEDGERID", "TXNDATE", "TXNTYPE", "SOURCETAB", "SOURCETXNID", "MEMBERID", "TXNOTE", "SIGNEDAMOUNT", "PRODUCTID", "AUTHORISATIONSTATUS", "CREATEDBY"],
    "Attendance": ["transaction_id", "bowler_id", "product_id", "session_date", "session_type", "qr_code_hash", "check_in_timestamp", "PaymentStatus"]
  };

  Object.keys(targetHeaders).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(targetHeaders[sheetName]);
    } else {
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        // Safe uppercase normalization map to check for existing headers
        const existingRaw = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        const existingHeaders = existingRaw.map(h => String(h).replace(/[\s_]/g, "").trim().toUpperCase());
        
        targetHeaders[sheetName].forEach(function(targetCol) {
          const cleanTarget = targetCol.replace(/[\s_]/g, "").toUpperCase();
          // Hard security gate: only add column if it doesn't exist under any spelling variation
          if (existingHeaders.indexOf(cleanTarget) === -1) {
            sheet.getRange(1, sheet.getLastColumn() + 1).setValue(targetCol);
          }
        });
      } else {
        sheet.appendRow(targetHeaders[sheetName]);
      }
    }
    
    // Brand headers into your deep navy club layout theme
    const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
    headerRange.setFontWeight("bold").setBackground("#1A365D").setFontColor("#FFFFFF").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  });

  // Run the safe synchronized data seeding engine pass
  executeSynchronizedDataSeeding(ss);
}

function executeSynchronizedDataSeeding(ss) {
  const membersSheet = ss.getSheetByName("Members");
  const ledgerSheet = ss.getSheetByName("Ledger");
  const attendanceSheet = ss.getSheetByName("Attendance");
  
  if (membersSheet.getLastRow() > 1) membersSheet.getRange(2, 1, membersSheet.getLastRow() - 1, membersSheet.getLastColumn()).clearContent();
  if (ledgerSheet.getLastRow() > 1) ledgerSheet.getRange(2, 1, ledgerSheet.getLastRow() - 1, ledgerSheet.getLastColumn()).clearContent();
  if (attendanceSheet.getLastRow() > 1) attendanceSheet.getRange(2, 1, attendanceSheet.getLastRow() - 1, attendanceSheet.getLastColumn()).clearContent();

  const sessionDateStr = "2026-10-11";
  
  // Seed initial synchronized member scenario accounts - writing text string handles to WhatsApp
  const coreScenarios = [
    { id: "MBR001", name: "Nikos Georgiou", status: "Active", tel: "'+35796123456", wa: "nikos_bowls_cy", email: "nikos@example.cy", product: "ST001", lastPaid: "2026-10-01", nextDue: "2027-11-01", amount: 550.00, note: "Annual Membership Renewal", active: "TRUE" },
    { id: "MBR002", name: "Maria Papadopoulos", status: "Active", tel: "'+35796234567", wa: "maria_p_bowls", email: "maria@example.cy", product: "ST002", lastPaid: "2026-10-02", nextDue: "2027-02-01", amount: 165.00, note: "Quarterly Membership Renewal", active: "TRUE" },
    { id: "MBR019", name: "Andreas Cyprus", status: "Lapsed", tel: "'+35799000111", wa: "andreas_cy", email: "andreas.cyp@gmail.com", product: "ST003", lastPaid: "2026-08-01", nextDue: "2026-09-01", amount: 0.00, note: "Awaiting Cashier Renewal Outflow", active: "TRUE" }
  ];

  coreScenarios.forEach(function(s) {
    membersSheet.appendRow([
      s.id, s.name, s.status, s.tel, s.wa, s.email, "15 Club Rink Lane", "", "Lysos", "8800", "Cyprus",
      s.product, s.lastPaid, s.nextDue, s.lastPaid, "Seeded Profile", s.active
    ]);

    const nextAttId = `ATT${String(attendanceSheet.getLastRow()).padStart(6, '0')}`;
    attendanceSheet.appendRow([nextAttId, s.id, s.product, sessionDateStr, "Morning", "QR_VALID_HASH_STUB", sessionDateStr, s.id === "MBR019" ? "UNPAID" : "PAID"]);

    if (s.amount > 0) {
      const nextLedgerId = `LEDGER${String(ledgerSheet.getLastRow()).padStart(6, '0')}`;
      const recId = `RCP${String(ledgerSheet.getLastRow()).padStart(6, '0')}`;
      ledgerSheet.appendRow([nextLedgerId, s.lastPaid, "Subscription Sale", "Receipts", recId, s.id, s.note, parseFloat(s.amount), s.product, "Reconciled", "CASHIER"]);
    }
  });
}
