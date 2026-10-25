/**
 * Akamas Short Mat Bowls Club - Forensic Audit Scanner
 * Module: TX999999 Chronological Timeline Gap, Sequence, and Date Sweep
 * 
 * Technical Implementation: Google Apps Script (V8 Engine)
 * Status: 100% Production Finalised with Chronological Overlap Detection
 */

function generateTX999999AuditReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName("Ledger");
  
  if (!ledgerSheet) {
    return { success: false, sequenceStatus: "CRITICAL_FAULT", error: "Ledger sheet tab not found." };
  }
  
  const data = ledgerSheet.getDataRange().getValues();
  const headers = data[0];
  const idxId = headers.indexOf("LEDGERID");
  const idxDate = headers.indexOf("TXNDATE");
  
  if (idxId === -1 || idxDate === -1) {
    return { success: false, sequenceStatus: "SCHEMA_MISMATCH", error: "Critical column headers missing." };
  }
  
  let verifiedCount = 0;
  let gapsFound = [];
  let chronologicalViolations = []; // Tracks rows where dates go backward
  let expectedSequenceNum = 1;
  let lastProcessedDate = null;
  
  for (let i = 1; i < data.length; i++) {
    const rawId = String(data[i][idxId]).trim().toUpperCase();
    if (!rawId || rawId === "BLANK" || !rawId.startsWith("LEDGER")) continue;
    
    const currentSequenceNum = parseInt(rawId.replace("LEDGER", ""), 10);
    if (isNaN(currentSequenceNum)) continue;
    
    const currentTxnDate = new Date(data[i][idxDate]);
    
    // 1. SEQUENCE GAP CHECK: Find missing IDs
    if (currentSequenceNum !== expectedSequenceNum) {
      for (let gap = expectedSequenceNum; gap < currentSequenceNum; gap++) {
        gapsFound.push(`LEDGER${String(gap).padStart(6, '0')}`);
      }
      expectedSequenceNum = currentSequenceNum;
    }
    
    // 2. CHRONOLOGICAL AUDIT: Catch dates going backward in the cash ledger book
    if (lastProcessedDate !== null && currentTxnDate < lastProcessedDate) {
      const formattedDate = Utilities.formatDate(currentTxnDate, "Asia/Nicosia", "yyyy-MM-dd HH:mm");
      const formattedLastDate = Utilities.formatDate(lastProcessedDate, "Asia/Nicosia", "yyyy-MM-dd HH:mm");
      chronologicalViolations.push(
        `Row ${i + 1} (${rawId}): Date ${formattedDate} goes backward. Prior entry was ${formattedLastDate}`
      );
    }
    
    if (!isNaN(currentTxnDate.getTime())) {
      lastProcessedDate = currentTxnDate;
    }
    
    verifiedCount++;
    expectedSequenceNum++;
  }
  
  let statusOutcome = "CLEAN";
  if (gapsFound.length > 0) statusOutcome = "TIMELINE_GAP_DETECTED";
  if (chronologicalViolations.length > 0) statusOutcome = "CHRONOLOGICAL_OVERRIDE_WARNING";
  
  return {
    success: true,
    sequenceStatus: statusOutcome,
    totalVerified: verifiedCount,
    gapsFound: gapsFound,
    dateViolations: chronologicalViolations
  };
}
