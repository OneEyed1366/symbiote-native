import { useEffect, useState } from 'react';
import { AccessibilityInfo } from '@symbiote-native/react';

// Accessibility: the props reach native unchanged (accessibilityLabel -> Android
// content-desc / iOS accessibilityLabel; accessibilityState -> checked/selected/enabled),
// the web aria-*/role aliases FOLD to accessibility* in our wrapper (raw aria-* must
// never reach native), and AccessibilityInfo reads device state + drives announce.
// Verify on Android with `uiautomator dump` (content-desc / selected / enabled) and
// logcat for the announce + module-resolution dlogs; on iOS via Accessibility Inspector.
export function AccessibilityDemo() {
  const [screenReader, setScreenReader] = useState('querying…');

  useEffect(() => {
    // A non-throwing getter proves the native module name resolved (Android
    // 'AccessibilityInfo' / iOS 'AccessibilityManager'); a reject means wrong name.
    AccessibilityInfo.isScreenReaderEnabled()
      .then(enabled => setScreenReader(enabled ? 'on' : 'off'))
      .catch(() => setScreenReader('unavailable'));
    AccessibilityInfo.announceForAccessibility('symbiote accessibility online');
  }, []);

  return (
    <view className="section-nested">
      <text className="section-label">
        Accessibility · props → native · aria/role transform · AccessibilityInfo
      </text>
      {/* getter readout: 'off' (no screen reader) proves the module resolved */}
      <text className="info-text">{`screen reader: ${screenReader}`}</text>
      {/* canonical accessibility*: content-desc 'a11y-canonical-label' + role=header */}
      <view
        accessible
        accessibilityRole="header"
        accessibilityLabel="a11y-canonical-label"
        className="a11y-card"
      >
        <text className="info-text">canonical label + role=header</text>
      </view>
      {/* web aria and role aliases MUST fold: content-desc should be
          'a11y-aria-label', a raw aria-label attribute must not reach the native node */}
      <view
        accessible
        role="button"
        aria-label="a11y-aria-label"
        className="a11y-card"
      >
        <text className="info-text">aria-label + role=button</text>
      </view>
      {/* accessibilityState: uiautomator shows enabled=false / selected=true */}
      <view
        accessible
        accessibilityLabel="a11y-state"
        accessibilityState={{ disabled: true, selected: true }}
        className="a11y-card"
      >
        <text className="info-text">state: disabled + selected</text>
      </view>
    </view>
  );
}
