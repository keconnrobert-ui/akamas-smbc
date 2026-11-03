/**
 * Minimal QR check-in demonstration.
 * This slice only demonstrates scanning a daily session QR and receiving a
 * welcome for a non-empty test identifier. It does not read or write member,
 * attendance, payment, or ledger records.
 */
function getQrDemoSessionInfo() {
  try {
    const baseUrl = ScriptApp.getService().getUrl();
    if (!baseUrl) {
      return { ok: false, code: 'NOT_DEPLOYED', message: 'Deploy the web app before displaying its QR code.', data: null, errors: [], meta: {} };
    }

    const timezone = Session.getScriptTimeZone();
    const sessionDate = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
    const sessionUrl = baseUrl + '?page=checkin&sessionDate=' + encodeURIComponent(sessionDate);
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(sessionUrl);

    return {
      ok: true,
      code: 'SUCCESS',
      message: 'Today’s session QR is ready.',
      data: { sessionDate: sessionDate, sessionUrl: sessionUrl, qrUrl: qrUrl },
      errors: [],
      meta: {}
    };
  } catch (error) {
    return { ok: false, code: 'QR_SETUP_ERROR', message: 'Could not prepare the session QR code.', data: null, errors: [{ field: 'qr', code: 'UNAVAILABLE', message: error.message }], meta: {} };
  }
}

function demoQrCheckIn(identifier, sessionDate) {
  const value = String(identifier || '').trim();
  if (!value) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Enter a test identifier to continue.', data: null, errors: [{ field: 'identifier', code: 'REQUIRED', message: 'Identifier is required.' }], meta: {} };
  }
  if (value.length > 100) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'The identifier is too long.', data: null, errors: [{ field: 'identifier', code: 'TOO_LONG', message: 'Use 100 characters or fewer.' }], meta: {} };
  }

  const timezone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const date = String(sessionDate || today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'The session date is invalid.', data: null, errors: [{ field: 'sessionDate', code: 'INVALID_DATE', message: 'Expected YYYY-MM-DD.' }], meta: {} };
  }

  return {
    ok: true,
    code: 'DEMO_WELCOME',
    message: 'Welcome to Akamas Short Mat Bowls Club!',
    data: { identifier: value, sessionDate: date, demoOnly: true },
    errors: [],
    meta: { note: 'Demonstration only: no attendance or payment has been recorded.' }
  };
}
