// Global switches of react-native-screens: flags, `enableScreens` and the platform helpers

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackHandler } from '@symbiote-native/engine';
import {
  compatibilityFlags,
  enableScreens,
  executeNativeBackPress,
  featureFlags,
  isHeaderBarButtonsAvailableOn,
  isIOS26OrHigherOn,
  isSearchBarAvailableOn,
  screensEnabled,
} from './screens-config';

afterEach(() => {
  vi.restoreAllMocks();
  enableScreens(true);
});

describe('compatibilityFlags', () => {
  it('reports the shape of the 4.30.0 native stack for downstream libraries', () => {
    expect(compatibilityFlags).toEqual({
      isNewBackTitleImplementation: true,
      usesHeaderFlexboxImplementation: true,
      usesNewAndroidHeaderHeightImplementation: true,
      usesStableTabsApi: true,
    });
  });
});

describe('featureFlags', () => {
  it('starts with the vendor defaults', () => {
    expect(featureFlags.experiment.synchronousScreenUpdatesEnabled).toBe(true);
    expect(featureFlags.experiment.synchronousHeaderConfigUpdatesEnabled).toBe(
      true,
    );
    expect(featureFlags.experiment.synchronousHeaderSubviewUpdatesEnabled).toBe(
      true,
    );
    expect(featureFlags.experiment.androidLegacyTopInsetBehavior).toBe(false);
    expect(
      featureFlags.experiment
        .androidResetScreenShadowStateOnOrientationChangeEnabled,
    ).toBe(true);
    expect(featureFlags.experiment.iosOrientationInheritanceFixEnabled).toBe(
      true,
    );
    expect(featureFlags.stable.debugLogging).toBe(false);
  });

  it('keeps a value the app sets and stays quiet on the first change', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.stable.debugLogging = true;
    expect(featureFlags.stable.debugLogging).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    featureFlags.stable.debugLogging = false;
    errorSpy.mockClear();
  });

  it('warns when a flag is changed away from a value it already left the default for', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.androidLegacyTopInsetBehavior = true;
    featureFlags.experiment.androidLegacyTopInsetBehavior = false;
    expect(errorSpy).toHaveBeenCalledWith(
      '[RNScreens] androidLegacyTopInsetBehavior feature flag modified for a second time; this might lead to unexpected effects',
    );
  });

  it('keeps the retired flags on and ignores writes to them', () => {
    featureFlags.experiment.iosPreventReattachmentOfDismissedScreens = false;
    featureFlags.experiment.iosPreventReattachmentOfDismissedModals = false;
    featureFlags.experiment.ios26AllowInteractionsDuringTransition = false;
    expect(
      featureFlags.experiment.iosPreventReattachmentOfDismissedScreens,
    ).toBe(true);
    expect(
      featureFlags.experiment.iosPreventReattachmentOfDismissedModals,
    ).toBe(true);
    expect(featureFlags.experiment.ios26AllowInteractionsDuringTransition).toBe(
      true,
    );
  });
});

describe('enableScreens', () => {
  it('is on until the app turns it off', () => {
    expect(screensEnabled()).toBe(true);
    enableScreens(false);
    expect(screensEnabled()).toBe(false);
  });

  it('turns on with no argument', () => {
    enableScreens(false);
    enableScreens();
    expect(screensEnabled()).toBe(true);
  });
});

describe('platform helpers', () => {
  it('offers the search bar on iOS and Android only', () => {
    expect(isSearchBarAvailableOn('ios')).toBe(true);
    expect(isSearchBarAvailableOn('android')).toBe(true);
    expect(isSearchBarAvailableOn('web')).toBe(false);
  });

  it('offers header bar buttons on iOS only', () => {
    expect(isHeaderBarButtonsAvailableOn('ios')).toBe(true);
    expect(isHeaderBarButtonsAvailableOn('android')).toBe(false);
  });

  it('tells iOS 26 and later from the older versions and from other platforms', () => {
    expect(isIOS26OrHigherOn('ios', '26.0')).toBe(true);
    expect(isIOS26OrHigherOn('ios', '27.1')).toBe(true);
    expect(isIOS26OrHigherOn('ios', '18.4')).toBe(false);
    expect(isIOS26OrHigherOn('android', 35)).toBe(false);
  });

  it('hands the back press to the native exit and reports it handled', () => {
    const exitSpy = vi
      .spyOn(BackHandler, 'exitApp')
      .mockImplementation(() => {});
    expect(executeNativeBackPress()).toBe(true);
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });
});
