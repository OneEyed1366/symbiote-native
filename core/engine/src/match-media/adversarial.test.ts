// Attacks on `matchMedia`: a hostile query string, a hostile window and a hostile listener

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetMediaEnvironment } from '../media-environment';
import { Dimensions } from '../react-native-host';
import { clearGlobalStyles } from '../style-registry';
import { internConditions } from '../style-registry/media-conditions';
import { resetMediaSubscriptions } from '../style-registry/media-subscriptions';
import { matchMedia } from './index';

const SLOW_MS = 2_000;
const DEEP = 20_000;
// Past the nesting where the parser overflows the stack in Node, which Hermes reaches sooner
const NESTING = 10_000;
const DISTINCT = 2_000;

function windowAt(width: number, height = 800): void {
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });
}

function elapsedMs(run: () => void): number {
  const started = performance.now();
  run();
  return performance.now() - started;
}

beforeEach(() => {
  globalThis.RN$registerCallableModule = (): void => {};
  windowAt(400);
});

afterEach(() => {
  clearGlobalStyles();
  resetMediaSubscriptions();
  resetMediaEnvironment();
  globalThis.RN$registerCallableModule = undefined;
});

describe('a hostile query string', () => {
  const GARBAGE = [
    '(',
    ')',
    '((((',
    '))))',
    '(width:',
    '(width: )',
    'and',
    'and and',
    'not',
    'not not',
    'only',
    '(min-width: calc(',
    '(min-width: calc()',
    '\u0000',
    '(min-width: \u0000px)',
    '"unterminated',
    "'unterminated",
    '/* unterminated',
    '\\',
    '(min-width: 1\\',
    'url(',
    '(--x)',
    '(min-width: var(--x))',
    '(min-width: 1e999px)',
    '(min-width: -1e999px)',
    '(min-width: calc(1px / 0))',
    '(min-width: calc(0px * (1 / 0)))',
    '(min-width: calc(infinity * 1px))',
    '(min-width: calc(NaN * 1px))',
    '@media (min-width: 1px)',
    '{}',
    '(min-width: 1px) {',
    '\uD800',
    '(min-width: 1px)￿',
    ',,,,',
    '(min-width: 1px),',
    ', (min-width: 1px)',
  ];

  it.each(GARBAGE)('never throws and answers a boolean for %j', query => {
    expect(() => matchMedia(query).matches).not.toThrow();
    expect(typeof matchMedia(query).matches).toBe('boolean');
  });

  it.each([
    '(__proto__)',
    '(constructor)',
    '(toString)',
    '(hasOwnProperty: 1)',
    '(__proto__: 1px)',
    '(min-__proto__: 1px)',
    '(min-constructor: 1px)',
    'constructor',
    '__proto__',
    'toString',
  ])(
    'does not read the inherited key in %s as a known feature or type',
    query => {
      expect(matchMedia(query).matches).toBe(false);
    },
  );

  it('answers false for a long run of opening brackets instead of overflowing the stack', () => {
    const list = matchMedia('('.repeat(NESTING));

    expect(list.matches).toBe(false);
    expect(list.media).toBe('not all');
  });

  it('answers false for a deep balanced nesting instead of overflowing the stack', () => {
    const list = matchMedia(
      `${'('.repeat(NESTING)}min-width: 1px${')'.repeat(NESTING)}`,
    );

    expect(list.matches).toBe(false);
    expect(list.media).toBe('not all');
  });

  it('still reads a nesting a real stylesheet could hold', () => {
    const depth = 10;

    expect(
      matchMedia(`${'('.repeat(depth)}min-width: 1px${')'.repeat(depth)}`)
        .matches,
    ).toBe(true);
  });

  it('survives a long chain of `not`', () => {
    expect(
      () => matchMedia(`${'not '.repeat(DEEP)}(min-width: 1px)`).matches,
    ).not.toThrow();
  });

  it('answers false for a deep `calc()` nesting, in bounded time', () => {
    const query = `(min-width: ${'calc('.repeat(NESTING)}1px${')'.repeat(NESTING)})`;
    let list: ReturnType<typeof matchMedia> | undefined;

    expect(elapsedMs(() => (list = matchMedia(query)))).toBeLessThan(SLOW_MS);
    expect(list?.matches).toBe(false);
  });

  it('parses a long `and` chain in linear time', () => {
    const query = Array.from({ length: DEEP }, () => '(min-width: 1px)').join(
      ' and ',
    );

    expect(elapsedMs(() => matchMedia(query).matches)).toBeLessThan(SLOW_MS);
  });

  it('parses a long comma list in linear time', () => {
    const query = Array.from({ length: DEEP }, () => '(min-width: 1px)').join(
      ', ',
    );

    expect(elapsedMs(() => matchMedia(query).matches)).toBeLessThan(SLOW_MS);
  });

  it('parses a very long identifier in linear time', () => {
    expect(
      elapsedMs(() => matchMedia(`(${'a'.repeat(1_000_000)})`).matches),
    ).toBeLessThan(SLOW_MS);
  });

  it('answers a booleans for two thousand distinct queries', () => {
    const lists = Array.from({ length: 2_000 }, (_, at) =>
      matchMedia(`(min-width: ${at}px)`),
    );

    expect(lists.every(list => typeof list.matches === 'boolean')).toBe(true);
  });
});

