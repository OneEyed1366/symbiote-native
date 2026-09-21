<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import styles from './App.module.css';

const navigation = useStackNavigation();
</script>

<template>
  <safe-area-view :class="styles['screen']">
    <view :class="styles['details-card']">
      <text :class="styles['details-title']">You made it!</text>
      <text :class="styles['details-body']">This screen was pushed by the Stack navigator — proof navigation actually works.</text>
    </view>
    <pressable :class="styles['button-secondary']" @press="() => navigation.pop()">
      <text :class="styles['button-secondary-text']">Go back</text>
    </pressable>
  </safe-area-view>
</template>
