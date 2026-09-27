import { APIGatewayProxyEvent } from 'aws-lambda';
import { HttpError } from './errorHandler';

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'dateTime' | 'taxCategory';

export interface FieldSpec {
  type: FieldType;
  required?: boolean;
  // POST時に項目が省略された場合に設定する値(openapi.yamlのdefaultに対応)
  default?: unknown;
}

// openapi.yamlの*Inputスキーマに対応する項目定義(検証仕様の正本はopenapi.yaml)
export type Schema = Record<string, FieldSpec>;

export const TAX_CATEGORIES = ['STANDARD', 'REDUCED', 'EXEMPT'] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// タイムゾーンのオフセットを必須とするISO 8601(例: 2026-07-12T19:30:00+09:00)
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  // 2026-02-30のような存在しない日付を除外する
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_TIME_PATTERN.exec(value);
  return match !== null && isDate(match[1]) && !Number.isNaN(Date.parse(value));
}

export function isTaxCategory(value: unknown): value is TaxCategory {
  return typeof value === 'string' && (TAX_CATEGORIES as readonly string[]).includes(value);
}

function matchesType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return isDate(value);
    case 'dateTime':
      return isDateTime(value);
    case 'taxCategory':
      return isTaxCategory(value);
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  if (!event.body) throw new HttpError(400, 'request body is required');
  let body: unknown;
  try {
    body = JSON.parse(event.body);
  } catch {
    throw new HttpError(400, 'request body is not valid JSON');
  }
  if (!isPlainObject(body)) throw new HttpError(400, 'request body must be a JSON object');
  return body;
}

// スキーマで検証し、スキーマに定義された項目のみを返す(未定義の項目・サーバー管理項目は除去する)。
// 不備のある項目名はprefix付きでerrorsに追加する
export function checkFields(
  schema: Schema,
  input: Record<string, unknown>,
  errors: string[],
  prefix = '',
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const value = input[name];
    if (value === undefined) {
      if (spec.required) errors.push(`${prefix}${name}`);
      continue;
    }
    if (!matchesType(value, spec.type)) {
      errors.push(`${prefix}${name}`);
      continue;
    }
    fields[name] = value;
  }
  return fields;
}

export function throwIfInvalid(errors: string[]): void {
  if (errors.length > 0) {
    throw new HttpError(400, `invalid or missing fields: ${errors.join(', ')}`);
  }
}

export function validateFields(schema: Schema, input: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const fields = checkFields(schema, input, errors);
  throwIfInvalid(errors);
  return fields;
}

export function applyDefaults(schema: Schema, fields: Record<string, unknown>): Record<string, unknown> {
  const result = { ...fields };
  for (const [name, spec] of Object.entries(schema)) {
    if (result[name] === undefined && spec.default !== undefined) result[name] = spec.default;
  }
  return result;
}

// マスタのパスパラメータidを数値に変換する(未指定はundefined、正の整数でなければ400)
export function parsePositiveIntegerId(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const id = Number(value);
  if (!POSITIVE_INTEGER_PATTERN.test(value) || !Number.isSafeInteger(id)) {
    throw new HttpError(400, 'id must be a positive integer');
  }
  return id;
}
