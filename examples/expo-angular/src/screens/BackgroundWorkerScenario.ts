import { Component, signal } from '@angular/core';
import * as BackgroundTask from '@symbiote-native/background-task';
import { CallConsole } from '../components/CallConsole';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import {
  TASK_STATUS_LABEL,
  WORKER_TASK_NAME,
  intervalOf,
} from './background-tasks-definitions';

@Component({
  selector: 'BackgroundWorkerScenario',
  standalone: true,
  imports: [CallConsole, Field, ResultRow, Scenario],
  template: `
    <Scenario
      testID="background-task-card"
      title="Sync data while the app is closed"
      why="Refresh a feed, upload queued photos or clear a cache on the system's schedule. iOS BGTaskScheduler and Android WorkManager decide when it runs, so it is battery-friendly but not exact."
      [steps]="steps"
      expect="Status reports the task system is available, the worker runs immediately on the test trigger and the last trigger time updates. In real use the OS runs it later on its own."
    >
      <Field
        testID="background-tasks-worker-interval-input"
        label="minimumInterval (minutes)"
        [(value)]="interval"
      />
      <ResultRow
        testID="background-tasks-trigger-result"
        label="last manual trigger"
        [value]="lastTrigger()"
      />
      <CallConsole
        isBare
        prefix="background-task"
        title="background-task calls"
        [color]="color"
        hint="triggerTaskWorkerForTestingAsync runs the registered worker now, debug builds only."
        [calls]="calls"
      />
    </Scenario>
  `,
})
export class BackgroundWorkerScenario {
  readonly color = lineColorOf(ROUTE_NAME.BackgroundTasks);
  readonly steps = [
    'Press registerTaskAsync',
    'In a debug build press triggerTaskWorkerForTestingAsync',
    'Check the console log for the worker run',
  ];

  readonly interval = signal('15');
  readonly lastTrigger = signal('never');

  readonly calls = [
    {
      label: 'getStatusAsync',
      run: async () => TASK_STATUS_LABEL[await BackgroundTask.getStatusAsync()],
    },
    {
      label: 'registerTaskAsync',
      run: () =>
        BackgroundTask.registerTaskAsync(WORKER_TASK_NAME, {
          minimumInterval: intervalOf(this.interval()),
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
        this.lastTrigger.set(new Date().toISOString());
        return result;
      },
    },
  ];
}
