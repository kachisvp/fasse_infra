import { HttpError } from '../../lib/lambda/common/errorHandler';
import {
  applyDefaults,
  isDate,
  isTaxCategory,
  parseJsonBody,
  parsePositiveIntegerId,
  Schema,
  validateFields,
} from '../../lib/lambda/common/validation';
import { buildEvent } from '../helpers/lambda';

const schema: Schema = {
  name: { type: 'string', required: true },
  price: { type: 'number' },
  count: { type: 'integer', default: 1 },
  active: { type: 'boolean', default: true },
  day: { type: 'date' },
  at: { type: 'dateTime' },
  category: { type: 'taxCategory' },
};

function expectHttpError(fn: () => unknown, statusCode: number, messagePattern?: RegExp): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(statusCode);
    if (messagePattern) expect((error as HttpError).message).toMatch(messagePattern);
    return;
  }
  throw new Error('expected HttpError to be thrown');
}

describe('parseJsonBody', () => {
  test('JSONオブジェクトを返す', () => {
    expect(parseJsonBody(buildEvent({ body: '{"a":1}' }))).toEqual({ a: 1 });
  });

  test.each([
    ['ボディ無し', null],
    ['JSONとして不正', '{invalid'],
    ['配列', '[1,2]'],
    ['null', 'null'],
    ['文字列', '"text"'],
  ])('%sの場合は400', (_label, body) => {
    expectHttpError(() => parseJsonBody(buildEvent({ body })), 400);
  });
});

describe('validateFields', () => {
  test('スキーマに定義された項目のみを返し、未定義の項目は除去する', () => {
    const result = validateFields(schema, { name: 'a', price: 1.5, unknown: 'x', created_at: 'x' });
    expect(result).toEqual({ name: 'a', price: 1.5 });
  });

  test('必須項目が無い場合は400で、項目名をmessageに含める', () => {
    expectHttpError(() => validateFields(schema, { price: 1 }), 400, /name/);
  });

  test.each([
    ['string', { name: 1 }, /name/],
    ['number', { name: 'a', price: '100' }, /price/],
    ['number(NaN相当は不可)', { name: 'a', price: null }, /price/],
    ['integer', { name: 'a', count: 1.5 }, /count/],
    ['boolean', { name: 'a', active: 'true' }, /active/],
    ['date(形式)', { name: 'a', day: '2026/07/12' }, /day/],
    ['date(存在しない日付)', { name: 'a', day: '2026-02-30' }, /day/],
    ['dateTime(オフセット無し)', { name: 'a', at: '2026-07-12T19:30:00' }, /at/],
    ['taxCategory(ENUM外)', { name: 'a', category: 'LUXURY' }, /category/],
  ])('型が一致しない場合は400: %s', (_label, input, pattern) => {
    expectHttpError(() => validateFields(schema, input), 400, pattern);
  });

  test('正しい型の値はすべて受け付ける', () => {
    const input = {
      name: 'a',
      price: 0,
      count: 3,
      active: false,
      day: '2026-07-12',
      at: '2026-07-12T19:30:00+09:00',
      category: 'REDUCED',
    };
    expect(validateFields(schema, input)).toEqual(input);
  });

  test('不備のある項目が複数あればすべてmessageに含める', () => {
    expectHttpError(() => validateFields(schema, { price: 'x' }), 400, /name.*price|price.*name/);
  });
});

describe('applyDefaults', () => {
  test('省略された項目にdefaultを設定し、指定された値は上書きしない', () => {
    expect(applyDefaults(schema, { name: 'a', active: false })).toEqual({ name: 'a', count: 1, active: false });
  });
});

describe('isDate / isTaxCategory / parsePositiveIntegerId', () => {
  test('isDate', () => {
    expect(isDate('2026-07-12')).toBe(true);
    expect(isDate('2026-7-12')).toBe(false);
    expect(isDate(undefined)).toBe(false);
  });

  test('isTaxCategory', () => {
    expect(isTaxCategory('STANDARD')).toBe(true);
    expect(isTaxCategory('standard')).toBe(false);
  });

  test('parsePositiveIntegerId: 未指定はundefined、正の整数は数値を返す', () => {
    expect(parsePositiveIntegerId(undefined)).toBeUndefined();
    expect(parsePositiveIntegerId('42')).toBe(42);
  });

  test.each(['0', '-1', '1.5', 'abc', '01'])('parsePositiveIntegerId: %sは400', (value) => {
    expectHttpError(() => parsePositiveIntegerId(value), 400, /id/);
  });
});
