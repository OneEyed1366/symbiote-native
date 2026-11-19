// `registerProperty` types a custom property: `inherits`, `initialValue` and the `syntax` filter

import {
  appendChild,
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

import type {
  IMediaCondition,
  IMediaEnvironment,
} from '../../../src/style-registry/media-evaluate';
import { applyMediaEnvironment } from '../../../src/style-registry/media-subscriptions';

import { describe, expect, it, mounted, report } from './harness';

const ROOT_TAG = 1;

function view(style: Record<string, unknown>): ISymbioteNode {
  const node = createElement('RCTView', false);
  setProp(node, 'style', style);
  return node;
}

function mount(root: ISymbioteNode) {
  const surface = createSurface(ROOT_TAG);
  surface.appendChild(root);
  surface.commit();
  mounted();
  return surface;
}

function fresh(): void {
  clearGlobalStyles();
  clearRegisteredProperties();
}

function messageOf(action: () => void): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('registerProperty, in the real engine', () => {
  it('hands a non-inheriting property its initial value below a declaring parent', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: false,
      initialValue: '0px',
    });
    const parent = view({ '--w': '20px' });
    const child = view({});
    appendChild(parent, child);
    mount(parent);

    expect(getComputedVariable(parent, '--w')).toBe('20px');
    expect(getComputedVariable(child, '--w')).toBe('0px');
  });

  it('lets the top node of a non-inheriting property read :root and the surface', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: false,
      initialValue: '0px',
    });
    registerRootVariables([{ name: '--w', value: '10px' }]);
    const top = view({});
    const child = view({});
    appendChild(top, child);
    mount(top);

    expect(getComputedVariable(top, '--w')).toBe('10px');
    expect(getComputedVariable(child, '--w')).toBe('0px');

    setVariable(ROOT_TAG, '--w', '12px');

    expect(getComputedVariable(top, '--w')).toBe('12px');
    expect(getComputedVariable(child, '--w')).toBe('0px');
    setVariable(ROOT_TAG, '--w', undefined);
  });

  it('lets an inheriting property pass through to the child', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: true,
      initialValue: '0px',
    });
    const parent = view({ '--w': '20px' });
    const child = view({});
    appendChild(parent, child);
    mount(parent);

    expect(getComputedVariable(child, '--w')).toBe('20px');
  });

  it('answers the initial value for a registered name nothing declares', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: true,
      initialValue: '3px',
    });
    const node = view({});
    mount(node);

    expect(getComputedVariable(node, '--w')).toBe('3px');
  });

  it('ignores a declaration that fails the syntax and reads the inherited one', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: true,
      initialValue: '0px',
    });
    const parent = view({ '--w': '5px' });
    const child = view({ '--w': 'banana' });
    appendChild(parent, child);
    mount(parent);

    expect(getComputedVariable(child, '--w')).toBe('5px');
  });

  it('computes to the initial value when the substituted text fails the syntax', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: true,
      initialValue: '0px',
    });
    const node = view({ '--w': 'var(--n)', '--n': '8', margin: 'var(--w)' });
    mount(node);

    expect(committedPayloadOf(node)?.margin).toBe(0);
  });

  it('keeps an unregistered name untyped', () => {
    fresh();
    const node = view({ '--n': 'banana' });
    mount(node);

    expect(getComputedVariable(node, '--n')).toBe('banana');
  });

  it('restyles a reader that was committed before the registration', () => {
    fresh();
    const node = view({ margin: 'var(--w)' });
    const surface = mount(node);
    expect(committedPayloadOf(node)?.margin).toBe(undefined);

    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: true,
      initialValue: '6px',
    });
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.margin).toBe(6);
  });

  it('refuses a second registration of the same name', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<length>',
      inherits: true,
      initialValue: '0px',
    });

    expect(
      messageOf(() =>
        registerProperty({
          name: '--w',
          syntax: '<number>',
          inherits: true,
          initialValue: '0',
        }),
      ),
    ).toBe('registerProperty: "--w" is already registered');
  });

  it('refuses a bad syntax, a missing initial value and a mismatching one', () => {
    fresh();

    expect(
      messageOf(() =>
        registerProperty({ name: '--a', syntax: '<banana>', inherits: true }),
      ),
    ).toBe('registerProperty: "<banana>" is not a valid syntax');
    expect(
      messageOf(() =>
        registerProperty({ name: '--b', syntax: '<length>', inherits: true }),
      ),
    ).toBe(
      'registerProperty: "--b" needs an initialValue for syntax "<length>"',
    );
    expect(
      messageOf(() =>
        registerProperty({
          name: '--c',
          syntax: '<length>',
          inherits: true,
          initialValue: '10',
        }),
      ),
    ).toBe(
      'registerProperty: initialValue "10" does not match syntax "<length>"',
    );
  });

  it('refuses a name that is not a custom property', () => {
    fresh();

    expect(
      messageOf(() =>
        registerProperty({ name: 'width', syntax: '*', inherits: true }),
      ),
    ).toBe('registerProperty: "width" is not a custom property (--name)');
  });
});

