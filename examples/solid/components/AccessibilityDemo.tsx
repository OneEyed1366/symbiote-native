// Accessibility: the props reach native unchanged (accessibilityLabel -> Android content-desc /
// iOS accessibilityLabel; accessibilityState -> checked/selected/enabled), the web aria-*/role
// aliases FOLD to accessibility* in our wrapper (raw aria-* must never reach native), and
// AccessibilityInfo reads device state + drives announce. Verify on Android with
// `uiautomator dump` (content-desc / selected / enabled) and logcat for the announce +
// module-resolution dlogs; on iOS via Accessibility Inspector.
//
// Per-card expectations: the canonical accessibilityLabel+role=header card expects content-desc
// 'a11y-canonical-label'; the aria-label/role=button card proves the web-alias FOLD; the third
// card's accessibilityState expects enabled=false/selected=true in uiautomator.

import { createSignal } from 'solid-js';
import { AccessibilityInfo } from '@symbiote-native/solid';
import './AccessibilityDemo.css';

export function AccessibilityDemo() {
  const [screenReader, setScreenReader] = createSignal('querying…');

  // Straight in the body, where Vue used onMounted and Svelte an $effect: a Solid body runs
  // exactly ONCE, at setup, so it already is the mount hook for anything that does not need a
  // committed host node — and neither of these calls does.
  //
  // A non-throwing getter proves the native module name resolved (Android 'AccessibilityInfo' /
  // iOS 'AccessibilityManager'); a reject means the name is wrong.
  AccessibilityInfo.isScreenReaderEnabled()
    .then(enabled => setScreenReader(enabled ? 'on' : 'off'))
    .catch(() => setScreenReader('unavailable'));
  AccessibilityInfo.announceForAccessibility('symbiote accessibility online');

  return (
    <view class="section-nested">
      <text class="section-label">
        Accessibility · props → native · aria/role transform · AccessibilityInfo
      </text>
      {/* getter readout: 'off' (no screen reader) already proves the module resolved */}
      <text class="a11y-text">{`screen reader: ${screenReader()}`}</text>

      <view
        accessible
        accessibilityRole="header"
        accessibilityLabel="a11y-canonical-label"
        class="a11y-card"
      >
        <text class="a11y-text">canonical label + role=header</text>
      </view>

      <view
        accessible
        role="button"
        aria-label="a11y-aria-label"
        class="a11y-card"
      >
        <text class="a11y-text">aria-label + role=button</text>
      </view>

      <view
        accessible
        accessibilityLabel="a11y-state"
        accessibilityState={{ disabled: true, selected: true }}
        class="a11y-card"
      >
        <text class="a11y-text">state: disabled + selected</text>
      </view>
    </view>
  );
}
