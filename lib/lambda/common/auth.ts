import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { json } from './response';
import { verifyJwt } from './jwt';

function unauthorized(message: string): APIGatewayProxyResult {
  return json(401, { message });
}

// WebAPI受口(検証ロジック)は常に単一形式のJWTのみを検証する(docs/spec/authentication REQ-201)。
// KMS公開鍵はデプロイ時にLambda環境変数へ設置し、リクエストの都度KMSへアクセスしない(REQ-202)。
export function withJwtAuth(handler: APIGatewayProxyHandler): APIGatewayProxyHandler {
  return async (event, context, callback) => {
    const authHeader = event.headers?.Authorization ?? event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized('Authorization header is missing or malformed');
    }

    const publicKeyPem = process.env.JWT_PUBLIC_KEY_PEM;
    if (!publicKeyPem) {
      return unauthorized('JWT public key is not configured');
    }

    const token = authHeader.slice('Bearer '.length);
    const claims = verifyJwt(token, publicKeyPem);
    if (!claims) {
      return unauthorized('Invalid or expired token');
    }

    const result = await handler(event, context, callback);
    return result as APIGatewayProxyResult;
  };
}
