import { randomUUID } from 'crypto';
import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './dynamodb';
import { nextSequence } from './counter';
import { json, notFound } from './response';

export interface HeaderDetailConfig {
  headerTableEnvVar: string;
  detailTableEnvVar: string;
  gsiName: string;
  gsiPk: string;
  dateField: string; // 一覧の日付範囲・伝票番号採番の基準にする項目（purchase_date / business_date）
  detailForeignKey: string; // 明細テーブルのPK（purchase_id / sales_id）
  noField: string; // 伝票番号の項目名（purchase_no / sales_no）
  noPrefix: string; // 伝票番号のプレフィックス（PO / SO）
}

// t_purchase_header/detail, t_sales_header/detail は
// 「ヘッダ+明細をTransactWriteItemsで登録」「更新は明細を全洗い替え」という挙動が共通のため、
// テーブル名・GSI・伝票番号の項目名だけを差し替えて使い回す
export function createHeaderDetailHandler(config: HeaderDetailConfig): APIGatewayProxyHandler {
  async function fetchDetails(detailTable: string, headerId: string) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: detailTable,
        KeyConditionExpression: '#fk = :id',
        ExpressionAttributeNames: { '#fk': config.detailForeignKey },
        ExpressionAttributeValues: { ':id': headerId },
      }),
    );
    return result.Items ?? [];
  }

  return async (event) => {
    const headerTable = process.env[config.headerTableEnvVar]!;
    const detailTable = process.env[config.detailTableEnvVar]!;
    const id = event.pathParameters?.id;
    const now = new Date().toISOString();

    switch (event.httpMethod) {
      case 'GET': {
        if (!id) {
          const from = event.queryStringParameters?.from;
          const to = event.queryStringParameters?.to;
          const result = await ddb.send(
            new QueryCommand({
              TableName: headerTable,
              IndexName: config.gsiName,
              KeyConditionExpression: 'gsi_pk = :pk AND #date BETWEEN :from AND :to',
              ExpressionAttributeNames: { '#date': config.dateField },
              ExpressionAttributeValues: { ':pk': config.gsiPk, ':from': from, ':to': to },
            }),
          );
          return json(200, result.Items ?? []);
        }

        const header = await ddb.send(new GetCommand({ TableName: headerTable, Key: { id } }));
        if (!header.Item) return notFound();
        const details = await fetchDetails(detailTable, id);
        return json(200, { ...header.Item, details });
      }

      case 'POST': {
        const body = JSON.parse(event.body ?? '{}');
        const { details, ...headerFields } = body;
        const headerId = randomUUID();
        const dateValue = headerFields[config.dateField];
        const seq = await nextSequence(`${config.noField}#${dateValue}`);
        const no = `${config.noPrefix}-${String(dateValue).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;

        const header = {
          ...headerFields,
          id: headerId,
          [config.noField]: no,
          gsi_pk: config.gsiPk,
          created_at: now,
          updated_at: now,
        };
        const detailItems = ((details ?? []) as Record<string, unknown>[]).map((d) => ({
          ...d,
          id: randomUUID(),
          [config.detailForeignKey]: headerId,
        }));

        await ddb.send(
          new TransactWriteCommand({
            TransactItems: [
              { Put: { TableName: headerTable, Item: header } },
              ...detailItems.map((item) => ({ Put: { TableName: detailTable, Item: item } })),
            ],
          }),
        );
        return json(201, { ...header, details: detailItems });
      }

      case 'PUT': {
        if (!id) return json(400, { message: 'id is required' });
        const existing = await ddb.send(new GetCommand({ TableName: headerTable, Key: { id } }));
        if (!existing.Item) return notFound();

        const body = JSON.parse(event.body ?? '{}');
        const { details, ...headerFields } = body;
        const header = {
          ...existing.Item,
          ...headerFields,
          id,
          gsi_pk: config.gsiPk,
          updated_at: now,
        };

        // 明細は全洗い替え: 既存明細を全件削除し、リクエストのdetailsを全て新規挿入する
        const existingDetails = await fetchDetails(detailTable, id);
        const newDetailItems = ((details ?? []) as Record<string, unknown>[]).map((d) => ({
          ...d,
          id: randomUUID(),
          [config.detailForeignKey]: id,
        }));

        await ddb.send(
          new TransactWriteCommand({
            TransactItems: [
              { Put: { TableName: headerTable, Item: header } },
              ...existingDetails.map((d) => ({
                Delete: {
                  TableName: detailTable,
                  Key: { [config.detailForeignKey]: id, id: (d as Record<string, unknown>).id },
                },
              })),
              ...newDetailItems.map((item) => ({ Put: { TableName: detailTable, Item: item } })),
            ],
          }),
        );
        return json(200, { ...header, details: newDetailItems });
      }

      case 'DELETE': {
        if (!id) return json(400, { message: 'id is required' });
        const existing = await ddb.send(new GetCommand({ TableName: headerTable, Key: { id } }));
        if (!existing.Item) return notFound();

        const existingDetails = await fetchDetails(detailTable, id);
        await ddb.send(
          new TransactWriteCommand({
            TransactItems: [
              { Delete: { TableName: headerTable, Key: { id } } },
              ...existingDetails.map((d) => ({
                Delete: {
                  TableName: detailTable,
                  Key: { [config.detailForeignKey]: id, id: (d as Record<string, unknown>).id },
                },
              })),
            ],
          }),
        );
        return json(204);
      }

      default:
        return json(405, { message: 'Method Not Allowed' });
    }
  };
}
