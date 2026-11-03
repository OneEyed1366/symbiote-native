import { defineComponent, ref } from 'vue';
import { Platform, StatusBar } from '@symbiote-native/vue';
import { FlexButton } from './canary-parts';

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
        <FlexButton title={isRed.value ? 'BG default' : 'BG red'} onPress={toggleRed} />
        <FlexButton title={isTranslucent.value ? 'Opaque' : 'Translucent'} onPress={toggleTranslucent} />
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
          <FlexButton
            title={isHidden.value ? 'Show status bar' : 'Hide status bar'}
            onPress={() => (isHidden.value = !isHidden.value)}
          />
          <FlexButton
            title={isDark.value ? 'Light text' : 'Dark text'}
            onPress={() => (isDark.value = !isDark.value)}
          />
        </view>
        {Platform.OS === 'android' && <AndroidWindowFlags />}
      </>
    );
  },
});
