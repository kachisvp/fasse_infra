import { APIGatewayProxyResult } from 'aws-lambda';

export function json(statusCode: number, body?: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}
