<script setup>
import { StyleSheet } from '@symbiote-native/vue';

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
</script>

<template>
  <view :style="styles.container">
    <text>Details screen</text>
  </view>
</template>
