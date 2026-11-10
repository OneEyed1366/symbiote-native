// Builds the `@media` snapshot from the runtime modules and keeps it current
// Starts on the first conditional class, so an app without `@media` never reads these modules

import type { IEventSubscription } from './native-events';
import { Platform } from './platform';
import {
  Appearance,
  Dimensions,
  I18nManager,
  PixelRatio,
} from './react-native-host';
import type { IMediaEnvironment } from './style-registry/media-evaluate';
import {
  applyMediaEnvironment,
  requestMediaAccessibility,
} from './style-registry/media-subscriptions';

export type IAccessibilityFlag =
  | 'reducedMotion'
  | 'moreContrast'
  | 'reducedTransparency';

// Accessibility reads return Promises, so every feature starts at its `no-preference` value
// and flips once when the read lands (ledger decision 41)
const accessibilityOn: Record<IAccessibilityFlag, boolean> = {
  reducedMotion: false,
  moreContrast: false,
  reducedTransparency: false,
};
let subscriptions: IEventSubscription[] = [];
let isStarted = false;

function snapshot(): IMediaEnvironment {
  const { width, height } = Dimensions.get('window');
  return {
    width,
    height,
    resolution: PixelRatio.get(),
    orientation: height >= width ? 'portrait' : 'landscape',
    'prefers-color-scheme': Appearance.getColorScheme() ?? 'light',
    'prefers-reduced-motion': accessibilityOn.reducedMotion
      ? 'reduce'
      : 'no-preference',
    'prefers-contrast': accessibilityOn.moreContrast ? 'more' : 'no-preference',
    'prefers-reduced-transparency': accessibilityOn.reducedTransparency
      ? 'reduce'
      : 'no-preference',
    platform: Platform.OS,
    dir: I18nManager.isRTL ? 'rtl' : 'ltr',
  };
}

function refresh(): void {
  applyMediaEnvironment(snapshot());
}

// The accessibility follower reports here, one flag per read or change event
export function landAccessibilityFlag(
  flag: IAccessibilityFlag,
  isOn: boolean,
): void {
  accessibilityOn[flag] = isOn;
  refresh();
}

export function ensureMediaEnvironment(): void {
  if (isStarted) return;
  isStarted = true;
  refresh();
  subscriptions.push(
    Dimensions.addEventListener('change', refresh),
    Appearance.addChangeListener(refresh),
  );
  requestMediaAccessibility();
}

// Test seam: stops listening and forgets what was read, so the next conditional class starts again
export function resetMediaEnvironment(): void {
  for (const subscription of subscriptions) subscription.remove();
  subscriptions = [];
  accessibilityOn.reducedMotion = false;
  accessibilityOn.moreContrast = false;
  accessibilityOn.reducedTransparency = false;
  isStarted = false;
}
