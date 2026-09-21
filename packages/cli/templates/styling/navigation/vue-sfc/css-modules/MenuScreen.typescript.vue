<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import styles from './App.module.css';

const navigation = useStackNavigation();
</script>

<template>
  <view :class="styles.container">
    <text>Welcome to SymbioteNative!</text>
    <pressable @press="() => navigation.push('Details')">
      <text>Go to Details</text>
    </pressable>
  </view>
</template>
