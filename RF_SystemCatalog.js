/**
 * RF_SystemCatalog.js
 * Canonical schema layer for the refactor.
 * System_Catalog is the source of truth. All sheet access should pass through here.
 * Rules:
 *   - canonical field name = SOURCEID
 *   - MEMBERID is a compatibility alias only
 *   - sheet headers are resolved by alias map and schema metadata
 */

function RF_normalizeHeaderName(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '')
    .toUpperCase();
}

function RF_getSystemCatalogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('System_Catalog') || ss.getSheetByName('System Catalog');
}

function RF_getCatalogRows(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  return sheet.getDataRange().getValues();
}

function RF_getCatalogMap(sheetName) {
  const rows = RF_getCatalogRows(sheetName);
  if (!rows || rows.length === 0) {
    return {};
  }

  const headers = rows[0];
  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const key = RF_normalizeHeaderName(headers[i]);
    map[key] = i;
  }

  // compatibility aliases for the ledger/source model
  const aliasMap = {
    MEMBERID: 'SOURCEID',
    SUPPLIERID: 'SOURCEID',
    ATTENDANCEID: 'SOURCEID',
    SOURCEID: 'SOURCEID',
    SOURCETAB: 'SOURCETAB',
    SOURCETXNID: 'SOURCETXNID',
    TXNHASH: 'TXNHASH',
    TXNDATE: 'TXNDATE',
    TXNTIME: 'TXNTIME',
    USEREMAIL: 'USEREMAIL',
    SIGNEDAMOUNT: 'SIGNEDAMOUNT',
    PRODUCTID: 'PRODUCTID',
    TXNTYPE: 'TXNTYPE'
  };

  for (const alias in aliasMap) {
    const canonical = aliasMap[alias];
    if (map[RF_normalizeHeaderName(alias)] !== undefined) {
      map[RF_normalizeHeaderName(alias)] = map[RF_normalizeHeaderName(alias)];
    }
    if (map[RF_normalizeHeaderName(canonical)] !== undefined) {
      map[RF_normalizeHeaderName(alias)] = map[RF_normalizeHeaderName(canonical)];
    }
  }

  return map;
}

function RF_getColumnIndex(sheetName, canonicalName, aliases) {
  const map = RF_getCatalogMap(sheetName);
  const candidates = [];
  const canonical = RF_normalizeHeaderName(canonicalName);
  if (canonical) {
    candidates.push(canonical);
  }

  if (Array.isArray(aliases)) {
    aliases.forEach(function(alias) {
      candidates.push(RF_normalizeHeaderName(alias));
    });
  }

  for (let i = 0; i < candidates.length; i++) {
    if (map[candidates[i]] !== undefined) {
      return map[candidates[i]];
    }
  }

  return -1;
}

function RF_requireColumns(sheetName, requiredColumns) {
  const map = RF_getCatalogMap(sheetName);
  const missing = [];

  requiredColumns.forEach(function(columnName) {
    const idx = RF_getColumnIndex(sheetName, columnName, []);
    if (idx < 0) {
      missing.push(columnName);
    }
  });

  if (missing.length > 0) {
    throw new Error('Missing required columns for ' + sheetName + ': ' + missing.join(', '));
  }

  return true;
}

function RF_resolveSourceField(sheetName, legacyName) {
  const canonical = RF_normalizeHeaderName(legacyName);
  const aliasMap = {
    MEMBERID: 'SOURCEID',
    SUPPLIERID: 'SOURCEID',
    ATTENDANCEID: 'SOURCEID',
    SOURCEID: 'SOURCEID'
  };

  const normalized = aliasMap[canonical] || canonical;
  const map = RF_getCatalogMap(sheetName);
  if (map[normalized] !== undefined) {
    return normalized;
  }

  for (const key in map) {
    const normalizedKey = RF_normalizeHeaderName(key);
    if (normalizedKey === canonical || aliasMap[normalizedKey] === normalized) {
      return normalizedKey;
    }
  }

  return canonical;
}

function RF_getSheetSchema(sheetName) {
  const rows = RF_getCatalogRows(sheetName);
  const headers = rows[0] || [];
  const schema = {
    sheetName: sheetName,
    headers: headers,
    mappedIndexes: RF_getCatalogMap(sheetName)
  };
  return schema;
}

function RF_syncCatalogToLedger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ledgerSheet = ss.getSheetByName('Ledger');
  if (!ledgerSheet) {
    return { ok: false, message: 'Ledger sheet not found' };
  }

  const headers = ledgerSheet.getRange(1, 1, 1, ledgerSheet.getLastColumn()).getValues()[0];
  const normalized = headers.map(function(header) {
    const key = RF_normalizeHeaderName(header);
    if (key === 'MEMBERID' || key === 'SUPPLIERID' || key === 'ATTENDANCEID') {
      return 'SOURCEID';
    }
    return header;
  });

  const row = normalized;
  ledgerSheet.getRange(1, 1, 1, row.length).setValues([row]);

  return { ok: true, message: 'Ledger headers aligned to SOURCEID canonical field' };
}
