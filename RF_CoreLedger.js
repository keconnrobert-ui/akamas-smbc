/**
 * RF_CoreLedger.js
 * Canonical ledger and transaction validation layer.
 * System_Catalog is the schema authority.
 * Ledger semantics are source-linked, not just member-based.
 */

function RF_hashCanonicalTransaction(payload) {
  const normalized = Object.keys(payload).sort().map(function(key) {
    return String(key) + '=' + String(payload[key]);
  }).join('|');

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalized
  );

  return digest
    .map(function(byte) {
      const hex = (byte + 256).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    })
    .join('');
}

function RF_generateTXNHASH(sourceTab, sourceTxnId, sourceId, userEmail, txnDate, txnTime, signedAmount, productId, txnType) {
  const payload = {
    sourceTab: String(sourceTab || ''),
    sourceTxnId: String(sourceTxnId || ''),
    sourceId: String(sourceId || ''),
    userEmail: String(userEmail || ''),
    txnDate: String(txnDate || ''),
    txnTime: String(txnTime || ''),
    signedAmount: String(signedAmount || 0),
    productId: String(productId || ''),
    txnType: String(txnType || '')
  };

  return RF_hashCanonicalTransaction(payload);
}

function RF_validateTXNHASH(row, userEmail) {
  const sourceTab = row.SOURCETAB || row.sourceTab || '';
  const sourceTxnId = row.SOURCETXNID || row.sourceTxnId || '';
  const sourceId = row.SOURCEID || row.sourceId || row.MEMBERID || row.SUPPLIERID || row.ATTENDANCEID || '';
  const txnDate = row.TXNDATE || row.txnDate || '';
  const txnTime = row.TXNTIME || row.txnTime || '';
  const signedAmount = row.SIGNEDAMOUNT || row.signedAmount || 0;
  const productId = row.PRODUCTID || row.productId || '';
  const txnType = row.TXNTYPE || row.txnType || '';

  const expectedHash = RF_generateTXNHASH(
    sourceTab,
    sourceTxnId,
    sourceId,
    userEmail,
    txnDate,
    txnTime,
    signedAmount,
    productId,
    txnType
  );

  return expectedHash === String(row.TXNHASH || row.txnHash || '');
}

function RF_generateLedgerId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('System_Config') || ss.getSheetByName('System Config');
  if (!configSheet) {
    throw new Error('System_Config sheet not found');
  }

  const rows = configSheet.getDataRange().getValues();
  let rowIndex = -1;
  let nextNumber = 1;

  for (let i = 1; i < rows.length; i++) {
    const key = (rows[i][0] || '').toString().trim();
    if (key === 'NEXT_LEDGERID' || key === 'NEXTLEDGERID') {
      rowIndex = i;
      nextNumber = parseInt((rows[i][1] || '1').toString().replace(/\D/g, ''), 10) + 1;
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error('NEXT_LEDGERID not found in System_Config');
  }

  const ledgerId = 'LEDG' + String(nextNumber).padStart(6, '0');
  configSheet.getRange(rowIndex + 1, 2).setValue(ledgerId);
  return ledgerId;
}

function RF_generateSourceTxnId(prefix) {
  const cleanPrefix = (prefix || 'RCP').toUpperCase();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('System_Config') || ss.getSheetByName('System Config');
  if (!configSheet) {
    throw new Error('System_Config sheet not found');
  }

  const rows = configSheet.getDataRange().getValues();
  const key = 'NEXT_' + cleanPrefix + '_ID';
  let rowIndex = -1;
  let nextNumber = 1;

  for (let i = 1; i < rows.length; i++) {
    const candidate = (rows[i][0] || '').toString().trim();
    if (candidate === key || candidate === 'NEXT' + cleanPrefix + 'ID') {
      rowIndex = i;
      nextNumber = parseInt((rows[i][1] || '1').toString().replace(/\D/g, ''), 10) + 1;
      break;
    }
  }

  const newId = cleanPrefix + String(nextNumber).padStart(6, '0');

  if (rowIndex === -1) {
    configSheet.appendRow([key, newId, 'Auto-generated ' + cleanPrefix + ' counter', new Date()]);
    return newId;
  }

  configSheet.getRange(rowIndex + 1, 2).setValue(newId);
  return newId;
}

