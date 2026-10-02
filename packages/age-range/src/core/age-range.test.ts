import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_AGE_RANGE = {
  requestAgeRangeAsync: vi.fn(async () => ({
    lowerBound: 18,
    upperBound: null,
  })),
  isEligibleForAgeFeaturesAsync: vi.fn(async () => true),
  showSignificantUpdateAcknowledgmentAsync: vi.fn(async () => undefined),
  getRequiredRegulatoryFeaturesAsync: vi.fn(async () => [
    'declaredAgeRangeRequired',
  ]),
  requestAgeSignalsAccessAsync: vi.fn(async () => 'SHARED' as const),
  setFakeAgeSignals: vi.fn(),
};

const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

// The real ExpoAgeRange native module only exists on device, so the module-lookup file is faked
// in place of expo-modules-core's runtime resolution, same pattern as
// packages/application/src/core/application.test.ts
vi.mock('./native-module', () => ({
  expoAgeRange: FAKE_NATIVE_AGE_RANGE,
}));

// expo-modules-core's real entry transitively imports react-native for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse, same fake
// packages/application/src/core/application.test.ts uses
vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
}));

const {
  requestAgeRangeAsync,
  isEligibleForAgeFeaturesAsync,
  showSignificantUpdateAcknowledgmentAsync,
  getRequiredRegulatoryFeaturesAsync,
  requestAgeSignalsAccessAsync,
  setFakeAgeSignals,
} = await import('./age-range');

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('requestAgeRangeAsync', () => {
  it('delegates to the native module on every platform', async () => {
    fakePlatform.OS = 'android';
    await expect(requestAgeRangeAsync({ threshold1: 18 })).resolves.toEqual({
      lowerBound: 18,
      upperBound: null,
    });
    expect(FAKE_NATIVE_AGE_RANGE.requestAgeRangeAsync).toHaveBeenCalledWith({
      threshold1: 18,
    });
  });
});

describe('isEligibleForAgeFeaturesAsync', () => {
  it('delegates to the native module on every platform', async () => {
    fakePlatform.OS = 'android';
    await expect(isEligibleForAgeFeaturesAsync()).resolves.toBe(true);
  });
});

describe('showSignificantUpdateAcknowledgmentAsync', () => {
  it('delegates to the native module on ios', async () => {
    await showSignificantUpdateAcknowledgmentAsync('update text');
    expect(
      FAKE_NATIVE_AGE_RANGE.showSignificantUpdateAcknowledgmentAsync,
    ).toHaveBeenCalledWith('update text');
  });

  it('resolves without calling the native module off ios', async () => {
    fakePlatform.OS = 'android';
    await expect(
      showSignificantUpdateAcknowledgmentAsync('update text'),
    ).resolves.toBeUndefined();
    expect(
      FAKE_NATIVE_AGE_RANGE.showSignificantUpdateAcknowledgmentAsync,
    ).not.toHaveBeenCalled();
  });
});

describe('getRequiredRegulatoryFeaturesAsync', () => {
  it('delegates to the native module on ios', async () => {
    await expect(getRequiredRegulatoryFeaturesAsync()).resolves.toEqual([
      'declaredAgeRangeRequired',
    ]);
  });

  it('reports null off ios without calling the native module', async () => {
    fakePlatform.OS = 'android';
    await expect(getRequiredRegulatoryFeaturesAsync()).resolves.toBeNull();
    expect(
      FAKE_NATIVE_AGE_RANGE.getRequiredRegulatoryFeaturesAsync,
    ).not.toHaveBeenCalled();
  });
});

describe('requestAgeSignalsAccessAsync', () => {
  it('delegates to the native module on android', async () => {
    fakePlatform.OS = 'android';
    await expect(requestAgeSignalsAccessAsync()).resolves.toBe('SHARED');
  });

  it('reports null off android without calling the native module', async () => {
    await expect(requestAgeSignalsAccessAsync()).resolves.toBeNull();
    expect(
      FAKE_NATIVE_AGE_RANGE.requestAgeSignalsAccessAsync,
    ).not.toHaveBeenCalled();
  });
});

describe('setFakeAgeSignals', () => {
  it('forwards the fake signals to the native module on android', () => {
    fakePlatform.OS = 'android';
    setFakeAgeSignals({ lowerBound: 13, upperBound: 15 });
    expect(FAKE_NATIVE_AGE_RANGE.setFakeAgeSignals).toHaveBeenCalledWith({
      lowerBound: 13,
      upperBound: 15,
    });
  });

  it('does nothing off android', () => {
    setFakeAgeSignals({ lowerBound: 13, upperBound: 15 });
    expect(FAKE_NATIVE_AGE_RANGE.setFakeAgeSignals).not.toHaveBeenCalled();
  });
});
