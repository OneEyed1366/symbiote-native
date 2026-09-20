import { ref } from '@vue/runtime-core';
import './App.css';

export default {
  setup() {
    const count = ref(0);
    return () => (
      <safe-area-view class="screen">
        <view class="brand-row">
          <image
            class="brand-logo brand-logo-react"
            resizeMode="contain"
            source={require('./assets/react-native-logo.png')}
          />
          <image
            class="plus-icon"
            resizeMode="contain"
            source={require('./assets/plus-icon.png')}
          />
          <image
            class="brand-logo brand-logo-vue"
            resizeMode="contain"
            source={require('./assets/vue-logo.png')}
          />
        </view>
        <text class="title">Welcome to SymbioteNative!</text>
        <text class="subtitle">Framework-agnostic React Native, driven by Vue.</text>

        <view class="counter-card">
          <text class="counter-label">TAPS</text>
          <text class="counter-value">{count.value}</text>
        </view>

        <pressable class="button-primary" onPress={() => count.value++}>
          <text class="button-primary-text">Tap me</text>
        </pressable>
      </safe-area-view>
    );
  },
};
