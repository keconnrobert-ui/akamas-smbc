# Refactor plan for akamas-smbc

This directory is intentionally isolated from the current runtime files. The goal is to capture the canonical logic that should exist once duplicated behavior is removed from the live modules.

## 1. Primary duplication problems

The repository currently duplicates the same behaviour across multiple files:

- Security logic: RBAC, CSRF validation, rate limiting, idempotency
- Ledger ID generation and transaction hash generation
- Attendance settlement and unpaid attendance logic
- System_Config access and counter increment patterns
- Role resolution logic from User sheet data

## 2. Target architecture

Use a small set of canonical modules, each with a single responsibility:

- RF_CoreConfig.js
  - system config reads and writes
  - counter generation helpers
  - common key/value helpers

- RF_CoreSecurity.js
  - CSRF generation and validation
  - rate limiting
  - idempotency cache
  - role authorisation
  - security audit logging

- RF_CoreLedger.js
  - TXNHASH generation and validation
  - Ledger ID generation
  - source transaction ID generation
  - ledger append logic

- RF_CoreAttendance.js
  - settlement workflow
  - override validation
  - unpaid attendance listing
  - user role lookup

## 3. Recommended migration order

### Phase 1: standardize names and common data access
- consolidate all access to System_Config into RF_CoreConfig.js
- standardize on the same key format (`NEXT_LEDGERID`, `NEXT_RCP_ID`, etc.)
- update all modules to read/write through a single helper layer

### Phase 2: centralise security logic
- remove duplicate implementations of validateCSRFToken, enforceRateLimit, checkIdempotencyKey
- ensure every request path uses the same helper functions

### Phase 3: centralise ledger logic
- replace `generateTXNHASH` duplicates with a single implementation
- make all ledger writes use `RF_recordToLedger`
- enforce one source of truth for `generateLedgerId` and `generateSourceTxnId`

### Phase 4: centralise attendance logic
- remove duplicate settlement logic from API_SettlementAndAttendance.js and API_MemberHandlers.js
- one canonical `RF_settleMemberAttendance` and one `RF_validateProductIdOverride`

### Phase 5: keep API wrappers thin
- API_Gateway.js should route to the shared helpers, not own implementation logic
- API_Security.js and API_MemberHandlers.js become light wrappers or can be deprecated

## 4. Canonical function map

| Concern | Canonical helper | Notes |
| --- | --- | --- |
| CSRF token | RF_generateCSRFToken / RF_validateCSRFToken | replace duplicate implementations |
| Rate limit | RF_enforceRateLimit | one implementation only |
| Idempotency | RF_checkIdempotencyKey / RF_cacheIdempotencyKey | one implementation only |
| User role | RF_authorizeUserRole / RF_getUserRole | same logic, one canonical version |
| TXNHASH | RF_generateTXNHASH / RF_validateTXNHASH | single source of truth |
| Ledger ID | RF_generateLedgerId / RF_generateSourceTxnId | single source of truth |
| Ledger append | RF_recordToLedger | used by all transaction writes |
| Attendance settlement | RF_settleMemberAttendance | canonical settlement flow |
| Override validation | RF_validateProductIdOverride | centralised logic |
| Unpaid attendance | RF_getUnpaidAttendanceList | centralised logic |

## 5. Example adoption pattern

```javascript
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const userEmail = Session.getActiveUser().getEmail();

  if (!RF_authorizeUserRole(userEmail, payload.requiredRole)) {
    return { success: false, error: 'RBAC_DENIED' };
  }

  if (!RF_validateCSRFToken(payload.csrfToken, userEmail)) {
    return { success: false, error: 'CSRF_INVALID' };
  }

  return RF_settleMemberAttendance(payload.attendanceTransactionId, payload.paymentAmount, payload.productIdOverride);
}
```

## 6. Notes for safe migration

- Do not delete original files immediately; first re-export wrappers from the RF_ modules.
- Add tests for the canonical helpers before removing duplicates.
- Keep old API names for compatibility while switching the call sites over.
- Ensure the same sheet schema assumptions are applied consistently across all modules.

This refactor reduces duplicate logic, makes behavior deterministic, and lowers the risk of future bugs caused by drift between implementations.
