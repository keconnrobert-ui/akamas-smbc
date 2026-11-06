/**
 * RF_SequenceIds.js
 * Shared next-to-use ID counters stored in System_Config.
 * The config value is the bare number of the NEXT ID to issue (for example 42).
 * Call both functions while holding the script lock. A record and its counter
 * cannot be updated atomically, so check existing IDs before issuing one.
 */

function RF_peekNextSequenceId(configKey, prefix, width) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('System_Config') || ss.getSheetByName('System Config');
  if (!sheet) throw new Error('System_Config sheet not found');

  const normalize = function(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const wanted = normalize(configKey);
  const rows = sheet.getDataRange().getValues();
  const targets = {
    NEXTLEDGERID: { sheet: 'Ledger', headers: ['LEDGERID'], prefix: 'LEDGER', pattern: /^(?:LEDGER|LEDG|LED|LDG)(\d+)$/ },
    NEXTATTENDANCEID: { sheet: 'Attendance', headers: ['TRANSACTIONID', 'ATTENDANCEID', 'ATTID'], prefix: 'ATT', pattern: /^ATT(\d+)$/ }
  };
  const target = targets[wanted];
  if (!target || prefix !== target.prefix) throw new Error('Unsupported sequence: ' + configKey);
  const matches = [];
  for (let i = 1; i < rows.length; i++) {
    if (normalize(rows[i][0]) === wanted) matches.push(i);
  }
  if (matches.length !== 1) throw new Error(configKey + ' must appear exactly once in System_Config.');

  const row = matches[0];
  const value = String(rows[row][1] == null ? '' : rows[row][1]).trim().toUpperCase();
  const legacy = value.match(target.pattern);
  const digits = /^\d+$/.test(value) ? value : legacy && legacy[1];
  const number = Number(digits);
  if (!digits || !Number.isSafeInteger(number) || number < 1 || number >= Number.MAX_SAFE_INTEGER) {
    throw new Error(configKey + ' in System_Config must contain the next number to use (for example 42).');
  }

  const targetSheet = ss.getSheetByName(target.sheet);
  if (!targetSheet || targetSheet.getLastColumn() < 1) throw new Error(target.sheet + ' sheet or headers not found; cannot check IDs.');
  SpreadsheetApp.flush();
  const existing = targetSheet.getDataRange().getValues();
  const headers = existing[0].map(normalize);
  const idCol = headers.findIndex(function(header) { return target.headers.includes(header); });
  if (idCol < 0) throw new Error(target.sheet + ' ID column not found; cannot check IDs.');
  for (let i = 1; i < existing.length; i++) {
    const match = String(existing[i][idCol] || '').trim().toUpperCase().match(target.pattern);
    if (match && Number(match[1]) === number) {
      throw new Error(configKey + ' value ' + number + ' is already used in ' + target.sheet + '. Check the counter before retrying.');
    }
  }
  return {
    id: prefix + String(number).padStart(width || 6, '0'),
    number: number,
    sheet: sheet,
    row: row + 1
  };
}

function RF_commitSequenceId(sequence) {
  sequence.sheet.getRange(sequence.row, 2).setValue(sequence.number + 1);
  sequence.sheet.getRange(sequence.row, 4).setValue(new Date());
}
