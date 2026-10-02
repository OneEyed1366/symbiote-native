<script setup lang="ts">
import { ref } from 'vue';
import {
  getRegisteredTasksAsync,
  getTaskOptionsAsync,
  isAvailableAsync,
  isTaskDefined,
  isTaskRegisteredAsync,
  unregisterAllTasksAsync,
  unregisterTaskAsync,
} from '@symbiote-native/task-manager';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { FETCH_TASK_NAME } from './background-tasks-definitions';

const color = lineColorOf(ROUTE_NAME.BackgroundTasks);

const taskName = ref(FETCH_TASK_NAME);

const calls = [
  { label: 'isAvailableAsync', run: () => isAvailableAsync() },
  { label: 'isTaskDefined', run: async () => isTaskDefined(taskName.value) },
  { label: 'isTaskRegisteredAsync', run: () => isTaskRegisteredAsync(taskName.value) },
  { label: 'getTaskOptionsAsync', run: () => getTaskOptionsAsync(taskName.value) },
  { label: 'getRegisteredTasksAsync', run: () => getRegisteredTasksAsync() },
  { label: 'unregisterTaskAsync', run: () => unregisterTaskAsync(taskName.value) },
  { label: 'unregisterAllTasksAsync', run: () => unregisterAllTasksAsync() },
];
</script>

<template>
  <Card testID="background-tasks-manager-card" title="Task name">
    <Field
      testID="background-tasks-name-input"
      label="task name for the calls below"
      :value="taskName"
      :onChange="next => (taskName = next)"
    />
  </Card>
  <CallConsole
    prefix="background-tasks-manager"
    title="Task manager calls"
    :color="color"
    :calls="calls"
  />
</template>
