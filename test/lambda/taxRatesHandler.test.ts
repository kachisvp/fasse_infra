process.env.TAX_RATE_TABLE = 'test-m-tax-rate';

import { mockClient } from 'aws-sdk-client-mock';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { ddb } from '../../lib/lambda/common/dynamodb';
import { withErrorHandling } from '../../lib/lambda/common/errorHandler';
import { createTaxRatesHandler } from '../../lib/lambda/common/taxRatesHandler';
import { buildEvent, invoke } from '../helpers/lambda';

const ddbMock = mockClient(ddb);
const taxRatesHandler = withErrorHandling(createTaxRatesHandler());
const handler = (event: APIGatewayProxyEvent) => invoke(taxRatesHandler, event);

const key = { taxCategory: 'STANDARD', validFrom: '2019-10-01' };
const existing = {
  tax_category: 'STANDARD',
  valid_from: '2019-10-01',
  description: '標準税率',
  rate: 0.1,
  created_at: '2026-01-01T00:00:00.000Z',
};
const validInput = { tax_category: 'REDUCED', description: '軽減税率', rate: 0.08, valid_from: '2019-10-01' };

describe('taxRatesHandler', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  test('GET一覧: tax_category未指定の場合はScanで全件を返す', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [existing] });
    const result = await handler(buildEvent({ httpMethod: 'GET' }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([existing]);
  });

  test('GET一覧: tax_category指定の場合はその区分をQueryで返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [existing] });
    const result = await handler(buildEvent({ httpMethod: 'GET', queryStringParameters: { tax_category: 'STANDARD' } }));
    expect(result.statusCode).toBe(200);
    expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.ExpressionAttributeValues).toEqual({
      ':c': 'STANDARD',
    });
  });

  test('GET一覧: tax_categoryがENUM外なら400', async () => {
    const result = await handler(buildEvent({ httpMethod: 'GET', queryStringParameters: { tax_category: 'X' } }));
    expect(result.statusCode).toBe(400);
  });

  test('GET単体: 存在すれば200、無ければ404', async () => {
    ddbMock.on(GetCommand).resolvesOnce({ Item: existing }).resolvesOnce({});
    expect((await handler(buildEvent({ httpMethod: 'GET', pathParameters: key }))).statusCode).toBe(200);
    expect((await handler(buildEvent({ httpMethod: 'GET', pathParameters: key }))).statusCode).toBe(404);
  });

  test.each([
    ['taxCategoryがENUM外', { taxCategory: 'X', validFrom: '2019-10-01' }],
    ['validFromが日付形式でない', { taxCategory: 'STANDARD', validFrom: '20191001' }],
  ])('GET単体: %sなら400', async (_label, pathParameters) => {
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters }));
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  test('POST: 登録してcreated_at/updated_atを付与する。スキーマに無い項目は保存しない', async () => {
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'POST', body: JSON.stringify({ ...validInput, unknown: 'x' }) }),
    );
    expect(result.statusCode).toBe(201);
    const saved = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(saved).toMatchObject(validInput);
    expect(saved.created_at).toBeDefined();
    expect(saved).not.toHaveProperty('unknown');
  });

  test.each([
    ['tax_categoryの欠落', { ...validInput, tax_category: undefined }],
    ['valid_fromの欠落', { ...validInput, valid_from: undefined }],
    ['rateが数値でない', { ...validInput, rate: '0.08' }],
    ['valid_toが日付形式でない', { ...validInput, valid_to: 'never' }],
  ])('POST: %sなら400で登録しない', async (_label, body) => {
    const result = await handler(buildEvent({ httpMethod: 'POST', body: JSON.stringify(body) }));
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  test('PUT: パスのキーを優先し、ボディのtax_category/valid_from/created_atは無視する', async () => {
    ddbMock.on(GetCommand).resolves({ Item: existing });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'PUT',
        pathParameters: key,
        body: JSON.stringify({
          description: '標準税率(改定)',
          rate: 0.1,
          valid_to: '2030-03-31',
          tax_category: 'REDUCED',
          valid_from: '2000-01-01',
          created_at: '2000-01-01T00:00:00Z',
        }),
      }),
    );
    expect(result.statusCode).toBe(200);
    const saved = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(saved.tax_category).toBe('STANDARD');
    expect(saved.valid_from).toBe('2019-10-01');
    expect(saved.valid_to).toBe('2030-03-31');
    expect(saved.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  test('PUT: 必須項目(rate)が無ければ400', async () => {
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: key, body: JSON.stringify({ description: 'x' }) }),
    );
    expect(result.statusCode).toBe(400);
  });

  test('PUT: 存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: key, body: JSON.stringify({ description: 'x', rate: 0.1 }) }),
    );
    expect(result.statusCode).toBe(404);
  });

  test('DELETE: 物理削除する', async () => {
    ddbMock.on(GetCommand).resolves({ Item: existing });
    ddbMock.on(DeleteCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: key }));
    expect(result.statusCode).toBe(204);
    expect(ddbMock.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({
      tax_category: 'STANDARD',
      valid_from: '2019-10-01',
    });
  });

  test('DELETE: 存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: key }));
    expect(result.statusCode).toBe(404);
  });
});
