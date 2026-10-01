<script lang="ts">
  import { addExpirationListener } from '@symbiote-native/background-task';
  import Card from '../components/Card.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.BackgroundTasks);
  const MAX_LOGGED_EVENTS = 6;

  let isOn = $state(false);
  let lines = $state<string[]>([]);
  let subscription: ReturnType<typeof addExpirationListener> | null = null;

  function toggle(next: boolean): void {
    isOn = next;
    if (next) {
      subscription = addExpirationListener(() => {
        lines = [`expired at ${new Date().toISOString()}`, ...lines].slice(0, MAX_LOGGED_EVENTS);
      });
    } else {
      subscription?.remove();
      subscription = null;
    }
  }
</script>

<Card testID="background-tasks-expiration-card" title="addExpirationListener (background-task)">
  <ToggleRow
    testID="background-tasks-expiration-switch"
    label="listen for the OS expiring the task"
    value={isOn}
    onChange={toggle}
    {color}
  />
  <text testID="background-tasks-expiration-log" class="info-text">
    {lines.length === 0 ? 'no expiration yet' : lines.join('\n')}
  </text>
</Card>
