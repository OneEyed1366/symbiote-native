<script setup>
import { ref } from 'vue';
import { StyleSheet } from '@symbiote-native/vue';

const count = ref(0);
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
</script>

<template>
  <view :style="styles.container">
    <text>Welcome to SymbioteNative!</text>
    <pressable @press="count++">
      <text>Taps: {{ count }}</text>
    </pressable>
  </view>
</template>
