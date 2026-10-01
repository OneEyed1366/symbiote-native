<script lang="ts">
  import { AsyncStorage, SQLiteStorage, Storage } from '@symbiote-native/sqlite/kv-store';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import Field from '../components/Field.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { aliasCalls, asyncCalls, syncCalls } from './sqlite-kv-calls';
  import type { IKvForm } from './sqlite-kv-calls';

  const color = lineColorOf(ROUTE_NAME.Sqlite);
  const CUSTOM_STORE_NAME = 'canary-custom-storage';
  const custom = new SQLiteStorage(CUSTOM_STORE_NAME);

  let form = $state<IKvForm>({ key: 'greeting', value: '{"hello":"world"}', index: '0' });
</script>

<Card testID="sqlite-kv-form-card" title="Key-value inputs">
  <Field
    testID="sqlite-kv-key-input"
    label="key"
    value={form.key}
    onChange={key => {
      form.key = key;
    }}
  />
  <Field
    testID="sqlite-kv-value-input"
    label="value (JSON object for mergeItem)"
    value={form.value}
    onChange={value => {
      form.value = value;
    }}
  />
  <Field
    testID="sqlite-kv-index-input"
    label="index for getKeyByIndex"
    value={form.index}
    onChange={index => {
      form.index = index;
    }}
  />
</Card>
<CallConsole
  prefix="sqlite-kv-async"
  title="AsyncStorage, async"
  {color}
  calls={asyncCalls(AsyncStorage, form)}
/>
<CallConsole
  prefix="sqlite-kv-sync"
  title="AsyncStorage, sync"
  {color}
  calls={syncCalls(AsyncStorage, form)}
/>
<CallConsole
  prefix="sqlite-kv-alias"
  title="AsyncStorage-style aliases"
  {color}
  calls={aliasCalls(AsyncStorage, form)}
/>
<CallConsole
  prefix="sqlite-kv-storage"
  title="Storage (same instance as AsyncStorage)"
  {color}
  calls={[
    { label: 'Storage is AsyncStorage', run: async () => Storage === AsyncStorage },
    { label: 'Storage.getItemAsync', run: () => Storage.getItemAsync(form.key) },
  ]}
/>
<CallConsole
  prefix="sqlite-kv-custom"
  title="new SQLiteStorage(name)"
  {color}
  calls={[
    ...asyncCalls(custom, form).slice(0, 2),
    { label: 'closeAsync', run: () => custom.closeAsync() },
    { label: 'closeSync', run: async () => custom.closeSync() },
    { label: 'close', run: () => custom.close() },
  ]}
/>
