/**
 * Akamas Short Mat Bowls Club — Consolidated Workspace Launcher
 * File: SystemStartup.gs
 * Version: 2.6.0-Dynamic Build (Schema-Agnostic Core)
 * Governing Architecture: Resolves view states using metadata column maps.
 */

var SPREADSHEET_ID = "1AZLvU80Y5GJGPJi4GJ6wrGTTU_g4hQzNqAfeinfMuTk";

/**
 * 🛠️ AUTOMATED SYSTEM ENTRY POINT MENU
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu("🎳 SMBC Management")
    .addItem("🎯 Launch Operations Terminal", "launchSystemWorkspace")
    .addSeparator()
    .addItem("🔍 Run Forensic Integrity Audit", "executeForensicSystemAudit")
    .addItem("🛡️ Apply Rigid Sheet Protection", "lockProductionSheetsNatively")
    .addToUi();
}

/**
 * 🚀 DYNAMIC ROLE-BASED UI LAUNCHER
 */
function launchSystemWorkspace() {
  var ui = SpreadsheetApp.getUi();
  var userEmail = Session.getActiveUser().getEmail() || "SYSTEM";
  
  // Resolve authentic identity row dynamically using schema headers
  var userProfile = fetchUserMetadataRecord_(userEmail);
  if (!userProfile || userProfile.ACTIVE_FLAG !== "TRUE") {
    ui.alert("⚠️ Security Access Revoked", "User email '" + userEmail + "' is not registered or active inside the club configuration tables.", ui.ButtonSet.OK);
    return;
  }
  
  var targetHtmlFile = "Front_End"; // Default fallback interface shell container
  var interfaceTitle = "Akamas SMBC — Cashier Workspace Console";
  
  // Enforce explicit Role-Based Access Control view boundaries
  if (userProfile.ROLE === "Manager" || userProfile.ROLE === "Accountant") {
    targetHtmlFile = "UI_Dashboard";
    interfaceTitle = "Akamas SMBC — Executive Management Terminal";
  } else if (userProfile.ROLE === "Bowler") {
    targetHtmlFile = "MobileKiosk";
    interfaceTitle = "Akamas SMBC — Member Check-In Hub";
  }
  
  try {
    var template = HtmlService.createTemplateFromFile(targetHtmlFile);
    template.userEmail = userEmail;
    template.userRole = userProfile.ROLE;
    
    var htmlOutput = template.evaluate()
      .setTitle(interfaceTitle)
      .setWidth(1200)
      .setHeight(750)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
      
    // Launch natively as an elegant, non-modal screen sidebar cockpit
    ui.showSidebar(htmlOutput);
    
  } catch (err) {
    ui.alert("❌ Viewport Initialization Failure", "Could not compile panel '" + targetHtmlFile + "': " + err.message, ui.ButtonSet.OK);
  }
}

/**
 * 📊 DYNAMIC SCHEMA EXTROLLER LOOKUP
 * Automatically maps column values using text header keys, eliminating hardcoded column indexes.
 */
function fetchUserMetadataRecord_(email) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Users");
    if (!sheet) return null;
    
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).toUpperCase().trim(); });
    
    // Resolve dynamic cell positioning locations out from your schema configuration
    var idIdx = headers.indexOf("USERID");
    var emailIdx = headers.indexOf("EMAIL");
    var roleIdx = headers.indexOf("ROLE");
    var activeIdx = headers.indexOf("ACTIVE_FLAG");
    
    // Fallback search parameters safety configuration check
    if (emailIdx === -1 || roleIdx === -1 || activeIdx === -1) {
      Logger.log("Schema Error: Users sheet is missing core system structural headers.");
      return null;
    }
    
    var cleanSearchEmail = String(email).trim().toLowerCase();
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowEmail = String(row[emailIdx]).trim().toLowerCase();
      
      if (rowEmail === cleanSearchEmail) {
        return {
          USERID: idIdx !== -1 ? row[idIdx] : "UNKNOWN",
          EMAIL: row[emailIdx],
          ROLE: String(row[roleIdx]).trim(),
          ACTIVE_FLAG: String(row[activeIdx]).trim().toUpperCase()
        };
      }
    }
  } catch (e) {
    Logger.log("Metadata verification loop exception: " + e.message);
  }
  return null;
}

/**
 * 🎛️ SIDEBAR INTERMEDIARY EXECUTORS
 */
function executeForensicSystemAudit() {
  if (typeof runComprehensiveForensicAudit === "function") {
    var result = runComprehensiveForensicAudit();
    SpreadsheetApp.getUi().alert("Forensic Status: " + result.status, JSON.stringify(result.summary, null, 2), SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    SpreadsheetApp.getUi().alert("Error", "Forensic engine module not found.", SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

function lockProductionSheetsNatively() {
  if (typeof applyStructuralSheetProtection === "function") {
    applyStructuralSheetProtection();
    SpreadsheetApp.getUi().alert("Success", "Role-based sheet block layers successfully applied.", SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
// [EOF: SystemStartup.gs]
