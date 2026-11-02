// The view around a screen's content: positioning per presentation and the `contentStyle` option

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IScreenOptions } from './navigator-props';
import { resolveScreenRenderPlan } from './render-stack';
import { featureFlags } from './screens-config';

const PLATFORM = {
  defaultHeaderBackTitleVisible: true,
  headerBarButtonsAvailable: true,
  isIOS26OrHigher: false,
};

function planOf(options: IScreenOptions, isAndroid = false) {
  return resolveScreenRenderPlan({
    screenId: 'a',
    index: 0,
    routeCount: 1,
    options,
    platform: PLATFORM,
    isAndroid,
    screenPassthrough: {},
  });
}

const FILL = { flex: 1 };
const ABSOLUTE_NO_BOTTOM = { position: 'absolute', top: 0, start: 0, end: 0 };

afterEach(() => {
  featureFlags.experiment.synchronousScreenUpdatesEnabled = true;
  vi.restoreAllMocks();
});

describe('content wrapper positioning', () => {
  it('fills the screen in a pushed screen', () => {
    expect(planOf({}).contentWrapperProps.style).toEqual(FILL);
  });

  it('fills a formSheet on iOS while the sheet is sized natively', () => {
    const { style } = planOf({
      stackPresentation: 'formSheet',
    }).contentWrapperProps;

    expect(style).toEqual(FILL);
  });

  it('sizes a fitToContents formSheet on iOS from its content', () => {
    const { style } = planOf({
      stackPresentation: 'formSheet',
      sheetAllowedDetents: 'fitToContents',
    }).contentWrapperProps;

    expect(style).toEqual(ABSOLUTE_NO_BOTTOM);
  });

  it('sizes a formSheet on iOS from its content when native sizing is off', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    featureFlags.experiment.synchronousScreenUpdatesEnabled = false;

    const { style } = planOf({
      stackPresentation: 'formSheet',
    }).contentWrapperProps;

    expect(style).toEqual(ABSOLUTE_NO_BOTTOM);
  });

  it('fills a formSheet on Android unless it fits its content', () => {
    const sheet = planOf({ stackPresentation: 'formSheet' }, true);
    const fitting = planOf(
      { stackPresentation: 'formSheet', sheetAllowedDetents: 'fitToContents' },
      true,
    );

    expect(sheet.contentWrapperProps.style).toEqual(FILL);
    expect(fitting.contentWrapperProps.style).toEqual(ABSOLUTE_NO_BOTTOM);
  });

  it('keeps room for the toolbar of a translucent Android header', () => {
    const { style } = planOf(
      { headerTranslucent: true },
      true,
    ).contentWrapperProps;

    expect(style).toEqual({ flex: 1, paddingTop: 56 });
  });
});

describe('contentStyle option', () => {
  it('lays the app style over the positioning of the wrapper', () => {
    const { style } = planOf({
      contentStyle: [{ padding: 8 }, { flex: 2 }],
    }).contentWrapperProps;

    expect(style).toEqual({ flex: 2, padding: 8 });
  });

  it('moves the background of an iOS formSheet to the screen', () => {
    const plan = planOf({
      stackPresentation: 'formSheet',
      contentStyle: { backgroundColor: 'red', padding: 8 },
    });

    expect(plan.screenProps.style).toEqual({ backgroundColor: 'red' });
    expect(plan.contentWrapperProps.style).toEqual({ flex: 1, padding: 8 });
  });

  it('keeps the background in the wrapper everywhere else', () => {
    const style = { backgroundColor: 'red' };

    const android = planOf(
      { stackPresentation: 'formSheet', contentStyle: style },
      true,
    );
    const pushed = planOf({ contentStyle: style });

    expect(android.contentWrapperProps.style).toEqual({ flex: 1, ...style });
    expect(android.screenProps).not.toHaveProperty('style');
    expect(pushed.contentWrapperProps.style).toEqual({ flex: 1, ...style });
    expect(pushed.screenProps).not.toHaveProperty('style');
  });
});
