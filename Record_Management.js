/**
 * Akamas Short Mat Bowls Club - Master Records Management Engine
 * Safe Unified Build: Object-mapped readers + Atomic header-indexed writers
 */

/**
 * Helper: Converts a headers array and a row values array into a keyed object.
 */
function getRowAsObject_(headers, rowValues) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    const key = String(headers[i] || "").trim().toUpperCase().replace(/[\s_]/g, "");
    if (key) obj[key] = rowValues[i];
  }
  return obj;
}

/**
 * Helper: Finds exact 0-indexed column position by uppercase normalized name.
 */
function getHeaderIndex_(headers, possibleNames) {
  const cleanHeaders = headers.map(h => String(h || "").trim().toUpperCase().replace(/[\s_]/g, ""));
  for (let name of possibleNames) {
    const target = name.toUpperCase().replace(/[\s_]/g, "");
    const idx = cleanHeaders.indexOf(target);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ==========================================
// 1. READERS (OBJECT-MAPPED VIA UPPERCASE HEADERS)
// ==========================================

function fetchAllMembersList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Members");
  if (!sheet) return [];
  
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(r => {
    const obj = getRowAsObject_(headers, r);
    const memberId = String(obj["MEMBERID"] || "").trim();
    if (!memberId) return null;

    const rawActive = obj["ACTIVE"];
    const isActiveStr = (rawActive === true || String(rawActive).trim().toUpperCase() === "TRUE") ? "TRUE" : "FALSE";

    const lastPaidVal = obj["LASTPAIDDATE"];
    const nextDueVal = obj["NEXTSUBSCRIPTIONDUE"];

    return {
      id: memberId,
      name: String(obj["FULLNAME"] || "").trim(),
      status: String(obj["STATUS"] || "Active").trim(),
      tel: String(obj["TELEPHONE"] || "").replace(/'/g, "").trim(),
      whatsapp: String(obj["WHATSAPP"] || "").trim(),
      email: String(obj["EMAIL"] || "").trim(),
      add1: String(obj["ADDRESSLINE1"] || "").trim(),
      add2: String(obj["ADDRESSLINE2"] || "").trim(),
      city: String(obj["CITY"] || "").trim(),
      postcode: String(obj["POSTCODE"] || "").trim(),
      country: String(obj["COUNTRY"] || "").trim(),
      productId: String(obj["PRODUCTID"] || "").trim(),
      lastPaid: lastPaidVal instanceof Date ? Utilities.formatDate(lastPaidVal, "Asia/Nicosia", "yyyy-MM-dd") : String(lastPaidVal || ""),
      nextDue: nextDueVal instanceof Date ? Utilities.formatDate(nextDueVal, "Asia/Nicosia", "yyyy-MM-dd") : String(nextDueVal || ""),
      active: isActiveStr
    };
  }).filter(m => m !== null);
}

function fetchAllProductTypesList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("ProductTypes");
  if (!sheet) return [];
  
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  
  const headers = values[0];
  const rows = values.slice(1);

  return rows.map(r => {
    const obj = getRowAsObject_(headers, r);
    const prodId = String(obj["PRODUCTID"] || "").trim();
    if (!prodId) return null;

    const rawActive = obj["ACTIVE"];
    const isActiveBool = (rawActive === true || String(rawActive).trim().toUpperCase() === "TRUE");

    return {
      id: prodId,
      name: String(obj["NAME"] || "").trim(),
      category: String(obj["CATEGORY"] || "Subscription Sale").trim(),
      price: parseFloat(obj["PRICE"]) || 0,
      coverageMonths: parseInt(obj["COVERAGEMONTHS"], 10) || 0,
      isActive: isActiveBool
    };
  }).filter(p => p !== null);
}

// ==========================================
// 2. ATOMIC WRITERS (HEADER-INDEXED FOR SAFETY)
// ==========================================

function updateMemberRecordAtomic(memberID, fields) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Members");
  if (!sheet) return { success: false, error: "Members sheet missing." };
  
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { success: false, error: "No data rows." };
  
  const headers = values[0];
  const idxId       = getHeaderIndex_(headers, ["MEMBERID", "MEMBER ID", "ID"]);
  const idxName     = getHeaderIndex_(headers, ["FULLNAME", "FULL NAME", "NAME"]);
  const idxStatus   = getHeaderIndex_(headers, ["STATUS"]);
  const idxTel      = getHeaderIndex_(headers, ["TELEPHONE", "PHONE", "TEL"]);
  const idxWa       = getHeaderIndex_(headers, ["WHATSAPP", "WA"]);
  const idxEmail    = getHeaderIndex_(headers, ["EMAIL"]);
  const idxAdd1     = getHeaderIndex_(headers, ["ADDRESSLINE1", "ADDRESS 1", "ADDRESS"]);
  const idxAdd2     = getHeaderIndex_(headers, ["ADDRESSLINE2", "ADDRESS 2"]);
  const idxCity     = getHeaderIndex_(headers, ["CITY"]);
  const idxPostcode = getHeaderIndex_(headers, ["POSTCODE", "ZIP"]);
  const idxCountry  = getHeaderIndex_(headers, ["COUNTRY"]);
  const idxActive   = getHeaderIndex_(headers, ["ACTIVE"]);

  if (idxId === -1) return { success: false, error: "MEMBERID column not found." };

  const cleanId = String(memberID).trim().toUpperCase();

  for (let i = 1; i < values.length; i++) {
    const rowId = String(values[i][idxId] || "").trim().toUpperCase();
    if (rowId === cleanId) {
      const physicalRow = i + 1; // 1-based sheet row index

      if (idxName !== -1 && fields.name !== undefined)     sheet.getRange(physicalRow, idxName + 1).setValue(String(fields.name).trim());
      if (idxStatus !== -1 && fields.status !== undefined) sheet.getRange(physicalRow, idxStatus + 1).setValue(String(fields.status).trim());
      if (idxTel !== -1 && fields.tel !== undefined)       sheet.getRange(physicalRow, idxTel + 1).setValue("'" + String(fields.tel).replace(/'/g, ""));
      if (idxWa !== -1 && fields.whatsapp !== undefined)   sheet.getRange(physicalRow, idxWa + 1).setValue(String(fields.whatsapp).trim());
      if (idxEmail !== -1 && fields.email !== undefined)   sheet.getRange(physicalRow, idxEmail + 1).setValue(String(fields.email).trim());
      if (idxAdd1 !== -1 && fields.add1 !== undefined)     sheet.getRange(physicalRow, idxAdd1 + 1).setValue(String(fields.add1));
      if (idxAdd2 !== -1 && fields.add2 !== undefined)     sheet.getRange(physicalRow, idxAdd2 + 1).setValue(String(fields.add2));
      if (idxCity !== -1 && fields.city !== undefined)     sheet.getRange(physicalRow, idxCity + 1).setValue(String(fields.city));
      if (idxPostcode !== -1 && fields.postcode !== undefined) sheet.getRange(physicalRow, idxPostcode + 1).setValue(String(fields.postcode));
      if (idxCountry !== -1 && fields.country !== undefined)   sheet.getRange(physicalRow, idxCountry + 1).setValue(String(fields.country));
      
      if (idxActive !== -1 && fields.active !== undefined) {
        const isFalse = String(fields.active).trim().toUpperCase() === "FALSE";
        sheet.getRange(physicalRow, idxActive + 1).setValue(isFalse ? false : true);
      }

      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  return { success: false, error: `MemberID ${cleanId} not matched.` };
}

function updateProductRecordAtomic(productID, name, price, isActiveFlag) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("ProductTypes");
  if (!sheet) return { success: false, error: "ProductTypes sheet missing." };
  
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { success: false, error: "No product rows." };

  const headers = values[0];
  const idxId     = getHeaderIndex_(headers, ["PRODUCTID", "PRODUCT ID", "SKU"]);
  const idxName   = getHeaderIndex_(headers, ["NAME", "PRODUCTNAME"]);
  const idxPrice  = getHeaderIndex_(headers, ["PRICE", "SHELFPRICE"]);
  const idxActive = getHeaderIndex_(headers, ["ACTIVE"]);

  if (idxId === -1) return { success: false, error: "PRODUCTID column not found." };

  const cleanSku = String(productID).trim().toUpperCase();

  for (let i = 1; i < values.length; i++) {
    const rowSku = String(values[i][idxId] || "").trim().toUpperCase();
    if (rowSku === cleanSku) {
      const physicalRow = i + 1;
      const writeBool = (isActiveFlag === true || String(isActiveFlag).trim().toUpperCase() === "TRUE") ? true : false;

      if (idxName !== -1)   sheet.getRange(physicalRow, idxName + 1).setValue(String(name).trim());
      if (idxPrice !== -1)  sheet.getRange(physicalRow, idxPrice + 1).setValue(parseFloat(price) || 0);
      if (idxActive !== -1) sheet.getRange(physicalRow, idxActive + 1).setValue(writeBool);

      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  return { success: false, error: `Product SKU ${cleanSku} not found.` };
}

function toggleProductActiveStatus(productID, toggleFlag) {
  const list = fetchAllProductTypesList();
  const match = list.find(p => p.id.toUpperCase() === String(productID).toUpperCase());
  if (!match) return { success: false, error: "Product not found." };
  return updateProductRecordAtomic(productID, match.name, match.price, toggleFlag);
}
