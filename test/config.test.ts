import { getConfig, parseEnvName } from '../lib/config';

describe('parseEnvName', () => {
  test('未指定の場合はstg', () => {
    expect(parseEnvName(undefined)).toBe('stg');
  });

  test.each(['dev', 'stg'])('%sはそのまま受け付ける', (value) => {
    expect(parseEnvName(value)).toBe(value);
  });

  test.each(['prod', 'foo', '', 1])('dev/stg以外(%p)は合成時エラーにする', (value) => {
    expect(() => parseEnvName(value)).toThrow(/dev.*stg/);
  });
});

describe('getConfig', () => {
  test('環境ごとのリソースプレフィックスを返す', () => {
    expect(getConfig('dev').resourcePrefix).toBe('fasse-dev');
    expect(getConfig('stg').resourcePrefix).toBe('fasse-stg');
  });
});
