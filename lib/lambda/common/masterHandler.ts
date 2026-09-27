import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './dynamodb';
import { nextSequence } from './counter';
import { HttpError } from './errorHandler';
import { json } from './response';
import { applyDefaults, parseJsonBody, parsePositiveIntegerId, Schema, validateFields } from './validation';

// m_item / m_supplier / m_menu は登録・更新・削除（論理削除）の挙動が共通のため、
// テーブル名・採番用カウンタ名・入力スキーマだけを差し替えて使い回す
export function createMasterHandler(tableEnvVar: string, counterName: string, schema: Schema): APIGatewayProxyHandler {
  return async (event) => {
    const tableName = process.env[tableEnvVar]!;
    const id = parsePositiveIntegerId(event.pathParameters?.id);
    const now = new Date().toISOString();

    async function getExisting(itemId: number) {
      const result = await ddb.send(new GetCommand({ TableName: tableName, Key: { id: itemId } }));
      if (!result.Item) throw new HttpError(404, 'Not Found');
      return result.Item;
    }

    switch (event.httpMethod) {
      case 'GET': {
        if (id === undefined) {
          const result = await ddb.send(new ScanCommand({ TableName: tableName }));
          return json(200, result.Items ?? []);
        }
        return json(200, await getExisting(id));
      }

      case 'POST': {
        const fields = applyDefaults(schema, validateFields(schema, parseJsonBody(event)));
        const newId = await nextSequence(counterName);
        const item = {
          ...fields,
          id: newId,
          created_at: now,
          updated_at: now,
        };
        await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
        return json(201, item);
      }

      case 'PUT': {
        if (id === undefined) throw new HttpError(400, 'id is required');
        const fields = validateFields(schema, parseJsonBody(event));
        const existing = await getExisting(id);
        // fieldsはスキーマの項目のみのため、id・created_at等のサーバー管理項目は既存の値が維持される
        const item = {
          ...existing,
          ...fields,
          id,
          updated_at: now,
        };
        await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
        return json(200, item);
      }

      case 'DELETE': {
        if (id === undefined) throw new HttpError(400, 'id is required');
        await getExisting(id);
        // 論理削除: is_active を false に更新するのみで、アイテムは物理削除しない
        await ddb.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { id },
            UpdateExpression: 'SET is_active = :inactive, updated_at = :now',
            ExpressionAttributeValues: { ':inactive': false, ':now': now },
          }),
        );
        return json(204);
      }

      default:
        throw new HttpError(405, 'Method Not Allowed');
    }
  };
}
