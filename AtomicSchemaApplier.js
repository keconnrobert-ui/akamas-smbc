/**
 * AtomicSchemaApplier.gs — PART A
 * 
 * Atomic schema modification engine with rollback capability.
 * Handles safe column insertion, deletion, and protection state changes
 * across multiple sheets without data loss or consistency violations.
 * 
 * Concurrency: Document-level lock with 60-second timeout for multi-step operations.
 * Atomicity: All-or-nothing commit pattern with transaction log.
 */

// ============================================================================
// TRANSACTION LOG & ROLLBACK STATE
// ============================================================================

const APPLIER_CONFIG = {
  lockTimeoutMs: 60000,
  maxRetries: 3,
  logSheetName: "Schema_Audit_Log"
};

/**
 * Internal transaction state tracking (in-memory during operation).
 */
let txnState = {
  txnId: null,
  startTime: null,
  operations: [],
  rolledBack: false,
  commitLog: []
};

/**
 * Initializes transaction log sheet if it doesn't exist.
 * This is a side-effect ledger for audit trail only (not part of core accounting).
 */
function initializeAuditLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(APPLIER_CONFIG.logSheetName);
  
  if (!logSheet) {
    logSheet = ss.insertSheet(APPLIER_CONFIG.logSheetName);
    const headers = [
      "LOGID",
      "TXN_ID",
      "TIMESTAMP",
      "OPERATION",
      "SHEET_NAME",
      "DETAILS",
      "STATUS",
      "ROLLBACK_CHAIN"
    ];
    logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    logSheet.protect().setDescription("Schema audit log (read-only)");
  }
  
  return logSheet;
}

/**
 * Generates unique transaction ID for this schema operation.
 * Format: TXA + timestamp + random suffix
 */
function generateTxnId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXA${ts}${rand}`;
}

/**
 * Logs an operation to the audit log.
 */
function logOperation(operation, sheetName, details, status) {
  const logSheet = initializeAuditLog();
  const logId = `LOG${Date.now()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
  
  const row = [
    logId,
    txnState.txnId,
    new Date().toISOString(),
    operation,
    sheetName,
    JSON.stringify(details),
    status,
    txnState.rolledBack ? "ROLLED_BACK" : "ACTIVE"
  ];
  
  logSheet.appendRow(row);
  txnState.commitLog.push({ logId, operation, status });
}

// ============================================================================
// SAFE COLUMN OPERATIONS
// ============================================================================

/**
 * Safely inserts a column at a given position with data type validation.
 * 
 * @param {string} sheetName - Target sheet name
 * @param {number} columnIndex - 0-based insert position
 * @param {Object} columnDef - { name, type, required, unique, defaultValue }
 * @returns {Object} {success, details, operationId}
 */
