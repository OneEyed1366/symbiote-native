import { defineComponent, ref } from 'vue';
import { Platform, StatusBar } from '@symbiote-native/vue';
import { ACCENT } from './canary-shared';

const BAR_RED = '#ff0000';
const BAR_DEFAULT = '#22323f';

// Android-only window flags. PASS: the strip changes and the app stays rendered, FAIL: it blanks
const AndroidWindowFlags = defineComponent({
  name: 'AndroidWindowFlags',
  setup() {
    const isRed = ref(false);
    const isTranslucent = ref(false);
    const toggleRed = (): void => {
      isRed.value = !isRed.value;
      StatusBar.setBackgroundColor(isRed.value ? BAR_RED : BAR_DEFAULT, true);
    };
    const toggleTranslucent = (): void => {
      isTranslucent.value = !isTranslucent.value;
      StatusBar.setTranslucent(isTranslucent.value);
    };
    return () => (
      <view class="row">
        <view class="flex1">
          <button title={isRed.value ? 'BG default' : 'BG red'} onPress={toggleRed} color={ACCENT} />
        </view>
        <view class="flex1">
          <button
            title={isTranslucent.value ? 'Opaque' : 'Translucent'}
            onPress={toggleTranslucent}
            color={ACCENT}
          />
        </view>
      </view>
    );
  },
});

// JS -> native: StatusBar renders nothing and drives the top strip from these props
export const CanaryStatusBar = defineComponent({
  name: 'CanaryStatusBar',
  setup() {
    const isHidden = ref(false);
    const isDark = ref(false);
    return () => (
      <>
        <StatusBar barStyle={isDark.value ? 'dark-content' : 'light-content'} hidden={isHidden.value} animated={true} />
        <view class="row">
          <view class="flex1">
            <button
              title={isHidden.value ? 'Show status bar' : 'Hide status bar'}
              onPress={() => (isHidden.value = !isHidden.value)}
              color={ACCENT}
            />
          </view>
          <view class="flex1">
            <button
              title={isDark.value ? 'Light text' : 'Dark text'}
              onPress={() => (isDark.value = !isDark.value)}
              color={ACCENT}
            />
          </view>
        </view>
        {Platform.OS === 'android' && <AndroidWindowFlags />}
      </>
    );
  },
});
