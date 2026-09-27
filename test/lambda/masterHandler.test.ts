process.env.ITEM_TABLE = 'test-m-item';
process.env.COUNTERS_TABLE = 'test-counters';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { ddb } from '../../lib/lambda/common/dynamodb';
import { withErrorHandling } from '../../lib/lambda/common/errorHandler';
import { createMasterHandler } from '../../lib/lambda/common/masterHandler';
import { itemSchema } from '../../lib/lambda/common/schemas';
import { buildEvent, invoke } from '../helpers/lambda';

const ddbMock = mockClient(ddb);
const masterHandler = withErrorHandling(createMasterHandler('ITEM_TABLE', 'm_item', itemSchema));
const handler = (event: APIGatewayProxyEvent) => invoke(masterHandler, event);

const validItem = { item_name: 'new item', unit: '個', tax_category: 'REDUCED' };

describe('masterHandler (items)', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  test('GET一覧: Scanの結果をそのまま返す', async () => {
    ddbMock.on(ScanCommand).resolves({ Items: [{ id: 1, item_name: 'test' }] });
    const result = await handler(buildEvent({ httpMethod: 'GET' }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([{ id: 1, item_name: 'test' }]);
  });

  test('GET単体: 存在すれば200', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 1, item_name: 'test' } });
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: '1' } }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ id: 1, item_name: 'test' });
  });

  test('GET単体: 存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: '999' } }));
    expect(result.statusCode).toBe(404);
  });

  test('GET単体: idが正の整数でなければ400', async () => {
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: 'abc' } }));
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  test('POST: countersテーブルで採番したidでPutする', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 5 } });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'POST', body: JSON.stringify(validItem) }));
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.id).toBe(5);
    expect(body.is_active).toBe(true);
  });

  test('POST: スキーマに無い項目・サーバー管理項目は保存しない', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 5 } });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ...validItem, id: 999, created_at: '2000-01-01T00:00:00Z', unknown: 'x' }),
      }),
    );
    expect(result.statusCode).toBe(201);
    const saved = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(saved.id).toBe(5);
    expect(saved.created_at).not.toBe('2000-01-01T00:00:00Z');
    expect(saved).not.toHaveProperty('unknown');
  });

  test.each([
    ['必須項目(tax_category)の欠落', JSON.stringify({ item_name: 'x', unit: '個' })],
    ['tax_categoryがENUM外', JSON.stringify({ ...validItem, tax_category: 'LUXURY' })],
    ['standard_priceが数値でない', JSON.stringify({ ...validItem, standard_price: '100' })],
    ['JSONとして不正', '{invalid'],
  ])('POST: %sの場合は400で登録しない', async (_label, body) => {
    const result = await handler(buildEvent({ httpMethod: 'POST', body }));
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  test('PUT: 存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: '1' }, body: JSON.stringify(validItem) }),
    );
    expect(result.statusCode).toBe(404);
  });

  test('PUT: 存在すれば更新して200', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 1, item_name: 'old', is_active: true } });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: '1' }, body: JSON.stringify(validItem) }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).item_name).toBe('new item');
  });

  test('PUT: created_at・idはリクエストで上書きできず、省略した任意項目は既存の値を維持する', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 1, item_name: 'old', standard_price: 300, is_active: true, created_at: '2026-01-01T00:00:00.000Z' },
    });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'PUT',
        pathParameters: { id: '1' },
        body: JSON.stringify({ ...validItem, id: 2, created_at: '2000-01-01T00:00:00Z' }),
      }),
    );
    expect(result.statusCode).toBe(200);
    const saved = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(saved.id).toBe(1);
    expect(saved.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(saved.standard_price).toBe(300);
  });

  test('PUT: 必須項目が無ければ400', async () => {
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: '1' }, body: JSON.stringify({ item_name: 'x' }) }),
    );
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  test('DELETE: 論理削除としてis_activeをfalseに更新する', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 1, item_name: 'x', is_active: true } });
    ddbMock.on(UpdateCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: { id: '1' } }));
    expect(result.statusCode).toBe(204);
    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.UpdateExpression).toContain('is_active');
    expect(updateCall.args[0].input.ExpressionAttributeValues).toMatchObject({ ':inactive': false });
  });

  test('DELETE: 存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: { id: '999' } }));
    expect(result.statusCode).toBe(404);
  });

  test('DynamoDBの予期しないエラーは500', async () => {
    ddbMock.on(ScanCommand).rejects(new Error('boom'));
    const result = await handler(buildEvent({ httpMethod: 'GET' }));
    expect(result.statusCode).toBe(500);
  });
});
