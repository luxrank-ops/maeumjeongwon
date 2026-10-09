'use strict';

const crypto = require('crypto');

const UID_RE = /^mj_[0-9a-f]{32}$/;
const TOKEN_RE = /^mj1\.(mj_[0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/;

function sign(secret, uid) {
  return crypto.createHmac('sha256', secret).update('mj1.' + uid).digest('base64url');
}

function issue(secret) {
  const uid = 'mj_' + crypto.randomBytes(16).toString('hex');
  return { uid, token: `mj1.${uid}.${sign(secret, uid)}` };
}

function verify(secret, token) {
  if (typeof token !== 'string') return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const expect = Buffer.from(sign(secret, m[1]));
  const got = Buffer.from(m[2]);
  return expect.length === got.length && crypto.timingSafeEqual(expect, got) ? m[1] : null;
}

module.exports = {
  UID_RE,
  TOKEN_RE,
  sign,
  issue,
  verify
};
