<script setup lang="ts">
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import BackgroundExpirationCard from './BackgroundExpirationCard.vue';
import BackgroundFetchCard from './BackgroundFetchCard.vue';
import BackgroundWorkerScenario from './BackgroundWorkerScenario.vue';
import TaskManagerCalls from './TaskManagerCalls.vue';
import './background-tasks-definitions';

const ROUTE = ROUTE_NAME.BackgroundTasks;
const color = lineColorOf(ROUTE);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="background-tasks-scroll"
    title="Background Tasks"
    body="Run code while the app is closed: define a task, register it for system-scheduled work and inspect the task registry. Background task is the current API, background fetch is its deprecated predecessor."
  >
    <BackgroundWorkerScenario />
    <Explorer testID="background-tasks-explorer" :color="color">
      <BackgroundFetchCard />
      <TaskManagerCalls />
      <BackgroundExpirationCard />
    </Explorer>
  </ScreenShell>
</template>
