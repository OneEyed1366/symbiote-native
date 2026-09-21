import { ref } from '@vue/runtime-core';
import styles from './App.module.css';

export default {
  setup() {
    const count = ref(0);
    return () => (
      <view class={styles.container}>
        <text>Welcome to SymbioteNative!</text>
        <pressable onPress={() => count.value++}>
          <text>Taps: {count.value}</text>
        </pressable>
      </view>
    );
  },
};
