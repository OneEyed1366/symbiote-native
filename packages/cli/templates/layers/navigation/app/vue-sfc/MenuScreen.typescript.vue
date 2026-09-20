<script setup lang="ts">
import { ref } from 'vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';

const count = ref<number>(0);
const navigation = useStackNavigation();
</script>

<template>
  <safe-area-view class="screen">
    <view class="brand-row">
      <image
        class="brand-logo brand-logo-react"
        resize-mode="contain"
        :source="require('./assets/react-native-logo.png')"
      />
      <image
        class="plus-icon"
        resize-mode="contain"
        :source="require('./assets/plus-icon.png')"
      />
      <image
        class="brand-logo brand-logo-vue"
        resize-mode="contain"
        :source="require('./assets/vue-logo.png')"
      />
    </view>

    <text class="title">Welcome to SymbioteNative!</text>
    <text class="subtitle">Framework-agnostic React Native, driven by Vue.</text>

    <view class="counter-card">
      <text class="counter-label">TAPS</text>
      <text class="counter-value">{{ count }}</text>
    </view>

    <view class="button-row">
      <pressable
        class="button-primary"
        @press="count++"
      >
        <text class="button-primary-text">Tap me</text>
      </pressable>
      <pressable
        class="button-secondary"
        @press="() => navigation.push('Details')"
      >
        <text class="button-secondary-text">Go to Details</text>
      </pressable>
    </view>
  </safe-area-view>
</template>
