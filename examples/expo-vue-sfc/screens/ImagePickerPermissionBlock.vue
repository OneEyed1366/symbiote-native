<script setup lang="ts">
import { computed, ref } from 'vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import { describePermission } from './image-picker-permission';
import type { IPermissionLike } from './image-picker-permission';

const props = defineProps<{
  prefix: string;
  title: string;
  color: string;
  hookResponse: IPermissionLike | null;
  hookRequest: () => Promise<unknown>;
  directGet: () => Promise<IPermissionLike>;
  directRequest: () => Promise<IPermissionLike>;
}>();

const direct = ref('not called');
const hookState = computed(() => describePermission(props.hookResponse));

function run(call: () => Promise<IPermissionLike>): void {
  call()
    .then(response => {
      direct.value = describePermission(response);
    })
    .catch((error: Error) => {
      direct.value = `failed: ${error.message}`;
    });
}
</script>

<template>
  <view>
    <text class="feature-card-title">{{ title }}</text>
    <ResultRow :testID="`${prefix}-hook`" label="hook state" :value="hookState" />
    <ActionButton
      :testID="`${prefix}-hook-request`"
      title="hook request()"
      :onPress="() => hookRequest()"
      :color="color"
    />
    <ActionButton
      :testID="`${prefix}-get`"
      title="get…PermissionsAsync"
      :onPress="() => run(directGet)"
      :color="color"
    />
    <ActionButton
      :testID="`${prefix}-request`"
      title="request…PermissionsAsync"
      :onPress="() => run(directRequest)"
      :color="color"
    />
    <ResultRow :testID="`${prefix}-direct`" label="direct call" :value="direct" />
  </view>
</template>
