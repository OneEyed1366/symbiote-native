<script setup lang="ts">
import { ref } from 'vue';

const count = ref<number>(0);
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

    <pressable class="button-primary" @press="count++">
      <text class="button-primary-text">Tap me</text>
    </pressable>
  </safe-area-view>
</template>

<style scoped>
:root {
  --ink: #0b1622;
  --paper: #13243a;
  --mist: #41506a;
  --chalk: #cbd5e1;
  --chalk-bright: #ffffff;
  --brand: #42b883;
}

.screen {
  flex: 1;
  background-color: var(--ink);
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px 32px;
}

.brand-row {
  flex-direction: row;
  align-items: center;
  gap: 28px;
}

.brand-logo {
  height: 64px;
}

.brand-logo-react {
  width: 70px;
}

.brand-logo-vue {
  width: 74px;
}

.plus-icon {
  width: 48px;
  height: 48px;
}

.title {
  color: var(--chalk-bright);
  font-size: 22px;
  font-weight: bold;
  text-align: center;
}

.subtitle {
  color: var(--chalk);
  font-size: 14px;
  text-align: center;
}

.counter-card {
  align-items: center;
  gap: 4px;
  padding: 20px 28px;
  border-radius: 16px;
  background-color: var(--paper);
}

.counter-label {
  color: var(--mist);
  font-size: 12px;
  letter-spacing: 1px;
}

.counter-value {
  color: var(--brand);
  font-size: 32px;
  font-weight: bold;
}

.button-primary {
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  padding: 14px 22px;
  background-color: var(--brand);
}

.button-primary-text {
  color: var(--ink);
  font-size: 15px;
  font-weight: bold;
}
</style>
