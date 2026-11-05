/** Returns active revenue products with cashier-safe catalogue fields only. */
function getDemoRevenueProducts() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ProductTypes');
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, message: 'ProductTypes has no product rows.', data: [] };
  const values = sheet.getDataRange().getValues();
  const normalize = function(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  const headers = values[0].map(normalize);
  const find = function(names) {
    for (let i = 0; i < names.length; i++) {
      const index = headers.indexOf(normalize(names[i]));
      if (index >= 0) return index;
    }
    return -1;
  };
  const idCol = find(['PRODUCTID']);
  const nameCol = find(['NAME']);
  const incomeCol = find(['CATEGORY']);
  const priceCol = find(['PRICE', 'SHELFPRICE']);
  const stockCatCol = find(['STCAT']);
  const activeCol = find(['ACTIVE']);
  const coverageCol = find(['COVERAGEMONTHS']);
  const sessionsCol = find(['SESSIONSPERCYCLE']);
  if (idCol < 0 || nameCol < 0 || stockCatCol < 0 || priceCol < 0) {
    return { ok: false, message: 'ProductTypes needs PRODUCTID, NAME, STCAT and PRICE (or SHELFPRICE) headers.', data: [] };
  }
  const products = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const productId = String(row[idCol] || '').trim();
    if (!productId) continue;
    const active = activeCol < 0 || row[activeCol] === true || ['TRUE', 'YES', 'ACTIVE', '1'].includes(String(row[activeCol] || '').trim().toUpperCase());
    if (!active) continue;
    const rawPrice = row[priceCol];
    const parsedPrice = typeof rawPrice === 'number' ? rawPrice : Number(String(rawPrice || '').replace(/[€,£\s,]/g, ''));
    const coverageMonths = coverageCol < 0 ? 0 : (parseInt(row[coverageCol], 10) || 0);
    const sessionsPerCycle = sessionsCol < 0 ? 0 : (parseInt(row[sessionsCol], 10) || 0);
    const rawCategory = String(row[stockCatCol] || '').trim() || 'Uncategorised';
    products.push({
      productId: productId,
      name: String(row[nameCol] || '').trim(),
      incomeCategory: incomeCol < 0 ? '' : String(row[incomeCol] || '').trim(),
      stockCategory: rawCategory,
      stockCategoryKey: normalize(rawCategory),
      price: isFinite(parsedPrice) ? parsedPrice : null,
      coverageMonths: coverageMonths,
      sessionsPerCycle: sessionsPerCycle
    });
  }
  return { ok: true, message: products.length ? 'Active products loaded from ProductTypes.' : 'No active products found.', data: products };
}

/** Serves the separate cashier revenue-products catalogue page. */
function getCashierRevenueProductsPage() {
  return HtmlService.createHtmlOutputFromFile('Cashier_RevenueProducts')
    .setTitle('Akamas SMBC — Revenue Products')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
