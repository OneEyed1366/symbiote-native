import { defineComponent, ref } from 'vue';
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

export const SecureStoreExtras = defineComponent(
  () => {
    const key = ref('canary.secure-store.options');
    const value = ref('options demo value');
    const service = ref('');
    const accessGroup = ref('');
    const accessible = ref(NONE);
    const isAuthRequired = ref(false);
    const prompt = ref('Unlock to use the demo value');

    const options = (): ISecureStoreOptions => ({
      keychainService: optional(service.value),
      accessGroup: optional(accessGroup.value),
      keychainAccessible: ACCESSIBLE[accessible.value],
      requireAuthentication: isAuthRequired.value,
      authenticationPrompt: optional(prompt.value),
    });

    return () => (
      <>
        <Card testID="secure-store-options-card" title="Options for every call below">
          <Field testID="secure-store-options-key-input" label="key" value={key.value} onChange={text => { key.value = text; }} />
          <Field testID="secure-store-options-value-input" label="value" value={value.value} onChange={text => { value.value = text; }} />
          <Field testID="secure-store-service-input" label="keychainService" value={service.value} onChange={text => { service.value = text; }} />
          <Field testID="secure-store-group-input" label="accessGroup (iOS)" value={accessGroup.value} onChange={text => { accessGroup.value = text; }} />
          <ChoiceRow
            testID="secure-store-accessible"
            label="keychainAccessible (iOS constants, undefined on Android)"
            options={ACCESSIBLE_CHOICES}
            value={accessible.value}
            onChange={next => { accessible.value = next; }}
            color={color}
          />
          <ToggleRow testID="secure-store-auth-switch" label="requireAuthentication" value={isAuthRequired.value} onChange={next => { isAuthRequired.value = next; }} color={color} />
          <Field testID="secure-store-prompt-input" label="authenticationPrompt" value={prompt.value} onChange={text => { prompt.value = text; }} />
        </Card>
        <CallConsole
          prefix="secure-store-options-calls"
          title="Calls with options"
          color={color}
          hint="getItem and setItem block the JS thread, with requireAuthentication the app stays frozen until the user authenticates."
          calls={[
            { label: 'setItemAsync', run: async () => setItemAsync(key.value, value.value, options()) },
            { label: 'getItemAsync', run: () => getItemAsync(key.value, options()) },
            { label: 'setItem (sync)', run: async () => setItem(key.value, value.value, options()) },
            { label: 'getItem (sync)', run: async () => getItem(key.value, options()) },
            { label: 'deleteItemAsync', run: async () => deleteItemAsync(key.value, options()) },
          ]}
        />
      </>
    );
  },
  { name: 'SecureStoreExtras' },
);
