/**
 * API_LockManager.gs
 * Centralized lock acquisition, release, and error handling.
 * Provides safe lock wrapping with timeout and fallback strategies.
 */

/**
 * Acquires a script-level lock with configurable timeout.
 * @param {string} lockName - Identifier for the lock (e.g., 'TRANSACTION_WRITE')
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Lock|null} Lock object if acquired, null if timed out
 */
function acquireLock(lockName, timeoutMs = 10000) {
  try {
    const lock = LockService.getScriptLock();
    const acquired = lock.tryLock(timeoutMs);
    
    if (!acquired) {
      logLockEvent('ACQUIRE_TIMEOUT', lockName, timeoutMs);
      return null;
    }
    
    logLockEvent('ACQUIRED', lockName, timeoutMs);
    return lock;
  } catch (e) {
    logLockEvent('ACQUIRE_ERROR', lockName, e.message);
    return null;
  }
}

/**
 * Safely releases a lock.
 * @param {Lock} lock - Lock object from acquireLock()
 * @param {string} lockName - Identifier for logging
 */
function releaseLock(lock, lockName) {
  try {
    if (lock && lock.hasLock()) {
      lock.releaseLock();
      logLockEvent('RELEASED', lockName, 0);
    }
  } catch (e) {
    logLockEvent('RELEASE_ERROR', lockName, e.message);
  }
}

/**
 * Executes a callback function while holding a lock.
 * Automatically acquires, executes, and releases the lock.
 * @param {string} lockName - Identifier for the lock
 * @param {Function} callback - Function to execute (receives lock as parameter)
 * @param {number} timeoutMs - Lock timeout in milliseconds (default 10000)
 * @returns {*} Result from callback, or null if lock acquisition failed
 */
function executeWithLock(lockName, callback, timeoutMs = 10000) {
  const lock = acquireLock(lockName, timeoutMs);
  
  if (!lock) {
    handleLockTimeout(lockName, 'Failed to acquire lock within ' + timeoutMs + 'ms');
    return null;
  }
  
  try {
    return callback(lock);
  } catch (e) {
    logLockEvent('CALLBACK_ERROR', lockName, e.message);
    throw e;
  } finally {
    releaseLock(lock, lockName);
  }
}

/**
 * Handles lock timeout errors gracefully.
 * @param {string} lockName - Lock identifier
 * @param {string} errorMessage - Error details
 */
function handleLockTimeout(lockName, errorMessage) {
  const message = `LOCK TIMEOUT [${lockName}]: ${errorMessage}. Request queued. Please retry.`;
  
  console.error(message);
  
  // Could integrate with alert system:
  // - Email manager: "High concurrency detected"
  // - Store in System Config: 'LAST_LOCK_TIMEOUT'
  // For now, log and return to caller
}

/**
 * Lightweight lock event logger.
 * @param {string} eventType - ACQUIRED, RELEASED, ACQUIRE_TIMEOUT, ACQUIRE_ERROR, RELEASE_ERROR, CALLBACK_ERROR
 * @param {string} lockName - Lock identifier
 * @param {*} detail - Additional context
 */
function logLockEvent(eventType, lockName, detail) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] LOCK | ${eventType} | ${lockName} | ${detail}`);
}
