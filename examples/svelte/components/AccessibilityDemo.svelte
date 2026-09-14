<script lang="ts">
  // Accessibility: the props reach native unchanged (accessibilityLabel -> Android
  // content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
  // the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
  // never reach native), and AccessibilityInfo reads device state + drives announce.
  // Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
  // logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
  import { AccessibilityInfo } from '@symbiote-native/svelte';

  let screenReader = $state('querying…');

  $effect(() => {
    // A non-throwing getter proves the native module name resolved (Android
    // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => (screenReader = enabled ? 'on' : 'off'))
      .catch(() => (screenReader = 'unavailable'));
    AccessibilityInfo.announceForAccessibility('symbiote accessibility online');
  });
</script>

<!-- Per-card expectations: the canonical accessibilityLabel+role=header card expects
     content-desc 'a11y-canonical-label'; the aria-label/role=button card proves the
     web-alias FOLD (a raw aria-label attribute must never reach the native node); the
     third card's accessibilityState expects enabled=false/selected=true in uiautomator. -->
<view class="section-nested">
  <text class="section-label">
    Accessibility · props → native · aria/role transform · AccessibilityInfo
  </text>
  <text class="info-text">{`screen reader: ${screenReader}`}</text>
  <view
    accessible
    accessibilityRole="header"
    accessibilityLabel="a11y-canonical-label"
    class="a11y-card"
  >
    <text class="info-text">canonical label + role=header</text>
  </view>
  <view accessible role="button" aria-label="a11y-aria-label" class="a11y-card">
    <text class="info-text">aria-label + role=button</text>
  </view>
  <view
    accessible
    accessibilityLabel="a11y-state"
    accessibilityState={{ disabled: true, selected: true }}
    class="a11y-card"
  >
    <text class="info-text">state: disabled + selected</text>
  </view>
</view>
