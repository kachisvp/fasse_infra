import { APIGatewayProxyHandler } from 'aws-lambda';
import { createPublicKey, verify as cryptoVerify } from 'crypto';
import { HttpError, withErrorHandling } from '../common/errorHandler';
import { json } from '../common/response';
import { parseJsonBody } from '../common/validation';
import { issueJwt } from './jwtIssue';

const KMS_KEY_ID = process.env.KMS_KEY_ID!;
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'fasse-auth';
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';
const COGNITO_REGION = process.env.COGNITO_REGION ?? '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? '';

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

// JWKSの取得失敗は利用者の認証情報の問題ではないため401にせず、例外としてwithErrorHandlingで500にする
// (design.md 3.1節「エラー応答」)

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

// ルートB(Cognito ID Token): docs/specs/authentication REQ-103, design.md 3.1
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

  const signature = Buffer.from(signatureB64, 'base64url');
  let isValid: boolean;
  try {
    const publicKey = createPublicKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' });
    isValid = cryptoVerify('RSA-SHA256', Buffer.from(`${headerB64}.${payloadB64}`), publicKey, signature);
  } catch {
    // JWKSの内容が不正な場合もクラッシュ(500系)ではなく検証NG(401)として扱う
    return null;
  }
  if (!isValid) return null;

  if (payload.iss !== COGNITO_ISSUER) return null;
  if (payload.aud !== COGNITO_CLIENT_ID) return null;
  if (typeof payload.exp !== 'number' || Date.now() >= payload.exp * 1000) return null;

  return { sub: payload.sub, email: payload.email };
}

const cognitoTokenHandler: APIGatewayProxyHandler = async (event) => {
  const { idToken } = parseJsonBody(event);
  if (typeof idToken !== 'string' || !idToken) {
    throw new HttpError(400, 'idToken is required');
  }

  // Cognito設定が未設定の間はJWKSを取得せず401を返す(フェイルクローズ。design.md 3.1節「エラー応答」)
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
    throw new HttpError(401, 'cognito is not configured');
  }

  const claims = await verifyIdToken(idToken);
  if (!claims) {
    throw new HttpError(401, 'invalid idToken');
  }

  // Cognitoのsub(ユーザー識別子)を自前JWTのsubに引き継ぐ(REQ-106)
  const token = await issueJwt({ sub: claims.sub, keyId: KMS_KEY_ID, issuer: JWT_ISSUER });
  return json(200, { token });
};

export const handler = withErrorHandling(cognitoTokenHandler);
