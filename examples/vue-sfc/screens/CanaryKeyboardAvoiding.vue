<script setup lang="ts">
import { ref } from 'vue';
import { KeyboardAvoidingView, Platform } from '@symbiote-native/vue';
import { TRACK_OFF } from './canary-shared';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';
const TRACK = { false: TRACK_OFF, true: '#42b883' };

const isEnabled = ref(true);
</script>

<template>
  <!-- PASS: with avoiding on, focusing the field lifts it above the email keyboard -->
  <view class="switch-row">
    <text class="switch-label"> avoid keyboard </text>
    <switch
      v-model="isEnabled"
      :track-color="TRACK"
    />
  </view>
  <KeyboardAvoidingView
    :behavior="KEYBOARD_BEHAVIOR"
    :enabled="isEnabled"
  >
    <text-input
      auto-complete="email"
      input-mode="email"
      enter-key-hint="done"
      placeholder="email — focus me near the bottom…"
      placeholder-text-color="#41506a"
      class="text-input"
    />
  </KeyboardAvoidingView>
</template>
