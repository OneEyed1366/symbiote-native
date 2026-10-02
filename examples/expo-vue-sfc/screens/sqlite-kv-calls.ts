import type { SQLiteStorage } from '@symbiote-native/sqlite/kv-store';
import type { ICall } from '../components/call-console';

export type IKvForm = { key: string; value: string; index: string };

export function asyncCalls(store: SQLiteStorage, form: IKvForm): ICall[] {
  const index = Number(form.index);
  return [
    { label: 'getItemAsync', run: () => store.getItemAsync(form.key) },
    {
      label: 'setItemAsync',
      run: () => store.setItemAsync(form.key, form.value),
    },
    {
      label: 'setItemAsync (updater)',
      run: () => store.setItemAsync(form.key, previous => `${previous ?? ''}+`),
    },
    { label: 'removeItemAsync', run: () => store.removeItemAsync(form.key) },
    { label: 'getAllKeysAsync', run: () => store.getAllKeysAsync() },
    { label: 'getLengthAsync', run: () => store.getLengthAsync() },
    { label: 'getKeyByIndexAsync', run: () => store.getKeyByIndexAsync(index) },
    { label: 'clearAsync', run: () => store.clearAsync() },
  ];
}

export function syncCalls(store: SQLiteStorage, form: IKvForm): ICall[] {
  const index = Number(form.index);
  return [
    { label: 'getItemSync', run: async () => store.getItemSync(form.key) },
    {
      label: 'setItemSync',
      run: async () => store.setItemSync(form.key, form.value),
    },
    {
      label: 'removeItemSync',
      run: async () => store.removeItemSync(form.key),
    },
    { label: 'getAllKeysSync', run: async () => store.getAllKeysSync() },
    { label: 'getLengthSync', run: async () => store.getLengthSync() },
    {
      label: 'getKeyByIndexSync',
      run: async () => store.getKeyByIndexSync(index),
    },
    { label: 'clearSync', run: async () => store.clearSync() },
  ];
}

export function aliasCalls(store: SQLiteStorage, form: IKvForm): ICall[] {
  const second = `${form.key}-2`;
  return [
    { label: 'getItem', run: () => store.getItem(form.key) },
    { label: 'setItem', run: () => store.setItem(form.key, form.value) },
    { label: 'removeItem', run: () => store.removeItem(form.key) },
    { label: 'getAllKeys', run: () => store.getAllKeys() },
    { label: 'clear', run: () => store.clear() },
    { label: 'mergeItem', run: () => store.mergeItem(form.key, form.value) },
    { label: 'multiGet', run: () => store.multiGet([form.key, second]) },
    {
      label: 'multiSet',
      run: () =>
        store.multiSet([
          [form.key, form.value],
          [second, form.value],
        ]),
    },
    {
      label: 'multiMerge',
      run: () =>
        store.multiMerge([
          [form.key, form.value],
          [second, form.value],
        ]),
    },
    { label: 'multiRemove', run: () => store.multiRemove([form.key, second]) },
  ];
}