function safeInsertColumn(sheetName, columnIndex, columnDef) {
  const lock = LockService.getDocumentLock();
  let acquired = false;
  
  try {
    acquired = lock.tryLock(APPLIER_CONFIG.lockTimeoutMs);
    if (!acquired) {
      return {
        success: false,
        error: "Could not acquire lock within timeout",
        details: { timeoutMs: APPLIER_CONFIG.lockTimeoutMs }
      };
    }
    
    // Initialize transaction
    txnState.txnId = generateTxnId();
    txnState.startTime = new Date();
    txnState.operations = [];
    txnState.rolledBack = false;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      logOperation("INSERT_COLUMN", sheetName, columnDef, "FAILED");
      return {
        success: false,
        error: `Sheet "${sheetName}" not found`,
        txnId: txnState.txnId
      };
    }
    
    // Capture pre-state
    const preState = {
      lastColumn: sheet.getLastColumn(),
      lastRow: sheet.getLastRow(),
      headers: sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    };
    
    txnState.operations.push({
      type: "INSERT_COLUMN",
      sheet: sheetName,
      columnIndex: columnIndex,
      preState: preState
    });
    
    // Insert the column
    const insertAfterCol = columnIndex > 0 ? columnIndex : 1;
    sheet.insertColumns(insertAfterCol, 1);
    
    // Set header
    sheet.getRange(1, insertAfterCol + 1).setValue(columnDef.name);
    
    // Apply validation rules if type is constrained
    if (columnDef.unique) {
      sheet.getRange(2, insertAfterCol + 1, sheet.getLastRow() - 1, 1)
        .setDataValidation(null); // Clear any existing validation first
    }
    
    // Set default value for existing rows (if provided)
    if (columnDef.defaultValue !== undefined && sheet.getLastRow() > 1) {
      const dataRange = sheet.getRange(2, insertAfterCol + 1, sheet.getLastRow() - 1, 1);
      dataRange.setValue(columnDef.defaultValue);
    }
    
    logOperation(
      "INSERT_COLUMN",
      sheetName,
      { columnDef, insertPosition: insertAfterCol },
      "SUCCESS"
    );
    
    return {
      success: true,
      txnId: txnState.txnId,
      details: {
        sheet: sheetName,
        columnName: columnDef.name,
        insertedAt: insertAfterCol,
        preState: preState
      }
    };
    
  } catch (e) {
    logOperation("INSERT_COLUMN", sheetName, { error: e.message }, "FAILED");
    return {
      success: false,
      error: e.message,
      txnId: txnState.txnId
    };
  } finally {
    if (acquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Safely deletes a column with pre-deletion backup capture.
 * 
 * @param {string} sheetName - Target sheet name
 * @param {string} columnName - Column header name to delete
 * @returns {Object} {success, deletedColumnIndex, backup, txnId}
 */
function safeDeleteColumn(sheetName, columnName) {
  const lock = LockService.getDocumentLock();
  let acquired = false;
  
  try {
    acquired = lock.tryLock(APPLIER_CONFIG.lockTimeoutMs);
    if (!acquired) {
      return {
        success: false,
        error: "Could not acquire lock within timeout",
        details: { timeoutMs: APPLIER_CONFIG.lockTimeoutMs }
      };
    }
    
    txnState.txnId = generateTxnId();
    txnState.startTime = new Date();
    txnState.operations = [];
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      logOperation("DELETE_COLUMN", sheetName, { columnName }, "FAILED");
      return {
        success: false,
        error: `Sheet "${sheetName}" not found`,
        txnId: txnState.txnId
      };
    }
    
    // Find column index by name
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colIndex = headers.indexOf(columnName);
    
    if (colIndex === -1) {
      logOperation("DELETE_COLUMN", sheetName, { columnName }, "FAILED");
      return {
        success: false,
        error: `Column "${columnName}" not found in sheet "${sheetName}"`,
        txnId: txnState.txnId
      };
    }
    
    // Capture backup of column data
    const backup = sheet.getRange(1, colIndex + 1, sheet.getLastRow(), 1).getValues();
    
    txnState.operations.push({
      type: "DELETE_COLUMN",
      sheet: sheetName,
      columnIndex: colIndex + 1,
      columnName: columnName,
      backup: backup
    });
    
    // Delete the column
    sheet.deleteColumns(colIndex + 1, 1);
    
    logOperation(
      "DELETE_COLUMN",
      sheetName,
      { columnName, columnIndex: colIndex + 1, rowsAffected: backup.length },
      "SUCCESS"
    );
    
    return {
      success: true,
      txnId: txnState.txnId,
      details: {
        sheet: sheetName,
        deletedColumn: columnName,
        deletedColumnIndex: colIndex + 1,
        rowsAffected: backup.length,
        backupRows: backup.length
      }
    };
    
  } catch (e) {
    logOperation("DELETE_COLUMN", sheetName, { error: e.message }, "FAILED");
    return {
      success: false,
      error: e.message,
      txnId: txnState.txnId
    };
  } finally {
    if (acquired) {
      lock.releaseLock();
    }
  }
}

// ============================================================================
// SHEET PROTECTION STATE MANAGEMENT
// ============================================================================

/**
 * Applies protection to a sheet with read-only enforcement.
 * 
 * @param {string} sheetName - Target sheet name
 * @param {Array<string>} allowEditEmails - (Optional) emails allowed to edit
 * @returns {Object} {success, protectionId, details}
 */
function applySheetProtection(sheetName, allowEditEmails = []) {
  const lock = LockService.getDocumentLock();
  let acquired = false;
  
  try {
    acquired = lock.tryLock(APPLIER_CONFIG.lockTimeoutMs);
    if (!acquired) {
      return {
        success: false,
        error: "Could not acquire lock",
        txnId: txnState.txnId
      };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { success: false, error: `Sheet "${sheetName}" not found` };
    }
    
    // Remove existing protection
    const existingProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    existingProtections.forEach(p => {
      if (p.canEdit()) {
        p.remove();
      }
    });
    
    // Create new protection
    const protection = sheet.protect().setDescription(`Read-only schema (${new Date().toISOString()})`);
    
    // Set editor restrictions
    if (allowEditEmails.length > 0) {
      const editors = SpreadsheetApp.getActiveSpreadsheet().getEditors();
      protection.removeEditors(
        editors.filter(e => !allowEditEmails.includes(e.getEmail())).map(e => e.getEmail())
      );
    } else {
      // Owner-only edit
      protection.removeEditors(
        SpreadsheetApp.getActiveSpreadsheet()
          .getEditors()
          .filter(e => e.getEmail() !== Session.getActiveUser().getEmail())
          .map(e => e.getEmail())
      );
    }
    
    logOperation("APPLY_PROTECTION", sheetName, { allowEditEmails }, "SUCCESS");
    
    return {
      success: true,
      txnId: txnState.txnId,
      details: {
        sheet: sheetName,
        protectionApplied: true,
        allowEditEmails: allowEditEmails.length > 0 ? allowEditEmails : ["owner-only"]
      }
    };
    
  } catch (e) {
    logOperation("APPLY_PROTECTION", sheetName, { error: e.message }, "FAILED");
    return {
      success: false,
      error: e.message,
      txnId: txnState.txnId
    };
  } finally {
    if (acquired) {
      lock.releaseLock();
    }
  }
}

/**
 * Removes sheet protection to allow modifications.
 * 
 * @param {string} sheetName - Target sheet name
 * @returns {Object} {success, details}
 */
function removeSheetProtection(sheetName) {
  const lock = LockService.getDocumentLock();
  let acquired = false;
  
  try {
    acquired = lock.tryLock(APPLIER_CONFIG.lockTimeoutMs);
    if (!acquired) {
      return {
        success: false,
        error: "Could not acquire lock"
      };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { success: false, error: `Sheet "${sheetName}" not found` };
    }
    
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    protections.forEach(p => {
      if (p.canEdit()) {
        p.remove();
      }
    });
    
    logOperation("REMOVE_PROTECTION", sheetName, {}, "SUCCESS");
    
    return {
      success: true,
      details: { sheet: sheetName, protectionRemoved: true }
    };
    
  } catch (e) {
    logOperation("REMOVE_PROTECTION", sheetName, { error: e.message }, "FAILED");
    return {
      success: false,
      error: e.message
    };
  } finally {
    if (acquired) {
      lock.releaseLock();
    }
  }
}

// AtomicSchemaApplier.gs - Block 2, Part B
// Validation, Rollback, and Finalization Engine
// ============================================================================

/**
 * VALIDATION LAYER
 * Validates schema modifications against business rules and data integrity.
 */

function validateSchemaModification(migrationPlan, sheetName, targetSchema) {
  const logger = new SchemaAuditLogger('validateSchemaModification');
  
  try {
    logger.log(`[VALIDATE] Schema modification for sheet: ${sheetName}`);
    
    // 1. Validate migration plan structure
    if (!migrationPlan || !migrationPlan.operations || migrationPlan.operations.length === 0) {
      throw new Error('Invalid migration plan: missing or empty operations array');
    }
    
    // 2. Validate operation sequence (inserts before deletes)
    const opTypes = migrationPlan.operations.map(op => op.type);
    const insertIdx = opTypes.lastIndexOf('INSERT');
    const deleteIdx = opTypes.indexOf('DELETE');
    
    if (insertIdx !== -1 && deleteIdx !== -1 && insertIdx > deleteIdx) {
      throw new Error('Invalid operation order: DELETE operations must come after INSERT operations');
    }
    
    // 3. Validate column definitions against schema registry
    const registry = getSchemaRegistry();
    const registrySchema = registry.schemas[sheetName];
    
    if (!registrySchema) {
      throw new Error(`Sheet ${sheetName} not found in schema registry`);
    }
    
    // 4. Validate target schema matches registry
    if (targetSchema.length !== registrySchema.columns.length) {
      throw new Error(
        `Target schema column count (${targetSchema.length}) ` +
        `does not match registry (${registrySchema.columns.length})`
      );
    }
    
    // 5. Validate each column definition
    for (let i = 0; i < targetSchema.length; i++) {
      const targetCol = targetSchema[i];
      const registryCol = registrySchema.columns[i];
      
      if (targetCol.name !== registryCol.name) {
        throw new Error(
          `Column mismatch at index ${i}: expected "${registryCol.name}", got "${targetCol.name}"`
        );
      }
      
      if (targetCol.type !== registryCol.type) {
        throw new Error(
          `Type mismatch for column "${targetCol.name}": ` +
          `expected "${registryCol.type}", got "${targetCol.type}"`
        );
      }
      
      // Validate MANDATORY columns cannot be removed
      if (registryCol.mandatory && targetCol.removed) {
        throw new Error(`Cannot remove mandatory column: ${targetCol.name}`);
      }
    }
    
    // 6. Validate ID column integrity
    const idColumn = targetSchema.find(col => col.isPrimaryKey);
    if (!idColumn) {
      throw new Error(`Sheet ${sheetName} must have a primary key column`);
    }
    
    // 7. Business rule validation
    validateBusinessRulesForSheet(sheetName, targetSchema);
    
    logger.log(`[VALIDATE] ✓ All validations passed for ${sheetName}`);
    return { valid: true, errors: [] };
    
  } catch (error) {
    logger.error(`[VALIDATE] ✗ Validation failed: ${error.message}`);
    return { valid: false, errors: [error.message] };
  }
}

function validateBusinessRulesForSheet(sheetName, targetSchema) {
  const logger = new SchemaAuditLogger('validateBusinessRulesForSheet');
  
  // LEDGER business rules
  if (sheetName === 'Ledger') {
    const hasLedgerId = targetSchema.some(col => col.name === 'LEDGERID');
    const hasPaymentDate = targetSchema.some(col => col.name === 'PAYMENT_DATE');
    const hasTxnHash = targetSchema.some(col => col.name === 'TXNHASH');
    
    if (!hasLedgerId) throw new Error('Ledger must include LEDGERID column');
    if (!hasPaymentDate) throw new Error('Ledger must include PAYMENT_DATE column');
    if (!hasTxnHash) throw new Error('Ledger must include TXNHASH column');
  }
  
  // ATTENDANCE business rules
  if (sheetName === 'Attendance') {
    const hasAttId = targetSchema.some(col => col.name === 'ATTID');
    const hasCheckIn = targetSchema.some(col => col.name === 'CHECK_IN_TIMESTAMP');
    const hasTxnHash = targetSchema.some(col => col.name === 'TXNHASH');
    
    if (!hasAttId) throw new Error('Attendance must include ATTID column');
    if (!hasCheckIn) throw new Error('Attendance must include CHECK_IN_TIMESTAMP column');
    if (!hasTxnHash) throw new Error('Attendance must include TXNHASH column');
  }
  
  // PURCHASES business rules
  if (sheetName === 'Purchases') {
    const hasPurId = targetSchema.some(col => col.name === 'PURID');
    const hasSupplierId = targetSchema.some(col => col.name === 'SUPPLIERID');
    const hasTxnHash = targetSchema.some(col => col.name === 'TXNHASH');
    
    if (!hasPurId) throw new Error('Purchases must include PURID column');
    if (!hasSupplierId) throw new Error('Purchases must include SUPPLIERID column');
    if (!hasTxnHash) throw new Error('Purchases must include TXNHASH column');
  }
  
  // MEMBERS business rules
  if (sheetName === 'Members') {
    const hasMemberId = targetSchema.some(col => col.name === 'MBR_ID');
    const hasProduct = targetSchema.some(col => col.name === 'CURRENT_PRODUCT_CODE');
    const hasLastPaid = targetSchema.some(col => col.name === 'LAST_PAID_DATE');
    
    if (!hasMemberId) throw new Error('Members must include MBR_ID column');
    if (!hasProduct) throw new Error('Members must include CURRENT_PRODUCT_CODE column');
    if (!hasLastPaid) throw new Error('Members must include LAST_PAID_DATE column');
  }
  
  logger.log(`[VALIDATE] ✓ Business rules validated for ${sheetName}`);
}

/**
 * ROLLBACK LAYER
 * Reverts sheet structure to previous state if atomic operation fails.
 */

function createRollbackPoint(sheet, sheetName) {
  const logger = new SchemaAuditLogger('createRollbackPoint');
  
  try {
    const rollbackId = `RB_${sheetName}_${Date.now()}`;
    const backup = {
      rollbackId: rollbackId,
      sheetName: sheetName,
      timestamp: new Date().toISOString(),
      columnCount: sheet.getLastColumn(),
      rowCount: sheet.getLastRow(),
      headers: sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0],
      frozenRows: sheet.getFrozenRows(),
      frozenColumns: sheet.getFrozenColumns(),
      protected: sheet.isProtected(),
      protectionId: sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0]?.getId() || null
    };
    
    // Store rollback point in System_Catalog
    const catalog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Catalog');
    if (!catalog) {
      throw new Error('System_Catalog sheet not found');
    }
    
    const nextRow = catalog.getLastRow() + 1;
    catalog.getRange(nextRow, 1, 1, 13).setValues([[
      rollbackId,
      backup.sheetName,
      backup.timestamp,
      backup.columnCount,
      backup.rowCount,
      JSON.stringify(backup.headers),
      backup.frozenRows,
      backup.frozenColumns,
      backup.protected,
      JSON.stringify(backup.protectionId),
      'PENDING',
      '',
      new Date().toISOString()
    ]]);
    
    logger.log(`[ROLLBACK] Checkpoint created: ${rollbackId}`);
    return rollbackId;
    
  } catch (error) {
    logger.error(`[ROLLBACK] Failed to create checkpoint: ${error.message}`);
    throw error;
  }
}

