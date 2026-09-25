import { describe, expect, it } from 'vitest';
import { getQueryParams } from './query-params';

describe('getQueryParams', () => {
  it('parses a query string', () => {
    const results = getQueryParams('https://demo.io?foo=bar&git=hub');
    expect(results.params).toStrictEqual({ foo: 'bar', git: 'hub' });
  });

  it('parses a query string with arrays', () => {
    expect(getQueryParams('/?a.b=c').params).toStrictEqual({ 'a.b': 'c' });
    expect(getQueryParams('/?a=b&c=d').params).toStrictEqual({
      a: 'b',
      c: 'd',
    });
    expect(getQueryParams('/?a%5Bb%5D=c').params).toStrictEqual({
      'a[b]': 'c',
    });
    expect(getQueryParams('/?foo[bar]=baz').params).toStrictEqual({
      'foo[bar]': 'baz',
    });
    expect(getQueryParams('/?git=hub,other').params).toStrictEqual({
      git: 'hub,other',
    });
    expect(getQueryParams('/?git=[hub,other]').params).toStrictEqual({
      git: '[hub,other]',
    });
  });

  it('parses a query string with hash', () => {
    expect(
      getQueryParams(
        'https://www.example.com:8080/path/to/resource?query=string#fragment',
      ).params,
    ).toEqual({ fragment: '', query: 'string' });
    expect(
      getQueryParams(
        'https://www.example.com:8080/path/to/resource?query=string#access_token=1234',
      ).params,
    ).toEqual({ access_token: '1234', query: 'string' });
    expect(
      getQueryParams(
        'https://www.example.com:8080/path/to/resource#access_token=1234',
      ).params,
    ).toEqual({ access_token: '1234' });
  });

  it('parses a query string without baseUrl', () => {
    expect(
      getQueryParams('/path/to/resource?query=string#access_token=1234').params,
    ).toEqual({
      access_token: '1234',
      query: 'string',
    });
  });

  it('parses an error from a query string', () => {
    const results = getQueryParams(
      'https://demo.io?foo=bar&git=hub&errorCode=invalid_prompt',
    );
    expect(results.errorCode).toBe('invalid_prompt');
    expect(results.params.errorCode).not.toBeDefined();
    expect(results.params).toEqual({ foo: 'bar', git: 'hub' });
  });
});
