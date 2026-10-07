// Credential flow of `expo-apple-authentication` over a faked native module

import { beforeEach, describe, expect, it, vi } from 'vitest';

const FULL_CREDENTIAL = {
  user: 'user-1',
  state: null,
  fullName: null,
  email: null,
  realUserStatus: 2,
  identityToken: 'jwt',
  authorizationCode: 'code',
};

const nativeModule = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(),
  requestAsync: vi.fn(),
  getCredentialStateAsync: vi.fn(),
  formatFullName: vi.fn(),
  addListener: vi.fn(),
}));

// What `./native-module` resolves to, `{}` models a build whose native code lacks the methods
const resolved = vi.hoisted(() => ({ module: {} as unknown }));

vi.mock('./native-module', () => ({
  get expoAppleAuthentication() {
    return resolved.module;
  },
}));

vi.mock('expo-modules-core', () => ({
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

const {
  addRevokeListener,
  formatFullName,
  getCredentialStateAsync,
  isAvailableAsync,
  refreshAsync,
  signInAsync,
  signOutAsync,
} = await import('./apple-authentication');
const { AppleAuthenticationOperation } = await import('./types');

beforeEach(() => {
  vi.clearAllMocks();
  resolved.module = nativeModule;
});

describe('isAvailableAsync', () => {
  it('asks the native module', async () => {
    nativeModule.isAvailableAsync.mockResolvedValue(true);

    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('answers false when the native module cannot tell', async () => {
    resolved.module = {};

    await expect(isAvailableAsync()).resolves.toBe(false);
  });
});

describe('signInAsync', () => {
  it('requests a login and returns the credential', async () => {
    nativeModule.requestAsync.mockResolvedValue(FULL_CREDENTIAL);

    const credential = await signInAsync({ nonce: 'n' });

    expect(credential).toBe(FULL_CREDENTIAL);
    expect(nativeModule.requestAsync).toHaveBeenCalledWith({
      nonce: 'n',
      requestedOperation: AppleAuthenticationOperation.LOGIN,
    });
  });

  it('works without options', async () => {
    nativeModule.requestAsync.mockResolvedValue(FULL_CREDENTIAL);

    await signInAsync();

    expect(nativeModule.requestAsync).toHaveBeenCalledWith({
      requestedOperation: AppleAuthenticationOperation.LOGIN,
    });
  });

  it.each(['authorizationCode', 'identityToken', 'user'])(
    'rejects a credential without %s',
    async field => {
      nativeModule.requestAsync.mockResolvedValue({
        ...FULL_CREDENTIAL,
        [field]: null,
      });

      await expect(signInAsync()).rejects.toMatchObject({
        code: 'ERR_REQUEST_FAILED',
        message: expect.stringContaining('signInAsync'),
      });
    },
  );

  it('throws when the native module cannot request', async () => {
    resolved.module = {};

    await expect(signInAsync()).rejects.toThrow(
      'signInAsync is not available on expo-apple-authentication',
    );
  });
});

describe('refreshAsync', () => {
  it('requests a refresh for the user', async () => {
    nativeModule.requestAsync.mockResolvedValue(FULL_CREDENTIAL);

    await refreshAsync({ user: 'user-1', state: 's' });

    expect(nativeModule.requestAsync).toHaveBeenCalledWith({
      user: 'user-1',
      state: 's',
      requestedOperation: AppleAuthenticationOperation.REFRESH,
    });
  });

  it('rejects an incomplete credential', async () => {
    nativeModule.requestAsync.mockResolvedValue({
      ...FULL_CREDENTIAL,
      identityToken: null,
    });

    await expect(refreshAsync({ user: 'user-1' })).rejects.toMatchObject({
      code: 'ERR_REQUEST_FAILED',
      message: expect.stringContaining('refreshAsync'),
    });
  });

  it('throws when the native module cannot request', async () => {
    resolved.module = {};

    await expect(refreshAsync({ user: 'user-1' })).rejects.toThrow(
      'refreshAsync is not available',
    );
  });
});

describe('signOutAsync', () => {
  it('requests a logout and returns whatever the system answers', async () => {
    const answer = { ...FULL_CREDENTIAL, identityToken: null };
    nativeModule.requestAsync.mockResolvedValue(answer);

    await expect(signOutAsync({ user: 'user-1' })).resolves.toBe(answer);
    expect(nativeModule.requestAsync).toHaveBeenCalledWith({
      user: 'user-1',
      requestedOperation: AppleAuthenticationOperation.LOGOUT,
    });
  });

  it('throws when the native module cannot request', async () => {
    resolved.module = {};

    await expect(signOutAsync({ user: 'user-1' })).rejects.toThrow(
      'signOutAsync is not available',
    );
  });
});

describe('getCredentialStateAsync', () => {
  it('returns the state the native module reports', async () => {
    nativeModule.getCredentialStateAsync.mockResolvedValue(1);

    await expect(getCredentialStateAsync('user-1')).resolves.toBe(1);
    expect(nativeModule.getCredentialStateAsync).toHaveBeenCalledWith('user-1');
  });

  it('throws when the native module cannot report', async () => {
    resolved.module = {};

    await expect(getCredentialStateAsync('user-1')).rejects.toThrow(
      'getCredentialStateAsync is not available',
    );
  });
});

describe('formatFullName', () => {
  const NAME = {
    namePrefix: null,
    givenName: 'Ada',
    middleName: null,
    familyName: 'Lovelace',
    nameSuffix: null,
    nickname: null,
  };

  it('formats through the native module with the style', () => {
    nativeModule.formatFullName.mockReturnValue('Ada Lovelace');

    expect(formatFullName(NAME, 'long')).toBe('Ada Lovelace');
    expect(nativeModule.formatFullName).toHaveBeenCalledWith(NAME, 'long');
  });

  it('throws when the native module cannot format', () => {
    resolved.module = {};

    expect(() => formatFullName(NAME)).toThrow(
      'formatFullName is not available',
    );
  });
});

describe('addRevokeListener', () => {
  it('subscribes to the revoke event and returns the subscription', () => {
    const subscription = { remove: vi.fn() };
    nativeModule.addListener.mockReturnValue(subscription);
    const listener = vi.fn();

    expect(addRevokeListener(listener)).toBe(subscription);
    expect(nativeModule.addListener).toHaveBeenCalledWith(
      'Expo.appleIdCredentialRevoked',
      listener,
    );
  });
});
