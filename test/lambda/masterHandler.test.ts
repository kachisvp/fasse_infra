process.env.ITEM_TABLE = 'test-m-item';
process.env.COUNTERS_TABLE = 'test-counters';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ddb } from '../../lib/lambda/common/dynamodb';
import { createMasterHandler } from '../../lib/lambda/common/masterHandler';

const ddbMock = mockClient(ddb);
const handler = createMasterHandler('ITEM_TABLE', 'm_item') as (
  event: APIGatewayProxyEvent,
) => Promise<APIGatewayProxyResult>;

function buildEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

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

  test('POST: countersテーブルで採番したidでPutする', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 5 } });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'POST', body: JSON.stringify({ item_name: 'new item', unit: '個' }) }),
    );
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.id).toBe(5);
    expect(body.is_active).toBe(true);
  });

  test('PUT: 存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: '1' }, body: JSON.stringify({ item_name: 'x' }) }),
    );
    expect(result.statusCode).toBe(404);
  });

  test('PUT: 存在すれば更新して200', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 1, item_name: 'old', is_active: true } });
    ddbMock.on(PutCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: '1' }, body: JSON.stringify({ item_name: 'new' }) }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).item_name).toBe('new');
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
});
