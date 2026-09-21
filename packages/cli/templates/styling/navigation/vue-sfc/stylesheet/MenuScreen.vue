<script setup>
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { StyleSheet } from '@symbiote-native/vue';

const navigation = useStackNavigation();
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
</script>

<template>
  <view :style="styles.container">
    <text>Welcome to SymbioteNative!</text>
    <pressable @press="() => navigation.push('Details')">
      <text>Go to Details</text>
    </pressable>
  </view>
</template>
