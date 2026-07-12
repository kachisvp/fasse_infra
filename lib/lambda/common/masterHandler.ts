import { APIGatewayProxyHandler } from 'aws-lambda';
import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './dynamodb';
import { nextSequence } from './counter';
import { json, notFound } from './response';

// m_item / m_supplier / m_menu は登録・更新・削除（論理削除）の挙動が共通のため、
// テーブル名と採番用カウンタ名だけを差し替えて使い回す
export function createMasterHandler(tableEnvVar: string, counterName: string): APIGatewayProxyHandler {
  return async (event) => {
    const tableName = process.env[tableEnvVar]!;
    const id = event.pathParameters?.id ? Number(event.pathParameters.id) : undefined;
    const now = new Date().toISOString();

    switch (event.httpMethod) {
      case 'GET': {
        if (id === undefined) {
          const result = await ddb.send(new ScanCommand({ TableName: tableName }));
          return json(200, result.Items ?? []);
        }
        const result = await ddb.send(new GetCommand({ TableName: tableName, Key: { id } }));
        if (!result.Item) return notFound();
        return json(200, result.Item);
      }

      case 'POST': {
        const body = JSON.parse(event.body ?? '{}');
        const newId = await nextSequence(counterName);
        const item = {
          ...body,
          id: newId,
          is_active: body.is_active ?? true,
          created_at: now,
          updated_at: now,
        };
        await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
        return json(201, item);
      }

      case 'PUT': {
        if (id === undefined) return json(400, { message: 'id is required' });
        const existing = await ddb.send(new GetCommand({ TableName: tableName, Key: { id } }));
        if (!existing.Item) return notFound();
        const body = JSON.parse(event.body ?? '{}');
        const item = {
          ...existing.Item,
          ...body,
          id,
          updated_at: now,
        };
        await ddb.send(new PutCommand({ TableName: tableName, Item: item }));
        return json(200, item);
      }

      case 'DELETE': {
        if (id === undefined) return json(400, { message: 'id is required' });
        const existing = await ddb.send(new GetCommand({ TableName: tableName, Key: { id } }));
        if (!existing.Item) return notFound();
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
        return json(405, { message: 'Method Not Allowed' });
    }
  };
}
