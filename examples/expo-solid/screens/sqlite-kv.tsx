import { createSignal } from 'solid-js';
import {
  AsyncStorage,
  SQLiteStorage,
  Storage,
} from '@symbiote-native/sqlite/kv-store';
import { CallConsole } from '../components/CallConsole';
import { Card, Field, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sqlite);
const CUSTOM_STORE_NAME = 'canary-custom-storage';

type IForm = { key: string; value: string; index: string };

function FormCard(props: { form: IForm; setForm: (patch: Partial<IForm>) => void }) {
  return (
    <Card testID="sqlite-kv-form-card" title="Key-value inputs">
      <Field testID="sqlite-kv-key-input" label="key" value={props.form.key} onChange={key => props.setForm({ key })} />
      <Field testID="sqlite-kv-value-input" label="value (JSON object for mergeItem)" value={props.form.value} onChange={value => props.setForm({ value })} />
      <Field testID="sqlite-kv-index-input" label="index for getKeyByIndex" value={props.form.index} onChange={index => props.setForm({ index })} />
    </Card>
  );
}

function asyncCalls(store: SQLiteStorage, form: IForm) {
  const index = Number(form.index);
  return [
    { label: 'getItemAsync', run: () => store.getItemAsync(form.key) },
    { label: 'setItemAsync', run: () => store.setItemAsync(form.key, form.value) },
    { label: 'setItemAsync (updater)', run: () => store.setItemAsync(form.key, previous => `${previous ?? ''}+`) },
    { label: 'removeItemAsync', run: () => store.removeItemAsync(form.key) },
    { label: 'getAllKeysAsync', run: () => store.getAllKeysAsync() },
    { label: 'getLengthAsync', run: () => store.getLengthAsync() },
    { label: 'getKeyByIndexAsync', run: () => store.getKeyByIndexAsync(index) },
    { label: 'clearAsync', run: () => store.clearAsync() },
  ];
}

function syncCalls(store: SQLiteStorage, form: IForm) {
  const index = Number(form.index);
  return [
    { label: 'getItemSync', run: async () => store.getItemSync(form.key) },
    { label: 'setItemSync', run: async () => store.setItemSync(form.key, form.value) },
    { label: 'removeItemSync', run: async () => store.removeItemSync(form.key) },
    { label: 'getAllKeysSync', run: async () => store.getAllKeysSync() },
    { label: 'getLengthSync', run: async () => store.getLengthSync() },
    { label: 'getKeyByIndexSync', run: async () => store.getKeyByIndexSync(index) },
    { label: 'clearSync', run: async () => store.clearSync() },
  ];
}

function aliasCalls(store: SQLiteStorage, form: IForm) {
  return [
    { label: 'getItem', run: () => store.getItem(form.key) },
    { label: 'setItem', run: () => store.setItem(form.key, form.value) },
    { label: 'removeItem', run: () => store.removeItem(form.key) },
    { label: 'getAllKeys', run: () => store.getAllKeys() },
    { label: 'clear', run: () => store.clear() },
    { label: 'mergeItem', run: () => store.mergeItem(form.key, form.value) },
    { label: 'multiGet', run: () => store.multiGet([form.key, `${form.key}-2`]) },
    { label: 'multiSet', run: () => store.multiSet([[form.key, form.value], [`${form.key}-2`, form.value]]) },
    { label: 'multiMerge', run: () => store.multiMerge([[form.key, form.value], [`${form.key}-2`, form.value]]) },
    { label: 'multiRemove', run: () => store.multiRemove([form.key, `${form.key}-2`]) },
  ];
}

export function KvCards() {
  const [form, setFormState] = createSignal<IForm>({ key: 'greeting', value: '{"hello":"world"}', index: '0' });
  const custom = new SQLiteStorage(CUSTOM_STORE_NAME);
  const setForm = (patch: Partial<IForm>) => setFormState(previous => ({ ...previous, ...patch }));
  return (
    <>
      <FormCard form={form()} setForm={setForm} />
      <CallConsole prefix="sqlite-kv-async" title="AsyncStorage, async" color={color} calls={asyncCalls(AsyncStorage, form())} />
      <CallConsole prefix="sqlite-kv-sync" title="AsyncStorage, sync" color={color} calls={syncCalls(AsyncStorage, form())} />
      <CallConsole prefix="sqlite-kv-alias" title="AsyncStorage-style aliases" color={color} calls={aliasCalls(AsyncStorage, form())} />
      <CallConsole
        prefix="sqlite-kv-storage"
        title="Storage (same instance as AsyncStorage)"
        color={color}
        calls={[
          { label: 'Storage is AsyncStorage', run: async () => Storage === AsyncStorage },
          { label: 'Storage.getItemAsync', run: () => Storage.getItemAsync(form().key) },
        ]}
      />
      <CallConsole
        prefix="sqlite-kv-custom"
        title="new SQLiteStorage(name)"
        color={color}
        calls={[
          ...asyncCalls(custom, form()).slice(0, 2),
          { label: 'closeAsync', run: () => custom.closeAsync() },
          { label: 'closeSync', run: async () => custom.closeSync() },
          { label: 'close', run: () => custom.close() },
        ]}
      />
    </>
  );
}
