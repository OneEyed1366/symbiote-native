<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import {
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
} from '@symbiote-native/media-library/vue';
import type {
  IGranularPermission,
  IMediaLibraryNextPermissionResponse,
} from '@symbiote-native/media-library/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const GRANULAR: IGranularPermission[] = ['photo', 'video'];

const isWriteOnly = ref(false);
const permission = ref<IMediaLibraryNextPermissionResponse | null>(null);

const granular = computed(() => (isWriteOnly.value ? undefined : GRANULAR));

// Reloads the status whenever `writeOnly` flips, ignoring a stale answer
watchEffect(onCleanup => {
  const writeOnly = isWriteOnly.value;
  const granularPermissions = granular.value;
  let isStale = false;
  onCleanup(() => {
    isStale = true;
  });
  permission.value = null;
  void getPermissionsAsync(writeOnly, granularPermissions).then(response => {
    if (!isStale) {
      permission.value = response;
    }
  });
});

const permissionText = computed(() =>
  permission.value === null
    ? 'loading…'
    : `${permission.value.status}, access ${permission.value.accessPrivileges ?? 'n/a'}`,
);

const calls = [
  { label: 'getPermissionsAsync', run: () => getPermissionsAsync(isWriteOnly.value, granular.value) },
  {
    label: 'requestPermissionsAsync',
    run: () => requestPermissionsAsync(isWriteOnly.value, granular.value),
  },
  { label: 'presentPermissionsPicker', run: () => presentPermissionsPicker() },
];
</script>

<template>
  <Card testID="media-library-permissions-card" title="Permissions">
    <ToggleRow
      testID="media-library-write-only-switch"
      label="writeOnly"
      :value="isWriteOnly"
      :onChange="next => (isWriteOnly = next)"
      :color="color"
    />
    <ResultRow
      testID="media-library-permission-hook"
      label="usePermissions"
      :value="permissionText"
    />
  </Card>
  <CallConsole
    prefix="media-library-permission-calls"
    title="Permission calls"
    :color="color"
    hint="granularPermissions (photo, video) only matter on Android 13+."
    :calls="calls"
  />
</template>
