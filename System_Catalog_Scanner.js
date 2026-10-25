/**
 * AKAMAS BOWLS CLUB - ENHANCED LIVE SYSTEM CATALOG SCANNER
 * Version 2.1
 * 
 * Adapted from SMBC v1.1.1 Model_Catalog_Scanner.gs
 * Interrogates all sheets at runtime and builds a live System_Catalog
 * that maps every column to its index for dynamic code references
 */

/**
 * Check if System_Catalog is stale (> 1 hour old)
 */
function isCatalogStale() {
  try {
    const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
    if (!configSheet) return true;
    
    const data = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 2).getValues();
    let lastCatalogRefresh = null;
    
    for (let row of data) {
      if (row[0] === 'LAST_CATALOG_REFRESH') {
        lastCatalogRefresh = new Date(row[1]);
        break;
      }
    }
    
    if (!lastCatalogRefresh) return true; // Never run
    
    const now = new Date();
    const ageMs = now.getTime() - lastCatalogRefresh.getTime();
    return ageMs > 3600000; // > 1 hour
  } catch (err) {
    Logger.log('isCatalogStale error: ' + err.message);
    return true;
  }
}

function runAkamasLiveSystemCatalogScanner() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Ensure System_Catalog sheet exists
  let catalogSheet = ss.getSheetByName("System_Catalog");
  if (!catalogSheet) {
    catalogSheet = ss.insertSheet("System_Catalog", 0); // Insert at start
  }
  catalogSheet.clear();
  
  // 2. Skip UI sheets (only scan data sheets)
  const uiSheets = ["System_Catalog", "System_Diagnostics", "UI_Dashboard", "MobileKiosk", "ReceptionQR", "Front_End"];
  
  // 3. Build in-memory matrix (RAM first, then single flush write)
  const bulkCatalogMatrix = [];
  bulkCatalogMatrix.push(["Sheet Name", "Field Name", "Column Letter", "Column Index"]);
  
  // 4. INTERROGATE ALL SHEETS
  ss.getSheets().forEach(sheet => {
    const tabName = sheet.getName();
    
    // Skip UI sheets
    if (uiSheets.includes(tabName)) return;
    
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return; // Skip empty sheets
    
    // Fetch entire header row in ONE call
    const headerRowValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // 5. For each column, create a catalog entry
    headerRowValues.forEach((fieldName, colIdx) => {
      const cleanFieldName = fieldName.toString().trim();
      
      if (cleanFieldName === "") return; // Skip blank columns
      
      // Convert column index to letter (A, B, C, etc.)
      const colLetter = sheet.getRange(1, colIdx + 1).getA1Notation().replace(/[0-9]/g, "");
      
      // Push entry to matrix
      bulkCatalogMatrix.push([
        tabName,
        cleanFieldName,
        colLetter,
        (colIdx + 1) // 1-indexed column number
      ]);
    });
  });
  
  // 6. SINGLE FLASH WRITE: Entire matrix to sheet at once
  if (bulkCatalogMatrix.length > 1) {
    catalogSheet.getRange(1, 1, bulkCatalogMatrix.length, 4).setValues(bulkCatalogMatrix);
  }
  
  // 7. Format the header row
  catalogSheet.getRange(1, 1, 1, 4)
    .setFontWeight("bold")
    .setBackground("#2f3542")
    .setFontColor("#ffffff");
  
  // Auto-fit columns
  catalogSheet.setColumnWidth(1, 150);
  catalogSheet.setColumnWidth(2, 200);
  catalogSheet.setColumnWidth(3, 120);
  catalogSheet.setColumnWidth(4, 120);
  
  // 8. Add freeze pane
  catalogSheet.setFrozenRows(1);
  
  // 9. Update System_Config LAST_CATALOG_REFRESH timestamp
  updateSystemConfigTimestamp('LAST_CATALOG_REFRESH', new Date().toISOString());
  
  SpreadsheetApp.flush();
  
  const rowCount = bulkCatalogMatrix.length - 1;
  Logger.log(`✅ System Catalog Complete: ${rowCount} columns mapped across ${ss.getSheets().length - uiSheets.length} data sheets`);
}

/**
 * Get column index for a field in a sheet using System_Catalog
 * @param {string} sheetName - Name of the data sheet
 * @param {string} fieldName - Column header to find
 * @returns {number} 1-indexed column number, or null if not found
 */
function getCatalogColumnIndex(sheetName, fieldName) {
  const catalogSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("System_Catalog");
  if (!catalogSheet) {
    throw new Error("System_Catalog sheet not found. Run runAkamasLiveSystemCatalogScanner() first.");
  }
  
  const data = catalogSheet.getRange(2, 1, catalogSheet.getLastRow() - 1, 4).getValues();
  for (let row of data) {
    if (row[0] === sheetName && row[1] === fieldName) {
      return row[3]; // Column Index (1-indexed)
    }
  }
  
  Logger.log(`⚠️ Field '${fieldName}' not found in sheet '${sheetName}'`);
  return null;
}

/**
 * Get all columns for a sheet
 * @param {string} sheetName - Name of the data sheet
 * @returns {Object} Map of fieldName -> columnIndex
 */
function getCatalogColumnsForSheet(sheetName) {
  const catalogSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("System_Catalog");
  if (!catalogSheet) {
    throw new Error("System_Catalog sheet not found.");
  }
  
  const data = catalogSheet.getRange(2, 1, catalogSheet.getLastRow() - 1, 4).getValues();
  const columnMap = {};
  
  for (let row of data) {
    if (row[0] === sheetName) {
      columnMap[row[1]] = row[3]; // fieldName -> columnIndex
    }
  }
  
  return columnMap;
}

function updateSystemConfigTimestamp(paramKey, paramValue) {
  try {
    const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Config');
    if (!configSheet) return;
    
    const data = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === paramKey) {
        configSheet.getRange(i + 2, 2).setValue(paramValue);
        return;
      }
    }
    
    // If not found, append new row
    configSheet.appendRow([paramKey, paramValue]);
  } catch (err) {
    Logger.log('updateSystemConfigTimestamp error: ' + err.message);
  }
}

function showDiagnostics() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const diagnosticsSheet = ss.getSheetByName('System_Diagnostics') || ss.insertSheet('System_Diagnostics');
  diagnosticsSheet.clear();
  
  const info = [];
  info.push(['Diagnostic Report', new Date().toISOString()]);
  info.push(['']);
  info.push(['Sheet', 'Rows', 'Columns', 'Status']);
  
  const uiSheets = ["System_Catalog", "System_Diagnostics", "UI_Dashboard"];
  ss.getSheets().forEach(sheet => {
    if (!uiSheets.includes(sheet.getName())) {
      info.push([
        sheet.getName(),
        sheet.getLastRow(),
        sheet.getLastColumn(),
        sheet.getLastRow() > 1 ? 'OK' : 'Empty'
      ]);
    }
  });
  
  diagnosticsSheet.getRange(1, 1, info.length, 4).setValues(info);
  Logger.log('✅ Diagnostics written to System_Diagnostics sheet');
}