function warningsOf(action: () => void): string[] {
  const warned: string[] = [];
  const original = console.warn;
  console.warn = (message: unknown) => warned.push(String(message));
  try {
    action();
  } finally {
    console.warn = original;
  }
  return warned;
}

describe('registerProperties, the module-load path of a compiled @property', () => {
  const GAP = {
    name: '--gap',
    syntax: '<length>',
    inherits: true,
    initialValue: '2px',
  };

  it('registers every descriptor of a file', () => {
    fresh();
    registerProperties([
      GAP,
      { name: '--n', syntax: '<number>', inherits: true, initialValue: '1' },
    ]);
    const node = view({});
    mount(node);

    expect(getComputedVariable(node, '--gap')).toBe('2px');
    expect(getComputedVariable(node, '--n')).toBe('1');
  });

  it('stays silent when a hot reload registers the same name again', () => {
    fresh();
    registerProperties([GAP]);

    expect(warningsOf(() => registerProperties([GAP]))).toEqual([]);
  });

  it('warns about a bad descriptor and still registers the rest', () => {
    fresh();
    const warned = warningsOf(() =>
      registerProperties([
        { name: '--bad', syntax: '<banana>', inherits: true },
        GAP,
      ]),
    );
    const node = view({});
    mount(node);

    expect(warned).toEqual([
      'registerProperty: "<banana>" is not a valid syntax',
    ]);
    expect(getComputedVariable(node, '--gap')).toBe('2px');
  });
});

const WIDE: IMediaCondition = ['>=', 'width', 600];

function environmentAt(width: number): IMediaEnvironment {
  return {
    width,
    height: 800,
    resolution: 2,
    orientation: 'portrait',
    'prefers-color-scheme': 'light',
    'prefers-reduced-motion': 'no-preference',
    'prefers-contrast': 'no-preference',
    'prefers-reduced-transparency': 'no-preference',
    platform: 'ios',
    dir: 'ltr',
  };
}

describe('a compiled @property inside @media, in the real engine', () => {
  const WIDE_ONLY = {
    name: '--w',
    syntax: '<length>',
    inherits: true,
    initialValue: '3px',
    cond: 0,
  };

  it('types the name only while the condition holds', () => {
    fresh();
    applyMediaEnvironment(environmentAt(390));
    registerProperties([WIDE_ONLY], [WIDE]);
    const node = view({});
    mount(node);
    expect(getComputedVariable(node, '--w')).toBe('');

    applyMediaEnvironment(environmentAt(700));
    expect(getComputedVariable(node, '--w')).toBe('3px');

    applyMediaEnvironment(environmentAt(390));
    expect(getComputedVariable(node, '--w')).toBe('');
  });

  it('restyles a reader when the rule starts to apply', () => {
    fresh();
    applyMediaEnvironment(environmentAt(390));
    registerProperties([WIDE_ONLY], [WIDE]);
    const node = view({ margin: 'var(--w)' });
    const surface = mount(node);
    expect(committedPayloadOf(node)?.margin).toBe(undefined);

    applyMediaEnvironment(environmentAt(700));
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.margin).toBe(3);
  });

  it('lets a later rule win over an earlier one', () => {
    fresh();
    registerProperties([
      { name: '--w', syntax: '<length>', inherits: true, initialValue: '1px' },
    ]);
    registerProperties([
      { name: '--w', syntax: '<number>', inherits: true, initialValue: '2' },
    ]);
    const node = view({});
    mount(node);

    expect(getComputedVariable(node, '--w')).toBe('2');
  });

  it('falls back to the earlier rule while the later one does not apply', () => {
    fresh();
    applyMediaEnvironment(environmentAt(390));
    registerProperties([
      { name: '--w', syntax: '<length>', inherits: true, initialValue: '1px' },
    ]);
    registerProperties([{ ...WIDE_ONLY, initialValue: '5px' }], [WIDE]);
    const node = view({});
    mount(node);
    expect(getComputedVariable(node, '--w')).toBe('1px');

    applyMediaEnvironment(environmentAt(700));
    expect(getComputedVariable(node, '--w')).toBe('5px');
  });

  it('lets registerProperty win over a rule, whichever came first', () => {
    fresh();
    applyMediaEnvironment(environmentAt(700));
    registerProperties([WIDE_ONLY], [WIDE]);
    registerProperty({
      name: '--w',
      syntax: '<number>',
      inherits: true,
      initialValue: '9',
    });
    const node = view({});
    mount(node);
    expect(getComputedVariable(node, '--w')).toBe('9');

    applyMediaEnvironment(environmentAt(390));
    applyMediaEnvironment(environmentAt(700));
    expect(getComputedVariable(node, '--w')).toBe('9');
  });

  it('keeps a rule that comes after registerProperty from replacing it', () => {
    fresh();
    registerProperty({
      name: '--w',
      syntax: '<number>',
      inherits: true,
      initialValue: '9',
    });
    const warned = warningsOf(() =>
      registerProperties([
        {
          name: '--w',
          syntax: '<length>',
          inherits: true,
          initialValue: '1px',
        },
      ]),
    );
    const node = view({});
    mount(node);

    expect(warned).toEqual([]);
    expect(getComputedVariable(node, '--w')).toBe('9');
  });
});

report();
