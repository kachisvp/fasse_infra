import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from './dynamodb';

const COUNTERS_TABLE = process.env.COUNTERS_TABLE!;

// counters テーブルの value を ADD でアトミックに加算し、採番する
export async function nextSequence(counterName: string): Promise<number> {
  const result = await ddb.send(
    new UpdateCommand({
      TableName: COUNTERS_TABLE,
      Key: { counter_name: counterName },
      UpdateExpression: 'ADD #v :incr',
      ExpressionAttributeNames: { '#v': 'value' },
      ExpressionAttributeValues: { ':incr': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  return result.Attributes!.value as number;
}
