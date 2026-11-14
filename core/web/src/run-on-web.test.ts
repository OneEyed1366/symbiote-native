// @vitest-environment happy-dom
// What an adapter's web entry calls once its app is registered: find the page element, boot the
// host on it and hand the adapter the root tag to run on

import {
  appendChild,
  createElement,
  createSurface,
  disposeRoot,
  routeProp,
  type IRootTag,
} from '@symbiote-native/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAppOnWeb, runOnWeb } from './run-on-web';

function mountMarker(rootTag: IRootTag): void {
  const surface = createSurface(rootTag);
  const root = createElement('RCTView');
  routeProp(root, 'testID', 'marker');
  appendChild(root, createElement('RCTView'));
  surface.appendChild(root);
  surface.commit();
}

describe('running on the web', () => {
  const tags: IRootTag[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    for (const tag of tags.splice(0)) disposeRoot(tag);
  });

  const run = (rootTag: IRootTag): void => {
    tags.push(rootTag);
    mountMarker(rootTag);
  };

  it('renders into the element with the id root by default', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    runOnWeb(run);

    expect(root.querySelector('[data-testid="marker"]')).not.toBeNull();
  });

  it('renders into the container it is given instead', () => {
    const container = document.createElement('section');
    document.body.appendChild(container);

    runOnWeb(run, { container });

    expect(container.querySelector('[data-testid="marker"]')).not.toBeNull();
  });

  it('registers an app and runs it on the root tag of the page', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const registered: string[] = [];
    const registry = {
      registerComponent: (appKey: string, provider: () => string) => {
        registered.push(`${appKey}:${provider()}`);
        return appKey;
      },
      runApplication: (appKey: string, { rootTag }: { rootTag: IRootTag }) => {
        registered.push(`run:${appKey}`);
        run(rootTag);
      },
    };

    runAppOnWeb(registry, 'canary', () => 'App');

    expect(registered).toEqual(['canary:App', 'run:canary']);
    expect(root.querySelector('[data-testid="marker"]')).not.toBeNull();
  });

  it('names the missing element when the page has none and is done loading', () => {
    expect(() => runOnWeb(run)).toThrow('#root');
  });

  it('waits for the page to finish loading when it has not yet', () => {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      get: () => 'loading',
    });
    const calls: IRootTag[] = [];
    runOnWeb(tag => {
      calls.push(tag);
      run(tag);
    });
    expect(calls).toEqual([]);

    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    Reflect.deleteProperty(document, 'readyState');
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(calls).toHaveLength(1);
    expect(root.querySelector('[data-testid="marker"]')).not.toBeNull();
  });
});
