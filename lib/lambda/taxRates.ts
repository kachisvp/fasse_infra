import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './common/dynamodb';
import { json, notFound } from './common/response';
import { withJwtAuth } from './common/auth';

const TAX_RATE_TABLE = process.env.TAX_RATE_TABLE!;

// m_tax_rate は tax_category + valid_from の複合キーで期間管理する。
// t_purchase_detail/t_sales_detail は tax_rate を数値でスナップショット保持しFK参照しないため、
// 他マスタと異なり論理削除(is_active)ではなく物理削除でよい（詳細はdesign.md「消費税の扱い」参照）
const taxRatesHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const taxCategory = event.pathParameters?.taxCategory;
  const validFrom = event.pathParameters?.validFrom;
  const now = new Date().toISOString();

  switch (event.httpMethod) {
    case 'GET': {
      if (!taxCategory) {
        const filterCategory = event.queryStringParameters?.tax_category;
        if (filterCategory) {
          const result = await ddb.send(
            new QueryCommand({
              TableName: TAX_RATE_TABLE,
              KeyConditionExpression: 'tax_category = :c',
              ExpressionAttributeValues: { ':c': filterCategory },
            }),
          );
          return json(200, result.Items ?? []);
        }
        const result = await ddb.send(new ScanCommand({ TableName: TAX_RATE_TABLE }));
        return json(200, result.Items ?? []);
      }

      if (!validFrom) return json(400, { message: 'validFrom is required' });
      const result = await ddb.send(
        new GetCommand({ TableName: TAX_RATE_TABLE, Key: { tax_category: taxCategory, valid_from: validFrom } }),
      );
      if (!result.Item) return notFound();
      return json(200, result.Item);
    }

    case 'POST': {
      const body = JSON.parse(event.body ?? '{}');
      const item = {
        ...body,
        created_at: now,
        updated_at: now,
      };
      await ddb.send(new PutCommand({ TableName: TAX_RATE_TABLE, Item: item }));
      return json(201, item);
    }

    case 'PUT': {
      if (!taxCategory || !validFrom) return json(400, { message: 'taxCategory and validFrom are required' });
      const existing = await ddb.send(
        new GetCommand({ TableName: TAX_RATE_TABLE, Key: { tax_category: taxCategory, valid_from: validFrom } }),
      );
      if (!existing.Item) return notFound();
      const body = JSON.parse(event.body ?? '{}');
      const item = {
        ...existing.Item,
        ...body,
        tax_category: taxCategory,
        valid_from: validFrom,
        updated_at: now,
      };
      await ddb.send(new PutCommand({ TableName: TAX_RATE_TABLE, Item: item }));
      return json(200, item);
    }

    case 'DELETE': {
      if (!taxCategory || !validFrom) return json(400, { message: 'taxCategory and validFrom are required' });
      const existing = await ddb.send(
        new GetCommand({ TableName: TAX_RATE_TABLE, Key: { tax_category: taxCategory, valid_from: validFrom } }),
      );
      if (!existing.Item) return notFound();
      await ddb.send(
        new DeleteCommand({ TableName: TAX_RATE_TABLE, Key: { tax_category: taxCategory, valid_from: validFrom } }),
      );
      return json(204);
    }

    default:
      return json(405, { message: 'Method Not Allowed' });
  }
};

export const handler = withJwtAuth(taxRatesHandler);
