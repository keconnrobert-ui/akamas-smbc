/**
 * Akamas SMBC - Standalone Product Manager Bridge
 * Calls the exact same functions used by UI_Dashboard.html
 */

function getProductsStandalone() {
  const list = fetchAllProductTypesList();
  return { success: true, products: list };
}

function saveProductStandalone(sku, name, price, activeFlag) {
  return updateProductRecordAtomic(sku, name, price, activeFlag);
}
