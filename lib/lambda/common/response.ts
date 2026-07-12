import { APIGatewayProxyResult } from 'aws-lambda';

export function json(statusCode: number, body?: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

export function notFound(message = 'Not Found'): APIGatewayProxyResult {
  return json(404, { message });
}
