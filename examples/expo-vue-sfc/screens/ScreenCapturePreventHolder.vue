<script setup lang="ts">
import { usePreventScreenCapture } from '@symbiote-native/screen-capture/vue';

const props = defineProps<{ keyName: string }>();

// The hook takes a plain string and applies it once at mount
usePreventScreenCapture(props.keyName);
</script>

<template>
  <view />
</template>
