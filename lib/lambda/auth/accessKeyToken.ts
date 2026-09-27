import { APIGatewayProxyHandler } from 'aws-lambda';
import { createHash } from 'crypto';
import { HttpError, withErrorHandling } from '../common/errorHandler';
import { json } from '../common/response';
import { parseJsonBody } from '../common/validation';
import { issueJwt } from './jwtIssue';

const KMS_KEY_ID = process.env.KMS_KEY_ID!;
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'fasse-auth';

// メンバーごとに個別発行したAccessKeyのSHA-256ハッシュ -> メンバー識別子のマップ。
// 平文のAccessKeyをLambda側でも保持しない(docs/specs/authentication REQ-102)。
// dev環境・stg環境は同一のマップを共用する(REQ-108)。
function loadAccessKeyHashMap(): Record<string, string> {
  const raw = process.env.ACCESS_KEY_HASH_MAP_JSON;
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

function hashAccessKey(accessKey: string): string {
  return createHash('sha256').update(accessKey).digest('hex');
}

// ルートA(AccessKey): docs/specs/authentication REQ-102, design.md 3.1「エラー応答」
const accessKeyTokenHandler: APIGatewayProxyHandler = async (event) => {
  const { accessKey } = parseJsonBody(event);
  if (typeof accessKey !== 'string' || !accessKey) {
    throw new HttpError(400, 'accessKey is required');
  }

  const memberId = loadAccessKeyHashMap()[hashAccessKey(accessKey)];
  if (!memberId) {
    throw new HttpError(401, 'invalid accessKey');
  }

  // KMS Signの失敗は未処理例外としてwithErrorHandlingが500を返す
  const token = await issueJwt({ sub: memberId, keyId: KMS_KEY_ID, issuer: JWT_ISSUER });
  return json(200, { token });
};

export const handler = withErrorHandling(accessKeyTokenHandler);
