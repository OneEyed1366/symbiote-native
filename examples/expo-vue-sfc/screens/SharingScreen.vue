<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { isAvailableAsync } from '@symbiote-native/sharing/vue';
import Card from '../components/Card.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { ROUTE_NAME } from '../routes';
import CapabilityRow from './CapabilityRow.vue';
import SharingIncomingSection from './SharingIncomingSection.vue';
import SharingShareCard from './SharingShareCard.vue';

const status = ref<ICapabilityStatus>('checking');

onMounted(() => {
  void isAvailableAsync().then(available => {
    status.value = toCapabilityStatus(available);
  });
});
</script>

<template>
  <ScreenShell
    :route="ROUTE_NAME.Sharing"
    testID="sharing-scroll"
    title="Sharing"
    body="Send files out through the system share sheet, and receive links, text and images that other apps share into yours."
  >
    <Card testID="sharing-capability-card" title="Capabilities">
      <CapabilityRow testID="sharing-available" label="Available" :status="status" />
    </Card>
    <SharingShareCard />
    <SharingIncomingSection />
  </ScreenShell>
</template>
