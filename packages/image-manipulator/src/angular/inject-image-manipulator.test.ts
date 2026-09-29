// Angular twin of `../react`'s `useImageManipulator`, `injectX` shape matching
// `@symbiote-native/navigation`'s `injectLinkingIntegration`

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { injectImageManipulator } from './inject-image-manipulator';

const { manipulate } = vi.hoisted(() => ({ manipulate: vi.fn() }));

vi.mock('../core', () => ({ manipulate }));

function createContext(): { release: ReturnType<typeof vi.fn> } {
  return { release: vi.fn() };
}

const ROOT_TAG = 997;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedHost: HostFixture | undefined;

@Component({
  selector: 'image-manipulator-host',
  standalone: true,
  template: '',
})
class HostFixture {
  readonly source = signal('uri-1');
  readonly context = injectImageManipulator(this.source);
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    capturedHost = this;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedHost = undefined;
  manipulate.mockImplementation(createContext);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectImageManipulator (Positive: creates once, recreates on source change, releases the stale one)', () => {
  it('creates a context for the initial source', () => {
    mount(ROOT_TAG, HostFixture);

    expect(manipulate).toHaveBeenCalledWith('uri-1');
    expect(capturedHost?.context()).toBeDefined();
  });

  it('recreates and releases the stale context when the source changes', async () => {
    mount(ROOT_TAG, HostFixture);
    const stale = capturedHost?.context();

    capturedHost?.source.set('uri-2');
    await tick();

    expect(capturedHost?.context()).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the current context on unmount', () => {
    mount(ROOT_TAG, HostFixture);
    const current = capturedHost?.context();

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
