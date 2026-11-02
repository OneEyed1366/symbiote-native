// The native overlay window is an iOS view, other platforms get a plain view

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFullWindowOverlay } from './full-window-overlay';

const WINDOW = { width: 390, height: 844 };
const NOT_IOS_MESSAGE = 'Using FullWindowOverlay is only valid on iOS devices.';

describe('full window overlay off iOS', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.set(globalThis, '__DEV__', true);
  });

  afterEach(() => {
    Reflect.set(globalThis, '__DEV__', false);
    vi.restoreAllMocks();
  });

  it('warns once in development that the overlay window exists on iOS only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resolveFullWindowOverlay: resolveFresh } =
      await import('./full-window-overlay');

    resolveFresh({ isIOS: false, ...WINDOW });
    resolveFresh({ isIOS: false, ...WINDOW });

    expect(warn.mock.calls.map(call => call[0])).toEqual([NOT_IOS_MESSAGE]);
  });

  it('stays silent on iOS', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { resolveFullWindowOverlay: resolveFresh } =
      await import('./full-window-overlay');

    resolveFresh({ isIOS: true, ...WINDOW });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('full window overlay on iOS', () => {
  it('uses the native overlay view', () => {
    const overlay = resolveFullWindowOverlay({ isIOS: true, ...WINDOW });

    expect(overlay.viewName).toBe('RNSFullWindowOverlay');
  });

  it('fills the window with its real size, as the overlay window is not sized by its parent', () => {
    const overlay = resolveFullWindowOverlay({ isIOS: true, ...WINDOW });

    expect(overlay.props.style).toEqual([
      { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
      { width: 390, height: 844 },
    ]);
  });

  it('sends the modal flag under its native name', () => {
    const overlay = resolveFullWindowOverlay({
      isIOS: true,
      ...WINDOW,
      unstable_accessibilityContainerViewIsModal: false,
    });

    expect(overlay.props.accessibilityContainerViewIsModal).toBe(false);
  });

  it('leaves the modal flag to the native default when the app sets none', () => {
    const overlay = resolveFullWindowOverlay({ isIOS: true, ...WINDOW });

    expect(overlay.props.accessibilityContainerViewIsModal).toBeUndefined();
  });
});

describe('full window overlay off iOS', () => {
  it('falls back to a plain view with no native props', () => {
    const overlay = resolveFullWindowOverlay({
      isIOS: false,
      ...WINDOW,
      unstable_accessibilityContainerViewIsModal: true,
    });

    expect(overlay.viewName).toBe('view');
    expect(overlay.props).toEqual({});
  });
});
