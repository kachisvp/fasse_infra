import { APIGatewayProxyHandler } from 'aws-lambda';
import { createHash } from 'crypto';
import { json } from '../common/response';
import { issueJwt } from './jwtIssue';

const KMS_KEY_ID = process.env.KMS_KEY_ID!;
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'fasse-auth';

// メンバーごとに個別発行したAccessKeyのSHA-256ハッシュ -> メンバー識別子のマップ。
// 平文のAccessKeyをLambda側でも保持しない(docs/spec/authentication REQ-102)。
// dev環境・stg環境は同一のマップを共用する(REQ-108)。
function loadAccessKeyHashMap(): Record<string, string> {
  const raw = process.env.ACCESS_KEY_HASH_MAP_JSON;
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

function hashAccessKey(accessKey: string): string {
  return createHash('sha256').update(accessKey).digest('hex');
}

// ルートA(AccessKey): docs/spec/authentication REQ-102, design.md 3.1
export const handler: APIGatewayProxyHandler = async (event) => {
  let body: { accessKey?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return json(400, { message: 'invalid request body' });
  }

  const accessKey = body.accessKey;
  if (!accessKey) {
    return json(400, { message: 'accessKey is required' });
  }

  const memberId = loadAccessKeyHashMap()[hashAccessKey(accessKey)];
  if (!memberId) {
    return json(401, { message: 'invalid accessKey' });
  }

  const token = await issueJwt({ sub: memberId, keyId: KMS_KEY_ID, issuer: JWT_ISSUER });
  return json(200, { token });
};
