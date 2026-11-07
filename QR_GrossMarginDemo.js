/** Read-only estimate using one unit per ledger receipt and today's catalogue costs. */
function getDemoGrossMargin() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) return { ok: false, message: 'Sign in with an authorized club Google account.' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const users = ss.getSheetByName('Users');
  if (!users || users.getLastRow() < 2) return { ok: false, message: 'Report access could not be verified.' };
  const norm = function(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const userRows = users.getDataRange().getValues(), userHeaders = userRows[0].map(norm);
  const emailCol = userHeaders.indexOf('EMAIL'), roleCol = userHeaders.indexOf('ROLE');
  const activeCol = userHeaders.indexOf('ACTIVEFLAG') >= 0 ? userHeaders.indexOf('ACTIVEFLAG') : userHeaders.indexOf('ACTIVE');
  if (emailCol < 0 || roleCol < 0 || activeCol < 0) return { ok: false, message: 'Users needs EMAIL, ROLE and ACTIVE_FLAG columns.' };
  const allowed = userRows.slice(1).some(function(row) {
    return String(row[emailCol] || '').trim().toLowerCase() === email &&
      ['CASHIER', 'MANAGER', 'ACCOUNTANT'].includes(String(row[roleCol] || '').trim().toUpperCase()) &&
      ['TRUE', 'YES', 'ACTIVE', '1'].includes(String(row[activeCol] || '').trim().toUpperCase());
  });
  if (!allowed) return { ok: false, message: 'Only an active Cashier, Manager or Accountant can view this report.' };
  const ledger = ss.getSheetByName('Ledger'), products = ss.getSheetByName('ProductTypes');
  if (!ledger || !products) return { ok: false, message: 'Ledger or ProductTypes sheet not found.' };
  const ledgerRows = ledger.getDataRange().getValues(), productRows = products.getDataRange().getValues();
  const lh = ledgerRows[0].map(norm), ph = productRows[0].map(norm);
  const requiredLedger = ['LEDGERID', 'TXNDATE', 'TXNTYPE', 'SOURCETAB', 'SIGNEDAMOUNT', 'PRODUCTID'];
  const requiredProduct = ['PRODUCTID', 'NAME', 'STCAT', 'BASECOST'];
  const missing = requiredLedger.filter(function(h) { return lh.indexOf(h) < 0; }).map(function(h) { return 'Ledger.' + h; })
    .concat(requiredProduct.filter(function(h) { return ph.indexOf(h) < 0; }).map(function(h) { return 'ProductTypes.' + h; }));
  if (missing.length) return { ok: false, message: 'Missing required columns: ' + missing.join(', ') + '.' };
  const col = function(headers, name) { return headers.indexOf(name); };
  const catalogue = Object.create(null), duplicateIds = Object.create(null);
  productRows.slice(1).forEach(function(row) {
    const id = String(row[col(ph, 'PRODUCTID')] || '').trim().toUpperCase();
    if (!id) return;
    if (catalogue[id]) { duplicateIds[id] = true; return; }
    catalogue[id] = { name: String(row[col(ph, 'NAME')] || '').trim(), category: String(row[col(ph, 'STCAT')] || '').trim(), cost: row[col(ph, 'BASECOST')] };
  });
  const result = [], warnings = [];
  let sales = 0, cost = 0;
  ledgerRows.slice(1).forEach(function(row, index) {
    const tab = norm(row[col(lh, 'SOURCETAB')]), type = norm(row[col(lh, 'TXNTYPE')]);
    if (tab !== 'RECEIPTS' && !(tab === 'ATTENDANCE' && type === 'RCP')) return;
    const label = String(row[col(lh, 'LEDGERID')] || '').trim() || 'Ledger row ' + (index + 2);
    const amountRaw = row[col(lh, 'SIGNEDAMOUNT')], amount = Number(amountRaw);
    if (amountRaw === '' || amountRaw === null || !Number.isFinite(amount)) { warnings.push(label + ': invalid sales amount; excluded.'); return; }
    if (amount <= 0) return;
    const id = String(row[col(lh, 'PRODUCTID')] || '').trim().toUpperCase();
    if (!id || !catalogue[id] || duplicateIds[id]) { warnings.push(label + ': product ' + (id || '(blank)') + ' missing or duplicated in ProductTypes; excluded.'); return; }
    const product = catalogue[id], category = norm(product.category);
    if (!category) { warnings.push(label + ': STCAT is blank for ' + id + '; excluded.'); return; }
    if (category === 'MATFEES' || category === 'DONATIONS') return;
    const rawCost = product.cost, unitCost = Number(rawCost);
    if (rawCost === '' || rawCost === null || !Number.isFinite(unitCost) || unitCost < 0) {
      warnings.push(label + ': BASECOST is missing or invalid for ' + id + '; excluded.'); return;
    }
    const date = row[col(lh, 'TXNDATE')];
    result.push({ ledgerId: label, date: date instanceof Date && !isNaN(date.getTime()) ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(date || ''), productId: id, name: product.name || id, category: product.category, sale: amount, cost: unitCost, margin: amount - unitCost });
    sales += amount; cost += unitCost;
  });
  return { ok: true, data: { rows: result.reverse(), sales: sales, cost: cost, margin: sales - cost, warnings: warnings } };
}

function getDemoGrossMarginPage() {
  return HtmlService.createHtmlOutputFromFile('GrossMargin_Demo')
    .setTitle('Akamas SMBC — Gross Margin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
