// Props stack against RN's `StatusBar.js`: each mounted bar pushes an entry, native gets the
// merged top once per frame and only what changed
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAndroidStatusBar } from './index.android';
import { createIosStatusBar } from './index.ios';

type ICall = { method: string; args: unknown[] };

const IOS_DEFAULT_CALLS: ICall[] = [
  { method: 'setStyle', args: ['default', false] },
  { method: 'setHidden', args: [false, 'none'] },
  { method: 'setNetworkActivityIndicatorVisible', args: [false] },
];

function recordingIosManager(calls: ICall[]) {
  return {
    setStyle: (...args: unknown[]) => calls.push({ method: 'setStyle', args }),
    setHidden: (...args: unknown[]) =>
      calls.push({ method: 'setHidden', args }),
    setNetworkActivityIndicatorVisible: (...args: unknown[]) =>
      calls.push({ method: 'setNetworkActivityIndicatorVisible', args }),
  };
}

function recordingAndroidManager(calls: ICall[]) {
  return {
    setStyle: (...args: unknown[]) => calls.push({ method: 'setStyle', args }),
    setHidden: (...args: unknown[]) =>
      calls.push({ method: 'setHidden', args }),
    setColor: (...args: unknown[]) => calls.push({ method: 'setColor', args }),
    setTranslucent: (...args: unknown[]) =>
      calls.push({ method: 'setTranslucent', args }),
    getConstants: () => ({ HEIGHT: 24, DEFAULT_BACKGROUND_COLOR: 'black' }),
  };
}

const frame = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

let calls: ICall[];
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  calls = [];
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function ios() {
  const manager = recordingIosManager(calls);
  return createIosStatusBar(() => manager);
}

function android() {
  const manager = recordingAndroidManager(calls);
  return createAndroidStatusBar(() => manager);
}

describe('iOS stack', () => {
  // RN has no previous values on the first flush, so all three iOS setters fire with the defaults
  it('sends every default on the first flush', async () => {
    const entry = ios().createEntry();
    entry.apply({});
    await frame();

    expect(calls).toEqual(IOS_DEFAULT_CALLS);
  });

  it('sends the merged bar style with its animated flag', async () => {
    const entry = ios().createEntry();
    entry.apply({ barStyle: 'dark-content', animated: true });
    await frame();

    expect(calls).toContainEqual({
      method: 'setStyle',
      args: ['dark-content', true],
    });
  });

  it('hides with the transition only when animated', async () => {
    ios().createEntry().apply({ hidden: true });
    await frame();
    expect(calls).toContainEqual({ method: 'setHidden', args: [true, 'none'] });

    calls.length = 0;
    ios()
      .createEntry()
      .apply({ hidden: true, animated: true, showHideTransition: 'slide' });
    await frame();
    expect(calls).toContainEqual({
      method: 'setHidden',
      args: [true, 'slide'],
    });
  });

  it('defaults the transition to fade', async () => {
    ios().createEntry().apply({ hidden: true, animated: true });
    await frame();

    expect(calls).toContainEqual({ method: 'setHidden', args: [true, 'fade'] });
  });

  it('sends one update for pushes in the same frame', async () => {
    const bar = ios();
    bar.createEntry().apply({ barStyle: 'light-content' });
    bar.createEntry().apply({ barStyle: 'dark-content' });
    await frame();

    expect(calls.filter(call => call.method === 'setStyle')).toEqual([
      { method: 'setStyle', args: ['dark-content', false] },
    ]);
  });

  it('lets the last mounted entry win and restores the previous on unmount', async () => {
    const bar = ios();
    bar.createEntry().apply({ barStyle: 'light-content' });
    const top = bar.createEntry();
    top.apply({ barStyle: 'dark-content' });
    await frame();
    calls.length = 0;

    top.release();
    await frame();

    expect(calls).toEqual([
      { method: 'setStyle', args: ['light-content', false] },
    ]);
  });

  it('falls back to the defaults when the last entry goes away', async () => {
    const only = ios().createEntry();
    only.apply({ barStyle: 'dark-content' });
    await frame();
    calls.length = 0;

    only.release();
    await frame();

    expect(calls).toEqual([{ method: 'setStyle', args: ['default', false] }]);
  });

  it('skips a value that did not change', async () => {
    const entry = ios().createEntry();
    entry.apply({ barStyle: 'dark-content' });
    await frame();
    calls.length = 0;

    entry.apply({ barStyle: 'dark-content', hidden: true });
    await frame();

    expect(calls).toEqual([{ method: 'setHidden', args: [true, 'none'] }]);
  });

  it('replaces the entry on every apply instead of stacking', async () => {
    const entry = ios().createEntry();
    entry.apply({ barStyle: 'dark-content' });
    entry.apply({ barStyle: 'light-content' });
    await frame();
    calls.length = 0;

    entry.release();
    await frame();

    expect(calls).toEqual([{ method: 'setStyle', args: ['default', false] }]);
  });
});

