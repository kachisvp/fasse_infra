process.env.PURCHASE_HEADER_TABLE = 'test-t-purchase-header';
process.env.PURCHASE_DETAIL_TABLE = 'test-t-purchase-detail';
process.env.SALES_HEADER_TABLE = 'test-t-sales-header';
process.env.SALES_DETAIL_TABLE = 'test-t-sales-detail';
process.env.COUNTERS_TABLE = 'test-counters';

import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { ddb } from '../../lib/lambda/common/dynamodb';
import { withErrorHandling } from '../../lib/lambda/common/errorHandler';
import { createHeaderDetailHandler, HeaderDetailConfig } from '../../lib/lambda/common/headerDetailHandler';
import {
  purchaseDetailSchema,
  purchaseHeaderSchema,
  salesDetailSchema,
  salesHeaderSchema,
} from '../../lib/lambda/common/schemas';
import { buildEvent, invoke } from '../helpers/lambda';

const ddbMock = mockClient(ddb);

interface Case {
  name: string;
  config: HeaderDetailConfig;
  validHeader: Record<string, unknown>;
  validDetail: Record<string, unknown>;
  expectedNo: string;
}

// 仕入・売上は同じハンドラを設定違いで使うため、両方の設定で同じ振る舞いを検証する
const cases: Case[] = [
  {
    name: 'purchases',
    config: {
      headerTableEnvVar: 'PURCHASE_HEADER_TABLE',
      detailTableEnvVar: 'PURCHASE_DETAIL_TABLE',
      gsiName: 'gsi_purchase_date',
      gsiPk: 'PURCHASE_HEADER',
      dateField: 'purchase_date',
      detailForeignKey: 'purchase_id',
      noField: 'purchase_no',
      noPrefix: 'PO',
      headerSchema: purchaseHeaderSchema,
      detailSchema: purchaseDetailSchema,
    },
    validHeader: { supplier_id: 10, purchase_date: '2026-07-12', subtotal: 1000, tax_amount: 80, total_amount: 1080 },
    validDetail: { item_id: 1, quantity: 2, unit_price: 500, amount: 1000, tax_rate: 0.08 },
    expectedNo: 'PO-20260712-0001',
  },
  {
    name: 'sales',
    config: {
      headerTableEnvVar: 'SALES_HEADER_TABLE',
      detailTableEnvVar: 'SALES_DETAIL_TABLE',
      gsiName: 'gsi_business_date',
      gsiPk: 'SALES_HEADER',
      dateField: 'business_date',
      detailForeignKey: 'sales_id',
      noField: 'sales_no',
      noPrefix: 'SO',
      headerSchema: salesHeaderSchema,
      detailSchema: salesDetailSchema,
    },
    validHeader: {
      sales_datetime: '2026-07-13T02:00:00+09:00',
      business_date: '2026-07-12',
      subtotal: 1000,
      tax_amount: 100,
      total_amount: 1100,
      payment_method: 'CASH',
    },
    validDetail: { menu_id: 1, quantity: 2, unit_price: 500, amount: 1000, tax_rate: 0.1 },
    expectedNo: 'SO-20260712-0001',
  },
];