describe('a render that asks for a new query every time', () => {
  it('keeps a window change cheap after twenty thousand distinct queries', () => {
    for (let at = 0; at < 20_000; at += 1) matchMedia(`(min-width: ${at}px)`);

    const spent = elapsedMs(() => {
      for (let at = 0; at < 100; at += 1) windowAt(at % 2 === 0 ? 700 : 500);
    });

    expect(spent).toBeLessThan(SLOW_MS);
  });
});

describe('a screen that asks for a new query on every frame', () => {
  it('does not intern the condition of a list nobody listens to', () => {
    for (let at = 0; at < DISTINCT; at += 1)
      matchMedia(`(min-width: ${at + 1}px)`);

    const [next] = internConditions([['>=', 'width', DISTINCT * 2]]);

    expect(next).toBeLessThan(DISTINCT);
  });

  it('reads a list nobody listens to against the window as it is now', () => {
    const list = matchMedia('(min-width: 600px)');
    expect(list.matches).toBe(false);

    windowAt(700);
    expect(list.matches).toBe(true);

    windowAt(300);
    expect(list.matches).toBe(false);
  });

  it('starts delivering `change` to a list once a listener is added after some flips', () => {
    const list = matchMedia('(min-width: 600px)');
    windowAt(700);
    const heard = vi.fn();

    list.addEventListener('change', heard);
    windowAt(300);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(list.matches).toBe(false);
  });
});

