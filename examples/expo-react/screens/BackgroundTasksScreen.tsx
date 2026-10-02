import { useState } from 'react';
import * as BackgroundFetch from '@symbiote-native/background-fetch';
import {
  BackgroundFetchResult,
  BackgroundFetchStatus,
} from '@symbiote-native/background-fetch';
import * as BackgroundTask from '@symbiote-native/background-task';
import {
  BackgroundTaskResult,
  BackgroundTaskStatus,
} from '@symbiote-native/background-task';
import { dlog } from '@symbiote-native/engine';
import { defineTask } from '@symbiote-native/task-manager';
import { CallConsole } from '../components/CallConsole';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { ExpirationCard, TaskManagerCalls } from './background-tasks-extras';

const ROUTE = ROUTE_NAME.BackgroundTasks;
const color = lineColorOf(ROUTE);
const FETCH_TASK_NAME = 'symbiote-canary-background-fetch';
const WORKER_TASK_NAME = 'symbiote-canary-background-task';

// Both run at module top level, the app can be launched headlessly to run them
defineTask(FETCH_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`${FETCH_TASK_NAME} failed:`, error);
    return BackgroundFetchResult.Failed;
  }
  dlog(() => `${FETCH_TASK_NAME} received: ${JSON.stringify(data)}`);
  return BackgroundFetchResult.NewData;
});

defineTask(WORKER_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error(`${WORKER_TASK_NAME} failed:`, error);
    return BackgroundTaskResult.Failed;
  }
  dlog(() => `${WORKER_TASK_NAME} received: ${JSON.stringify(data)}`);
  return BackgroundTaskResult.Success;
});

const FETCH_STATUS_LABEL: Record<BackgroundFetchStatus, string> = {
  [BackgroundFetchStatus.Denied]: 'Denied',
  [BackgroundFetchStatus.Restricted]: 'Restricted',
  [BackgroundFetchStatus.Available]: 'Available',
};

const TASK_STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  [BackgroundTaskStatus.Restricted]: 'Restricted (e.g. iOS Simulator)',
  [BackgroundTaskStatus.Available]: 'Available',
};

function intervalOf(text: string): number | undefined {
  const value = Number(text);
  return text.trim() === '' || Number.isNaN(value) ? undefined : value;
}

function FetchCard() {
  const [interval, setInterval] = useState('900');
  const [stopOnTerminate, setStopOnTerminate] = useState(false);
  const [startOnBoot, setStartOnBoot] = useState(true);
  return (
    <>
      <Card testID="background-fetch-card" title="background-fetch options (deprecated upstream)">
        <Field testID="background-tasks-fetch-interval-input" label="minimumInterval (seconds)" value={interval} onChange={setInterval} />
        <ToggleRow testID="background-tasks-stop-switch" label="stopOnTerminate (Android)" value={stopOnTerminate} onChange={setStopOnTerminate} color={color} />
        <ToggleRow testID="background-tasks-boot-switch" label="startOnBoot (Android)" value={startOnBoot} onChange={setStartOnBoot} color={color} />
      </Card>
      <CallConsole
        prefix="background-fetch"
        title="background-fetch calls"
        color={color}
        calls={[
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
                minimumInterval: intervalOf(interval),
                stopOnTerminate,
                startOnBoot,
              }),
          },
          { label: 'setMinimumIntervalAsync', run: () => BackgroundFetch.setMinimumIntervalAsync(intervalOf(interval) ?? 900) },
          { label: 'unregisterTaskAsync', run: () => BackgroundFetch.unregisterTaskAsync(FETCH_TASK_NAME) },
        ]}
      />
    </>
  );
}

function WorkerCard() {
  const [interval, setInterval] = useState('15');
  const [lastTrigger, setLastTrigger] = useState('never');
  return (
    <Scenario
      testID="background-task-card"
      title="Sync data while the app is closed"
      why="Refresh a feed, upload queued photos or clear a cache on the system's schedule. iOS BGTaskScheduler and Android WorkManager decide when it runs, so it is battery-friendly but not exact."
      steps={['Press registerTaskAsync', 'In a debug build press triggerTaskWorkerForTestingAsync', 'Check the console log for the worker run']}
      expect="Status reports the task system is available, the worker runs immediately on the test trigger and the last trigger time updates. In real use the OS runs it later on its own."
    >
      <Field testID="background-tasks-worker-interval-input" label="minimumInterval (minutes)" value={interval} onChange={setInterval} />
      <ResultRow testID="background-tasks-trigger-result" label="last manual trigger" value={lastTrigger} />
      <CallConsole
        isBare
        prefix="background-task"
        title="background-task calls"
        color={color}
        hint="triggerTaskWorkerForTestingAsync runs the registered worker now, debug builds only."
        calls={[
          {
            label: 'getStatusAsync',
            run: async () => TASK_STATUS_LABEL[await BackgroundTask.getStatusAsync()],
          },
          {
            label: 'registerTaskAsync',
            run: () => BackgroundTask.registerTaskAsync(WORKER_TASK_NAME, { minimumInterval: intervalOf(interval) }),
          },
          { label: 'unregisterTaskAsync', run: () => BackgroundTask.unregisterTaskAsync(WORKER_TASK_NAME) },
          {
            label: 'triggerTaskWorkerForTestingAsync',
            run: async () => {
              const result = await BackgroundTask.triggerTaskWorkerForTestingAsync();
              setLastTrigger(new Date().toISOString());
              return result;
            },
          },
        ]}
      />
    </Scenario>
  );
}

export function BackgroundTasksScreen() {
  const [taskName, setTaskName] = useState(FETCH_TASK_NAME);
  return (
    <ScreenShell
      route={ROUTE}
      testID="background-tasks-scroll"
      title="Background Tasks"
      body="Run code while the app is closed: define a task, register it for system-scheduled work and inspect the task registry. Background task is the current API, background fetch is its deprecated predecessor."
    >
      <WorkerCard />
      <Explorer testID="background-tasks-explorer" color={color}>
        <FetchCard />
        <TaskManagerCalls taskName={taskName} setTaskName={setTaskName} />
        <ExpirationCard />
      </Explorer>
    </ScreenShell>
  );
}