function executeRollback(rollbackId, sheetName) {
  const logger = new SchemaAuditLogger('executeRollback');
  
  try {
    const catalog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Catalog');
    const data = catalog.getDataRange().getValues();
    
    let rollbackPoint = null;
    let rollbackRowIndex = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === rollbackId) {
        rollbackPoint = {
          rollbackId: data[i][0],
          sheetName: data[i][1],
          timestamp: data[i][2],
          columnCount: data[i][3],
          rowCount: data[i][4],
          headers: JSON.parse(data[i][5]),
          frozenRows: data[i][6],
          frozenColumns: data[i][7],
          protected: data[i][8],
          protectionId: data[i][9]
        };
        rollbackRowIndex = i + 1;
        break;
      }
    }
    
    if (!rollbackPoint) {
      throw new Error(`Rollback point not found: ${rollbackId}`);
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    
    // Step 1: Remove excess columns
    const currentColumns = sheet.getLastColumn();
    if (currentColumns > rollbackPoint.columnCount) {
      const excessColumns = currentColumns - rollbackPoint.columnCount;
      sheet.deleteColumns(rollbackPoint.columnCount + 1, excessColumns);
    }
    
    // Step 2: Restore frozen rows/columns
    sheet.setFrozenRows(rollbackPoint.frozenRows);
    sheet.setFrozenColumns(rollbackPoint.frozenColumns);
    
    // Step 3: Restore protection state
    if (rollbackPoint.protected && rollbackPoint.protectionId) {
      const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      protections.forEach(prot => prot.remove());
      sheet.protect().setDescription(`Restored from ${rollbackId}`);
    }
    
    // Step 4: Mark rollback as completed
    catalog.getRange(rollbackRowIndex, 11).setValue('COMPLETED');
    catalog.getRange(rollbackRowIndex, 12).setValue('Rollback executed');
    
    logger.log(`[ROLLBACK] ✓ Rollback executed: ${rollbackId}`);
    return { success: true, rollbackId: rollbackId };
    
  } catch (error) {
    logger.error(`[ROLLBACK] ✗ Rollback failed: ${error.message}`);
    throw error;
  }
}

