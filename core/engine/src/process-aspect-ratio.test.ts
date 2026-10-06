// Кейсы из `processAspectRatio-test.js` RN, где RN бросает invariant, мы возвращаем `undefined`

import { describe, expect, it } from 'vitest';
import { processAspectRatio } from './process-aspect-ratio';

// Значение вне типа параметра, как его передал бы JS-вызов
function processUntyped(json: string): unknown {
  return Reflect.apply(processAspectRatio, undefined, [JSON.parse(json)]);
}

describe('processAspectRatio', () => {
  it('accepts numbers', () => {
    expect(processAspectRatio(1)).toBe(1);
    expect(processAspectRatio(0)).toBe(0);
    expect(processAspectRatio(1.5)).toBe(1.5);
  });

  it('accepts string numbers', () => {
    expect(processAspectRatio('1')).toBe(1);
    expect(processAspectRatio('0')).toBe(0);
    expect(processAspectRatio('1.5')).toBe(1.5);
    expect(processAspectRatio('+1.5')).toBe(1.5);
    expect(processAspectRatio('   1')).toBe(1);
    expect(processAspectRatio('   0    ')).toBe(0);
  });

  it('accepts `auto` as no ratio', () => {
    expect(processAspectRatio('auto')).toBeUndefined();
    expect(processAspectRatio(' auto')).toBeUndefined();
    expect(processAspectRatio(' auto  ')).toBeUndefined();
  });

  it('accepts ratios', () => {
    expect(processAspectRatio('+1/1')).toBe(1);
    expect(processAspectRatio('0 / 10')).toBe(0);
    expect(processAspectRatio('117/ 13')).toBe(9);
    expect(processAspectRatio('1.5 /1.2')).toBe(1.25);
    expect(processAspectRatio('1/0')).toBe(Infinity);
  });

  it('drops invalid formats instead of throwing', () => {
    expect(processAspectRatio('0a')).toBeUndefined();
    expect(processAspectRatio('1 / 1 1')).toBeUndefined();
    expect(processAspectRatio('auto 1/1')).toBeUndefined();
  });

  it('ignores non-string falsy values', () => {
    expect(processAspectRatio(undefined)).toBeUndefined();
    expect(processUntyped('null')).toBeUndefined();
    expect(processUntyped('false')).toBeUndefined();
  });

  it('drops non-string truthy values instead of throwing', () => {
    expect(processUntyped('[1,2,3]')).toBeUndefined();
    expect(processUntyped('{}')).toBeUndefined();
  });
});
