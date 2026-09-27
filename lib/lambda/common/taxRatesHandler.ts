import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './dynamodb';
import { HttpError } from './errorHandler';
import { json } from './response';
import { taxRateSchema, taxRateUpdateSchema } from './schemas';
import { isDate, isTaxCategory, parseJsonBody, validateFields } from './validation';

// パスパラメータ(/tax-rates/{taxCategory}/{validFrom})を検証し、DynamoDBのキーに変換する
function parseKey(event: APIGatewayProxyEvent): { tax_category: string; valid_from: string } {
  const taxCategory = event.pathParameters?.taxCategory;
  const validFrom = event.pathParameters?.validFrom;
  if (!isTaxCategory(taxCategory)) throw new HttpError(400, 'taxCategory must be one of STANDARD, REDUCED, EXEMPT');
  if (!isDate(validFrom)) throw new HttpError(400, 'validFrom must be in YYYY-MM-DD format');
  return { tax_category: taxCategory, valid_from: validFrom };
}

// m_tax_rate は tax_category + valid_from の複合キーで期間管理する。
// t_purchase_detail/t_sales_detail は tax_rate を数値でスナップショット保持しFK参照しないため、
// 他マスタと異なり論理削除(is_active)ではなく物理削除でよい（詳細はdesign.md「消費税の扱い」参照）
export function createTaxRatesHandler(): APIGatewayProxyHandler {
  return async (event) => {
    const tableName = process.env.TAX_RATE_TABLE!;
    const isCollection = !event.pathParameters?.taxCategory;
    const now = new Date().toISOString();

    async function getExisting(key: Record<string, string>) {
      const result = await ddb.send(new GetCommand({ TableName: tableName, Key: key }));
      if (!result.Item) throw new HttpError(404, 'Not Found');
      return result.Item;
    }

    switch (event.httpMethod) {
      case 'GET': {
        if (isCollection) {
          const filterCategory = event.queryStringParameters?.tax_category;
          if (filterCategory === undefined) {
            const result = await ddb.send(new ScanCommand({ TableName: tableName }));
            return json(200, result.Items ?? []);
          }
          if (!isTaxCategory(filterCategory)) {
            throw new HttpError(400, 'tax_category must be one of STANDARD, REDUCED, EXEMPT');
          }
          const result = await ddb.send(
            new QueryCommand({
              TableName: tableName,
              KeyConditionExpression: 'tax_category = :c',
              ExpressionAttributeValues: { ':c': filterCategory },
            }),
          );
          return json(200, result.Items ?? []);
        }
        return json(200, await getExisting(parseKey(event)));
      }

      case 'POST': {
        const fields = validateFields(taxRateSchema, parseJsonBody(event));
        const item = {
          ...fields,
          created_at: now,
          updated_at: now,
        };
        await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
        return json(201, item);
      }

      case 'PUT': {
        const key = parseKey(event);
        // tax_category・valid_fromはスキーマに無いため、ボディに含まれていても無視されパスの値が優先される
        const fields = validateFields(taxRateUpdateSchema, parseJsonBody(event));
        const existing = await getExisting(key);
        const item = {
          ...existing,
          ...fields,
          ...key,
          updated_at: now,
        };
        await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
        return json(200, item);
      }

      case 'DELETE': {
        const key = parseKey(event);
        await getExisting(key);
        await ddb.send(new DeleteCommand({ TableName: tableName, Key: key }));
        return json(204);
      }

      default:
        throw new HttpError(405, 'Method Not Allowed');
    }
  };
}
