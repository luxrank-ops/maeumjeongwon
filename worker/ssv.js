'use strict';

// AdMob 보상형 광고 SSV 콜백 검증 — Worker(WebCrypto) 판.
// 서버 판(server/ssv.js)과 같은 파싱 규칙을 쓰고, 서명 검증만 WebCrypto 로 한다.
// (구글 verifier-keys.json 의 키는 P-256 ECDSA, 서명은 DER 인코딩이라 r||s 로 풀어서 검증한다)

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

let keysCache = null;
let keysFetchedAt = 0;

export function parseCallback(rawQuery) {
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

function b64urlToBytes(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pemToBytes(pem) {
  const body = String(pem || '')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return b64urlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_'));
}

// DER (SEQUENCE { INTEGER r, INTEGER s }) → r||s (P-256 는 각 32바이트)
function derToRaw(sig) {
  if (sig[0] !== 0x30) return null;
  let i = 2;
  if (sig[1] & 0x80) i = 2 + (sig[1] & 0x7f);
  const parts = [];
  for (let k = 0; k < 2; k++) {
    if (sig[i] !== 0x02) return null;
    const len = sig[i + 1];
    let val = sig.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (val.length > 32 && val[0] === 0) val = val.slice(1);
    if (val.length < 32) {
      const pad = new Uint8Array(32 - val.length);
      val = new Uint8Array([...pad, ...val]);
    }
    parts.push(val);
  }
  const out = new Uint8Array(64);
  out.set(parts[0], 0);
  out.set(parts[1], 32);
  return out;
}

// keyId → SPKI 바이트
export async function fetchAdMobKey(keyId) {
  const now = Date.now();
  if (!keysCache || now - keysFetchedAt > 3600000) {
    const res = await fetch(KEYS_URL, { cf: { cacheTtl: 3600 } });
    if (!res.ok) throw new Error('keys_' + res.status);
    keysCache = await res.json();
    keysFetchedAt = now;
  }
  const list = (keysCache && keysCache.keys) || [];
  const hit = list.find(k => String(k.keyId) === String(keyId));
  if (!hit) return null;
  return hit.pem ? pemToBytes(hit.pem) : b64urlToBytes(hit.base64 || '');
}

export async function verifySignature(content, signatureB64Url, spkiBytes) {
  try {
    const key = await crypto.subtle.importKey(
      'spki',
      spkiBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const der = b64urlToBytes(signatureB64Url);
    const raw = derToRaw(der);
    if (!raw) return false;
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      raw,
      new TextEncoder().encode(content)
    );
  } catch (e) {
    return false;
  }
}
