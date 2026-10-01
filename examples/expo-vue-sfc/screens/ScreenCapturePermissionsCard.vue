<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  getPermissionsAsync,
  requestPermissionsAsync,
  usePermissions,
} from '@symbiote-native/screen-capture/vue';
import type { PermissionResponse } from '@symbiote-native/screen-capture/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.ScreenCapture);

const permissions = usePermissions();
const direct = ref('not called');

function describePermission(response: PermissionResponse | null): string {
  return response === null
    ? 'loading…'
    : `${response.status}, granted ${response.granted}, canAskAgain ${response.canAskAgain}`;
}

const hookState = computed(() =>
  permissions.error.value === null
    ? describePermission(permissions.status.value)
    : permissions.error.value.message,
);

function run(call: () => Promise<PermissionResponse>): void {
  call()
    .then(response => {
      direct.value = describePermission(response);
    })
    .catch((failure: Error) => {
      direct.value = `failed: ${failure.message}`;
    });
}
</script>

<template>
  <Card testID="screen-capture-permissions-card" title="Permissions">
    <ResultRow testID="screen-capture-permission-hook" label="usePermissions state" :value="hookState" />
    <ActionButton
      testID="screen-capture-hook-request"
      title="hook request()"
      :onPress="() => permissions.request()"
      :color="color"
    />
    <ActionButton
      testID="screen-capture-hook-get"
      title="hook get()"
      :onPress="() => permissions.get()"
      :color="color"
    />
    <ActionButton
      testID="screen-capture-get-button"
      title="getPermissionsAsync"
      :onPress="() => run(getPermissionsAsync)"
      :color="color"
    />
    <ActionButton
      testID="screen-capture-request-button"
      title="requestPermissionsAsync"
      :onPress="() => run(requestPermissionsAsync)"
      :color="color"
    />
    <ResultRow testID="screen-capture-direct" label="direct call" :value="direct" />
  </Card>
</template>
