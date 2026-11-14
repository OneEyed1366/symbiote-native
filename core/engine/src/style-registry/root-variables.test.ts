// `:root` custom properties cascade in load order and follow the `@media` they were declared in

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NO_VALUE,
  OP_SET_GLOBAL_VARIABLE,
  OP_STRIDE,
  resetMutationBuffer,
  takeBatch,
} from '../mutation-buffer';
import type { IMediaCondition, IMediaEnvironment } from './media-evaluate';
import {
  clearGlobalStyles,
  registerRootVariables,
  registerRules,
  rootVariableTable,
  setMediaEnvironment,
} from './index';

const PHONE: IMediaEnvironment = {
  width: 390,
  height: 844,
  resolution: 3,
  orientation: 'portrait',
  'prefers-color-scheme': 'light',
  'prefers-reduced-motion': 'no-preference',
  'prefers-contrast': 'no-preference',
  'prefers-reduced-transparency': 'no-preference',
  platform: 'ios',
  dir: 'ltr',
};

const DARK: IMediaCondition = ['=', 'prefers-color-scheme', 'dark'];
const WIDE: IMediaCondition = ['>=', 'width', 600];

beforeEach(() => {
  clearGlobalStyles();
  resetMutationBuffer();
  setMediaEnvironment(PHONE);
});

// The `:root` writes the next commit would carry to native, as `name=value` text
function publishedWrites(): string[] {
  const { ops, strings } = takeBatch();
  const writes: string[] = [];
  for (let at = 0; at < ops.length; at += OP_STRIDE) {
    if (ops[at] !== OP_SET_GLOBAL_VARIABLE) continue;
    const value = ops[at + 2] ?? NO_VALUE;
    const shown = value === NO_VALUE ? '(removed)' : strings[value];
    writes.push(`${strings[ops[at + 1] ?? -1]}=${shown}`);
  }
  return writes;
}

afterEach(() => clearGlobalStyles());

describe('registerRootVariables', () => {
  it('lets the later declaration of a name win, across calls too', () => {
    registerRootVariables([
      { name: '--gap', value: '4px' },
      { name: '--gap', value: '8px' },
    ]);
    registerRootVariables([{ name: '--ink', value: '#111' }]);
    registerRootVariables([{ name: '--ink', value: '#222' }]);

    expect(Object.fromEntries(rootVariableTable())).toEqual({
      '--gap': '8px',
      '--ink': '#222',
    });
  });

  it('applies a conditional declaration only while its condition holds', () => {
    registerRootVariables(
      [
        { name: '--bg', value: '#fff' },
        { name: '--bg', value: '#000', cond: 0 },
      ],
      [DARK],
    );
    expect(rootVariableTable().get('--bg')).toBe('#fff');

    setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'dark' });
    expect(rootVariableTable().get('--bg')).toBe('#000');

    setMediaEnvironment(PHONE);
    expect(rootVariableTable().get('--bg')).toBe('#fff');
  });

  it('reads the truth of a condition that was already true at registration', () => {
    setMediaEnvironment({ ...PHONE, width: 800 });
    registerRootVariables([{ name: '--cols', value: '3', cond: 0 }], [WIDE]);

    expect(rootVariableTable().get('--cols')).toBe('3');
  });

  it('shares a condition id with registerRules, so one flip covers both', () => {
    registerRules(
      [{ tokens: ['card'], specificity: [0, 1, 0], order: 0, style: { padding: 16 }, cond: 0 }],
      [WIDE],
    );
    registerRootVariables([{ name: '--cols', value: '3', cond: 0 }], [WIDE]);

    expect(setMediaEnvironment({ ...PHONE, width: 800 })).toEqual([0]);
  });

  it('sends the winning value of each name once, at registration', () => {
    registerRootVariables([
      { name: '--gap', value: '4px' },
      { name: '--gap', value: '8px' },
      { name: '--ink', value: '#111' },
    ]);

    expect(publishedWrites()).toEqual(['--gap=8px', '--ink=#111']);
  });

  it('sends nothing for a value that did not change', () => {
    registerRootVariables([{ name: '--gap', value: '8px' }]);
    publishedWrites();
    registerRootVariables([{ name: '--gap', value: '8px' }]);

    expect(publishedWrites()).toEqual([]);
  });

  it('sends only the names a condition flip changed', () => {
    registerRootVariables(
      [
        { name: '--bg', value: '#fff' },
        { name: '--bg', value: '#000', cond: 0 },
        { name: '--gap', value: '8px' },
      ],
      [DARK],
    );
    publishedWrites();

    setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'dark' });
    expect(publishedWrites()).toEqual(['--bg=#000']);

    setMediaEnvironment(PHONE);
    expect(publishedWrites()).toEqual(['--bg=#fff']);
  });

  it('removes a name whose only declaration stopped applying', () => {
    registerRootVariables([{ name: '--cols', value: '3', cond: 0 }], [WIDE]);
    setMediaEnvironment({ ...PHONE, width: 800 });
    publishedWrites();

    setMediaEnvironment(PHONE);
    expect(publishedWrites()).toEqual(['--cols=(removed)']);
  });

  it('sends nothing when an environment change flips no condition', () => {
    registerRootVariables([{ name: '--cols', value: '3', cond: 0 }], [WIDE]);
    publishedWrites();

    setMediaEnvironment({ ...PHONE, height: 900 });
    expect(publishedWrites()).toEqual([]);
  });

  it('empties with the rest of the global styles', () => {
    registerRootVariables([{ name: '--gap', value: '4px' }]);
    clearGlobalStyles();

    expect(rootVariableTable().size).toBe(0);
  });
});