describe('iOS imperative API', () => {
  it('setBarStyle drives the native call and becomes the default', async () => {
    const bar = ios();
    bar.imperative.setBarStyle('dark-content', true);
    expect(calls).toEqual([
      { method: 'setStyle', args: ['dark-content', true] },
    ]);

    bar.createEntry().apply({});
    await frame();
    expect(calls).toContainEqual({
      method: 'setStyle',
      args: ['dark-content', false],
    });
  });

  it('setHidden defaults the animation to none', () => {
    ios().imperative.setHidden(true);
    expect(calls).toEqual([{ method: 'setHidden', args: [true, 'none'] }]);
  });

  it('setNetworkActivityIndicatorVisible reaches native', () => {
    ios().imperative.setNetworkActivityIndicatorVisible(true);
    expect(calls).toEqual([
      { method: 'setNetworkActivityIndicatorVisible', args: [true] },
    ]);
  });

  it('warns that background color and translucency are Android only', () => {
    const bar = ios();
    bar.imperative.setBackgroundColor('red');
    bar.imperative.setTranslucent(true);

    expect(warn).toHaveBeenCalledWith(
      '`setBackgroundColor` is only available on Android',
    );
    expect(warn).toHaveBeenCalledWith(
      '`setTranslucent` is only available on Android',
    );
    expect(calls).toEqual([]);
  });

  it('has no current height', () => {
    expect(ios().currentHeight()).toBeUndefined();
  });
});

describe('Android stack', () => {
  it('sets style, hidden and translucent from the defaults on the first flush', async () => {
    android().createEntry().apply({});
    await frame();

    expect(calls).toEqual(
      expect.arrayContaining([
        { method: 'setStyle', args: ['default'] },
        { method: 'setHidden', args: [false] },
        { method: 'setTranslucent', args: [false] },
      ]),
    );
  });

  it('re-sends the bar style on every flush', async () => {
    const entry = android().createEntry();
    entry.apply({ barStyle: 'dark-content' });
    await frame();
    calls.length = 0;

    entry.apply({ barStyle: 'dark-content', hidden: true });
    await frame();

    expect(calls).toContainEqual({
      method: 'setStyle',
      args: ['dark-content'],
    });
    expect(calls).toContainEqual({ method: 'setHidden', args: [true] });
  });

  // Activities are not translucent by default, so a true value is always re-sent
  it('keeps sending translucent while it is true', async () => {
    const entry = android().createEntry();
    entry.apply({ translucent: true });
    await frame();
    calls.length = 0;

    entry.apply({ translucent: true, barStyle: 'light-content' });
    await frame();

    expect(calls).toContainEqual({ method: 'setTranslucent', args: [true] });
  });

  it('does not repeat hidden when it did not change', async () => {
    const entry = android().createEntry();
    entry.apply({ hidden: true });
    await frame();
    calls.length = 0;

    entry.apply({ hidden: true });
    await frame();

    expect(calls.filter(call => call.method === 'setHidden')).toEqual([]);
  });

  it('reads the bar height from the native constants', () => {
    expect(android().currentHeight()).toBe(24);
  });
});

describe('Android imperative API', () => {
  it('setBarStyle and setHidden take no animation arguments', () => {
    const bar = android();
    bar.imperative.setBarStyle('light-content', true);
    bar.imperative.setHidden(true, 'slide');

    expect(calls).toEqual([
      { method: 'setStyle', args: ['light-content'] },
      { method: 'setHidden', args: [true] },
    ]);
  });

  it('setTranslucent reaches native', () => {
    android().imperative.setTranslucent(true);
    expect(calls).toEqual([{ method: 'setTranslucent', args: [true] }]);
  });

  it('warns that the network indicator is iOS only', () => {
    android().imperative.setNetworkActivityIndicatorVisible(true);

    expect(warn).toHaveBeenCalledWith(
      '`setNetworkActivityIndicatorVisible` is only available on iOS',
    );
    expect(calls).toEqual([]);
  });
});
