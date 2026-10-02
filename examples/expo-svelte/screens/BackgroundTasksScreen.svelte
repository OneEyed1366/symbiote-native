<script lang="ts">
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import BackgroundExpirationCard from './BackgroundExpirationCard.svelte';
  import BackgroundFetchCard from './BackgroundFetchCard.svelte';
  import BackgroundWorkerScenario from './BackgroundWorkerScenario.svelte';
  import TaskManagerCalls from './TaskManagerCalls.svelte';
  import './background-tasks-definitions';

  const ROUTE = ROUTE_NAME.BackgroundTasks;
</script>

<ScreenShell
  route={ROUTE}
  testID="background-tasks-scroll"
  title="Background Tasks"
  body="Run code while the app is closed: define a task, register it for system-scheduled work and inspect the task registry. Background task is the current API, background fetch is its deprecated predecessor."
>
  <BackgroundWorkerScenario />
  <Explorer testID="background-tasks-explorer" color={lineColorOf(ROUTE)}>
    <BackgroundFetchCard />
    <TaskManagerCalls />
    <BackgroundExpirationCard />
  </Explorer>
</ScreenShell>
