import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Context } from 'aws-lambda';

export const TEST_REQUEST_ID = 'test-request-id';

export const testContext = {
  awsRequestId: TEST_REQUEST_ID,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:ap-northeast-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  getRemainingTimeInMillis: () => 3000,
} as unknown as Context;

export function buildEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/test',
    headers: {},
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  } as APIGatewayProxyEvent;
}

export async function invoke(
  handler: APIGatewayProxyHandler,
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  return (await handler(event, testContext, () => undefined)) as APIGatewayProxyResult;
}
