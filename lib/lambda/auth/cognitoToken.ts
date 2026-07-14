import { APIGatewayProxyHandler } from 'aws-lambda';
import { createPublicKey, verify as cryptoVerify } from 'crypto';
import { json } from '../common/response';
import { issueJwt } from './jwtIssue';

const KMS_KEY_ID = process.env.KMS_KEY_ID!;
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'fasse-auth';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const COGNITO_REGION = process.env.COGNITO_REGION!;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID!;

// dev環境のルートBも、専用のUser Poolを持たずstg環境のこの値を共用する(REQ-107)
const COGNITO_ISSUER = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`;
const JWKS_URL = `${COGNITO_ISSUER}/.well-known/jwks.json`;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

// Lambda実行環境がウォームな間はJWKSを再取得しない(KMSキー同様、都度アクセスを避ける)
let cachedJwks: Jwk[] | undefined;

async function getJwks(): Promise<Jwk[]> {
  if (cachedJwks) return cachedJwks;
  const response = await fetch(JWKS_URL);
  if (!response.ok) {
    throw new Error(`failed to fetch JWKS: ${response.status}`);
  }
  const data = (await response.json()) as { keys: Jwk[] };
  cachedJwks = data.keys;
  return cachedJwks;
}

function base64UrlDecodeJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

interface IdTokenPayload {
  sub: string;
  email?: string;
  iss?: string;
  aud?: string;
  exp?: number;
}

// ルートB(Cognito ID Token): docs/spec/authentication REQ-103, design.md 3.1
async function verifyIdToken(idToken: string): Promise<{ sub: string; email?: string } | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: IdTokenPayload;
  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  const jwk = (await getJwks()).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const publicKey = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' });
  const signature = Buffer.from(signatureB64, 'base64url');
  const isValid = cryptoVerify('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), publicKey, signature);
  if (!isValid) return null;

  if (payload.iss !== COGNITO_ISSUER) return null;
  if (payload.aud !== COGNITO_CLIENT_ID) return null;
  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp * 1000) return null;

  return { sub: payload.sub, email: payload.email };
}

export const handler: APIGatewayProxyHandler = async (event) => {
  let body: { idToken?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { message: 'invalid request body' });
  }

  const idToken = body.idToken;
  if (!idToken) {
    return json(400, { message: 'idToken is required' });
  }

  const claims = await verifyIdToken(idToken);
  if (!claims) {
    return json(401, { message: 'invalid idToken' });
  }

  // Cognitoのsub(ユーザー識別子)を自前JWTのsubに引き継ぐ(REQ-106)
  const token = await issueJwt({ sub: claims.sub, keyId: KMS_KEY_ID, issuer: JWT_ISSUER });
  return json(200, { token });
};
