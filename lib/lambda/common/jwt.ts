import { createPublicKey, verify as cryptoVerify } from 'crypto';

export interface JwtClaims {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

function base64UrlDecodeJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

// KMSのRSASSA_PKCS1_V1_5_SHA_256(alg: RS256)で署名されたJWTを、エクスポート済みの
// KMS公開鍵(PEM)で検証する。KMSへの都度アクセスは発生しない(docs/spec/authentication REQ-202)。
export function verifyJwt(token: string, publicKeyPem: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string };
  let payload: JwtClaims;
  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const signature = Buffer.from(signatureB64, 'base64url');
  const signedData = `${headerB64}.${payloadB64}`;
  const publicKey = createPublicKey(publicKeyPem);
  const isValid = cryptoVerify('RSA-SHA256', Buffer.from(signedData), publicKey, signature);
  if (!isValid) return null;

  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp * 1000) {
    return null;
  }

  return payload;
}
