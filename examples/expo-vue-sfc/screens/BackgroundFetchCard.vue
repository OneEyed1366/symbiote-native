<script setup lang="ts">
import { ref } from 'vue';
import * as BackgroundFetch from '@symbiote-native/background-fetch';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { FETCH_STATUS_LABEL, FETCH_TASK_NAME, intervalOf } from './background-tasks-definitions';

const color = lineColorOf(ROUTE_NAME.BackgroundTasks);

const interval = ref('900');
const stopOnTerminate = ref(false);
const startOnBoot = ref(true);

const calls = [
  {
    label: 'getStatusAsync',
    run: async () => {
      const status = await BackgroundFetch.getStatusAsync();
      return status === null ? 'unavailable' : FETCH_STATUS_LABEL[status];
    },
  },
  {
    label: 'registerTaskAsync',
    run: () =>
      BackgroundFetch.registerTaskAsync(FETCH_TASK_NAME, {
        minimumInterval: intervalOf(interval.value),
        stopOnTerminate: stopOnTerminate.value,
        startOnBoot: startOnBoot.value,
      }),
  },
  {
    label: 'setMinimumIntervalAsync',
    run: () => BackgroundFetch.setMinimumIntervalAsync(intervalOf(interval.value) ?? 900),
  },
  {
    label: 'unregisterTaskAsync',
    run: () => BackgroundFetch.unregisterTaskAsync(FETCH_TASK_NAME),
  },
];
</script>

<template>
  <Card testID="background-fetch-card" title="background-fetch options (deprecated upstream)">
    <Field
      testID="background-tasks-fetch-interval-input"
      label="minimumInterval (seconds)"
      :value="interval"
      :onChange="next => (interval = next)"
    />
    <ToggleRow
      testID="background-tasks-stop-switch"
      label="stopOnTerminate (Android)"
      :value="stopOnTerminate"
      :onChange="next => (stopOnTerminate = next)"
      :color="color"
    />
    <ToggleRow
      testID="background-tasks-boot-switch"
      label="startOnBoot (Android)"
      :value="startOnBoot"
      :onChange="next => (startOnBoot = next)"
      :color="color"
    />
  </Card>
  <CallConsole prefix="background-fetch" title="background-fetch calls" :color="color" :calls="calls" />
</template>
