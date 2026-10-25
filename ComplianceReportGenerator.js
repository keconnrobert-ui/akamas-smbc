/**
 * ComplianceReportGenerator.gs - CHUNK 1: Traceability Matrix Validator
 * 
 * Purpose:
 *   - Validate TXNHASH consistency across source sheets and Ledger
 *   - Detect hash mismatches (source vs. Ledger)
 *   - Build bidirectional traceability audit chains
 *   - Report orphaned or unlinked records
 * 
 * Dependencies:
 *   - Ledger sheet: LEDGERID, TXNDATE, SOURCETXNID, TXNTYPE, TXNHASH
 *   - Source sheets: Transactions, Attendance, Purchases, Members
 *   - API_SecurityAndHelpers.gs (for any future hash validation)
 * 
 * Returns: { success, validated, mismatches, orphaned, matrix }
 */

/**
 * Test wrapper for traceabilityMatrixValidator
 * Run this function to execute the validator against your live spreadsheet
 */
function testTraceabilityValidator() {
  const spreadsheetId = '1AZLvU80Y5GJGPJi4GJ6wrGTTU_g4hQzNqAfeinfMuTk';
  
  Logger.log('=== TRACEABILITY VALIDATOR TEST ===');
  Logger.log('Spreadsheet ID: ' + spreadsheetId);
  Logger.log('Starting validation...\n');
  
  const result = traceabilityMatrixValidator(spreadsheetId);
  
  Logger.log(JSON.stringify(result, null, 2));
  
  return result;
}


