/**
 * RF_SequenceIds.js
 * Shared next-to-use ID counters stored in System_Config.
 * The config value is the bare number of the NEXT ID to issue (for example 42).
 * Call both functions while holding the script lock: peek, write the record,
 * then commit, so a failed write never burns a number.
 */

function RF_peekNextSequenceId(configKey, prefix, width) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('System_Config') || ss.getSheetByName('System Config');
  if (!sheet) throw new Error('System_Config sheet not found');

  const normalize = function(value) { return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const wanted = normalize(configKey);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalize(rows[i][0]) !== wanted) continue;
    const digits = String(rows[i][1] === null || rows[i][1] === undefined ? '' : rows[i][1]).replace(/\D/g, '');
    const number = parseInt(digits, 10);
    if (!digits || isNaN(number) || number < 1) {
      throw new Error(configKey + ' in System_Config must contain the next number to use (for example 42).');
    }
    return {
      id: prefix + String(number).padStart(width || 6, '0'),
      number: number,
      sheet: sheet,
      row: i + 1
    };
  }
  throw new Error(configKey + ' not found in System_Config.');
}

function RF_commitSequenceId(sequence) {
  sequence.sheet.getRange(sequence.row, 2).setValue(sequence.number + 1);
  sequence.sheet.getRange(sequence.row, 4).setValue(new Date());
}
