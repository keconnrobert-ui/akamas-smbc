/**
 * Akamas Short Mat Bowls Club - Forensic Audit Tracer
 * Module: Direct Active State Column Verification Logger
 * Status: 100% Production Ready
 */

function runForensicActiveFieldTrace() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const membersSheet = ss.getSheetByName("Members");
  
  if (!membersSheet) {
    Logger.log("❌ EXCEPTION CRITICAL: 'Members' tab sheet not found in workbook.");
    return;
  }
  
  const data = membersSheet.getDataRange().getValues();
  const headers = data[0];
  
  const idxId = headers.indexOf("MEMBERID");
  const idxActive = headers.indexOf("ACTIVE");
  
  Logger.log("=================================================================");
  Logger.log("   ASMBC FORENSIC SPREADSHEET ROW LOG: INITIAL PASS TRACE       ");
  Logger.log(`   Header 'MEMBERID' Found at Array Column Position Index: ${idxId}`);
  Logger.log(`   Header 'ACTIVE'   Found at Array Column Position Index: ${idxActive} (Column ${String.fromCharCode(65 + idxActive)})`);
  Logger.log("=================================================================");
  
  let targetRowIdx = -1;
  let rawCellType = "";
  let rawCellValue = "";
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxId]).trim().toUpperCase() === "MBR999") {
      targetRowIdx = i + 1;
      rawCellValue = data[i][idxActive];
      rawCellType = typeof rawCellValue;
      break;
    }
  }
  
  if (targetRowIdx === -1) {
    Logger.log("❌ SCAN BREAK: Target record MBR999 was not found in the spreadsheet rows.");
    return;
  }
  
  Logger.log(`   [BEFORE EDIT] Target Row Line Coordinates: Row ${targetRowIdx}`);
  Logger.log(`   [BEFORE EDIT] Raw Extracted JavaScript Variable Type: ${rawCellType}`);
  Logger.log(`   [BEFORE EDIT] Raw Unaltered Spreadsheet Cell Value  : "${rawCellValue}"`);
  Logger.log("-----------------------------------------------------------------");
  
  // SIMULATE THE EDIT PASS: Manually force write to column Q to trace update parameters
  Logger.log("   Executing simulated backend modification pass onto row...");
  membersSheet.getRange(targetRowIdx, idxActive + 1).setValue("FALSE");
  SpreadsheetApp.flush(); // Flush all pending operations to force cell synchronization
  
  // READ FILE AGAIN: Refresh data array straight from spreadsheet cells to trace final state
  const refreshData = membersSheet.getDataRange().getValues();
  const freshCellValue = refreshData[targetRowIdx - 1][idxActive];
  const freshCellType = typeof freshCellValue;
  
  Logger.log("-----------------------------------------------------------------");
  Logger.log("   ASMBC FORENSIC SPREADSHEET ROW LOG: SECOND PASS RE-READ      ");
  Logger.log(`   [AFTER EDIT] Fresh Extracted JavaScript Variable Type : ${freshCellType}`);
  Logger.log(`   [AFTER EDIT] Fresh Unaltered Spreadsheet Cell Value   : "${freshCellValue}"`);
  Logger.log("=================================================================");
}