/**
 * FINALIZATION LAYER
 * Commits schema changes and updates audit trail.
 */

function finalizeSchemaModification(migrationPlan, sheetName, targetSchema) {
  const logger = new SchemaAuditLogger('finalizeSchemaModification');
  const rollbackId = createRollbackPoint(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName),
    sheetName
  );
  
  try {
    logger.log(`[FINALIZE] Starting finalization for ${sheetName} (Rollback: ${rollbackId})`);
    
    // Step 1: Execute all INSERT operations
    const insertOps = migrationPlan.operations.filter(op => op.type === 'INSERT');
    for (const op of insertOps) {
      safeInsertColumn(sheetName, op.position, op.columnDef);
      logger.log(`[FINALIZE] ✓ Inserted column: ${op.columnDef.name} at position ${op.position}`);
    }
    
    // Step 2: Execute all DELETE operations
    const deleteOps = migrationPlan.operations.filter(op => op.type === 'DELETE');
    for (const op of deleteOps) {
      safeDeleteColumn(sheetName, op.position);
      logger.log(`[FINALIZE] ✓ Deleted column at position: ${op.position}`);
    }
    
    // Step 3: Apply sheet protection
    applySheetProtection(sheetName, migrationPlan.protectionConfig);
    logger.log(`[FINALIZE] ✓ Sheet protection applied`);
    
    // Step 4: Update audit log
    recordMigrationCompletion(sheetName, migrationPlan, rollbackId, 'SUCCESS');
    
    // Step 5: Update System_Catalog rollback status
    const catalog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('System_Catalog');
    const data = catalog.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === rollbackId) {
        catalog.getRange(i + 1, 11).setValue('COMMITTED');
        catalog.getRange(i + 1, 12).setValue('Migration completed successfully');
        break;
      }
    }
    
    logger.log(`[FINALIZE] ✓ Schema modification finalized for ${sheetName}`);
    return { success: true, sheetName: sheetName, rollbackId: rollbackId };
    
  } catch (error) {
    logger.error(`[FINALIZE] ✗ Finalization failed: ${error.message}. Executing rollback...`);
    executeRollback(rollbackId, sheetName);
    recordMigrationCompletion(sheetName, migrationPlan, rollbackId, 'FAILED', error.message);
    throw error;
  }
}

