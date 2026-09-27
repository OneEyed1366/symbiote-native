<script setup>
import { ref } from 'vue';
import styles from './App.module.css';

const count = ref(0);
</script>

<template>
  <safe-area-view :class="styles['screen']">
    <view :class="styles['brand-row']">
      <image
        :class="[styles['brand-logo'], styles['brand-logo-react']]"
        resize-mode="contain"
        :source="require('./assets/react-native-logo.png')"
      />
      <image
        :class="styles['plus-icon']"
        resize-mode="contain"
        :source="require('./assets/plus-icon.png')"
      />
      <image
        :class="[styles['brand-logo'], styles['brand-logo-vue']]"
        resize-mode="contain"
        :source="require('./assets/vue-logo.png')"
      />
    </view>
    <text :class="styles['title']">Welcome to SymbioteNative!</text>
    <text :class="styles['subtitle']">Framework-agnostic React Native, driven by Vue.</text>

    <view :class="styles['counter-card']">
      <text :class="styles['counter-label']">TAPS</text>
      <text :class="styles['counter-value']">{{ count }}</text>
    </view>

    <pressable :class="styles['button-primary']" @press="count++">
      <text :class="styles['button-primary-text']">Tap me</text>
    </pressable>
  </safe-area-view>
</template>
