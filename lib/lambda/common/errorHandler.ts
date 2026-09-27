import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from './logger';
import { json } from './response';

// 利用者に返してよい想定内のエラー(400/401/404等)。messageはそのままレスポンスに含める
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

// 各Lambdaのハンドラ最上位に置く共通エラーハンドラ(docs/specs/purchase-sales design.md「入力検証・エラー応答」)。
// HttpErrorはそのステータスで、それ以外の未処理例外は500で返す。いずれもレスポンスにrequestIdを含め、
// 500の内部詳細(スタックトレース等)はログにのみ出力する
export function withErrorHandling(handler: APIGatewayProxyHandler): APIGatewayProxyHandler {
  return async (event, context, callback) => {
    logger.addContext(context);
    const requestId = context.awsRequestId;
    const request = { method: event.httpMethod, path: event.path };
    try {
      const result = await handler(event, context, callback);
      return result as APIGatewayProxyResult;
    } catch (error) {
      if (error instanceof HttpError) {
        logger.warn('request rejected', { ...request, statusCode: error.statusCode, reason: error.message });
        return json(error.statusCode, { message: error.message, requestId });
      }
      logger.error('unhandled error', { ...request, error: error as Error });
      return json(500, { message: 'Internal Server Error', requestId });
    }
  };
}
