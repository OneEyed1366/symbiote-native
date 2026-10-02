import { Component, signal } from '@angular/core';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store';
import type { ISecureStoreOptions } from '@symbiote-native/secure-store';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { Explorer } from '../components/Explorer';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { toCapabilityStatus } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { CapabilityRow } from './CapabilityRow';
import { SecureStoreExtras } from './SecureStoreExtras';

const DEMO_KEY = 'canary.secure-store.demo';
const AUTH_OPTIONS: ISecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt: 'Unlock to store the demo value',
};

@Component({
  selector: 'SecureStoreScreen',
  standalone: true,
  imports: [
    ActionButton,
    CapabilityRow,
    Card,
    Explorer,
    ResultRow,
    Scenario,
    ScreenShell,
    SecureStoreExtras,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="secure-store-scroll"
      title="Secure Store"
      body="Store small secrets, such as a sign-in token or a PIN, in the iOS Keychain and the Android Keystore. They survive app restarts, stay out of backups, and can require Face ID or a fingerprint to read."
    >
      <Card testID="secure-store-capability-card" title="Capabilities">
        <CapabilityRow
          testID="secure-store-available"
          label="Available"
          [status]="isAvailable()"
        />
        <CapabilityRow
          testID="secure-store-biometrics"
          label="Biometrics usable"
          [status]="canUseBiometrics()"
        />
      </Card>

      <Scenario
        testID="secure-store-remember-scenario"
        title="Keep a sign-in token across restarts"
        why="A session token must survive closing the app but never be readable by other apps or by a backup. The Keychain and Keystore do that; AsyncStorage does not."
        [steps]="rememberSteps"
        expect="The same token comes back after the relaunch. The value below shows it, and Last result says ok."
      >
        <text-input
          testID="secure-store-input"
          [value]="inputText()"
          placeholder="Fake token, e.g. eyJhbGciOi..."
          placeholderTextColor="#41506a"
          class="text-input"
          (valueChange)="inputText.set($event)"
        ></text-input>
        <ActionButton
          testID="secure-store-save-button"
          title="Save"
          [color]="color"
          (press)="save(inputText())"
        />
        <ActionButton
          testID="secure-store-read-button"
          title="Read"
          [color]="color"
          (press)="read()"
        />
        <ResultRow
          testID="secure-store-value"
          [label]="demoKey"
          [value]="storedValue() ?? '(no entry)'"
        />
        <ResultRow
          testID="secure-store-result"
          label="Last result"
          [value]="lastResult()"
        />
      </Scenario>

      <Scenario
        testID="secure-store-biometrics-scenario"
        title="Lock a secret behind Face ID or a fingerprint"
        why="For something like a payment PIN, even an unlocked phone in someone else's hands should not reveal it."
        [steps]="biometricsSteps"
        expect="Saving and reading both ask for biometrics. Cancelling the prompt shows a failure in Last result and the value stays hidden."
      >
        <ActionButton
          testID="secure-store-save-auth-button"
          title="Save behind biometrics"
          [color]="color"
          (press)="save(inputText(), authOptions, 'saved (authenticated)')"
        />
      </Scenario>

      <Scenario
        testID="secure-store-signout-scenario"
        title="Wipe the secret on sign-out"
        why="After signing out, the token must be gone, not just forgotten by the UI."
        [steps]="signoutSteps"
        expect="Read reports no entry, and the value shows (no entry)."
      >
        <ActionButton
          testID="secure-store-delete-button"
          title="Delete"
          [color]="color"
          (press)="remove()"
        />
      </Scenario>

      <Explorer testID="secure-store-explorer" [color]="color">
        <ng-template><SecureStoreExtras /></ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class SecureStoreScreen {
  readonly route = ROUTE_NAME.SecureStore;
  readonly color = lineColorOf(ROUTE_NAME.SecureStore);
  readonly demoKey = DEMO_KEY;
  readonly authOptions = AUTH_OPTIONS;
  readonly rememberSteps = [
    'Type a fake token below and press Save',
    'Force-quit the app and open it again',
    'Press Read',
  ];
  readonly biometricsSteps = [
    'Type a value and press Save behind biometrics',
    'Approve the system prompt',
    'Press Read above and approve again',
  ];
  readonly signoutSteps = ['Press Delete', 'Press Read above'];

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly canUseBiometrics = signal<ICapabilityStatus>('checking');
  readonly inputText = signal('');
  readonly storedValue = signal<string | null>(null);
  readonly lastResult = signal('idle');

  constructor() {
    void isAvailableAsync().then(available => {
      this.isAvailable.set(toCapabilityStatus(available));
      // Throws when the native module is missing, so it only runs once availability is positive
      this.canUseBiometrics.set(
        available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no',
      );
    });
  }

  private async readBack(label: string): Promise<void> {
    const value = await getItemAsync(DEMO_KEY);
    this.storedValue.set(value);
    this.lastResult.set(value === null ? `${label}: no entry` : `${label}: ok`);
  }

  private run(label: string, action: () => Promise<void>): void {
    action().catch((error: Error) => {
      this.lastResult.set(`${label} failed: ${error.message}`);
    });
  }

  read(): void {
    this.run('read', () => this.readBack('read'));
  }

  save(text: string, options: ISecureStoreOptions = {}, label = 'saved'): void {
    this.run(label, async () => {
      await setItemAsync(DEMO_KEY, text, options);
      await this.readBack(label);
    });
  }

  remove(): void {
    this.run('delete', async () => {
      await deleteItemAsync(DEMO_KEY);
      this.storedValue.set(null);
      this.lastResult.set('deleted');
    });
  }
}
