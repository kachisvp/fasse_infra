import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { HttpError } from './errorHandler';
import { verifyJwt } from './jwt';

// WebAPI受口(検証ロジック)は常に単一形式のJWTのみを検証する(docs/specs/authentication REQ-201)。
// KMS公開鍵はデプロイ時にLambda環境変数へ設置し、リクエストの都度KMSへアクセスしない(REQ-202)。
// 検証NGはHttpError(401)としてwithErrorHandlingがレスポンスに変換する(REQ-204)
export function withJwtAuth(handler: APIGatewayProxyHandler): APIGatewayProxyHandler {
  return async (event, context, callback) => {
    const authHeader = event.headers?.Authorization ?? event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpError(401, 'Authorization header is missing or malformed');
    }

    const publicKeyPem = process.env.JWT_PUBLIC_KEY_PEM;
    if (!publicKeyPem) {
      throw new HttpError(401, 'JWT public key is not configured');
    }

    const token = authHeader.slice('Bearer '.length);
    const claims = verifyJwt(token, publicKeyPem);
    if (!claims) {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const result = await handler(event, context, callback);
    return result as APIGatewayProxyResult;
  };
}