describe('a component that listens on mount and stops on unmount', () => {
  it('dispatches `change` once to the one list that still listens', () => {
    const list = matchMedia('(min-width: 600px)');
    list.addEventListener('change', () => {});
    const dispatched = vi.spyOn(EventTarget.prototype, 'dispatchEvent');

    windowAt(700);

    expect(dispatched).toHaveBeenCalledTimes(1);
    dispatched.mockRestore();
  });

  it('leaves no work on a flip once every listener aborted', () => {
    const noop = (): void => {};
    for (let mount = 0; mount < DISTINCT; mount += 1) {
      const list = matchMedia('(min-width: 600px)');
      const unmount = new AbortController();
      list.addEventListener('change', noop, { signal: unmount.signal });
      unmount.abort();
    }
    const dispatched = vi.spyOn(EventTarget.prototype, 'dispatchEvent');

    windowAt(700);

    expect(dispatched).not.toHaveBeenCalled();
    dispatched.mockRestore();
  });

  it('leaves no work on a flip once the listener was removed', () => {
    const list = matchMedia('(min-width: 600px)');
    const heard = vi.fn();
    list.addEventListener('change', heard);
    list.removeEventListener('change', heard);
    const dispatched = vi.spyOn(EventTarget.prototype, 'dispatchEvent');

    windowAt(700);

    expect(dispatched).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
    dispatched.mockRestore();
  });

  it('keeps delivering while another listener remains after one was removed', () => {
    const list = matchMedia('(min-width: 600px)');
    const gone = vi.fn();
    const kept = vi.fn();
    list.addEventListener('change', gone);
    list.addEventListener('change', kept);
    list.removeEventListener('change', gone);

    windowAt(700);

    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('leaves no work on a flip once a `once` listener fired', () => {
    const list = matchMedia('(min-width: 600px)');
    const heard = vi.fn();
    list.addEventListener('change', heard, { once: true });
    windowAt(700);
    const dispatched = vi.spyOn(EventTarget.prototype, 'dispatchEvent');

    windowAt(300);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(dispatched).not.toHaveBeenCalled();
    dispatched.mockRestore();
  });

  it('leaves no work on a flip once `onchange` is cleared and the legacy listener is gone', () => {
    const list = matchMedia('(min-width: 600px)');
    const legacy = vi.fn();
    list.onchange = () => {};
    list.addListener(legacy);
    list.onchange = null;
    list.removeListener(legacy);
    const dispatched = vi.spyOn(EventTarget.prototype, 'dispatchEvent');

    windowAt(700);

    expect(dispatched).not.toHaveBeenCalled();
    dispatched.mockRestore();
  });

  it('listens again after the last listener left and a new one arrived', () => {
    const list = matchMedia('(min-width: 600px)');
    const first = new AbortController();
    list.addEventListener('change', () => {}, { signal: first.signal });
    first.abort();
    const heard = vi.fn();

    list.addEventListener('change', heard);
    windowAt(700);

    expect(heard).toHaveBeenCalledTimes(1);
    expect(list.matches).toBe(true);
  });

  it('does not subscribe a listener whose signal was already aborted', () => {
    const list = matchMedia('(min-width: 600px)');
    list.addEventListener('change', vi.fn(), { signal: AbortSignal.abort() });
    const dispatched = vi.spyOn(EventTarget.prototype, 'dispatchEvent');

    windowAt(700);

    expect(dispatched).not.toHaveBeenCalled();
    dispatched.mockRestore();
  });
});

describe('a hostile window', () => {
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -1],
  ])(
    'answers booleans and does not throw for a %s window width',
    (_name, width) => {
      windowAt(width);

      expect(typeof matchMedia('(min-width: 600px)').matches).toBe('boolean');
      expect(typeof matchMedia('(width < 100px)').matches).toBe('boolean');
      expect(typeof matchMedia('(orientation: landscape)').matches).toBe(
        'boolean',
      );
    },
  );

  it('never calls a NaN window wider than any breakpoint', () => {
    windowAt(Number.NaN);

    expect(matchMedia('(min-width: 600px)').matches).toBe(false);
    expect(matchMedia('(max-width: 600px)').matches).toBe(false);
  });
});

describe('a hostile listener', () => {
  it('lets other lists hear a flip when `onchange` throws', () => {
    const throwing = matchMedia('(min-width: 600px)');
    throwing.onchange = () => {
      throw new Error('listener failed');
    };
    const quiet = matchMedia('(min-width: 600px) and (max-width: 900px)');
    const heard = vi.fn();
    quiet.addEventListener('change', heard);
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => windowAt(700)).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledTimes(1);
    reported.mockRestore();
  });

  it('still dispatches `change` when `onchange` throws', () => {
    const list = matchMedia('(min-width: 600px)');
    const heard = vi.fn();
    list.addEventListener('change', heard);
    list.onchange = () => {
      throw new Error('listener failed');
    };

    expect(() => windowAt(700)).not.toThrow();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('survives a listener that registers more lists while a flip is delivered', () => {
    const list = matchMedia('(min-width: 600px)');
    const created: boolean[] = [];
    list.addEventListener('change', () => {
      const inner = matchMedia('(min-width: 600px)');
      inner.addEventListener('change', () => {});
      created.push(inner.matches);
    });

    expect(() => windowAt(700)).not.toThrow();
    expect(created).toEqual([true]);
  });

  it('does not deliver to a list whose last listener left during the same flip', () => {
    const first = matchMedia('(min-width: 600px)');
    const second = matchMedia('(min-width: 600px)');
    const unmount = new AbortController();
    const heard = vi.fn();
    first.addEventListener('change', () => unmount.abort());
    second.addEventListener('change', heard, { signal: unmount.signal });

    windowAt(700);

    expect(heard).not.toHaveBeenCalled();
  });

  it('survives a flood of flips on a list with many listeners', () => {
    const list = matchMedia('(min-width: 600px)');
    const heard = vi.fn();
    for (let at = 0; at < 500; at += 1)
      list.addEventListener('change', () => heard());

    const spent = elapsedMs(() => {
      for (let at = 0; at < 200; at += 1) windowAt(at % 2 === 0 ? 700 : 500);
    });

    expect(spent).toBeLessThan(SLOW_MS);
    expect(heard).toHaveBeenCalledTimes(500 * 200);
  });
});
