<script lang="ts">
  import * as BackgroundFetch from '@symbiote-native/background-fetch';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { FETCH_STATUS_LABEL, FETCH_TASK_NAME, intervalOf } from './background-tasks-definitions';

  const color = lineColorOf(ROUTE_NAME.BackgroundTasks);

  let interval = $state('900');
  let stopOnTerminate = $state(false);
  let startOnBoot = $state(true);
</script>

<Card testID="background-fetch-card" title="background-fetch options (deprecated upstream)">
  <Field testID="background-tasks-fetch-interval-input" label="minimumInterval (seconds)" value={interval} onChange={next => (interval = next)} />
  <ToggleRow testID="background-tasks-stop-switch" label="stopOnTerminate (Android)" value={stopOnTerminate} onChange={next => (stopOnTerminate = next)} {color} />
  <ToggleRow testID="background-tasks-boot-switch" label="startOnBoot (Android)" value={startOnBoot} onChange={next => (startOnBoot = next)} {color} />
</Card>
<CallConsole
  prefix="background-fetch"
  title="background-fetch calls"
  {color}
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
    {
      label: 'setMinimumIntervalAsync',
      run: () => BackgroundFetch.setMinimumIntervalAsync(intervalOf(interval) ?? 900),
    },
    {
      label: 'unregisterTaskAsync',
      run: () => BackgroundFetch.unregisterTaskAsync(FETCH_TASK_NAME),
    },
  ]}
/>
