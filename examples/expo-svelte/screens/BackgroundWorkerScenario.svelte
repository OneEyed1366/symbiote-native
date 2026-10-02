<script lang="ts">
  import * as BackgroundTask from '@symbiote-native/background-task';
  import CallConsole from '../components/CallConsole.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { TASK_STATUS_LABEL, WORKER_TASK_NAME, intervalOf } from './background-tasks-definitions';

  const color = lineColorOf(ROUTE_NAME.BackgroundTasks);

  let interval = $state('15');
  let lastTrigger = $state('never');
</script>

<Scenario
  testID="background-task-card"
  title="Sync data while the app is closed"
  why="Refresh a feed, upload queued photos or clear a cache on the system's schedule. iOS BGTaskScheduler and Android WorkManager decide when it runs, so it is battery-friendly but not exact."
  steps={['Press registerTaskAsync', 'In a debug build press triggerTaskWorkerForTestingAsync', 'Check the console log for the worker run']}
  expect="Status reports the task system is available, the worker runs immediately on the test trigger and the last trigger time updates. In real use the OS runs it later on its own."
>
  <Field testID="background-tasks-worker-interval-input" label="minimumInterval (minutes)" value={interval} onChange={next => (interval = next)} />
  <ResultRow testID="background-tasks-trigger-result" label="last manual trigger" value={lastTrigger} />
  <CallConsole
    isBare
    prefix="background-task"
    title="background-task calls"
    {color}
    hint="triggerTaskWorkerForTestingAsync runs the registered worker now, debug builds only."
    calls={[
      {
        label: 'getStatusAsync',
        run: async () => TASK_STATUS_LABEL[await BackgroundTask.getStatusAsync()],
      },
      {
        label: 'registerTaskAsync',
        run: () =>
          BackgroundTask.registerTaskAsync(WORKER_TASK_NAME, {
            minimumInterval: intervalOf(interval),
          }),
      },
      {
        label: 'unregisterTaskAsync',
        run: () => BackgroundTask.unregisterTaskAsync(WORKER_TASK_NAME),
      },
      {
        label: 'triggerTaskWorkerForTestingAsync',
        run: async () => {
          const result = await BackgroundTask.triggerTaskWorkerForTestingAsync();
          lastTrigger = new Date().toISOString();
          return result;
        },
      },
    ]}
  />
</Scenario>
