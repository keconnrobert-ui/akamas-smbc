# ASMBC MEMBERSHIP AND FINANCE - FUNCTION DIRECTORY
**Generated: 2026-10-23 09:56:57**

---

## FUNCTIONS BY MODULE


### Accounting_Reports.js
\\\javascript

  generateWeeklyIncomeExpenditureReport(filterStartDateStr)

  printWeeklyCashBookStatementToLog()

\\\\n

### Analyse_Code.js
\\\javascript

  runApplicationAudit()

  getProjectContent_()

  verifyBootstrapIntegrity_(file, report)

  inspectServerFile_(file, functions, report)

  maskNonExecutableText_(line)

  inspectHtmlFile_(file, report)

  inspectBraceBalance_(file, report)

  AX_canStartRegexp_(source, index)

  stripNonCode_(source)

  inspectDuplicateDeclarations_(file, report)

  inspectLikelyUnresolvedCalls_(file, functions, report)

  collectDefinedFunctions_(files)

  collectLocalNames_(source)

  getGlobalAllowlist_()

  inspectManifest_(file, report)

  addIssue_(report, severity, file, line, rule, message)

  limitIssues_(report)

  AX_normalizeFindingText_(value)

  AX_normalizeSeverity_(severity)

  AX_isAuditToolFinding_(finding)

  AX_classifyFinding_(finding)

  AX_normalizeFinding_(finding)

  AX_getFindingKey_(finding)

  AX_deduplicateFindings_(findings)

  AX_isBlockingFinding_(finding)

  updateSummaryAndStatus_(report)

  buildNextActions_(report)

  sendAuditReport_(report)

  buildCurrentCodePdf_()

  buildAuditHtmlReport_(report)

  escapeHtml_(value)

  countLines_(text)

  getErrorLine_(error)

  lineNumberAtIndex_(source, index)

  isServerFile_(file)

  isHtmlFile_(file)

  isControlWord_(name)

  auditTransactionFunctions()

  getFunctionsFromFile(fileName)

  functionName("
  const regex = /function\s+([a-zA-Z0-9_]+)

\\\\n

### Analyse_TransactionFunctions.js
\\\javascript

  auditTransactionFunctions()

  getFunctionsFromFile(fileName)

  functionName("
  const regex = /function\s+([a-zA-Z0-9_]+)

\\\\n

### Analysis_Extensions.js
\\\javascript

  AX_collectAllFunctions_(files)

  AX_checkHtmlServerCallbacks_(files, allFunctions, report)

  AX_checkMissingHtmlReferences_(files, report)

  AX_removeKnownUnresolvedCalls_(allFunctions, report)

  AX_extractFunctionNameFromMessage_(issue)

  AX_removeAuditSelfFindings_(files, report)

  AX_isSelfDetectionLine_(line)

  AX_buildSuggestedDevelopmentWork_(files, report)

  has(rule)

  AX_addIssueIfMissing_(
  report,
  severity,
  file,
  line,
  rule,
  message
)

  AX_getGlobalAllowlist_()

  AX_isServerFile_(file)

  AX_isHtmlFile_(file)

  AX_baseName_(name)

  AX_normalizeHtmlName_(name)

  AX_isControlWord_(name)

  AX_lineNumberAtIndex_(source, index)

  AX_getSourceLine_(file, lineNumber)

  AX_isDocumentationHtmlExampleLine_(line)

  AX_applyAuditExtensions_(files, allFunctions, report)

\\\\n

### Analysis_Hardening.js
\\\javascript

  AH_applyHardeningGeneration_(files, report)

  AH_buildInventory_(files)

  AH_buildHardeningPlan_(inventory, issues)

  hasRule(rule)

  add(id, priority, title, files, reason, action)

  AH_buildServerSecurityKernel_()

  SEC_ok_(data, message)

  SEC_fail_(code, message)

  SEC_safeMessage_(message)

  SEC_safeException_(exception, publicMessage)

  SEC_requireObject_(value, name)

  SEC_requireString_(value, name, maxLength)

  SEC_optionalString_(value, name, maxLength)

  SEC_requireEnum_(value, name, allowed)

  SEC_requireDateString_(value, name)

  SEC_requireFiniteNumber_(value, name, min, max)

  SEC_escapeHtml_(value)

  SEC_constantTimeEqual_(left, right)

  SEC_hmacSha256Base64_(payload, secret)

  SEC_verifyHmacSha256_(payload, suppliedSignature, secret)

  SEC_getRequiredSecret_(propertyName)

  SEC_runSafely_(callback, publicMessage)

  SEC_assert_(condition, message)

  AH_buildFrontendSecurityKernel_()

  text(value)

  escapeHtml(value)

  safeError(result, fallback)

  isContractSuccess(result)

  isContractFailure(result)

  setText(element, value)

  setBusy(element, busy)

  safeJson(value)

  AH_buildIntegrationGuide_(inventory, plan)

  AH_buildReviewChecklist_()

\\\\n

### Analysis_project.js
\\\javascript

  AX_applyProjectAnalysis_(files, report)

  AX_analyseProject_(files)

  AX_buildArchitecture_(
  fileInventory,
  functions,
  serverCalls,
  frontendCalls
)

  AX_extractFunctions_(fileName, source)

  AX_extractServerCalls_(fileName, source)

  AX_extractFrontendCalls_(fileName, source)

  AX_buildProcessingOrder_(
  functions,
  serverCalls,
  frontendCalls
)

  AX_addSecurityFindings_(
  files,
  functions,
  serverCalls,
  frontendCalls,
  findings,
  assumptions
)

  add(
    rule,
    severity,
    title,
    file,
    line,
    evidence,
    action,
    message
  )

  AXPA_normalizeFindings_(findings)

  AXPA_findingKey_(finding)

  AXPA_part_(value)

  AXASF_classification_(fileName)

  AX_buildReplacementSpecifications_(files, analysis)

  AX_proposedChangesForFile_(fileName, findings)

  AX_buildAnalysisSpecification_(analysis)

  AX_buildSourcePackage_(files)

  AX_findAll_(source, pattern)

  AX_lineNumber_(source, index)

  AX_evidence_(source, index)

  AX_fileName_(file)

  AX_fileSource_(file)

  AX_isProtectedFile_(fileName)

  AX_limitSource_(source)

  AX_limit_(value)

  AX_hash_(source)

\\\\n

### API_ActionMatrix.js
\\\javascript

  testActionMatrixLoad()

  getRolePermissions(role)

  canUserPerformAction(email, action)

  enforceActionAuthorization(email, action)

\\\\n

### API_AttendanceHandler.js
\\\javascript

  recordAttendance(attendancePayload)

  findAttendanceByQRHash(qrHash)

  getAttendanceAdoptionMetrics()

\\\\n

### API_CoreTransactions.js
\\\javascript

  recordReceiptTransaction(payload, userEmail)

  recordExpenseTransaction(payload, userEmail)

  recordCogsTransaction(payload, userEmail)

  validateTransactionIntegrity(payload)

  validateReceiptPayload(payload)

  validateExpensePayload(payload)

\\\\n

### API_Gateway.js
\\\javascript

  validateRBAC_(userRoleNum, minimumRequired)

  validateRoleAccess_(userRoleNum, minimumRequired)

  doGet(e)

  doPost(e)

  authorizeUserRole(userEmail)

  generateCSRFToken(userEmail)

  validateCSRFToken(token, userEmail)

  constantTimeCompare(a, b)

  enforceRateLimit(userEmail)

  checkIdempotencyKey(idempotencyKey)

  cacheIdempotencyKey(idempotencyKey, result)

  getActionRoleMatrix()

  getPanelMembers(userEmail, userRole)

  getPanelProducts(userEmail, userRole)

  getPanelLedger(userEmail, userRole)

  getPanelAttendance(userEmail, userRole, catalog)

  getMemberIdByEmail(email, catalog)

  createResponse(statusCode, payload)

  buildCatalogMap(sheet)

  getSystemConfig(parameterKey)

  setSystemConfig(parameterKey, parameterValue, description = "")

  getDailySessionQR()

  testGetPanelLedger()

  getDashboard()

  getMobileCheckInKiosk()

  getReceptionQRDisplay()

  getFrontEnd()

  getDashboard()

  getDashboardStats()

\\\\n

### API_LockManager.js
\\\javascript

  acquireLock(lockName, timeoutMs = 10000)

  releaseLock(lock, lockName)

  executeWithLock(lockName, callback, timeoutMs = 10000)

  handleLockTimeout(lockName, errorMessage)

  logLockEvent(eventType, lockName, detail)

\\\\n

### API_MemberHandlers.js
\\\javascript

  settleMemberAttendance(transactionId, overrideProductId, paymentMethod)

  validateProductIdOverride(memberId, overrideProductId)

  getUnpaidAttendanceList(sessionDate)

  generateTXNHASH(sourceTxnId, txnDate, amount, memberId, productId)

  generateNextLedgerId(prefix)

  getUserRole(email)

\\\\n

### API_ProductAndLedger.js
\\\javascript

  getProductById(productId)

  calculateMatFeeDueDate(lastPaidDate, coverageMonths)

  listActiveProducts()

  queryLedgerByMember(memberId)

  generateLedgerId()

  forensicAuditTX999999()

\\\\n

### API_ResponseHandler.js
\\\javascript

  respondWithSuccess(data, message = "Operation successful", options = {})

  respondWithError(errorCode, message, options = {})

  respondWithValidationError(fieldName, reason, options = {})

  respondWithAuthError(requiredRole, userRole = null, options = {})

  respondWithRateLimitError(userEmail, limit, window, options = {})

  respondWithInternalError(exception, context = "unknown", options = {})

  respondWithIdempotencyConflict(idempotencyKey, priorResult, options = {})

  logAPIError(errorCode, message, details, httpCode)

\\\\n

### API_Security.js
\\\javascript

  validateCSRFToken(token, sessionState)

  enforceRateLimit(email, limit = 10, window = 60000)

  checkIdempotencyKey(idempotencyKey)

  cacheIdempotencyKey(idempotencyKey, ttl = 3600000)

  authorizeUserRole(email, requiredRole)

  logSecurityEvent(eventType, status, detail, context)

\\\\n

### API_SecurityAndHelpers.js
\\\javascript

  generateTXNHASH(sourceTxnId, txnDate, signedAmount, memberId, productId)

  verifyUserRoleByEmail(userEmail)

  userHasRole(userEmail, minRequiredRole)

  storeIdempotencyKey(idempotencyKey, ledgerId, txnHash)

  checkIdempotencyKey(idempotencyKey, sourceSheet)

  checkRateLimit(userEmail)

  generateRcpId()

  generateCosId()

  generatePurId()

  generateAttId()

  generateMbrId()

  generateSupId()

  generateCounterId(counterKey, prefix)

  generateCSRFToken(userEmail)

  validateCSRFToken(userEmail, token, maxAgeSeconds = 3600)

  acquireLock(timeoutMs = 10000)

  releaseLock(lock)

  isValidMemberId(memberId)

  isValidProductId(productId)

  isValidAmount(amount, txnType)

  isValidTxnDate(txnDate)

  getCurrentUserEmail()

  getScriptTimeZone()

  formatLedgerDate(date)

  logSecurityEvent(eventType, userEmail, details)

\\\\n

### API_SettlementAndAttendance.js
\\\javascript

  settleMemberAttendance(attendanceTransactionId, paymentAmount, productIdOverride)

  validateProductIdOverride(bowlerId, overrideProductId)

  getUnpaidAttendanceList(filterDate, filterProductId, includeOverdue)

  getUserRole(email)

  generateLedgerId()

  generateTXNHASH(sourceTxnId, txnDate, signedAmount, memberId, productId)

\\\\n

### API_transactionLogic.js
\\\javascript

  generateTXNHASH(sourceTxnId, paymentDate, amount, partyId, category)

  validateTXNHASH(storedHash, sourceTxnId, paymentDate, amount, partyId, category)

  getNextLEDGERID()

  recordToLedger(txn)

  recordCOGS()

  generateTXNHASH(sourceTxnId, paymentDate, amount, partyId, category)

  validateTXNHASH(storedHash, sourceTxnId, paymentDate, amount, partyId, category)

  getNextLEDGERID()

  recordToLedger(txn)

  recordCOGSPair(params)

  atomicSettlementFlow(params)

  getProductPrice(productCode)

  calculateNextMatFeeDue(productCode, paymentDate)

  generateSourceTxnId(prefix = "RCP")

  validateTransactionIntegrity(ledgerId)

\\\\n

### AtomicSchemaApplier.js
\\\javascript

  initializeAuditLog()

  generateTxnId()

  logOperation(operation, sheetName, details, status)

  safeInsertColumn(sheetName, columnIndex, columnDef)

  safeDeleteColumn(sheetName, columnName)

  applySheetProtection(sheetName, allowEditEmails = [])

  removeSheetProtection(sheetName)

  validateSchemaModification(migrationPlan, sheetName, targetSchema)

  validateBusinessRulesForSheet(sheetName, targetSchema)

  createRollbackPoint(sheet, sheetName)

  executeRollback(rollbackId, sheetName)

  finalizeSchemaModification(migrationPlan, sheetName, targetSchema)

  recordMigrationCompletion(sheetName, migrationPlan, rollbackId, status, errorMsg = '')

  detectAndCleanupOrphans(sheetName, targetSchema)

  applyAtomicSchemaModification(sheetName, targetSchema, protectionConfig = {})

  detectCurrentSchema(sheetName)

  generateMigrationPlan(currentSchema, targetSchema, protectionConfig)

\\\\n

### Audit_Engine.js
\\\javascript

  generateTX999999AuditReport()

\\\\n

### Cashier_Engine.js
\\\javascript

  processManualCashierReceipt(memberID, productID, rawAmount, paymentMethod, notes)

  updateMemberLifecycleDates(sheet, memberID, productRecord)

  healAttendanceLogWithReceiptToken(sheet, memberID, receiptId)

\\\\n

### Checkin_Engine.js
\\\javascript

  processMobileCheckInGate(memberId, checkInDate)

  processManualCheckInGate(memberId, checkInDate)

  performCheckInLogic(memberId, checkInDate)

  getMemberByIdentifier(identifier)

  recordAttendance(memberId, checkInDate, subscriptionStatus, productId, paymentStatus)

  normalizeDate(dateInput)

  datesEqual(date1, date2)

  isAfter(date1, date2)

  isBefore(date1, date2)

  isSameOrAfter(date1, date2)

  isSameOrBefore(date1, date2)

  hasCheckedInToday(memberId, checkInDate)

  testCheckInLogic()

  testGetMemberByIdentifier()

  testRecordAttendance()

  testDateNormalization()

\\\\n

### CodebaseCatalog.js
\\\javascript

  searchCodebaseLocal()

  listCodebaseFiles()

\\\\n

### ComplianceReportGenerator.js
\\\javascript

  testTraceabilityValidator()

  traceabilityMatrixValidator(spreadsheetId)

\\\\n

### Draw_LotsEngine.js
\\\javascript

  executeDynamicDrawLots()

  calculateSymmetricalMatSlices(count)

  buildTeamRoleMatrix(sheet, dateStr, matNum, players, timestamp)

  getLiveDrawLotsRows()

\\\\n

### Forensic_Logger.js
\\\javascript

  runForensicActiveFieldTrace()

\\\\n

### FunctionInvetoryParser.js
\\\javascript

  getAllScriptFilesForInventory()

  getAllScriptFilesManualFallback()

  extractAllFunctionSignatures(scriptFiles)

  nameHere(param1, param2, ...)

  validateGoldenListFunctions(functionMap)

  isUtilityFunction(functionName)

  runFunctionInventoryAudit()

  generateInventoryReport(report)

  auditFunctionInventory()

  saveAuditReportToSheet(report, formattedText)

  validateRBACMatrix(functionMap)

  validateFunctionParameters(functionMap)

  generateComplianceMatrix(inventoryReport, rbacReport, paramReport)

  exportAuditAsJSON()

  parseFunctionInventory()

  captureEnvironment()

  validateCrossModuleConsistency(report)

  identifyMissingFunctions(report)

  generateSummary(report, startTime)

  exportReportToDocument(report, folderName)

  validateParserOutput()

\\\\n

### HTMLFrontendvalidator.js
\\\javascript

  scanHTMLForScriptCalls()

  extractScriptRunCalls(htmlSource)

  parseParameters(paramString)

  getLineNumber(source, matchIndex)

  validateFrontendCallsAgainstGoldenList(htmlInventory, goldenList)

  scanHTMLForScriptCalls()

  extractScriptRunCalls(htmlSource)

  validateFrontendCallsAgainstGoldenList(htmlScanResults, goldenList)

  analyzeOrphans(htmlScanResults, goldenList)

  validateRBACOnFrontendCalls(validCalls, goldenList)

  validateFrontendIntegrity()

  determineCompletionStatus(validationReport)

\\\\n

### Initialization.js
\\\javascript

  inspectAllSheetHeadersAndNames()

  initializeSystem()

  executeSynchronizedDataSeeding(ss)

\\\\n

### Product_Manager.js
\\\javascript

  getProductsStandalone()

  saveProductStandalone(sku, name, price, activeFlag)

\\\\n

### QR_Generator.js
\\\javascript

  generateDailyQRCode()

  getDailyQRCode()

  setupDailyQRTrigger()

\\\\n

### Record_Management.js
\\\javascript

  getRowAsObject_(headers, rowValues)

  getHeaderIndex_(headers, possibleNames)

  fetchAllMembersList()

  fetchAllProductTypesList()

  updateMemberRecordAtomic(memberID, fields)

  updateProductRecordAtomic(productID, name, price, isActiveFlag)

  toggleProductActiveStatus(productID, toggleFlag)

\\\\n

### SchemaOrchestrator.js
\\\javascript

  initializeSchemaOrchestrator()

\\\\n

### SchemeMigrator.js
\\\javascript

  detectDrift()

  validateBusinessRules()

  runFullMigrationCycle()

  onOpen(e)

  onOpen()

\\\\n

### Scheme_Migration_Discovery.js
\\\javascript

  discoverMigrationPatterns()

  identifyMigrationFunctions()

  runSchemaMigration()

  executeMigrationCycle()

  applyAtomicSchemaModification()

  allocateMemberId()

  getNextId(prefix)

  updateSystemConfig(key, value)

  safeInsertColumn(sheet, position, header)

  safeDeleteColumn(sheet, columnLetter)

  getColumnIndex(sheet, header)

  generateTXNHASH(txnData)

  SHA256(data)

\\\\n

### SystemStartup.js
\\\javascript

  onOpen()

  launchSystemWorkspace()

  fetchUserMetadataRecord_(email)

  executeForensicSystemAudit()

  lockProductionSheetsNatively()

\\\\n

### System_Catalog_Scanner.js
\\\javascript

  isCatalogStale()

  runAkamasLiveSystemCatalogScanner()

  getCatalogColumnIndex(sheetName, fieldName)

  getCatalogColumnsForSheet(sheetName)

  updateSystemConfigTimestamp(paramKey, paramValue)

  showDiagnostics()

\\\\n

### Workbook_Explorer.js
\\\javascript

  exploreWorkbookSchema()

  exploreProjectFunctions()

  checkSchemaDrift()

  runFullDiagnostics()

  searchCodebaseForPhrases()

  getAllScriptFilesFromProject()

  getAllScriptFilesManual()

  outputSearchResults(results)

  onOpen()

\\\\n