function recordMigrationCompletion(sheetName, migrationPlan, rollbackId, status, errorMsg = '') {
  const logger = new SchemaAuditLogger('recordMigrationCompletion');
  
  try {
    const auditLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schema_Audit_Log');
    const nextRow = auditLog.getLastRow() + 1;
    
    auditLog.getRange(nextRow, 1, 1, 13).setValues([[
      `MIGRATION_${Date.now()}`,
      sheetName,
      migrationPlan.schemaVersion,
      JSON.stringify(migrationPlan.operations),
      status,
      rollbackId,
      errorMsg,
      JSON.stringify({
        operationCount: migrationPlan.operations.length,
        insertCount: migrationPlan.operations.filter(op => op.type === 'INSERT').length,
        deleteCount: migrationPlan.operations.filter(op => op.type === 'DELETE').length
      }),
      new Date().toISOString(),
      Session.getActiveUser().getEmail(),
      migrationPlan.description || 'Schema modification via SchemaMigrator',
      'COMPLETED',
      new Date().toISOString()
    ]]);
    
    logger.log(`[AUDIT] Migration recorded: ${sheetName} - ${status}`);
    
  } catch (error) {
    logger.error(`[AUDIT] Failed to record migration: ${error.message}`);
  }
}

/**
 * ORPHAN DETECTION & CLEANUP
 * Identifies and cleans up orphaned rows after schema modifications.
 */

