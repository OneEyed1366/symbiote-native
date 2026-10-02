<script lang="ts">
  import { addListener, removeAllListeners } from '@symbiote-native/media-library/svelte';
  import Card from '../components/Card.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.MediaLibrary);
  const MAX_LOGGED_EVENTS = 6;

  let isOn = $state(false);
  let lines = $state<string[]>([]);
  let subscription: ReturnType<typeof addListener> | null = null;

  function toggle(next: boolean): void {
    isOn = next;
    if (next) {
      subscription = addListener(event => {
        const summary = `incremental ${event.hasIncrementalChanges}, +${event.insertedAssets?.length ?? 0} -${event.deletedAssets?.length ?? 0} ~${event.updatedAssets?.length ?? 0}`;
        lines = [summary, ...lines].slice(0, MAX_LOGGED_EVENTS);
      });
    } else {
      subscription?.remove();
      removeAllListeners();
    }
  }
</script>

<Card testID="media-library-listener-card" title="Change listener">
  <ToggleRow
    testID="media-library-listener-switch"
    label="addListener / removeAllListeners"
    value={isOn}
    onChange={toggle}
    {color}
  />
  <text testID="media-library-listener-log" class="info-text">
    {lines.length === 0 ? 'no changes yet, edit the library in another app' : lines.join('\n')}
  </text>
</Card>
