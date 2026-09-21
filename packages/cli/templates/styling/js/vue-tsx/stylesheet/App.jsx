import { ref } from '@vue/runtime-core';
import { StyleSheet } from '@symbiote-native/vue';

export default {
  setup() {
    const count = ref(0);
    return () => (
      <view style={styles.container}>
        <text>Welcome to SymbioteNative!</text>
        <pressable onPress={() => count.value++}>
          <text>Taps: {count.value}</text>
        </pressable>
      </view>
    );
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
