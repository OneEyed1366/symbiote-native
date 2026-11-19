// Hostile `var()` text and names through the real engine: a commit must neither throw nor hang

import {
  clearGlobalStyles,
  clearRegisteredProperties,
  committedPayloadOf,
  createElement,
  createSurface,
  getComputedVariable,
  registerProperties,
  registerProperty,
  registerRootVariables,
  setProp,
  setVariable,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;
const OTHER_TAG = 11;
const BUMP = 1_000;
const SLOW_MS = 2_000;
const CHAIN = 600;
const LAUGHS = 40;

function commit(style: Record<string, unknown>): ISymbioteNode {
  const surface = createSurface(ROOT_TAG);
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return node;
}

function widthOf(node: ISymbioteNode): unknown {
  return committedPayloadOf(node)?.width;
}

function messageOf(action: () => void): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

function isRefused(action: () => void): boolean {
  return messageOf(action) !== '';
}

function elapsedMs(action: () => void): number {
  const started = Date.now();
  action();
  return Date.now() - started;
}

describe('a hostile var() in the real engine', () => {
  it('drops a width whose variables form a cycle, without a fallback', () => {
    clearGlobalStyles();
    registerRootVariables([
      { name: '--a', value: 'var(--b)' },
      { name: '--b', value: 'var(--a)' },
    ]);

    expect(widthOf(commit({ width: 'var(--a)' }))).toBe(undefined);
  });

  it('takes the fallback for a variable inside a cycle', () => {
    clearGlobalStyles();
    registerRootVariables([
      { name: '--a', value: 'var(--b)' },
      { name: '--b', value: 'var(--a)' },
    ]);

    expect(widthOf(commit({ width: 'var(--a, 7px)' }))).toBe(7);
  });

  it('refuses an exponential doubling chain within the time limit', () => {
    clearGlobalStyles();
    const doubling = Array.from({ length: LAUGHS }, (_, at) => ({
      name: `--l${at + 1}`,
      value: `var(--l${at}) var(--l${at})`,
    }));
    registerRootVariables([{ name: '--l0', value: 'lol' }, ...doubling]);
    let node: ISymbioteNode | undefined;

    const spent = elapsedMs(() => {
      node = commit({ width: `var(--l${LAUGHS})` });
    });

    expect(spent).toBeLessThan(SLOW_MS);
    expect(node === undefined ? 'missing' : widthOf(node)).toBe(undefined);
  });

  it('reads a chain inside the depth limit and refuses one beyond it', () => {
    clearGlobalStyles();
    const chain = Array.from({ length: CHAIN }, (_, at) => ({
      name: `--c${at + 1}`,
      value: `var(--c${at})`,
    }));
    registerRootVariables([{ name: '--c0', value: '1px' }, ...chain]);

    expect(widthOf(commit({ width: 'var(--c100)' }))).toBe(1);
    expect(widthOf(commit({ width: `var(--c${CHAIN})` }))).toBe(undefined);
  });

  it('survives a hundred thousand nested fallbacks', () => {
    clearGlobalStyles();
    const nested = `${'var(--none, '.repeat(100_000)}1px${')'.repeat(100_000)}`;

    expect(messageOf(() => commit({ width: nested }))).toBe('');
  });

  it('survives an unclosed reference and a lone opening', () => {
    clearGlobalStyles();

    expect(messageOf(() => commit({ width: 'var(--x' }))).toBe('');
    expect(messageOf(() => commit({ width: 'var(' }))).toBe('');
    expect(messageOf(() => commit({ width: 'var(--)' }))).toBe('');
  });

  it('survives a five megabyte variable value', () => {
    clearGlobalStyles();
    registerRootVariables([{ name: '--big', value: 'a'.repeat(5_000_000) }]);

    expect(widthOf(commit({ width: 'var(--big, 2px)' }))).toBe(2);
  });

  it('keeps names of Object.prototype apart from the declared ones', () => {
    clearGlobalStyles();
    registerRootVariables([{ name: '--__proto__', value: '5px' }]);

    expect(widthOf(commit({ width: 'var(--__proto__)' }))).toBe(5);
    expect(widthOf(commit({ width: 'var(--constructor, 3px)' }))).toBe(3);
    expect(widthOf(commit({ width: 'var(--toString, 4px)' }))).toBe(4);
  });

  it('refuses a registered syntax of a hundred thousand alternatives in bounded time', () => {
    clearGlobalStyles();
    clearRegisteredProperties();
    const syntax = `${'<length>+ | '.repeat(100_000)}<color>`;

    const spent = elapsedMs(() => {
      messageOf(() =>
        registerProperty({
          name: '--h',
          syntax,
          inherits: false,
          initialValue: '0px',
        }),
      );
    });

    expect(spent).toBeLessThan(SLOW_MS);
  });
});

describe('the variable API with hostile arguments', () => {
  it('writes to a surface nobody created, with a huge or missing value, without a throw', () => {
    clearGlobalStyles();

    expect(
      messageOf(() => setVariable(987_654, '--x', 'a'.repeat(1_000_000))),
    ).toBe('');
    expect(messageOf(() => setVariable(987_654, '--x', undefined))).toBe('');
  });

  it('refuses a name without the custom property prefix', () => {
    expect(messageOf(() => setVariable(ROOT_TAG, 'width', '1px'))).toContain(
      'not a custom property',
    );
  });

  it('reads an empty answer for a node that was never mounted or is gone', () => {
    clearGlobalStyles();
    const loose = createElement('RCTView', false);
    const surface = createSurface(ROOT_TAG);
    const gone = createElement('RCTView', false);
    setProp(gone, 'style', { '--x': '1px' });
    surface.appendChild(gone);
    surface.commit();
    mounted();
    surface.clear();

    expect(getComputedVariable(loose, '--x')).toBe('');
    expect(messageOf(() => getComputedVariable(gone, '--x'))).toBe('');
    expect(messageOf(() => getComputedVariable(loose, 'no-dashes'))).toBe('');
    expect(messageOf(() => getComputedVariable(loose, ''))).toBe('');
  });

  for (const [label, name] of [
    ['no prefix', 'width'],
    ['only the prefix', '--'],
  ]) {
    it(`refuses to register a name with ${label}`, () => {
      clearRegisteredProperties();

      expect(
        isRefused(() =>
          registerProperty({ name, syntax: '*', inherits: true }),
        ),
      ).toBe(true);
    });
  }

  for (const [label, syntax] of [
    ['an empty syntax', ''],
    ['an unknown type', '<foo>'],
    ['an unclosed type', '<length'],
    ['a stray multiplier', '+'],
  ]) {
    it(`refuses to register ${label}`, () => {
      clearRegisteredProperties();

      expect(
        isRefused(() =>
          registerProperty({
            name: '--s',
            syntax,
            inherits: true,
            initialValue: '0px',
          }),
        ),
      ).toBe(true);
    });
  }

  it('does not register an `@property` whose condition id the table lacks', () => {
    clearGlobalStyles();
    clearRegisteredProperties();
    registerProperties(
      [
        {
          name: '--late',
          syntax: '<length>',
          inherits: true,
          initialValue: '1px',
          cond: 9,
        },
      ],
      [],
    );

    expect(getComputedVariable(commit({}), '--late')).toBe('');
  });

  it('does not register an `@property` declared inside an `@container` rule', () => {
    clearGlobalStyles();
    clearRegisteredProperties();
    registerProperties(
      [
        {
          name: '--boxed',
          syntax: '<length>',
          inherits: true,
          initialValue: '1px',
          cond: 0,
        },
      ],
      [['@', null, ['>=', 'width', 0]]],
    );

    expect(getComputedVariable(commit({}), '--boxed')).toBe('');
  });

  it('refuses a typed property without an initial value and one whose initial value holds var()', () => {
    clearRegisteredProperties();

    expect(
      isRefused(() =>
        registerProperty({ name: '--i', syntax: '<length>', inherits: true }),
      ),
    ).toBe(true);
    expect(
      isRefused(() =>
        registerProperty({
          name: '--j',
          syntax: '*',
          inherits: true,
          initialValue: 'var(--x)',
        }),
      ),
    ).toBe(true);
  });
});

describe('a storm of variable writes', () => {
  it('leaves the reader on the last value written, after every commit', () => {
    clearGlobalStyles();
    const reader = createElement('RCTView', false);
    setProp(reader, 'style', { width: 'var(--storm)' });
    const surface = createSurface(ROOT_TAG);
    surface.appendChild(reader);
    surface.commit();
    mounted();
    const stale: number[] = [];

    for (let write = 1; write <= 300; write += 1) {
      setVariable(ROOT_TAG, '--storm', `${write}px`);
      if (write % 3 === 0)
        setVariable(ROOT_TAG, '--storm', `${write + BUMP}px`);
      surface.commit();
      mounted();
      const expected = write % 3 === 0 ? write + BUMP : write;
      if (committedPayloadOf(reader)?.width !== expected) stale.push(write);
    }

    expect(stale).toEqual([]);
    expect(getComputedVariable(reader, '--storm')).toBe(`${300 + BUMP}px`);
  });

  it('keeps two surfaces apart', () => {
    clearGlobalStyles();
    const first = createElement('RCTView', false);
    setProp(first, 'style', { width: 'var(--apart, 1px)' });
    const second = createElement('RCTView', false);
    setProp(second, 'style', { width: 'var(--apart, 1px)' });
    setVariable(ROOT_TAG, '--apart', '7px');
    const left = createSurface(ROOT_TAG);
    left.appendChild(first);
    left.commit();
    const right = createSurface(OTHER_TAG);
    right.appendChild(second);
    right.commit();
    mounted();

    expect(committedPayloadOf(first)?.width).toBe(7);
    expect(committedPayloadOf(second)?.width).toBe(1);
    setVariable(ROOT_TAG, '--apart', undefined);
  });
});

describe('a registered name that is no identifier', () => {
  for (const name of ['--a b', '--a;b', '--a{b}', '--"x"', '--a\u0000b']) {
    it(`refuses ${JSON.stringify(name)}`, () => {
      clearRegisteredProperties();

      expect(
        isRefused(() =>
          registerProperty({ name, syntax: '*', inherits: true }),
        ),
      ).toBe(true);
    });
  }
});

// The C++ JSON text keeps a control character raw, which `folly::parseJson` accepts
describe('a transform text carrying a control character', () => {
  it('commits without a throw', () => {
    clearGlobalStyles();
    registerRootVariables([{ name: '--t', value: 'rotate(\n45deg\n)' }]);

    expect(messageOf(() => commit({ transform: 'var(--t)' }))).toBe('');
  });

  it('commits what the same text written plain commits', () => {
    clearGlobalStyles();
    const text = 'rotate(\n45deg\n)';
    const plain = committedPayloadOf(commit({ transform: text }))?.transform;
    registerRootVariables([{ name: '--t', value: text }]);

    expect(
      committedPayloadOf(commit({ transform: 'var(--t)' }))?.transform,
    ).toEqual(plain);
  });
});

report();
