<script lang="ts">
  import {
    AFTER_FIRST_UNLOCK,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    ALWAYS,
    ALWAYS_THIS_DEVICE_ONLY,
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    WHEN_UNLOCKED,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    deleteItemAsync,
    getItem,
    getItemAsync,
    setItem,
    setItemAsync,
  } from '@symbiote-native/secure-store';
  import type { ISecureStoreOptions } from '@symbiote-native/secure-store';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const color = lineColorOf(ROUTE_NAME.SecureStore);
  const NONE = 'default';

  const ACCESSIBLE: Record<string, number | undefined> = {
    [NONE]: undefined,
    AFTER_FIRST_UNLOCK,
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    ALWAYS,
    ALWAYS_THIS_DEVICE_ONLY,
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    WHEN_UNLOCKED,
    WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };

  const ACCESSIBLE_CHOICES = Object.keys(ACCESSIBLE).map(label => ({
    label,
    value: label,
  }));

  let key = $state('canary.secure-store.options');
  let value = $state('options demo value');
  let service = $state('');
  let accessGroup = $state('');
  let accessible = $state(NONE);
  let isAuthRequired = $state(false);
  let prompt = $state('Unlock to use the demo value');

  function optional(text: string): string | undefined {
    return text.trim() === '' ? undefined : text.trim();
  }

  function options(): ISecureStoreOptions {
    return {
      keychainService: optional(service),
      accessGroup: optional(accessGroup),
      keychainAccessible: ACCESSIBLE[accessible],
      requireAuthentication: isAuthRequired,
      authenticationPrompt: optional(prompt),
    };
  }
</script>

<Card testID="secure-store-options-card" title="Options for every call below">
  <Field testID="secure-store-options-key-input" label="key" value={key} onChange={next => { key = next; }} />
  <Field testID="secure-store-options-value-input" label="value" value={value} onChange={next => { value = next; }} />
  <Field testID="secure-store-service-input" label="keychainService" value={service} onChange={next => { service = next; }} />
  <Field testID="secure-store-group-input" label="accessGroup (iOS)" value={accessGroup} onChange={next => { accessGroup = next; }} />
  <ChoiceRow
    testID="secure-store-accessible"
    label="keychainAccessible (iOS constants, undefined on Android)"
    options={ACCESSIBLE_CHOICES}
    value={accessible}
    onChange={next => {
      accessible = next;
    }}
    {color}
  />
  <ToggleRow testID="secure-store-auth-switch" label="requireAuthentication" value={isAuthRequired} onChange={next => { isAuthRequired = next; }} {color} />
  <Field testID="secure-store-prompt-input" label="authenticationPrompt" value={prompt} onChange={next => { prompt = next; }} />
</Card>
<CallConsole
  prefix="secure-store-options-calls"
  title="Calls with options"
  {color}
  hint="getItem and setItem block the JS thread, with requireAuthentication the app stays frozen until the user authenticates."
  calls={[
    { label: 'setItemAsync', run: async () => setItemAsync(key, value, options()) },
    { label: 'getItemAsync', run: () => getItemAsync(key, options()) },
    { label: 'setItem (sync)', run: async () => setItem(key, value, options()) },
    { label: 'getItem (sync)', run: async () => getItem(key, options()) },
    { label: 'deleteItemAsync', run: async () => deleteItemAsync(key, options()) },
  ]}
/>
