'use strict';

const crypto = require('crypto');

function parseCallback(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') return null;
  const sigIdx = rawQuery.indexOf('&signature=');
  const keyIdx = rawQuery.indexOf('&key_id=');
  if (sigIdx < 0 || keyIdx < 0) return null;
  const content = rawQuery.slice(0, sigIdx);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get('signature') || '';
  const keyId = params.get('key_id') || '';
  if (!content || !signature || !keyId) return null;
  return {
    content: decodeURIComponent(content),
    rawContent: content,
    signature,
    keyId,
    params
  };
}

function verifySignature(content, signatureB64Url, pem) {
  try {
    const sig = Buffer.from(signatureB64Url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const verify = crypto.createVerify('SHA256');
    verify.update(content);
    verify.end();
    return verify.verify(pem, sig);
  } catch (e) {
    return false;
  }
}

module.exports = {
  parseCallback,
  verifySignature
};
