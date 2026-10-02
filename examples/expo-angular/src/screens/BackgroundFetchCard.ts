import { Component, signal } from '@angular/core';
import * as BackgroundFetch from '@symbiote-native/background-fetch';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import {
  FETCH_STATUS_LABEL,
  FETCH_TASK_NAME,
  intervalOf,
} from './background-tasks-definitions';

@Component({
  selector: 'BackgroundFetchCard',
  standalone: true,
  imports: [CallConsole, Card, Field, ToggleRow],
  template: `
    <Card
      testID="background-fetch-card"
      title="background-fetch options (deprecated upstream)"
    >
      <Field
        testID="background-tasks-fetch-interval-input"
        label="minimumInterval (seconds)"
        [(value)]="interval"
      />
      <ToggleRow
        testID="background-tasks-stop-switch"
        label="stopOnTerminate (Android)"
        [(value)]="stopOnTerminate"
        [color]="color"
      />
      <ToggleRow
        testID="background-tasks-boot-switch"
        label="startOnBoot (Android)"
        [(value)]="startOnBoot"
        [color]="color"
      />
    </Card>
    <CallConsole
      prefix="background-fetch"
      title="background-fetch calls"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class BackgroundFetchCard {
  readonly color = lineColorOf(ROUTE_NAME.BackgroundTasks);

  readonly interval = signal('900');
  readonly stopOnTerminate = signal(false);
  readonly startOnBoot = signal(true);

  readonly calls = [
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
          minimumInterval: intervalOf(this.interval()),
          stopOnTerminate: this.stopOnTerminate(),
          startOnBoot: this.startOnBoot(),
        }),
    },
    {
      label: 'setMinimumIntervalAsync',
      run: () =>
        BackgroundFetch.setMinimumIntervalAsync(
          intervalOf(this.interval()) ?? 900,
        ),
    },
    {
      label: 'unregisterTaskAsync',
      run: () => BackgroundFetch.unregisterTaskAsync(FETCH_TASK_NAME),
    },
  ];
}
