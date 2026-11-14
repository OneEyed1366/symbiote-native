// Feeds the accessibility preferences of `@media` from `AccessibilityInfo`
// The surface hands this module to `media-subscriptions.ts`, since it reaches the node types

import { AccessibilityInfo } from './accessibility-info';
import { dlog } from './debug';
import { landAccessibilityFlag, type IAccessibilityFlag } from './media-environment';
import { Platform } from './platform';

type IFlagSource = {
  flag: IAccessibilityFlag;
  eventName: Parameters<typeof AccessibilityInfo.addEventListener>[0];
  read: () => Promise<boolean>;
};

let isStarted = false;

// Reads one flag and follows its change event
function followFlag({ flag, eventName, read }: IFlagSource): void {
  const land = (isOn: boolean): void => {
    landAccessibilityFlag(flag, isOn);
  };
  read().then(land, error => {
    dlog(`media-accessibility: ${eventName} read failed: ${String(error)}`);
  });
  // Kept for the life of the app, so the subscription is never removed
  AccessibilityInfo.addEventListener(eventName, state => {
    land(state === true);
  });
}

const MOTION: IFlagSource = {
  flag: 'reducedMotion',
  eventName: 'reduceMotionChanged',
  read: () => AccessibilityInfo.isReduceMotionEnabled(),
};

// iOS answers transparency and darker colors, Android only text contrast (ledger decision 40)
const IOS_SOURCES: readonly IFlagSource[] = [
  MOTION,
  {
    flag: 'reducedTransparency',
    eventName: 'reduceTransparencyChanged',
    read: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  },
  {
    flag: 'moreContrast',
    eventName: 'darkerSystemColorsChanged',
    read: () => AccessibilityInfo.isDarkerSystemColorsEnabled(),
  },
];

const ANDROID_SOURCES: readonly IFlagSource[] = [
  MOTION,
  {
    flag: 'moreContrast',
    eventName: 'highTextContrastChanged',
    read: () => AccessibilityInfo.isHighTextContrastEnabled(),
  },
];

export function startMediaAccessibility(): void {
  if (isStarted) return;
  isStarted = true;
  const sources = Platform.select({
    ios: IOS_SOURCES,
    default: ANDROID_SOURCES,
  });
  for (const source of sources ?? []) followFlag(source);
}
