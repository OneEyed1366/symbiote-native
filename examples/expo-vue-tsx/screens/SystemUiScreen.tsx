import { defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { Ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import {
  getBackgroundColorAsync,
  setBackgroundColorAsync,
} from '@symbiote-native/system-ui/vue';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow(props: { label: string; value: string }) {
  return (
    <view class="auth-capability-row">
      <text class="auth-capability-label">{props.label}</text>
      <text class="auth-value-text">{props.value}</text>
    </view>
  );
}

/**
 * System UI demo: @symbiote-native/system-ui — get/set the root view's background color. Plain
 * re-export, same for every adapter. Fetches the current color on mount and after every set.
 */
export const SystemUiScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SystemUi];
    const lineColor = LINE_COLOR[ROUTE_LINE_INFO[ROUTE_NAME.SystemUi].line];

    const backgroundColor: Ref<string | null> = ref(null);

    let isMounted = true;
    onUnmounted(() => {
      isMounted = false;
    });

    function refreshBackgroundColor() {
      getBackgroundColorAsync().then(value => {
        if (isMounted) backgroundColor.value = value ? String(value) : null;
      });
    }

    function handleSetColor(color: string | null) {
      setBackgroundColorAsync(color).then(refreshBackgroundColor);
    }

    onMounted(refreshBackgroundColor);

    return () => (
      <safe-area-view class="screen">
        <ScrollView
          testID="system-ui-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view class="hero-badge" style={{ backgroundColor: lineColor }}>
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">System UI</text>
              <text class="hero-body">
                @symbiote-native/system-ui — reads and sets the root view's
                background color, affecting the whole app.
              </text>
            </view>
          </view>

          <view testID="system-ui-card" class="auth-card">
            <view class="auth-card-header">
              <text class="auth-card-title">Background color</text>
            </view>
            <ValueRow
              label="Current"
              value={backgroundColor.value ?? 'not set'}
            />
            <ActionButton
              testID="system-ui-red-button"
              title="Red"
              onPress={() => handleSetColor('#ef4444')}
              color={lineColor}
            />
            <ActionButton
              testID="system-ui-blue-button"
              title="Blue"
              onPress={() => handleSetColor('#3b82f6')}
              color={lineColor}
            />
            <ActionButton
              testID="system-ui-reset-button"
              title="Reset"
              onPress={() => handleSetColor(null)}
              color={lineColor}
            />
          </view>
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'SystemUiScreen' },
);
