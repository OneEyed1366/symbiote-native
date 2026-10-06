import { defineComponent } from 'vue';
import { DynamicColorIOS, Platform, PlatformColor, useColorScheme } from '@symbiote-native/vue';

// Names resolve on the native side and a wrong one silently falls back, so this is device-only.
// The opaque color objects stay dynamic: they are resolved at runtime
export const PlatformColorDemo = defineComponent({
  name: 'PlatformColorDemo',
  setup() {
    const scheme = useColorScheme();
    return () => (
      <view class="section-nested">
        <text class="section-label">
          {`PlatformColor · semantic + DynamicColorIOS (${scheme.value ?? 'unknown'})`}
        </text>
        <view class="row">
          <view
            class="color-tile"
            style={{ backgroundColor: PlatformColor('systemBlue', '@android:color/holo_blue_dark') }}
          >
            <text class="tile-label">systemBlue</text>
          </view>
          {/* DynamicColorIOS throws off iOS, as in RN */}
          {Platform.OS === 'ios' && (
            <view
              class="color-tile-bordered"
              style={{
                backgroundColor: DynamicColorIOS({ light: '#dcf3e8', dark: '#2c3e50' }),
                borderColor: PlatformColor('separator'),
              }}
            >
              <text class="bold-label" style={{ color: PlatformColor('label') }}>
                dynamic
              </text>
            </view>
          )}
        </view>
      </view>
    );
  },
});
