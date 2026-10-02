import { describe, expect, it, vi } from 'vitest';
import {
  AUTH_CELL_CHANGE,
  createAuthCell,
  createAutoDiscoveryController,
  createLoadedRequestController,
  createRequestResultController,
} from './auth-request-controllers';
import type { IAuthRequestConfig } from './auth-request.types';
import type { IAuthSessionResult } from './auth-session.types';
import type { IDiscoveryDocument } from './discovery';

const DISCOVERY: IDiscoveryDocument = {
  authorizationEndpoint: 'https://example.com/authorize',
};
const CONFIG: IAuthRequestConfig = {
  clientId: 'client',
  redirectUri: 'app://cb',
};
const SUCCESS: IAuthSessionResult = {
  type: 'success',
  errorCode: null,
  params: { code: 'abc' },
  authentication: null,
  url: 'app://cb?code=abc',
};

// A request that resolves its URL on demand, so tests decide when loading completes
function createFakeRequestClass() {
  const instances: FakeRequest[] = [];
  class FakeRequest {
    url: string | null = null;
    resolveUrl: () => void = () => undefined;
    promptAsync = vi.fn(async () => SUCCESS);
    constructor(readonly config: IAuthRequestConfig) {
      instances.push(this);
    }
    makeAuthUrlAsync(): Promise<string> {
      return new Promise(resolve => {
        this.resolveUrl = () => {
          this.url = 'https://example.com/authorize?x=1';
          resolve(this.url);
        };
      });
    }
  }
  return { FakeRequest, instances };
}

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

describe('createAuthCell', () => {
  it('notifies listeners with the next value and stops after remove', () => {
    const cell = createAuthCell<number>(1);
    const listener = vi.fn();
    const subscription = cell.addListener(AUTH_CELL_CHANGE, listener);
    cell.set(2);
    subscription.remove();
    cell.set(3);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(2);
    expect(cell.getSnapshot()).toBe(3);
  });
});

describe('createAutoDiscoveryController', () => {
  it('starts null and settles on the resolved document', async () => {
    const controller = createAutoDiscoveryController();
    const cell = controller.resolve(DISCOVERY);
    expect(cell.getSnapshot()).toBeNull();
    await flush();
    expect(cell.getSnapshot()).toEqual(DISCOVERY);
  });

  it('keeps the same cell for the same input and drops a stale load after dispose', async () => {
    const controller = createAutoDiscoveryController();
    const first = controller.resolve(DISCOVERY);
    expect(controller.resolve(DISCOVERY)).toBe(first);
    controller.dispose();
    await flush();
    expect(first.getSnapshot()).toBeNull();
  });
});

describe('createLoadedRequestController', () => {
  it('publishes the request only once its url has loaded', async () => {
    const { FakeRequest, instances } = createFakeRequestClass();
    const controller = createLoadedRequestController();
    const cell = controller.resolve(CONFIG, DISCOVERY, FakeRequest);
    expect(cell.getSnapshot()).toBeNull();
    instances[0].resolveUrl();
    await flush();
    expect(cell.getSnapshot()).toBe(instances[0]);
  });

  it('does not build a request while discovery is missing', () => {
    const { FakeRequest, instances } = createFakeRequestClass();
    const controller = createLoadedRequestController();
    controller.resolve(CONFIG, null, FakeRequest);
    expect(instances).toHaveLength(0);
  });

  it('keeps the previous request visible while a changed config reloads', async () => {
    const { FakeRequest, instances } = createFakeRequestClass();
    const controller = createLoadedRequestController();
    const first = controller.resolve(CONFIG, DISCOVERY, FakeRequest);
    instances[0].resolveUrl();
    await flush();
    const second = controller.resolve(
      { ...CONFIG, clientId: 'other' },
      DISCOVERY,
      FakeRequest,
    );
    expect(second).not.toBe(first);
    expect(second.getSnapshot()).toBe(instances[0]);
    instances[1].resolveUrl();
    await flush();
    expect(second.getSnapshot()).toBe(instances[1]);
  });

  it('treats a re-created but equal config as the same request', () => {
    const { FakeRequest, instances } = createFakeRequestClass();
    const controller = createLoadedRequestController();
    const first = controller.resolve(
      { ...CONFIG, scopes: ['a', 'b'], extraParams: { x: '1' } },
      DISCOVERY,
      FakeRequest,
    );
    const again = controller.resolve(
      { ...CONFIG, scopes: ['a', 'b'], extraParams: { x: '1' } },
      DISCOVERY,
      FakeRequest,
    );
    expect(again).toBe(first);
    expect(instances).toHaveLength(1);
  });

  it('ignores a load that finishes after dispose', async () => {
    const { FakeRequest, instances } = createFakeRequestClass();
    const controller = createLoadedRequestController();
    const cell = controller.resolve(CONFIG, DISCOVERY, FakeRequest);
    controller.dispose();
    instances[0].resolveUrl();
    await flush();
    expect(cell.getSnapshot()).toBeNull();
  });
});

describe('createRequestResultController', () => {
  it('refuses to prompt before the request has loaded', async () => {
    const controller = createRequestResultController();
    const holder = controller.resolve(null, DISCOVERY);
    await expect(holder.promptAsync()).rejects.toThrow(
      'Cannot prompt to authenticate until the request has finished loading.',
    );
  });

  it('prompts with the merged options and publishes the result', async () => {
    const { FakeRequest } = createFakeRequestClass();
    const request = new FakeRequest(CONFIG);
    const controller = createRequestResultController();
    const holder = controller.resolve(request, DISCOVERY, {
      showInRecents: true,
    });
    const returned = await holder.promptAsync({ createTask: false });
    expect(returned).toBe(SUCCESS);
    expect(request.promptAsync).toHaveBeenCalledWith(DISCOVERY, {
      showInRecents: true,
      createTask: false,
    });
    expect(holder.result.getSnapshot()).toBe(SUCCESS);
  });

  it('keeps one holder across inputs and prompts with the latest request', async () => {
    const { FakeRequest } = createFakeRequestClass();
    const first = new FakeRequest(CONFIG);
    const second = new FakeRequest({ ...CONFIG, clientId: 'other' });
    const controller = createRequestResultController();
    const holder = controller.resolve(first, DISCOVERY);
    expect(controller.resolve(second, DISCOVERY)).toBe(holder);
    await holder.promptAsync();
    expect(first.promptAsync).not.toHaveBeenCalled();
    expect(second.promptAsync).toHaveBeenCalledTimes(1);
  });
});
