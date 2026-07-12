process.env.PURCHASE_HEADER_TABLE = 'test-t-purchase-header';
process.env.PURCHASE_DETAIL_TABLE = 'test-t-purchase-detail';
process.env.COUNTERS_TABLE = 'test-counters';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ddb } from '../../lib/lambda/common/dynamodb';
import { createHeaderDetailHandler } from '../../lib/lambda/common/headerDetailHandler';

const ddbMock = mockClient(ddb);
const handler = createHeaderDetailHandler({
  headerTableEnvVar: 'PURCHASE_HEADER_TABLE',
  detailTableEnvVar: 'PURCHASE_DETAIL_TABLE',
  gsiName: 'gsi_purchase_date',
  gsiPk: 'PURCHASE_HEADER',
  dateField: 'purchase_date',
  detailForeignKey: 'purchase_id',
  noField: 'purchase_no',
  noPrefix: 'PO',
}) as (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

function buildEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

describe('headerDetailHandler (purchases)', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  test('GET一覧: gsi_purchase_dateのQueryで日付範囲の結果を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'h1', purchase_date: '2026-07-01' }] });
    const result = await handler(
      buildEvent({ httpMethod: 'GET', queryStringParameters: { from: '2026-07-01', to: '2026-07-31' } }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([{ id: 'h1', purchase_date: '2026-07-01' }]);
  });

  test('GET単体: ヘッダ+明細をまとめて返す', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'h1', purchase_date: '2026-07-01' } });
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'd1', purchase_id: 'h1', item_id: 1 }] });
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: 'h1' } }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      id: 'h1',
      purchase_date: '2026-07-01',
      details: [{ id: 'd1', purchase_id: 'h1', item_id: 1 }],
    });
  });

  test('GET単体: ヘッダが存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: 'missing' } }));
    expect(result.statusCode).toBe(404);
  });

  test('POST: purchase_noを採番しヘッダ+明細をTransactWriteItemsで登録する', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          supplier_id: 10,
          purchase_date: '2026-07-12',
          subtotal: 1000,
          tax_amount: 100,
          total_amount: 1100,
          details: [{ item_id: 1, quantity: 2, unit_price: 500, amount: 1000 }],
        }),
      }),
    );
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.purchase_no).toBe('PO-20260712-0001');
    expect(body.details).toHaveLength(1);
    expect(body.details[0].purchase_id).toBe(body.id);

    const transactCall = ddbMock.commandCalls(TransactWriteCommand)[0];
    expect(transactCall.args[0].input.TransactItems).toHaveLength(2);
  });

  test('PUT: 既存明細を全洗い替えする', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'h1', purchase_date: '2026-07-01' } });
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'old-detail', purchase_id: 'h1' }] });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'PUT',
        pathParameters: { id: 'h1' },
        body: JSON.stringify({
          purchase_date: '2026-07-01',
          details: [{ item_id: 2, quantity: 1, unit_price: 300, amount: 300 }],
        }),
      }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.details).toHaveLength(1);
    expect(body.details[0].id).not.toBe('old-detail');

    const transactCall = ddbMock.commandCalls(TransactWriteCommand)[0];
    const items = transactCall.args[0].input.TransactItems!;
    // ヘッダのPut + 既存明細1件のDelete + 新規明細1件のPut = 3件
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.Delete?.Key?.id === 'old-detail')).toBe(true);
  });

  test('PUT: ヘッダが存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: 'missing' }, body: JSON.stringify({ details: [] }) }),
    );
    expect(result.statusCode).toBe(404);
  });

  test('DELETE: ヘッダ+明細をTransactWriteItemsでまとめて削除する', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'h1' } });
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'd1', purchase_id: 'h1' }] });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: { id: 'h1' } }));
    expect(result.statusCode).toBe(204);
    const transactCall = ddbMock.commandCalls(TransactWriteCommand)[0];
    expect(transactCall.args[0].input.TransactItems).toHaveLength(2);
  });

  test('DELETE: ヘッダが存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: { id: 'missing' } }));
    expect(result.statusCode).toBe(404);
  });
});
