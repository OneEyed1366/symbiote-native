import { afterEach, describe, expect, it, vi } from 'vitest';

function createFakePushTokenManager() {
  let listener: ((event: { devicePushToken: string }) => void) | undefined;
  return {
    getDevicePushTokenAsync: vi.fn(async () => 'fake-device-token'),
    unregisterForNotificationsAsync: vi.fn(async () => undefined),
    addListener: vi.fn(
      (eventName: string, cb: (event: { devicePushToken: string }) => void) => {
        if (eventName === 'onDevicePushToken') listener = cb;
        return { remove: vi.fn() };
      },
    ),
    fireTokenEvent(event: { devicePushToken: string }) {
      listener?.(event);
    },
  };
}

const FAKE_PUSH_TOKEN_MANAGER = createFakePushTokenManager();
const FAKE_SERVER_REGISTRATION_MODULE = {
  getInstallationIdAsync: vi.fn(async () => 'ABCDEF-1234'),
  getRegistrationInfoAsync: vi.fn(async () => null),
  setRegistrationInfoAsync: vi.fn(async () => undefined),
};
const FAKE_TOPIC_SUBSCRIPTION_MODULE = {
  subscribeToTopicAsync: vi.fn(async () => null),
  unsubscribeFromTopicAsync: vi.fn(async () => null),
};

vi.mock('./native-modules', () => ({
  pushTokenManager: FAKE_PUSH_TOKEN_MANAGER,
  serverRegistrationModule: FAKE_SERVER_REGISTRATION_MODULE,
  topicSubscriptionModule: FAKE_TOPIC_SUBSCRIPTION_MODULE,
}));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  CodedError: class CodedError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

vi.mock('@symbiote-native/engine', () => ({ dlog: vi.fn() }));

const {
  addPushTokenListener,
  getDevicePushTokenAsync,
  getExpoPushTokenAsync,
  setAutoServerRegistrationEnabledAsync,
  subscribeToTopicAsync,
  unsubscribeFromTopicAsync,
} = await import('./tokens');

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('getDevicePushTokenAsync', () => {
  it('wraps the native string token with the platform type', async () => {
    const token = await getDevicePushTokenAsync();
    expect(token).toEqual({ type: 'ios', data: 'fake-device-token' });
  });
});

describe('addPushTokenListener / listener add-remove', () => {
  it('forwards a rolled token to the listener, wrapped with the platform type', () => {
    const listener = vi.fn();
    const subscription = addPushTokenListener(listener);

    FAKE_PUSH_TOKEN_MANAGER.fireTokenEvent({ devicePushToken: 'rolled-token' });

    expect(listener).toHaveBeenCalledWith({
      type: 'ios',
      data: 'rolled-token',
    });
    expect(subscription.remove).toBeTypeOf('function');
  });

  it('removes the underlying native subscription on .remove()', () => {
    const subscription = addPushTokenListener(vi.fn());
    subscription.remove();
    expect(subscription.remove).toHaveBeenCalled();
  });
});

describe('getExpoPushTokenAsync', () => {
  it('posts to the Expo push endpoint and returns the token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { expoPushToken: 'ExponentPushToken[abc]' } }),
          {
            status: 200,
          },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const token = await getExpoPushTokenAsync({
      projectId: 'proj-1',
      applicationId: 'com.symbiote.canary',
    });

    expect(token).toEqual({ type: 'expo', data: 'ExponentPushToken[abc]' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/getExpoPushToken',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects with a CodedError when projectId is missing (error path)', async () => {
    await expect(
      getExpoPushTokenAsync({ applicationId: 'com.symbiote.canary' }),
    ).rejects.toThrow(/projectId/);
  });

  it('rejects with a CodedError when the server responds with a malformed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ nope: true }), { status: 200 }),
      ),
    );

    await expect(
      getExpoPushTokenAsync({
        projectId: 'proj-1',
        applicationId: 'com.symbiote.canary',
      }),
    ).rejects.toThrow(/Malformed response/);
  });
});

describe('setAutoServerRegistrationEnabledAsync', () => {
  it('clears the registration blob when disabled', async () => {
    await setAutoServerRegistrationEnabledAsync(false);
    expect(
      FAKE_SERVER_REGISTRATION_MODULE.setRegistrationInfoAsync,
    ).toHaveBeenCalledWith(null);
  });

  it('persists isEnabled:true when enabled', async () => {
    await setAutoServerRegistrationEnabledAsync(true);
    expect(
      FAKE_SERVER_REGISTRATION_MODULE.setRegistrationInfoAsync,
    ).toHaveBeenCalledWith(JSON.stringify({ isEnabled: true }));
  });
});

describe('topic subscription (android)', () => {
  it('subscribes and unsubscribes', async () => {
    await subscribeToTopicAsync('news');
    await unsubscribeFromTopicAsync('news');
    expect(
      FAKE_TOPIC_SUBSCRIPTION_MODULE.subscribeToTopicAsync,
    ).toHaveBeenCalledWith('news');
    expect(
      FAKE_TOPIC_SUBSCRIPTION_MODULE.unsubscribeFromTopicAsync,
    ).toHaveBeenCalledWith('news');
  });
});
