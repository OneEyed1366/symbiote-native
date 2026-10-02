// Angular twin of `../react`'s `useIncomingShare` test

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IResolvedSharePayload, ISharePayload } from '../core';

const TEXT_PAYLOAD: ISharePayload = {
  value: 'hello',
  shareType: 'text',
  mimeType: 'text/plain',
};
const URL_PAYLOAD: ISharePayload = {
  value: 'https://a.test',
  shareType: 'url',
  mimeType: 'text/plain',
};
const RESOLVED_TEXT: IResolvedSharePayload = {
  ...TEXT_PAYLOAD,
  contentUri: null,
  contentType: 'text',
  contentMimeType: null,
  originalName: null,
  contentSize: null,
};

const payloads = vi.hoisted(() => ({
  getSharedPayloads: vi.fn<() => ISharePayload[]>(),
  getResolvedSharedPayloadsAsync:
    vi.fn<() => Promise<IResolvedSharePayload[]>>(),
  clearSharedPayloads: vi.fn(),
}));

const appState = vi.hoisted(() => {
  let listener: ((status: string) => void) | undefined;
  return {
    addEventListener: vi.fn((_type: string, next: (status: string) => void) => {
      listener = next;
      return { remove: vi.fn() };
    }),
    emit: (status: string) => listener?.(status),
  };
});

vi.mock('../core/sharing', () => payloads);
vi.mock('@symbiote-native/engine', async importOriginal => ({
  ...(await importOriginal<typeof import('@symbiote-native/engine')>()),
  AppState: appState,
}));

const { injectIncomingShare } = await import('./inject-incoming-share');

const ROOT_TAG = 1405;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let captured: ReturnType<typeof injectIncomingShare> | undefined;

@Component({ selector: 'incoming-share-host', standalone: true, template: '' })
class HostFixture {
  readonly share = injectIncomingShare();
  constructor() {
    captured = this.share;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  payloads.getSharedPayloads.mockReturnValue([]);
  payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([]);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('injectIncomingShare (Positive)', () => {
  it('returns the shared payloads on setup', () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);

    mount(ROOT_TAG, HostFixture);

    expect(captured?.().sharedPayloads).toEqual([TEXT_PAYLOAD]);
  });

  it('resolves the payloads after mount', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockResolvedValue([RESOLVED_TEXT]);

    mount(ROOT_TAG, HostFixture);
    await tick();
    await tick();

    expect(captured?.().resolvedSharedPayloads).toEqual([RESOLVED_TEXT]);
    expect(captured?.().isResolving).toBe(false);
  });

  it('picks up new payloads when the app returns to the foreground', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    appState.emit('active');
    await tick();
    await tick();

    expect(captured?.().sharedPayloads).toEqual([URL_PAYLOAD]);
  });

  it('refreshSharePayloads re-reads and clearSharedPayloads calls native', async () => {
    mount(ROOT_TAG, HostFixture);
    await tick();
    payloads.getSharedPayloads.mockReturnValue([URL_PAYLOAD]);

    captured?.().refreshSharePayloads();
    await tick();
    await tick();
    captured?.().clearSharedPayloads();

    expect(captured?.().sharedPayloads).toEqual([URL_PAYLOAD]);
    expect(payloads.clearSharedPayloads).toHaveBeenCalledTimes(1);
  });
});

describe('injectIncomingShare (Negative)', () => {
  it('surfaces a resolving failure as `error`', async () => {
    payloads.getSharedPayloads.mockReturnValue([TEXT_PAYLOAD]);
    payloads.getResolvedSharedPayloadsAsync.mockRejectedValue(
      new Error('offline'),
    );

    mount(ROOT_TAG, HostFixture);
    await tick();
    await tick();

    expect(captured?.().error?.message).toBe('offline');
  });
});