describe.each(cases)('headerDetailHandler ($name)', ({ config, validHeader, validDetail, expectedNo }) => {
  const headerDetailHandler = withErrorHandling(createHeaderDetailHandler(config));
  const handler = (event: APIGatewayProxyEvent) => invoke(headerDetailHandler, event);
  const validBody = { ...validHeader, details: [validDetail] };

  beforeEach(() => {
    ddbMock.reset();
  });

  test('GET一覧: GSIのQueryで日付範囲の結果を返す', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'h1' }] });
    const result = await handler(
      buildEvent({ httpMethod: 'GET', queryStringParameters: { from: '2026-07-01', to: '2026-07-31' } }),
    );
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([{ id: 'h1' }]);
    expect(ddbMock.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe(config.gsiName);
  });

  test.each([
    ['from・to無し', null],
    ['toのみ無し', { from: '2026-07-01' }],
    ['日付形式が不正', { from: '2026/07/01', to: '2026-07-31' }],
  ])('GET一覧: %sの場合は400', async (_label, queryStringParameters) => {
    const result = await handler(buildEvent({ httpMethod: 'GET', queryStringParameters }));
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
  });

  test('GET単体: ヘッダ+明細をまとめて返す', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'h1' } });
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'd1', [config.detailForeignKey]: 'h1' }] });
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: 'h1' } }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      id: 'h1',
      details: [{ id: 'd1', [config.detailForeignKey]: 'h1' }],
    });
  });

  test('GET単体: ヘッダが存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'GET', pathParameters: { id: 'missing' } }));
    expect(result.statusCode).toBe(404);
  });

  test('POST: 伝票番号を採番しヘッダ+明細をTransactWriteItemsで登録する', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'POST', body: JSON.stringify(validBody) }));
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body[config.noField]).toBe(expectedNo);
    expect(body.details).toHaveLength(1);
    expect(body.details[0][config.detailForeignKey]).toBe(body.id);

    const counterKey = ddbMock.commandCalls(UpdateCommand)[0].args[0].input.Key;
    expect(counterKey).toEqual({ counter_name: `${config.noField}#2026-07-12` });
    expect(ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems).toHaveLength(2);
  });

  test('POST: 伝票番号・id・スキーマに無い項目はリクエストで指定できない', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          ...validBody,
          id: 'client-id',
          [config.noField]: 'FAKE-0001',
          gsi_pk: 'OTHER',
          unknown: 'x',
          details: [{ ...validDetail, id: 'client-detail-id', [config.detailForeignKey]: 'other' }],
        }),
      }),
    );
    expect(result.statusCode).toBe(201);
    const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    const header = items[0].Put!.Item!;
    expect(header.id).not.toBe('client-id');
    expect(header[config.noField]).toBe(expectedNo);
    expect(header.gsi_pk).toBe(config.gsiPk);
    expect(header).not.toHaveProperty('unknown');
    const detail = items[1].Put!.Item!;
    expect(detail.id).not.toBe('client-detail-id');
    expect(detail[config.detailForeignKey]).toBe(header.id);
  });

  test(`POST: ${config.dateField}が無い場合は400で採番・登録しない`, async () => {
    const { [config.dateField]: _date, ...header } = validHeader;
    const result = await handler(
      buildEvent({ httpMethod: 'POST', body: JSON.stringify({ ...header, details: [validDetail] }) }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain(config.dateField);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  test.each([
    ['detailsが無い', (b: Record<string, unknown>) => ({ ...b, details: undefined }), /details/],
    ['detailsが配列でない', (b: Record<string, unknown>) => ({ ...b, details: {} }), /details/],
    [
      '明細のtax_rateが無い',
      (b: Record<string, unknown>) => ({ ...b, details: [{ ...(b.details as object[])[0], tax_rate: undefined }] }),
      /details\[0\]\.tax_rate/,
    ],
    ['subtotalが数値でない', (b: Record<string, unknown>) => ({ ...b, subtotal: '1000' }), /subtotal/],
  ])('POST: %sの場合は400', async (_label, mutate, pattern) => {
    const result = await handler(buildEvent({ httpMethod: 'POST', body: JSON.stringify(mutate(validBody)) }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(pattern);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  test('PUT: 既存明細を全洗い替えする', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'h1', ...validHeader, [config.noField]: expectedNo } });
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'old-detail', [config.detailForeignKey]: 'h1' }] });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: 'h1' }, body: JSON.stringify(validBody) }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.details).toHaveLength(1);
    expect(body.details[0].id).not.toBe('old-detail');

    const items = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    // ヘッダのPut + 既存明細1件のDelete + 新規明細1件のPut = 3件
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.Delete?.Key?.id === 'old-detail')).toBe(true);
  });

  test('PUT: 伝票番号・created_atはリクエストで上書きできず、日付を変更しても採番し直さない', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: { id: 'h1', ...validHeader, [config.noField]: expectedNo, created_at: '2026-07-12T00:00:00.000Z' },
    });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(
      buildEvent({
        httpMethod: 'PUT',
        pathParameters: { id: 'h1' },
        body: JSON.stringify({
          ...validBody,
          [config.dateField]: '2026-07-20',
          [config.noField]: 'FAKE-0001',
          created_at: '2000-01-01T00:00:00Z',
        }),
      }),
    );
    expect(result.statusCode).toBe(200);
    const header = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Put!.Item!;
    expect(header[config.noField]).toBe(expectedNo);
    expect(header.created_at).toBe('2026-07-12T00:00:00.000Z');
    expect(header[config.dateField]).toBe('2026-07-20');
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  test('PUT: 必須項目が無ければ400', async () => {
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: 'h1' }, body: JSON.stringify({ details: [] }) }),
    );
    expect(result.statusCode).toBe(400);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  test('PUT: ヘッダが存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(
      buildEvent({ httpMethod: 'PUT', pathParameters: { id: 'missing' }, body: JSON.stringify(validBody) }),
    );
    expect(result.statusCode).toBe(404);
  });

  test('DELETE: ヘッダ+明細をTransactWriteItemsでまとめて削除する', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { id: 'h1' } });
    ddbMock.on(QueryCommand).resolves({ Items: [{ id: 'd1', [config.detailForeignKey]: 'h1' }] });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: { id: 'h1' } }));
    expect(result.statusCode).toBe(204);
    expect(ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems).toHaveLength(2);
  });

  test('DELETE: ヘッダが存在しなければ404', async () => {
    ddbMock.on(GetCommand).resolves({});
    const result = await handler(buildEvent({ httpMethod: 'DELETE', pathParameters: { id: 'missing' } }));
    expect(result.statusCode).toBe(404);
  });
});

describe('headerDetailHandler (sales固有)', () => {
  const salesHandler = withErrorHandling(createHeaderDetailHandler(cases[1].config));

  beforeEach(() => {
    ddbMock.reset();
  });

  test('POST: customer_count・discount_amountを省略した場合はdefault(1, 0)を設定する', async () => {
    ddbMock.on(UpdateCommand).resolves({ Attributes: { value: 1 } });
    ddbMock.on(TransactWriteCommand).resolves({});
    const result = await invoke(
      salesHandler,
      buildEvent({ httpMethod: 'POST', body: JSON.stringify({ ...cases[1].validHeader, details: [] }) }),
    );
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.customer_count).toBe(1);
    expect(body.discount_amount).toBe(0);
  });

  test('POST: sales_datetimeがオフセット付きISO 8601でなければ400', async () => {
    const result = await invoke(
      salesHandler,
      buildEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ...cases[1].validHeader, sales_datetime: '2026-07-13 02:00', details: [] }),
      }),
    );
    expect(result.statusCode).toBe(400);
  });
});
