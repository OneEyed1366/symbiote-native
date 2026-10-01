<script lang="ts">
  import {
    addContactsChangeListener,
    getPermissionsAsync,
    removeAllContactsChangeListeners,
    requestPermissionsAsync,
  } from '@symbiote-native/contacts/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.Contacts);

  let count = $state(0);
  let isListening = $state(false);

  function toggle(next: boolean): void {
    isListening = next;
    if (next) {
      addContactsChangeListener(() => {
        count += 1;
      });
    } else {
      removeAllContactsChangeListeners();
    }
  }
</script>

<CallConsole
  prefix="contacts-permissions"
  title="Permissions"
  {color}
  calls={[
    { label: 'getPermissionsAsync', run: () => getPermissionsAsync() },
    { label: 'requestPermissionsAsync', run: () => requestPermissionsAsync() },
  ]}
/>
<Card testID="contacts-listener-card" title="Change listener">
  <ToggleRow
    testID="contacts-listener-switch"
    label="addContactsChangeListener / removeAllContactsChangeListeners"
    value={isListening}
    onChange={toggle}
    {color}
  />
  <ResultRow testID="contacts-listener-count" label="change events" value={String(count)} />
  <text class="info-text">Edit a contact in the system Contacts app, then come back.</text>
</Card>
