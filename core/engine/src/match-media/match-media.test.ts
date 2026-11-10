// `matchMedia` answers from the same environment as the compiled rules and fires `change` on a flip

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetMediaEnvironment } from '../media-environment';
import { Dimensions } from '../react-native-host';
import { clearGlobalStyles } from '../style-registry';
import { resetMediaSubscriptions } from '../style-registry/media-subscriptions';
import { matchMedia, MediaQueryListEvent } from './index';

function windowAt(width: number, height = 800): void {
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });
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

describe('matches', () => {
  it('follows the window, read live from the same object', () => {
    const list = matchMedia('(min-width: 600px)');
    expect(list.matches).toBe(false);

    windowAt(700);
    expect(list.matches).toBe(true);
  });

  it('holds for an empty query and never for one RN cannot answer', () => {
    expect(matchMedia('').matches).toBe(true);
    expect(matchMedia('print').matches).toBe(false);
    expect(matchMedia('(hover: hover)').matches).toBe(false);
  });

  it('answers a compound query', () => {
    windowAt(700, 400);
    expect(matchMedia('(min-width: 600px) and (orientation: landscape)').matches).toBe(true);
    expect(matchMedia('not (min-width: 600px)').matches).toBe(false);
  });
});

describe('media', () => {
  it('reports the serialized query, as a browser does', () => {
    expect(matchMedia('  ( MIN-width:600px )  ').media).toBe('(min-width: 600px)');
    expect(matchMedia('print').media).toBe('print');
  });
});

describe('change', () => {
  it('fires once with the new answer when the window crosses the breakpoint', () => {
    const list = matchMedia('(min-width: 600px)');
    const onChange = vi.fn();
    list.addEventListener('change', onChange);

    windowAt(500);
    expect(onChange).not.toHaveBeenCalled();

    windowAt(700);
    expect(onChange).toHaveBeenCalledTimes(1);
    const event = onChange.mock.calls[0]?.[0];
    expect(event).toBeInstanceOf(MediaQueryListEvent);
    expect(event).toMatchObject({ matches: true, media: '(min-width: 600px)' });

    windowAt(800);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('calls the `onchange` handler too', () => {
    const list = matchMedia('(min-width: 600px)');
    const onChange = vi.fn();
    list.onchange = onChange;

    windowAt(700);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops for a listener whose signal aborts, and not for the others', () => {
    const list = matchMedia('(min-width: 600px)');
    const kept = vi.fn();
    const aborted = vi.fn();
    const controller = new AbortController();
    list.addEventListener('change', kept);
    list.addEventListener('change', aborted, { signal: controller.signal });
    controller.abort();

    windowAt(700);
    expect(aborted).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy addListener and removeListener pair working', () => {
    const list = matchMedia('(min-width: 600px)');
    const legacy = vi.fn();
    list.addListener(legacy);
    windowAt(700);
    list.removeListener(legacy);
    windowAt(400);
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('never fires for a query RN cannot answer', () => {
    const list = matchMedia('print');
    const onChange = vi.fn();
    list.addEventListener('change', onChange);

    windowAt(700);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is an EventTarget', () => {
    expect(matchMedia('(min-width: 600px)')).toBeInstanceOf(EventTarget);
  });
});
