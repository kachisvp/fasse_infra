import { APIGatewayProxyHandler } from 'aws-lambda';
import { HttpError, withErrorHandling } from '../../lib/lambda/common/errorHandler';
import { logger } from '../../lib/lambda/common/logger';
import { buildEvent, invoke, TEST_REQUEST_ID } from '../helpers/lambda';

describe('withErrorHandling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('ハンドラの戻り値をそのまま返す', async () => {
    const inner: APIGatewayProxyHandler = async () => ({ statusCode: 200, body: 'ok' });
    const result = await invoke(withErrorHandling(inner), buildEvent());
    expect(result).toEqual({ statusCode: 200, body: 'ok' });
  });

  test('HttpErrorはそのステータスとmessage・requestIdを返し、WARNログを出力する', async () => {
    const warn = jest.spyOn(logger, 'warn');
    const inner: APIGatewayProxyHandler = async () => {
      throw new HttpError(400, 'invalid or missing fields: name');
    };
    const result = await invoke(withErrorHandling(inner), buildEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'invalid or missing fields: name',
      requestId: TEST_REQUEST_ID,
    });
    expect(warn).toHaveBeenCalled();
  });

  test('予期しない例外は500(固定文言)を返し、内部詳細をレスポンスに含めずERRORログに出力する', async () => {
    const error = jest.spyOn(logger, 'error');
    const inner: APIGatewayProxyHandler = async () => {
      throw new Error('secret internal detail');
    };
    const result = await invoke(withErrorHandling(inner), buildEvent());
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ message: 'Internal Server Error', requestId: TEST_REQUEST_ID });
    expect(result.body).not.toContain('secret internal detail');
    expect(error).toHaveBeenCalled();
  });
});