function RF_recordToLedger(txn) {
  if (!txn || typeof txn !== 'object') {
    throw new Error('txn must be an object');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName('Ledger');
  if (!ledgerSheet) {
    throw new Error('Ledger sheet not found');
  }

  RF_requireColumns('Ledger', ['LEDGERID', 'SOURCETAB', 'SOURCETXNID', 'SOURCEID', 'TXNHASH', 'TXNDATE', 'TXNTIME', 'SIGNEDAMOUNT', 'TXNTYPE', 'PRODUCTID', 'USEREMAIL']);

  const ledgerId = RF_generateLedgerId();
  const now = new Date();
  const txnDate = txn.txnDate || now;
  const txnTime = txn.txnTime || now;
  const userEmail = txn.userEmail || Session.getActiveUser().getEmail();

  const generatedHash = RF_generateTXNHASH(
    txn.sourceTab,
    txn.sourceTxnId,
    txn.sourceId,
    userEmail,
    txnDate,
    txnTime,
    txn.signedAmount,
    txn.productId,
    txn.txnType
  );

  const row = [
    ledgerId,
    txn.sourceTab || '',
    txn.sourceTxnId || '',
    txn.sourceId || '',
    txn.sourceRole || 'UNKNOWN',
    txn.txnType || 'RCP',
    txn.productId || '',
    txnDate,
    txnTime,
    txn.signedAmount || 0,
    userEmail,
    generatedHash,
    txn.note || '',
    txn.reconciliationStatus || 'PENDING'
  ];

  ledgerSheet.appendRow(row);
  return ledgerId;
}

function RF_validateLedgerSource(row) {
  const sourceTab = (row.SOURCETAB || row.sourceTab || '').toString();
  const sourceTxnId = (row.SOURCETXNID || row.sourceTxnId || '').toString();
  const sourceId = (row.SOURCEID || row.sourceId || row.MEMBERID || row.SUPPLIERID || row.ATTENDANCEID || '').toString();

  if (!sourceTab || !sourceTxnId || !sourceId) {
    return { valid: false, reason: 'Missing required source linkage fields' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(sourceTab);
  if (!sourceSheet) {
    return { valid: false, reason: 'Source sheet not found: ' + sourceTab };
  }

  const sourceData = sourceSheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < sourceData.length; i++) {
    const rowData = sourceData[i];
    if (rowData[0] === sourceTxnId || rowData[0] === sourceId || rowData[1] === sourceId) {
      found = true;
      break;
    }
  }

  if (!found) {
    return { valid: false, reason: 'Source record not found: ' + sourceTab + '/' + sourceTxnId + '/' + sourceId };
  }

  return { valid: true, reason: 'Source linkage validated' };
}

function RF_validateLedgerConsistency() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName('Ledger');
  if (!ledgerSheet) {
    return { ok: false, anomalies: ['Ledger sheet not found'] };
  }

  const rows = ledgerSheet.getDataRange().getValues();
  const anomalies = [];

  if (rows.length < 2) {
    return { ok: true, anomalies: [] };
  }

  const parsed = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const ledgerId = row[0] || '';
    const dateValue = row[7] || row[0];
    const timeValue = row[8] || row[1] || '';

    if (!ledgerId) {
      continue;
    }

    parsed.push({
      rowIndex: i,
      ledgerId: String(ledgerId),
      txnDate: new Date(dateValue),
      sortKey: String(ledgerId).replace(/\D/g, '')
    });
  }

  const byDate = parsed.slice().sort(function(a, b) {
    return a.txnDate.getTime() - b.txnDate.getTime();
  });

  const byId = parsed.slice().sort(function(a, b) {
    return parseInt(a.sortKey, 10) - parseInt(b.sortKey, 10);
  });

  for (let i = 0; i < byDate.length; i++) {
    const expectedId = byDate[i].ledgerId;
    if (parsed[i] && parsed[i].ledgerId !== expectedId) {
      anomalies.push('Date-order mismatch detected near: ' + expectedId);
    }
  }

  for (let i = 0; i < byId.length; i++) {
    const expectedDate = byId[i].txnDate;
    if (parsed[i] && parsed[i].txnDate.getTime() !== expectedDate.getTime()) {
      anomalies.push('LedgerID-order mismatch detected near: ' + byId[i].ledgerId);
    }
  }

  return { ok: anomalies.length === 0, anomalies: anomalies };
}
