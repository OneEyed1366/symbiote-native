// @vitest-environment happy-dom
// A prop with no DOM form is dropped, and under the debug switch the app is told which one

import {
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  setTreeHost,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDomHost } from './dom-host';

const ROOT_TAG = 9_402;

describe('DOM host skipped props', () => {
  let surface: ReturnType<typeof createSurface>;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const host = createDomHost({ document });
    host.registerRoot(ROOT_TAG, document.createElement('div'));
    Object.assign(globalThis, {
      nativeFabricUIManager: { registerEventHandler(): void {} },
    });
    setTreeHost(host);
    surface = createSurface(ROOT_TAG);
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    globalThis.__SYMBIOTE_DEBUG__ = undefined;
    log.mockRestore();
    disposeRoot(ROOT_TAG);
  });

  const commitView = (prop: string, value: unknown): void => {
    const view = createElement('RCTView');
    routeProp(view, prop, value);
    surface.appendChild(view);
    surface.commit();
  };

  it('names an attribute nobody writes', () => {
    globalThis.__SYMBIOTE_DEBUG__ = true;
    commitView('mysteryProp', 'x');

    expect(log).toHaveBeenCalledWith(expect.stringContaining('mysteryProp'));
  });

  it('names a style key the platform has no css for', () => {
    globalThis.__SYMBIOTE_DEBUG__ = true;
    commitView('elevation', 4);

    expect(log).toHaveBeenCalledWith(expect.stringContaining('elevation'));
  });

  it('says nothing while the debug switch is off', () => {
    commitView('mysteryProp', 'x');

    expect(log).not.toHaveBeenCalled();
  });
});
