import { generateKeyPairSync, KeyObject, sign } from 'crypto';

export interface TestKeyPair {
  privateKey: KeyObject;
  publicKeyPem: string;
  publicJwk: Record<string, unknown>;
}

export function generateTestKeyPair(): TestKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    publicJwk: publicKey.export({ format: 'jwk' }) as Record<string, unknown>,
  };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

// RS256で署名したJWTを生成する(テスト用)
export function signTestJwt(
  privateKey: KeyObject,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' },
): string {
  const signedData = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = sign('RSA-SHA256', Buffer.from(signedData), privateKey).toString('base64url');
  return `${signedData}.${signature}`;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