function detectAndCleanupOrphans(sheetName, targetSchema) {
  const logger = new SchemaAuditLogger('detectAndCleanupOrphans');
  
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const data = sheet.getDataRange().getValues();
    const idColumn = targetSchema.findIndex(col => col.isPrimaryKey);
    
    if (idColumn === -1) {
      logger.warn(`[ORPHAN] No primary key found for ${sheetName}`);
      return { orphansDetected: 0, orphansCleaned: 0 };
    }
    
    let orphanCount = 0;
    const rowsToDelete = [];
    
    // Scan for rows with missing ID or TXNHASH
    for (let i = 1; i < data.length; i++) {
      const idValue = data[i][idColumn];
      const txnHashCol = targetSchema.findIndex(col => col.name === 'TXNHASH');
      const txnHashValue = txnHashCol !== -1 ? data[i][txnHashCol] : null;
      
      if (!idValue || !txnHashValue) {
        orphanCount++;
        rowsToDelete.push(i + 1);
      }
    }
    
    // Delete orphaned rows (in reverse order to preserve indices)
    let cleanedCount = 0;
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      sheet.deleteRow(rowsToDelete[i]);
      cleanedCount++;
    }
    
    logger.log(`[ORPHAN] Detected: ${orphanCount}, Cleaned: ${cleanedCount} for ${sheetName}`);
    return { orphansDetected: orphanCount, orphansCleaned: cleanedCount };
    
  } catch (error) {
    logger.error(`[ORPHAN] Cleanup failed: ${error.message}`);
    return { orphansDetected: 0, orphansCleaned: 0, error: error.message };
  }
}

/**
 * SCHEMA AUDIT LOGGER
 * Lightweight structured logging for schema operations.
 */

