import { randomUUID } from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './dynamodb';
import { nextSequence } from './counter';
import { HttpError } from './errorHandler';
import { json } from './response';
import { applyDefaults, checkFields, isDate, isPlainObject, parseJsonBody, Schema, throwIfInvalid } from './validation';

export interface HeaderDetailConfig {
  headerTableEnvVar: string;
  detailTableEnvVar: string;
  gsiName: string;
  gsiPk: string;
  dateField: string; // 一覧の日付範囲・伝票番号採番の基準にする項目（purchase_date / business_date）
  detailForeignKey: string; // 明細テーブルのPK（purchase_id / sales_id）
  noField: string; // 伝票番号の項目名（purchase_no / sales_no）
  noPrefix: string; // 伝票番号のプレフィックス（PO / SO）
  headerSchema: Schema; // ヘッダの入力スキーマ（dateFieldを必須項目として含むこと）
  detailSchema: Schema; // 明細の入力スキーマ
}

// t_purchase_header/detail, t_sales_header/detail は
// 「ヘッダ+明細をTransactWriteItemsで登録」「更新は明細を全洗い替え」という挙動が共通のため、
// テーブル名・GSI・伝票番号の項目名・入力スキーマだけを差し替えて使い回す
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

  async function getExistingHeader(headerTable: string, id: string) {
    const result = await ddb.send(new GetCommand({ TableName: headerTable, Key: { id } }));
    if (!result.Item) throw new HttpError(404, 'Not Found');
    return result.Item;
  }

  // ヘッダ・明細をそれぞれのスキーマで検証し、スキーマの項目のみを返す。
  // id・伝票番号・created_at・gsi_pk等のサーバー管理項目はここで除去される
  function parseHeaderDetail(event: APIGatewayProxyEvent) {
    const { details, ...headerInput } = parseJsonBody(event);
    const errors: string[] = [];
    const header = checkFields(config.headerSchema, headerInput, errors);
    const detailFields: Record<string, unknown>[] = [];
    if (!Array.isArray(details)) {
      errors.push('details');
    } else {
      details.forEach((detail, index) => {
        if (!isPlainObject(detail)) {
          errors.push(`details[${index}]`);
          return;
        }
        detailFields.push(checkFields(config.detailSchema, detail, errors, `details[${index}].`));
      });
    }
    throwIfInvalid(errors);
    return { header, details: detailFields };
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
          if (!isDate(from) || !isDate(to)) {
            throw new HttpError(400, 'from and to are required in YYYY-MM-DD format');
          }
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

        const header = await getExistingHeader(headerTable, id);
        const details = await fetchDetails(detailTable, id);
        return json(200, { ...header, details });
      }

      case 'POST': {
        const input = parseHeaderDetail(event);
        const headerFields = applyDefaults(config.headerSchema, input.header);
        const headerId = randomUUID();
        // dateFieldはスキーマの必須項目のため、検証済みのここでは必ず存在する
        const dateValue = headerFields[config.dateField] as string;
        const seq = await nextSequence(`${config.noField}#${dateValue}`);
        const no = `${config.noPrefix}-${dateValue.replace(/-/g, '')}-${String(seq).padStart(4, '0')}`;

        const header = {
          ...headerFields,
          id: headerId,
          [config.noField]: no,
          gsi_pk: config.gsiPk,
          created_at: now,
          updated_at: now,
        };
        const detailItems = input.details.map((d) => ({
          ...applyDefaults(config.detailSchema, d),
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
        if (!id) throw new HttpError(400, 'id is required');
        const input = parseHeaderDetail(event);
        const existing = await getExistingHeader(headerTable, id);

        // 伝票番号・created_atは既存の値を維持する。日付を変更しても伝票番号は採番し直さない
        const header = {
          ...existing,
          ...input.header,
          id,
          gsi_pk: config.gsiPk,
          updated_at: now,
        };

        // 明細は全洗い替え: 既存明細を全件削除し、リクエストのdetailsを全て新規挿入する
        const existingDetails = await fetchDetails(detailTable, id);
        const newDetailItems = input.details.map((d) => ({
          ...applyDefaults(config.detailSchema, d),
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
        if (!id) throw new HttpError(400, 'id is required');
        await getExistingHeader(headerTable, id);

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
        throw new HttpError(405, 'Method Not Allowed');
    }
  };
}
