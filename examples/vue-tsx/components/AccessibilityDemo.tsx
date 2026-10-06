import { defineComponent, onMounted, ref } from 'vue';
import { AccessibilityInfo } from '@symbiote-native/vue';

// The accessibility props reach native unchanged, the aria and role aliases fold into them,
// and AccessibilityInfo reads device state. Verify with uiautomator dump or Accessibility Inspector
export const AccessibilityDemo = defineComponent({
  name: 'AccessibilityDemo',
  setup() {
    const screenReader = ref('querying…');
    // A getter that does not throw proves the native module name resolved
    onMounted(() => {
      AccessibilityInfo.isScreenReaderEnabled()
        .then(isEnabled => {
          screenReader.value = isEnabled ? 'on' : 'off';
        })
        .catch(() => {
          screenReader.value = 'unavailable';
        });
      AccessibilityInfo.announceForAccessibility('symbiote accessibility online');
    });
    return () => (
      <view class="section-nested">
        <text class="section-label">Accessibility · props → native · aria/role transform · AccessibilityInfo</text>
        <text class="info-text">{`screen reader: ${screenReader.value}`}</text>
        {/* Canonical props: content-desc 'a11y-canonical-label' and role header */}
        <view accessible={true} accessibilityRole="header" accessibilityLabel="a11y-canonical-label" class="a11y-card">
          <text class="info-text">canonical label + role=header</text>
        </view>
        {/* The aria and role aliases must fold, a raw aria-label must not reach the native node */}
        <view accessible={true} role="button" aria-label="a11y-aria-label" class="a11y-card">
          <text class="info-text">aria-label + role=button</text>
        </view>
        <view
          accessible={true}
          accessibilityLabel="a11y-state"
          accessibilityState={{ disabled: true, selected: true }}
          class="a11y-card"
        >
          <text class="info-text">state: disabled + selected</text>
        </view>
      </view>
    );
  },
});
