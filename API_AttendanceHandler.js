/**
 * recordAttendance()
 * Atomic write to Attendance sheet with idempotency via QR_CODE_HASH.
 * Integrates with lock manager, response handler, and security.
 * 
 * Attendance Schema:
 * [TRANSACTION_ID(A), BOWLER_ID(B), PRODUCT_ID(C), SESSION_DATE(D), 
 *  SESSION_TYPE(E), QR_CODE_HASH(F), CHECK_IN_TIMESTAMP(G), 
 *  PAYMENTSTATUS(H), LEDGERID(I), ENTRY_METHOD(J)]
 */
function recordAttendance(attendancePayload) {
  return executeWithLock('ATTENDANCE_WRITE', function(lock) {
    try {
      const {
        transaction_id,
        bowler_id,
        product_id,
        session_date,
        session_type,
        qr_code_hash,
        payment_status,
        ledger_id,
        entry_method
      } = attendancePayload;
      
      // Validate payload
      if (!transaction_id || !bowler_id || !session_date) {
        throw new Error('Missing required fields: transaction_id, bowler_id, session_date');
      }
      
      if (!['QR_SCAN', 'QR_OPERATOR', 'MANUAL_CASHIER', 'MANUAL_MEMBER'].includes(entry_method)) {
        throw new Error('Invalid entry_method: ' + entry_method);
      }
      
      const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName('Attendance');
      
      if (!attendanceSheet) {
        throw new Error('Attendance sheet not found');
      }
      
      const checkInTimestamp = new Date().toISOString();
      
      // Check for duplicate via QR_CODE_HASH (idempotency)
      if (qr_code_hash) {
        const existingRecord = findAttendanceByQRHash(qr_code_hash);
        if (existingRecord) {
          return {
            success: false,
            action: 'RECORD_ATTENDANCE',
            reason: 'DUPLICATE_QR',
            existing_transaction_id: existingRecord.transaction_id,
            timestamp: checkInTimestamp
          };
        }
      }
      
      // Append new attendance record
      const newRow = [
        transaction_id,
        bowler_id,
        product_id || '',
        session_date,
        session_type || '',
        qr_code_hash || '',
        checkInTimestamp,
        payment_status || 'UNPAID',
        ledger_id || '',
        entry_method
      ];
      
      attendanceSheet.appendRow(newRow);
      
      return {
        success: true,
        action: 'RECORD_ATTENDANCE',
        transaction_id: transaction_id,
        bowler_id: bowler_id,
        check_in_timestamp: checkInTimestamp,
        entry_method: entry_method,
        timestamp: checkInTimestamp
      };
    } catch (e) {
      console.error('recordAttendance error: ' + e.message);
      return {
        success: false,
        action: 'RECORD_ATTENDANCE',
        error: e.message,
        timestamp: new Date().toISOString()
      };
    }
  }, 10000); // 10s lock timeout
}

/**
 * Helper: Find attendance record by QR_CODE_HASH.
 * @param {string} qrHash - QR code hash
 * @returns {object|null} Attendance record or null
 */
function findAttendanceByQRHash(qrHash) {
  try {
    const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName('Attendance');
    
    if (!attendanceSheet) {
      return null;
    }
    
    const data = attendanceSheet.getRange('A:J').getValues();
    
    // Column F (index 5) = QR_CODE_HASH
    for (let i = 1; i < data.length; i++) {
      if (data[i][5] === qrHash && qrHash !== '') {
        return {
          transaction_id: data[i][0],
          bowler_id: data[i][1],
          product_id: data[i][2],
          session_date: data[i][3],
          session_type: data[i][4],
          qr_code_hash: data[i][5],
          check_in_timestamp: data[i][6],
          payment_status: data[i][7],
          ledger_id: data[i][8],
          entry_method: data[i][9]
        };
      }
    }
    
    return null;
  } catch (e) {
    console.error('findAttendanceByQRHash error: ' + e.message);
    return null;
  }
}

/**
 * Helper: Get attendance adoption metrics (entry_method breakdown).
 * @returns {object} Metrics by entry method
 */
function getAttendanceAdoptionMetrics() {
  try {
    const attendanceSheet = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName('Attendance');
    
    if (!attendanceSheet) {
      return null;
    }
    
    const data = attendanceSheet.getRange('J:J').getValues(); // ENTRY_METHOD column
    const metrics = {
      'QR_SCAN': 0,
      'QR_OPERATOR': 0,
      'MANUAL_CASHIER': 0,
      'MANUAL_MEMBER': 0,
      'UNKNOWN': 0
    };
    
    for (let i = 1; i < data.length; i++) {
      const method = data[i][0];
      if (metrics[method] !== undefined) {
        metrics[method]++;
      } else if (method) {
        metrics['UNKNOWN']++;
      }
    }
    
    return metrics;
  } catch (e) {
    console.error('getAttendanceAdoptionMetrics error: ' + e.message);
    return null;
  }
}
