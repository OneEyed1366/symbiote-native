import { Component, signal } from '@angular/core';
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
import { Card } from '../components/Card';
import { ChoiceRow } from '../components/ChoiceRow';
import { Field } from '../components/Field';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

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

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

@Component({
  selector: 'SecureStoreExtras',
  standalone: true,
  imports: [CallConsole, Card, ChoiceRow, Field, ToggleRow],
  template: `
    <Card
      testID="secure-store-options-card"
      title="Options for every call below"
    >
      <Field
        testID="secure-store-options-key-input"
        label="key"
        [(value)]="key"
      />
      <Field
        testID="secure-store-options-value-input"
        label="value"
        [(value)]="value"
      />
      <Field
        testID="secure-store-service-input"
        label="keychainService"
        [(value)]="service"
      />
      <Field
        testID="secure-store-group-input"
        label="accessGroup (iOS)"
        [(value)]="accessGroup"
      />
      <ChoiceRow
        testID="secure-store-accessible"
        label="keychainAccessible (iOS constants, undefined on Android)"
        [options]="accessibleChoices"
        [(value)]="accessible"
        [color]="color"
      />
      <ToggleRow
        testID="secure-store-auth-switch"
        label="requireAuthentication"
        [(value)]="isAuthRequired"
        [color]="color"
      />
      <Field
        testID="secure-store-prompt-input"
        label="authenticationPrompt"
        [(value)]="prompt"
      />
    </Card>
    <CallConsole
      prefix="secure-store-options-calls"
      title="Calls with options"
      [color]="color"
      hint="getItem and setItem block the JS thread, with requireAuthentication the app stays frozen until the user authenticates."
      [calls]="calls"
    />
  `,
})
export class SecureStoreExtras {
  readonly color = lineColorOf(ROUTE_NAME.SecureStore);
  readonly accessibleChoices = Object.keys(ACCESSIBLE).map(label => ({
    label,
    value: label,
  }));

  readonly key = signal('canary.secure-store.options');
  readonly value = signal('options demo value');
  readonly service = signal('');
  readonly accessGroup = signal('');
  readonly accessible = signal(NONE);
  readonly isAuthRequired = signal(false);
  readonly prompt = signal('Unlock to use the demo value');

  private options(): ISecureStoreOptions {
    return {
      keychainService: optional(this.service()),
      accessGroup: optional(this.accessGroup()),
      keychainAccessible: ACCESSIBLE[this.accessible()],
      requireAuthentication: this.isAuthRequired(),
      authenticationPrompt: optional(this.prompt()),
    };
  }

  readonly calls = [
    {
      label: 'setItemAsync',
      run: async () => setItemAsync(this.key(), this.value(), this.options()),
    },
    {
      label: 'getItemAsync',
      run: () => getItemAsync(this.key(), this.options()),
    },
    {
      label: 'setItem (sync)',
      run: async () => setItem(this.key(), this.value(), this.options()),
    },
    {
      label: 'getItem (sync)',
      run: async () => getItem(this.key(), this.options()),
    },
    {
      label: 'deleteItemAsync',
      run: async () => deleteItemAsync(this.key(), this.options()),
    },
  ];
}
