<script setup lang="ts">
import { ref } from 'vue';
import styles from './App.module.css';

const count = ref<number>(0);
</script>

<template>
  <view :class="styles.container">
    <text>Welcome to SymbioteNative!</text>
    <pressable @press="count++">
      <text>Taps: {{ count }}</text>
    </pressable>
  </view>
</template>