function traceabilityMatrixValidator(spreadsheetId) {
  try {
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const ledgerSheet = ss.getSheetByName('Ledger');

    if (!ledgerSheet) {
      return {
        success: false,
        message: 'Ledger sheet not found',
        validated: 0,
        mismatches: [],
        orphaned: [],
        matrix: []
      };
    }

    // Load Ledger data with headers
    const ledgerData = ledgerSheet.getDataRange().getValues();
    if (ledgerData.length < 2) {
      return {
        success: false,
        message: 'Ledger sheet is empty',
        validated: 0,
        mismatches: [],
        orphaned: [],
        matrix: []
      };
    }

    const ledgerHeaders = ledgerData[0];
    const ledgerRows = ledgerData.slice(1).filter(row => row[0]); // Skip empty rows

    // Column indices for Ledger
    const ledgerIdIdx = ledgerHeaders.indexOf('LEDGERID');
    const txnDateIdx = ledgerHeaders.indexOf('TXNDATE');
    const sourceTxnIdIdx = ledgerHeaders.indexOf('SOURCETXNID');
    const txnTypeIdx = ledgerHeaders.indexOf('TXNTYPE');
    const ledgerHashIdx = ledgerHeaders.indexOf('TXNHASH');
    const memberIdIdx = ledgerHeaders.indexOf('MEMBERID');

    if (ledgerIdIdx === -1 || ledgerHashIdx === -1) {
      return {
        success: false,
        message: 'Ledger missing required columns: LEDGERID or TXNHASH',
        validated: 0,
        mismatches: [],
        orphaned: [],
        matrix: []
      };
    }

    // Result containers
    const mismatches = [];
    const orphaned = [];
    const matrix = [];
    let validatedCount = 0;

    // === TRANSACTIONS VALIDATION (RCP entries) ===
    const txnSheet = ss.getSheetByName('Transactions');
    if (txnSheet) {
      const txnData = txnSheet.getDataRange().getValues();
      const txnHeaders = txnData[0];
      const txnRows = txnData.slice(1).filter(row => row[0]);

      const txnIdIdx = txnHeaders.indexOf('TXNID');
      const txnHashIdx = txnHeaders.indexOf('TXNHASH');

      // Build map: TXNID → { hash, rowIndex, date }
      const txnMap = {};
      txnRows.forEach((row, idx) => {
        if (row[txnIdIdx]) {
          txnMap[row[txnIdIdx]] = {
            hash: row[txnHashIdx] || '',
            rowIndex: idx + 2,
            date: row[txnHeaders.indexOf('TXNDATE')] || null
          };
        }
      });

      // Validate RCP entries in Ledger
      ledgerRows.forEach((ledgerRow, idx) => {
        const txnType = ledgerRow[txnTypeIdx];
        if (txnType && txnType.toString().startsWith('RCP')) {
          const ledgerId = ledgerRow[ledgerIdIdx];
          const sourceTxnId = ledgerRow[sourceTxnIdIdx];
          const ledgerHash = ledgerRow[ledgerHashIdx];
          const ledgerDate = ledgerRow[txnDateIdx];

          if (!sourceTxnId) {
            orphaned.push({
              ledgerId,
              txnType,
              sourceSheet: 'Transactions',
              issue: 'Missing SOURCETXNID in RCP entry',
              rowIndex: idx + 2
            });
            return;
          }

          const txnRecord = txnMap[sourceTxnId];
          if (!txnRecord) {
            orphaned.push({
              ledgerId,
              sourceTxnId,
              txnType,
              sourceSheet: 'Transactions',
              issue: `SOURCETXNID '${sourceTxnId}' not found in Transactions sheet`,
              rowIndex: idx + 2
            });
            return;
          }

          // Hash match check
          const hashMatch = txnRecord.hash === ledgerHash;
          if (!hashMatch) {
            mismatches.push({
              ledgerId,
              sourceTxnId,
              sourceSheet: 'Transactions',
              sourceHash: txnRecord.hash,
              ledgerHash,
              sourceRowIndex: txnRecord.rowIndex,
              ledgerRowIndex: idx + 2,
              issue: 'TXNHASH mismatch: source vs. Ledger'
            });
          }

          // Add to matrix
          matrix.push({
            ledgerId,
            sourceTxnId,
            sourceSheet: 'Transactions',
            txnType,
            ledgerDate,
            sourceDate: txnRecord.date,
            hashMatch,
            direction: 'Transactions → Ledger',
            sourceRowIndex: txnRecord.rowIndex,
            ledgerRowIndex: idx + 2
          });

          validatedCount++;
        }
      });
    }

    // === ATTENDANCE VALIDATION (RCP_ATTENDANCE entries) ===
    const attSheet = ss.getSheetByName('Attendance');
    if (attSheet) {
      const attData = attSheet.getDataRange().getValues();
      const attHeaders = attData[0];
      const attRows = attData.slice(1).filter(row => row[0]);

      const attIdIdx = attHeaders.indexOf('TRANSACTION_ID');
      const attHashIdx = attHeaders.indexOf('TXNHASH');
      const attDateIdx = attHeaders.indexOf('SESSION_DATE');

      // Build map: TRANSACTION_ID → { hash, rowIndex }
      const attMap = {};
      attRows.forEach((row, idx) => {
        if (row[attIdIdx]) {
          attMap[row[attIdIdx]] = {
            hash: row[attHashIdx] || '',
            rowIndex: idx + 2,
            date: row[attDateIdx] || null
          };
        }
      });

      // Validate Attendance linkage via LEDGERID
      ledgerRows.forEach((ledgerRow, idx) => {
        const txnType = ledgerRow[txnTypeIdx];
        if (txnType && txnType.toString() === 'RCP_ATTENDANCE') {
          const ledgerId = ledgerRow[ledgerIdIdx];
          const ledgerHash = ledgerRow[ledgerHashIdx];
          const ledgerDate = ledgerRow[txnDateIdx];

          const attRecord = attMap[ledgerId];
          if (!attRecord) {
            // Not necessarily an error; attendance may not yet be paid
            return;
          }

          const hashMatch = attRecord.hash === ledgerHash;
          if (!hashMatch) {
            mismatches.push({
              ledgerId,
              sourceSheet: 'Attendance',
              sourceHash: attRecord.hash,
              ledgerHash,
              sourceRowIndex: attRecord.rowIndex,
              ledgerRowIndex: idx + 2,
              issue: 'TXNHASH mismatch: Attendance vs. Ledger'
            });
          }

          matrix.push({
            ledgerId,
            sourceSheet: 'Attendance',
            txnType,
            ledgerDate,
            sourceDate: attRecord.date,
            hashMatch,
            direction: 'Attendance ↔ Ledger',
            sourceRowIndex: attRecord.rowIndex,
            ledgerRowIndex: idx + 2
          });

          validatedCount++;
        }
      });
    }

    // === PURCHASES VALIDATION (COS entries) ===
    const purSheet = ss.getSheetByName('Purchases');
    if (purSheet) {
      const purData = purSheet.getDataRange().getValues();
      const purHeaders = purData[0];
      const purRows = purData.slice(1).filter(row => row[0]);

      const purSrctxIdIdx = purHeaders.indexOf('SRCTXID');
      const purHashIdx = purHeaders.indexOf('TXNHASH');
      const purDateIdx = purHeaders.indexOf('TXDATE');

      // Build map: SRCTXID → { hash, rowIndex, date }
      const purMap = {};
      purRows.forEach((row, idx) => {
        if (row[purSrctxIdIdx]) {
          purMap[row[purSrctxIdIdx]] = {
            hash: row[purHashIdx] || '',
            rowIndex: idx + 2,
            date: row[purDateIdx] || null
          };
        }
      });

      // Validate COS entries in Ledger
      ledgerRows.forEach((ledgerRow, idx) => {
        const txnType = ledgerRow[txnTypeIdx];
        if (txnType && txnType.toString().startsWith('COS')) {
          const ledgerId = ledgerRow[ledgerIdIdx];
          const sourceTxnId = ledgerRow[sourceTxnIdIdx];
          const ledgerHash = ledgerRow[ledgerHashIdx];
          const ledgerDate = ledgerRow[txnDateIdx];

          if (!sourceTxnId) {
            orphaned.push({
              ledgerId,
              txnType,
              sourceSheet: 'Purchases',
              issue: 'Missing SOURCETXNID in COS entry',
              rowIndex: idx + 2
            });
            return;
          }

          const purRecord = purMap[sourceTxnId];
          if (!purRecord) {
            orphaned.push({
              ledgerId,
              sourceTxnId,
              txnType,
              sourceSheet: 'Purchases',
              issue: `SRCTXID '${sourceTxnId}' not found in Purchases sheet`,
              rowIndex: idx + 2
            });
            return;
          }

          const hashMatch = purRecord.hash === ledgerHash;
          if (!hashMatch) {
            mismatches.push({
              ledgerId,
              sourceTxnId,
              sourceSheet: 'Purchases',
              sourceHash: purRecord.hash,
              ledgerHash,
              sourceRowIndex: purRecord.rowIndex,
              ledgerRowIndex: idx + 2,
              issue: 'TXNHASH mismatch: Purchases vs. Ledger'
            });
          }

          matrix.push({
            ledgerId,
            sourceTxnId,
            sourceSheet: 'Purchases',
            txnType,
            ledgerDate,
            sourceDate: purRecord.date,
            hashMatch,
            direction: 'Purchases → Ledger',
            sourceRowIndex: purRecord.rowIndex,
            ledgerRowIndex: idx + 2
          });

          validatedCount++;
        }
      });
    }

    // === MEMBERS CROSS-REFERENCE ===
    const mbrsSheet = ss.getSheetByName('Members');
    if (mbrsSheet) {
      const mbrsData = mbrsSheet.getDataRange().getValues();
      const mbrsHeaders = mbrsData[0];
      const mbrsRows = mbrsData.slice(1).filter(row => row[0]);

      const mbrIdIdx = mbrsHeaders.indexOf('MEMBERID');

      // Build set of valid MEMBERIDs
      const validMemberIds = new Set(mbrsRows.map(row => row[mbrIdIdx]).filter(id => id));

      // Check Ledger MEMBERID references
      ledgerRows.forEach((ledgerRow, idx) => {
        const memberId = ledgerRow[memberIdIdx];
        const ledgerId = ledgerRow[ledgerIdIdx];

        if (memberId && !validMemberIds.has(memberId)) {
          orphaned.push({
            ledgerId,
            memberId,
            sourceSheet: 'Members',
            issue: `MEMBERID '${memberId}' not found in Members sheet`,
            rowIndex: idx + 2
          });
        }
      });
    }

    return {
      success: true,
      validated: validatedCount,
      validatedCount,
      mismatches,
      orphaned,
      matrix,
      summary: {
        totalLedgerRows: ledgerRows.length,
        validatedEntries: validatedCount,
        hashMismatches: mismatches.length,
        orphanedRecords: orphaned.length
      }
    };

  } catch (error) {
    Logger.log(`[traceabilityMatrixValidator] Error: ${error.message}`);
    return {
      success: false,
      message: `Validation failed: ${error.message}`,
      validated: 0,
      mismatches: [],
      orphaned: [],
      matrix: [],
      error: error.toString()
    };
  }
}
