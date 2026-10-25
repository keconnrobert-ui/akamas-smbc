// ============================================================================
// QR_Generator.gs: Daily QR Code Generation at 05:00 AM
// ============================================================================

/**
 * Main function: Generate QR code daily and store in Script Properties
 * Call via time-based trigger (05:00 AM every day)
 */
function generateDailyQRCode() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetId = ss.getId();
    
    // Build QR data: sheet ID + today's date
    const today = new Date();
    const dateStr = Utilities.formatDate(today, 'GMT', 'yyyy-MM-dd');
    const qrData = `AKAMAS_${sheetId.substring(0, 8)}_${dateStr}`;
    
    // Generate QR code URL (using qr-server API)
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;
    
    // Store in Script Properties for ReceptionQR.html to retrieve
    const props = PropertiesService.getScriptProperties();
    props.setProperty('DAILY_QR_URL', qrUrl);
    props.setProperty('DAILY_QR_DATA', qrData);
    props.setProperty('DAILY_QR_GENERATED', today.toISOString());
    
    // Log generation
    logAudit('QR_GENERATED', 'QR_Generator', null, 
      `QR Code: ${qrData}, URL: ${qrUrl}`);
    
    return { success: true, qrData: qrData, qrUrl: qrUrl };
  } catch (error) {
    logAudit('ERROR', 'generateDailyQRCode', null, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieve current QR code (called by ReceptionQR.html)
 */
function getDailyQRCode() {
  try {
    const props = PropertiesService.getScriptProperties();
    const qrUrl = props.getProperty('DAILY_QR_URL');
    const qrData = props.getProperty('DAILY_QR_DATA');
    const generated = props.getProperty('DAILY_QR_GENERATED');
    
    if (!qrUrl) {
      // Generate if missing
      const result = generateDailyQRCode();
      return result;
    }
    
    return {
      success: true,
      qrUrl: qrUrl,
      qrData: qrData,
      generatedAt: generated
    };
  } catch (error) {
    logAudit('ERROR', 'getDailyQRCode', null, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Setup time-based trigger for 05:00 AM daily
 * Run this once during deployment to activate daily QR generation
 */
function setupDailyQRTrigger() {
  try {
    // Delete existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'generateDailyQRCode') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Create new daily trigger at 05:00 AM
    ScriptApp.newTrigger('generateDailyQRCode')
      .timeBased()
      .atHour(5)
      .everyDays(1)
      .create();
    
    logAudit('TRIGGER_SETUP', 'QR_Generator', null, 
      'Daily QR trigger set to 05:00 AM');
    
    return { success: true, message: 'Daily QR trigger activated' };
  } catch (error) {
    logAudit('ERROR', 'setupDailyQRTrigger', null, error.message);
    return { success: false, error: error.message };
  }
}

// End QR_Generator.gs
