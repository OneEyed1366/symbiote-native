import { useState } from 'react';
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
import { CallConsole } from '../components/CallConsole';
import {
  Card,
  ChoiceRow,
  Field,
  ToggleRow,
  lineColorOf,
} from '../components/ScreenShell';
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

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export function SecureStoreExtras() {
  const [key, setKey] = useState('canary.secure-store.options');
  const [value, setValue] = useState('options demo value');
  const [service, setService] = useState('');
  const [accessGroup, setAccessGroup] = useState('');
  const [accessible, setAccessible] = useState(NONE);
  const [isAuthRequired, setIsAuthRequired] = useState(false);
  const [prompt, setPrompt] = useState('Unlock to use the demo value');

  const options = (): ISecureStoreOptions => ({
    keychainService: optional(service),
    accessGroup: optional(accessGroup),
    keychainAccessible: ACCESSIBLE[accessible],
    requireAuthentication: isAuthRequired,
    authenticationPrompt: optional(prompt),
  });

  return (
    <>
      <Card testID="secure-store-options-card" title="Options for every call below">
        <Field testID="secure-store-options-key-input" label="key" value={key} onChange={setKey} />
        <Field testID="secure-store-options-value-input" label="value" value={value} onChange={setValue} />
        <Field testID="secure-store-service-input" label="keychainService" value={service} onChange={setService} />
        <Field testID="secure-store-group-input" label="accessGroup (iOS)" value={accessGroup} onChange={setAccessGroup} />
        <ChoiceRow
          testID="secure-store-accessible"
          label="keychainAccessible (iOS constants, undefined on Android)"
          options={ACCESSIBLE_CHOICES}
          value={accessible}
          onChange={setAccessible}
          color={color}
        />
        <ToggleRow testID="secure-store-auth-switch" label="requireAuthentication" value={isAuthRequired} onChange={setIsAuthRequired} color={color} />
        <Field testID="secure-store-prompt-input" label="authenticationPrompt" value={prompt} onChange={setPrompt} />
      </Card>
      <CallConsole
        prefix="secure-store-options-calls"
        title="Calls with options"
        color={color}
        hint="getItem and setItem block the JS thread, with requireAuthentication the app stays frozen until the user authenticates."
        calls={[
          { label: 'setItemAsync', run: async () => setItemAsync(key, value, options()) },
          { label: 'getItemAsync', run: () => getItemAsync(key, options()) },
          { label: 'setItem (sync)', run: async () => setItem(key, value, options()) },
          { label: 'getItem (sync)', run: async () => getItem(key, options()) },
          { label: 'deleteItemAsync', run: async () => deleteItemAsync(key, options()) },
        ]}
      />
    </>
  );
}
