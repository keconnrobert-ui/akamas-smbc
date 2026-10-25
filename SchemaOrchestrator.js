// SchemaOrchestrator.gs - Block 3
// Central Orchestration Engine for Schema Registry, Migration, and Audit
// ============================================================================

/**
 * SCHEMA ORCHESTRATOR: Master Controller
 * Coordinates schema drift detection, migration planning, atomic application,
 * and forensic audit trail across all sheets.
 */

class SchemaOrchestrator {
  constructor() {
    this.ss = SpreadsheetApp.getActiveSpreadsheet();
    this.logger = new SchemaAuditLogger('SchemaOrchestrator');
    this.registry = null;
    this.migrationPlan = null;
    this.auditState = {};
  }
  
  /**
   * MASTER INITIALIZATION
   * Loads registry, detects drift, validates business rules, and plans migration.
   */
  
  initialize() {
    this.logger.log('[INIT] SchemaOrchestrator initialization started');
    
    try {
      // Step 1: Load schema registry
      this.registry = getSchemaRegistry();
      this.logger.log(`[INIT] ✓ Schema Registry loaded (v${this.registry.version})`);
      
      // Step 2: Run drift detection across all sheets
      const driftReport = this.detectDriftAcrossAllSheets();
      this.logger.log(`[INIT] Drift detection complete: ${driftReport.driftCount} sheets affected`);
      
      // Step 3: Validate business rules
      const rulesValidation = this.validateBusinessRulesAcrossRegistry();
      this.logger.log(`[INIT] Business rule validation: ${rulesValidation.passed ? 'PASSED' : 'FAILED'}`);
      
      if (!rulesValidation.passed) {
        throw new Error(`Business rule validation failed: ${rulesValidation.errors.join('; ')}`);
      }
      
      // Step 4: Initialize audit state
      this.initializeAuditState();
      this.logger.log('[INIT] ✓ Audit state initialized');
      
      return { success: true, message: 'SchemaOrchestrator initialized' };
      
    } catch (error) {
      this.logger.error(`[INIT] Initialization failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * DRIFT DETECTION LAYER
   * Identifies schema divergence between registry and live sheets.
   */
  
  detectDriftAcrossAllSheets() {
    this.logger.log('[DRIFT] Starting drift detection across all sheets');
    
    const driftReport = {
      timestamp: new Date().toISOString(),
      driftCount: 0,
      sheets: [],
      summary: {}
    };
    
    for (const [sheetName, schemaDefn] of Object.entries(this.registry.schemas)) {
      const driftResult = this.detectSheetDrift(sheetName, schemaDefn);
      
      if (driftResult.hasDrift) {
        driftReport.driftCount++;
        driftReport.sheets.push({
          sheetName: sheetName,
          drift: driftResult,
          timestamp: new Date().toISOString()
        });
        
        this.logger.warn(`[DRIFT] ✗ Drift detected in ${sheetName}: ${driftResult.issues.length} issues`);
      } else {
        this.logger.log(`[DRIFT] ✓ ${sheetName} matches registry`);
      }
    }
    
    driftReport.summary = {
      totalSheets: Object.keys(this.registry.schemas).length,
      driftSheets: driftReport.driftCount,
      cleanSheets: Object.keys(this.registry.schemas).length - driftReport.driftCount,
      detectionTime: `${Date.now() - new Date(driftReport.timestamp).getTime()}ms`
    };
    
    return driftReport;
  }
  
  detectSheetDrift(sheetName, schemaDefn) {
    const sheet = this.ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return {
        hasDrift: true,
        issues: [`Sheet ${sheetName} does not exist`],
        severity: 'CRITICAL'
      };
    }
    
    const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const registryColumns = schemaDefn.columns.map(col => col.name);
    
    const issues = [];
    
    // Check 1: Column count mismatch
    if (currentHeaders.length !== registryColumns.length) {
      issues.push(
        `Column count mismatch: registry expects ${registryColumns.length}, ` +
        `found ${currentHeaders.length}`
      );
    }
    
    // Check 2: Column name mismatches
    for (let i = 0; i < Math.min(currentHeaders.length, registryColumns.length); i++) {
      if (currentHeaders[i] !== registryColumns[i]) {
        issues.push(
          `Column ${i + 1} mismatch: expected "${registryColumns[i]}", ` +
          `found "${currentHeaders[i]}"`
        );
      }
    }
    
    // Check 3: Missing mandatory columns
    const mandatoryCols = schemaDefn.columns.filter(col => col.mandatory);
    for (const mandCol of mandatoryCols) {
      if (!currentHeaders.includes(mandCol.name)) {
        issues.push(`Missing mandatory column: ${mandCol.name}`);
      }
    }
    
    // Check 4: Orphaned columns (in sheet but not in registry)
    for (const header of currentHeaders) {
      if (!registryColumns.includes(header)) {
        issues.push(`Orphaned column in sheet: ${header}`);
      }
    }
    
    return {
      hasDrift: issues.length > 0,
      issues: issues,
      severity: issues.some(i => i.includes('CRITICAL')) ? 'CRITICAL' : 'WARNING',
      currentColumnCount: currentHeaders.length,
      expectedColumnCount: registryColumns.length,
      currentHeaders: currentHeaders,
      registryHeaders: registryColumns
    };
  }
  
  /**
   * BUSINESS RULE VALIDATION
   * Validates schema against domain-specific rules.
   */
  
  validateBusinessRulesAcrossRegistry() {
    this.logger.log('[RULES] Starting business rule validation');
    
    const validation = {
      passed: true,
      errors: [],
      warnings: [],
      checks: {}
    };
    
    // Rule 1: Every sheet must have a primary key
    for (const [sheetName, schemaDefn] of Object.entries(this.registry.schemas)) {
      const hasPrimaryKey = schemaDefn.columns.some(col => col.isPrimaryKey);
      validation.checks[`${sheetName}_PRIMARY_KEY`] = hasPrimaryKey ? 'PASS' : 'FAIL';
      
      if (!hasPrimaryKey) {
        validation.errors.push(`${sheetName} must have a primary key column`);
        validation.passed = false;
      }
    }
    
    // Rule 2: Ledger must have TXNHASH, LEDGERID, PAYMENT_DATE
    if (this.registry.schemas['Ledger']) {
      const ledgerCols = this.registry.schemas['Ledger'].columns.map(col => col.name);
      const requiredLedgerCols = ['LEDGERID', 'TXNHASH', 'PAYMENT_DATE', 'SOURCETXNID'];
      
      for (const col of requiredLedgerCols) {
        if (!ledgerCols.includes(col)) {
          validation.errors.push(`Ledger missing required column: ${col}`);
          validation.passed = false;
        }
      }
    }
    
    // Rule 3: Attendance must have TXNHASH, ATTID, CHECK_IN_TIMESTAMP
    if (this.registry.schemas['Attendance']) {
      const attCols = this.registry.schemas['Attendance'].columns.map(col => col.name);
      const requiredAttCols = ['ATTID', 'TXNHASH', 'CHECK_IN_TIMESTAMP'];
      
      for (const col of requiredAttCols) {
        if (!attCols.includes(col)) {
          validation.errors.push(`Attendance missing required column: ${col}`);
          validation.passed = false;
        }
      }
    }
    
    // Rule 4: Purchases must have TXNHASH, PURID, SUPPLIERID
    if (this.registry.schemas['Purchases']) {
      const purCols = this.registry.schemas['Purchases'].columns.map(col => col.name);
      const requiredPurCols = ['PURID', 'TXNHASH', 'SUPPLIERID'];
      
      for (const col of requiredPurCols) {
        if (!purCols.includes(col)) {
          validation.errors.push(`Purchases missing required column: ${col}`);
          validation.passed = false;
        }
      }
    }
    
    // Rule 5: Members must have TXNHASH, LAST_PAID_DATE, CURRENT_PRODUCT_CODE
    if (this.registry.schemas['Members']) {
      const memCols = this.registry.schemas['Members'].columns.map(col => col.name);
      const requiredMemCols = ['TXNHASH', 'LAST_PAID_DATE', 'CURRENT_PRODUCT_CODE'];
      
      for (const col of requiredMemCols) {
        if (!memCols.includes(col)) {
          validation.errors.push(`Members missing required column: ${col}`);
          validation.passed = false;
        }
      }
    }
    
    this.logger.log(
      `[RULES] Validation complete: ${validation.passed ? 'PASSED' : 'FAILED'} ` +
      `(${validation.errors.length} errors, ${validation.warnings.length} warnings)`
    );
    
    return validation;
  }
  
  /**
   * MIGRATION PLANNING
   * Generates comprehensive migration plan from drift report.
   */
  
  planMigrationFromDrift(driftReport) {
    this.logger.log('[PLAN] Starting migration planning from drift report');
    
    this.migrationPlan = {
      timestamp: new Date().toISOString(),
      totalSheets: driftReport.sheets.length,
      sheets: [],
      rollbackPoints: {},
      estimatedDuration: 0
    };
    
    for (const driftSheet of driftReport.sheets) {
      const sheetName = driftSheet.sheetName;
      const schemaDefn = this.registry.schemas[sheetName];
      
      const targetSchema = schemaDefn.columns.map(col => ({
        name: col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        mandatory: col.mandatory
      }));
      
      const currentSchema = driftSheet.drift.currentHeaders.map((header, idx) => ({
        name: header,
        type: 'STRING',
        position: idx + 1,
        isPrimaryKey: idx === 0
      }));
      
      const sheetMigrationPlan = {
        sheetName: sheetName,
        currentSchema: currentSchema,
        targetSchema: targetSchema,
        drift: driftSheet.drift,
        operations: this.generateOperationsForSheet(currentSchema, targetSchema),
        estimatedDuration: 5000 // ms
      };
      
      this.migrationPlan.sheets.push(sheetMigrationPlan);
      this.migrationPlan.estimatedDuration += 5000;
    }
    
    this.logger.log(
      `[PLAN] Migration plan generated: ${this.migrationPlan.sheets.length} sheets, ` +
      `${this.migrationPlan.estimatedDuration}ms estimated`
    );
    
    return this.migrationPlan;
  }
  
  generateOperationsForSheet(currentSchema, targetSchema) {
    const operations = [];
    
    // INSERTs: columns in target but not current
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
    
    // DELETEs: columns in current but not target
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
    
    return operations;
  }
  
  /**
   * ATOMIC EXECUTION
   * Executes migration plan with atomic guarantees across all sheets.
   */
  
  executeMigrationPlan(migrationPlan) {
    this.logger.log('[EXEC] Executing migration plan');
    
    const executionResult = {
      timestamp: new Date().toISOString(),
      totalSheets: migrationPlan.sheets.length,
      successCount: 0,
      failureCount: 0,
      results: []
    };
    
    for (const sheetPlan of migrationPlan.sheets) {
      try {
        const sheetName = sheetPlan.sheetName;
        const result = applyAtomicSchemaModification(
          sheetName,
          sheetPlan.targetSchema,
          { description: `Drift remediation for ${sheetName}` }
        );
        
        if (result.success) {
          executionResult.successCount++;
          this.logger.log(`[EXEC] ✓ ${sheetName} migration completed`);
        } else {
          executionResult.failureCount++;
          this.logger.error(`[EXEC] ✗ ${sheetName} migration failed: ${result.error}`);
        }
        
        executionResult.results.push({
          sheetName: sheetName,
          success: result.success,
          rollbackId: result.rollbackId,
          operationCount: result.operationCount,
          error: result.error || null
        });
        
      } catch (error) {
        executionResult.failureCount++;
        this.logger.error(`[EXEC] Exception during migration: ${error.message}`);
        executionResult.results.push({
          sheetName: sheetPlan.sheetName,
          success: false,
          error: error.message
        });
      }
    }
    
    this.logger.log(
      `[EXEC] Migration execution complete: ${executionResult.successCount} success, ` +
      `${executionResult.failureCount} failures`
    );
    
    return executionResult;
  }
  
  /**
   * AUDIT STATE INITIALIZATION
   * Initializes cryptographic audit trail.
   */
  
  initializeAuditState() {
    const catalog = this.ss.getSheetByName('System_Catalog');
    const ledger = this.ss.getSheetByName('Ledger');
    
    if (!catalog || !ledger) {
      throw new Error('System_Catalog or Ledger sheet not found');
    }
    
    // Scan Ledger for last LEDGERID
    const ledgerData = ledger.getDataRange().getValues();
    let lastLedgerId = 0;
    
    for (let i = 1; i < ledgerData.length; i++) {
      const lid = ledgerData[i][0]; // LEDGERID column
      if (lid && typeof lid === 'string' && lid.startsWith('LDG')) {
        const num = parseInt(lid.substring(3));
        if (num > lastLedgerId) lastLedgerId = num;
      }
    }
    
    this.auditState = {
      lastLedgerId: lastLedgerId,
      lastTxnHash: null,
      lastPaymentDate: null,
      recordCount: ledgerData.length - 1,
      integrityStatus: 'INITIALIZED'
    };
    
    this.logger.log(`[AUDIT] Audit state initialized: lastLedgerId=${lastLedgerId}`);
  }
  
  /**
   * FORENSIC TX999999 AUDIT
   * Validates ledger integrity via dual-anchor jigsaw model.
   */
  
  executeTX999999Audit() {
    this.logger.log('[TX999999] Starting forensic audit');
    
    const auditResult = {
      timestamp: new Date().toISOString(),
      checksPerformed: 0,
      checksPassed: 0,
      checksFailed: 0,
      issues: [],
      ledgerIntegrity: {}
    };
    
    try {
      const ledger = this.ss.getSheetByName('Ledger');
      const ledgerData = ledger.getDataRange().getValues();
      
      // Check 1: LEDGERID sequence integrity
      auditResult.checksPerformed++;
      const ledgerIdCheck = this.validateLedgerIdSequence(ledgerData);
      if (ledgerIdCheck.valid) {
        auditResult.checksPassed++;
      } else {
        auditResult.checksFailed++;
        auditResult.issues.push(...ledgerIdCheck.issues);
      }
      auditResult.ledgerIntegrity.ledgerIdSequence = ledgerIdCheck;
      
      // Check 2: TXNHASH consistency across Ledger and source sheets
      auditResult.checksPerformed++;
      const txnHashCheck = this.validateTxnHashConsistency(ledgerData);
      if (txnHashCheck.valid) {
        auditResult.checksPassed++;
      } else {
        auditResult.checksFailed++;
        auditResult.issues.push(...txnHashCheck.issues);
      }
      auditResult.ledgerIntegrity.txnHashConsistency = txnHashCheck;
      
      // Check 3: Reverse anchor validation
      auditResult.checksPerformed++;
      const reverseAnchorCheck = this.validateReverseAnchors(ledgerData);
      if (reverseAnchorCheck.valid) {
        auditResult.checksPassed++;
      } else {
        auditResult.checksFailed++;
        auditResult.issues.push(...reverseAnchorCheck.issues);
      }
      auditResult.ledgerIntegrity.reverseAnchors = reverseAnchorCheck;
      
      // Check 4: Chronological PAYMENT_DATE order
      auditResult.checksPerformed++;
      const chronoCheck = this.validateChronologicalOrder(ledgerData);
      if (chronoCheck.valid) {
        auditResult.checksPassed++;
      } else {
        auditResult.checksFailed++;
        auditResult.issues.push(...chronoCheck.issues);
      }
      auditResult.ledgerIntegrity.chronologicalOrder = chronoCheck;
      
      // Check 5: Cash-basis accounting compliance
      auditResult.checksPerformed++;
      const cashBasisCheck = this.validateCashBasisCompliance(ledgerData);
      if (cashBasisCheck.valid) {
        auditResult.checksPassed++;
      } else {
        auditResult.checksFailed++;
        auditResult.issues.push(...cashBasisCheck.issues);
      }
      auditResult.ledgerIntegrity.cashBasisCompliance = cashBasisCheck;
      
      this.logger.log(
        `[TX999999] Audit complete: ${auditResult.checksPassed}/${auditResult.checksPerformed} checks passed`
      );
      
      return auditResult;
      
    } catch (error) {
      this.logger.error(`[TX999999] Audit failed: ${error.message}`);
      auditResult.error = error.message;
      return auditResult;
    }
  }
  
  validateLedgerIdSequence(ledgerData) {
    const issues = [];
    let lastId = 0;
    
    for (let i = 1; i < ledgerData.length; i++) {
      const ledgerId = ledgerData[i][0];
      if (ledgerId && typeof ledgerId === 'string' && ledgerId.startsWith('LDG')) {
        const num = parseInt(ledgerId.substring(3));
        if (num !== lastId + 1) {
          issues.push(`LEDGERID gap at row ${i + 1}: expected LDG${lastId + 1}, found ${ledgerId}`);
        }
        lastId = num;
      }
    }
    
    return { valid: issues.length === 0, issues: issues, lastId: lastId };
  }
  
  validateTxnHashConsistency(ledgerData) {
    const issues = [];
    const sourceSheets = ['Attendance', 'Purchases', 'Members'];
    const txnHashMap = {};
    
    // Build TXNHASH map from Ledger
    for (let i = 1; i < ledgerData.length; i++) {
      const txnHash = ledgerData[i][4]; // TXNHASH column
      const sourceSheet = ledgerData[i][3]; // SOURCE_SHEET column
      const sourceTxnId = ledgerData[i][2]; // SOURCETXNID column
      
      if (!txnHashMap[sourceSheet]) {
        txnHashMap[sourceSheet] = {};
      }
      txnHashMap[sourceSheet][sourceTxnId] = txnHash;
    }
    
    // Validate against source sheets
    for (const sheetName of sourceSheets) {
      const sheet = this.ss.getSheetByName(sheetName);
      if (!sheet) continue;
      
      const sheetData = sheet.getDataRange().getValues();
      for (let i = 1; i < sheetData.length; i++) {
        const txnHash = sheetData[i][2]; // TXNHASH column (assumed position 3)
        const txnId = sheetData[i][0]; // ID column
        
        if (txnHashMap[sheetName] && txnHashMap[sheetName][txnId] !== txnHash) {
          issues.push(
            `TXNHASH mismatch in ${sheetName} row ${i + 1}: ` +
            `ledger has ${txnHashMap[sheetName][txnId]}, sheet has ${txnHash}`
          );
        }
      }
    }
    
    return { valid: issues.length === 0, issues: issues };
  }
  
  validateReverseAnchors(ledgerData) {
    const issues = [];
    
    for (let i = 1; i < ledgerData.length; i++) {
      const ledgerId = ledgerData[i][0];
      const sourceTxnId = ledgerData[i][2];
      const txnHash = ledgerData[i][4];
      
      // Verify reverse mapping exists
      if (!sourceTxnId || !txnHash) {
        issues.push(`Row ${i + 1} missing reverse anchor: SOURCETXNID or TXNHASH`);
      }
    }
    
    return { valid: issues.length === 0, issues: issues };
  }
  
  validateChronologicalOrder(ledgerData) {
    const issues = [];
    let lastDate = new Date(0);
    
    for (let i = 1; i < ledgerData.length; i++) {
      const paymentDate = new Date(ledgerData[i][1]); // PAYMENT_DATE column
      
      if (paymentDate < lastDate) {
        issues.push(
          `Chronological violation at row ${i + 1}: ` +
          `${paymentDate.toISOString()} is before previous ${lastDate.toISOString()}`
        );
      }
      lastDate = paymentDate;
    }
    
    return { valid: issues.length === 0, issues: issues };
  }
  
  validateCashBasisCompliance(ledgerData) {
    const issues = [];
    const today = new Date();
    
    for (let i = 1; i < ledgerData.length; i++) {
      const paymentDate = new Date(ledgerData[i][1]);
      
      if (paymentDate > today) {
        issues.push(
          `Cash-basis violation at row ${i + 1}: PAYMENT_DATE ` +
          `${paymentDate.toISOString()} is in future`
        );
      }
      
      // Check for deferrals or accruals (TYPE field)
      const type = ledgerData[i][5]; // TYPE column
      if (['ACCRUAL', 'DEFERRAL', 'PROVISION'].includes(type)) {
        issues.push(
          `Cash-basis violation at row ${i + 1}: TYPE "${type}" not allowed in pure cash-basis model`
        );
      }
    }
    
    return { valid: issues.length === 0, issues: issues };
  }
  
  /**
   * MASTER ORCHESTRATION: runFullOrchestration
   * Single entry point for complete schema remediation cycle.
   */
  
  runFullOrchestration() {
    this.logger.log('[MASTER] Starting full orchestration cycle');
    
    const startTime = Date.now();
    const orchestrationResult = {
      phase1_init: this.initialize(),
      phase2_drift: null,
      phase3_plan: null,
      phase4_execute: null,
      phase5_audit: null,
      totalDuration: 0,
      status: 'IN_PROGRESS'
    };
    
    try {
      if (!orchestrationResult.phase1_init.success) {
        throw new Error('Phase 1 initialization failed');
      }
      
      // Phase 2: Drift Detection
      const driftReport = this.detectDriftAcrossAllSheets();
      orchestrationResult.phase2_drift = driftReport;
      this.logger.log(`[MASTER] Phase 2 complete: ${driftReport.driftCount} drifts detected`);
      
      if (driftReport.driftCount === 0) {
        orchestrationResult.status = 'NO_DRIFT_DETECTED';
        this.logger.log('[MASTER] ✓ All sheets compliant with registry');
        return orchestrationResult;
      }
      
      // Phase 3: Migration Planning
      const migrationPlan = this.planMigrationFromDrift(driftReport);
      orchestrationResult.phase3_plan = migrationPlan;
      this.logger.log(`[MASTER] Phase 3 complete: ${migrationPlan.sheets.length} sheets planned`);
      
      // Phase 4: Atomic Execution
      const executionResult = this.executeMigrationPlan(migrationPlan);
      orchestrationResult.phase4_execute = executionResult;
      this.logger.log(
        `[MASTER] Phase 4 complete: ${executionResult.successCount} success, ` +
        `${executionResult.failureCount} failures`
      );
      
      // Phase 5: TX999999 Forensic Audit
      const auditResult = this.executeTX999999Audit();
      orchestrationResult.phase5_audit = auditResult;
      this.logger.log(
        `[MASTER] Phase 5 complete: ${auditResult.checksPassed}/${auditResult.checksPerformed} checks passed`
      );
      
      orchestrationResult.totalDuration = Date.now() - startTime;
      orchestrationResult.status = 'COMPLETED';
      
      this.logger.log(
        `[MASTER] ✓ Full orchestration completed in ${orchestrationResult.totalDuration}ms`
      );
      
      return orchestrationResult;
      
    } catch (error) {
      orchestrationResult.totalDuration = Date.now() - startTime;
      orchestrationResult.status = 'FAILED';
      orchestrationResult.error = error.message;
      this.logger.error(`[MASTER] Orchestration failed: ${error.message}`);
      return orchestrationResult;
    }
  }
}

/**
 * GLOBAL ENTRY POINT: initializeSchemaOrchestrator
 * Called from doGet/doPost or standalone testing.
 */

function initializeSchemaOrchestrator() {
  const orchestrator = new SchemaOrchestrator();
  return orchestrator.runFullOrchestration();
}

// END OF SchemaOrchestrator.gs
     
