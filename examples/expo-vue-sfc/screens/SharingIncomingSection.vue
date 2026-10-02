<script setup lang="ts">
import { getSharedPayloads } from '@symbiote-native/sharing/vue';
import Scenario from '../components/Scenario.vue';
import SharingIncomingCards from './SharingIncomingCards.vue';

// iOS throws without an App Group and a Share Extension, so probe before mounting the hook
function probeIncomingShare(): string | null {
  try {
    getSharedPayloads();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const problem = probeIncomingShare();
</script>

<template>
  <SharingIncomingCards v-if="problem === null" />
  <Scenario
    v-else
    testID="sharing-incoming-card"
    title="Receive what other apps share into yours (needs native setup)"
    why="Appear in the share sheet so users can send a link, text or image straight into the app. This needs an iOS App Group with a Share Extension, or an Android intent filter, which the example app does not ship."
    :steps="[
      'Add a Share Extension and an App Group to the iOS project, or an intent filter on Android',
      'Rebuild the app and share something into it',
    ]"
    :expect="`Right now the native side reports: ${problem}`"
  />
</template>
