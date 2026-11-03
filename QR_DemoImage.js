/** Fetch the QR image through Apps Script so the display browser does not need to reach the QR provider directly. */
function getQrDemoImageData() {
  const session = getQrDemoSessionInfo();
  if (!session || !session.ok) return session;

  try {
    const response = UrlFetchApp.fetch(session.data.qrUrl, { muteHttpExceptions: true });
    const status = response.getResponseCode();
    const blob = response.getBlob();
    const mimeType = blob.getContentType();
    if (status !== 200 || !/^image\/(png|jpeg|gif)$/i.test(mimeType)) {
      throw new Error('QR image provider returned an unexpected response (' + status + ').');
    }

    const imageData = Utilities.base64Encode(blob.getBytes());
    return {
      ok: true,
      code: 'SUCCESS',
      message: 'Session QR image loaded.',
      data: {
        sessionDate: session.data.sessionDate,
        sessionUrl: session.data.sessionUrl,
        imageDataUrl: 'data:' + mimeType + ';base64,' + imageData
      },
      errors: [],
      meta: {}
    };
  } catch (error) {
    return {
      ok: false,
      code: 'QR_IMAGE_ERROR',
      message: 'Could not load the QR image. Use the direct check-in link instead.',
      data: { sessionDate: session.data.sessionDate, sessionUrl: session.data.sessionUrl },
      errors: [{ field: 'qr', code: 'IMAGE_UNAVAILABLE', message: error.message }],
      meta: {}
    };
  }
}