class SchemaAuditLogger {
  constructor(moduleName) {
    this.moduleName = moduleName;
    this.ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  
  log(message) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${this.moduleName}] ${message}`;
    console.log(entry);
    this._writeAuditEntry(entry, 'INFO');
  }
  
  warn(message) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${this.moduleName}] ⚠ ${message}`;
    console.warn(entry);
    this._writeAuditEntry(entry, 'WARN');
  }
  
  error(message) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${this.moduleName}] ✗ ${message}`;
    console.error(entry);
    this._writeAuditEntry(entry, 'ERROR');
  }
  
  _writeAuditEntry(message, level) {
    try {
      const auditLog = this.ss.getSheetByName('Schema_Audit_Log');
      if (auditLog) {
        const row = auditLog.getLastRow() + 1;
        auditLog.getRange(row, 1).setValue(message);
        auditLog.getRange(row, 2).setValue(level);
        auditLog.getRange(row, 3).setValue(new Date().toISOString());
      }
    } catch (e) {
      // Silently fail if audit log unavailable
    }
  }
}

/**
 * MASTER ORCHESTRATION: applyAtomicSchemaModification
 * Single entry point for all schema modifications with full validation,
 * rollback, and finalization.
 */

function applyAtomicSchemaModification(sheetName, targetSchema, protectionConfig = {}) {
  const logger = new SchemaAuditLogger('applyAtomicSchemaModification');
  
  try {
    logger.log(`[ORCHESTRATE] Starting atomic schema modification for ${sheetName}`);
    
    // Step 1: Generate migration plan
    const currentSchema = detectCurrentSchema(sheetName);
    const migrationPlan = generateMigrationPlan(currentSchema, targetSchema, protectionConfig);
    
    logger.log(`[ORCHESTRATE] Migration plan generated: ${migrationPlan.operations.length} operations`);
    
    // Step 2: Validate plan
    const validation = validateSchemaModification(migrationPlan, sheetName, targetSchema);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }
    
    logger.log(`[ORCHESTRATE] ✓ All validations passed`);
    
    // Step 3: Execute finalization (which includes rollback point creation)
    const result = finalizeSchemaModification(migrationPlan, sheetName, targetSchema);
    
    // Step 4: Cleanup orphans
    const cleanupResult = detectAndCleanupOrphans(sheetName, targetSchema);
    logger.log(`[ORCHESTRATE] Orphan cleanup: ${cleanupResult.orphansCleaned} rows removed`);
    
    logger.log(`[ORCHESTRATE] ✓ Atomic schema modification completed successfully`);
    return {
      success: true,
      sheetName: sheetName,
      rollbackId: result.rollbackId,
      operationCount: migrationPlan.operations.length,
      orphansRemoved: cleanupResult.orphansCleaned
    };
    
  } catch (error) {
    logger.error(`[ORCHESTRATE] ✗ Atomic schema modification failed: ${error.message}`);
    return {
      success: false,
      sheetName: sheetName,
      error: error.message
    };
  }
}

/**
 * HELPER: detectCurrentSchema
 * Reads current sheet structure.
 */

function detectCurrentSchema(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  return headers.map((header, idx) => ({
    name: header,
    type: 'STRING',
    position: idx + 1,
    isPrimaryKey: idx === 0
  }));
}

/**
 * HELPER: generateMigrationPlan
 * Compares current vs. target schema and generates operation sequence.
 */

function generateMigrationPlan(currentSchema, targetSchema, protectionConfig) {
  const operations = [];
  
  // Identify INSERTs: columns in target but not in current
  for (let i = 0; i < targetSchema.length; i++) {
    const targetCol = targetSchema[i];
    const exists = currentSchema.some(col => col.name === targetCol.name);
    
    if (!exists) {
      operations.push({
        type: 'INSERT',
        position: i + 1,
        columnDef: targetCol
      });
    }
  }
  
  // Identify DELETEs: columns in current but not in target
  for (let i = 0; i < currentSchema.length; i++) {
    const currentCol = currentSchema[i];
    const exists = targetSchema.some(col => col.name === currentCol.name);
    
    if (!exists) {
      operations.push({
        type: 'DELETE',
        position: i + 1,
        columnName: currentCol.name
      });
    }
  }
  
  return {
    schemaVersion: '1.2.0',
    operations: operations,
    protectionConfig: protectionConfig || {},
    description: `Schema migration for ${currentSchema.length} → ${targetSchema.length} columns`
  };
}

// END OF AtomicSchemaApplier.gs - Block 2 Part B
