import { Component, signal } from '@angular/core';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from '@symbiote-native/angular';
import {
  canUseBiometricAuthentication,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
} from '@symbiote-native/secure-store/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const DEMO_KEY = 'canary.secure-store.demo';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

/**
 * @symbiote-native/secure-store canary demo: a capability card (isAvailableAsync,
 * canUseBiometricAuthentication), a stored-value card, and a write/read/delete card driving one
 * demo key. Kill and relaunch the app to prove the value survives outside the JS heap. Every
 * function is a plain re-export off the core package — no service to inject(), same shape as
 * StoreReviewScreen's.
 */
@Component({
  selector: 'SecureStoreScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, TextInput, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="secure-store-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Secure Store</Text>
            <Text class="hero-body">
              @symbiote-native/secure-store — encrypted key/value storage in the
              iOS Keychain and the Android Keystore. Save a value, kill the app,
              relaunch, and read it back.
            </Text>
          </View>
        </View>

        <View testID="secure-store-capability-card" class="secure-store-card">
          <Text class="secure-store-card-title">Capabilities</Text>
          <View testID="secure-store-available" class="secure-store-row">
            <Text class="secure-store-row-label">Available</Text>
            <View [class]="statusBadgeClass(isAvailable())">
              <Text class="secure-store-status-text">{{
                statusLabel(isAvailable())
              }}</Text>
            </View>
          </View>
          <View testID="secure-store-biometrics" class="secure-store-row">
            <Text class="secure-store-row-label">Biometrics usable</Text>
            <View [class]="statusBadgeClass(canUseBiometrics())">
              <Text class="secure-store-status-text">{{
                statusLabel(canUseBiometrics())
              }}</Text>
            </View>
          </View>
        </View>

        <View testID="secure-store-value-card" class="secure-store-card">
          <Text class="secure-store-card-title">Stored value</Text>
          <View class="secure-store-row">
            <Text class="secure-store-row-label">{{ demoKey }}</Text>
            <Text testID="secure-store-value" class="secure-store-value-text">{{
              valueLabel()
            }}</Text>
          </View>
          <View class="secure-store-row">
            <Text class="secure-store-row-label">Last result</Text>
            <Text
              testID="secure-store-result"
              class="secure-store-value-text"
              >{{ lastResult() }}</Text
            >
          </View>
        </View>

        <View testID="secure-store-write-card" class="secure-store-card">
          <Text class="secure-store-card-title">Write, read, delete</Text>
          <TextInput
            testID="secure-store-input"
            [value]="inputText()"
            (valueChange)="inputText.set($event)"
            placeholder="Value to store"
            placeholderTextColor="#41506a"
            class="text-input"
          ></TextInput>
          <ActionButton
            testID="secure-store-save-button"
            title="Save"
            (press)="handleSave()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="secure-store-save-auth-button"
            title="Save behind biometrics"
            (press)="handleSaveAuthenticated()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="secure-store-read-button"
            title="Read"
            (press)="handleRead()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="secure-store-delete-button"
            title="Delete"
            (press)="handleDelete()"
            [color]="lineColor"
          ></ActionButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class SecureStoreScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.SecureStore];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };
  readonly demoKey = DEMO_KEY;

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly canUseBiometrics = signal<ICapabilityStatus>('checking');
  readonly inputText = signal('');
  readonly storedValue = signal<string | null>(null);
  readonly lastResult = signal('idle');

  constructor() {
    isAvailableAsync().then(available => {
      this.isAvailable.set(toCapabilityStatus(available));
      // canUseBiometricAuthentication throws when the native module is missing entirely, so it
      // only runs once availability has come back positive.
      this.canUseBiometrics.set(
        available ? toCapabilityStatus(canUseBiometricAuthentication()) : 'no',
      );
    });
  }

  handleRead(): void {
    this.readBack('read').catch((error: Error) =>
      this.lastResult.set(`read failed: ${error.message}`),
    );
  }

  handleSave(): void {
    setItemAsync(DEMO_KEY, this.inputText())
      .then(() => this.readBack('saved'))
      .catch((error: Error) =>
        this.lastResult.set(`save failed: ${error.message}`),
      );
  }

  // Android prompts on every operation, iOS only when reading or updating an entry that already
  // exists — so the write below may pass silently and the read after it raise the prompt.
  handleSaveAuthenticated(): void {
    setItemAsync(DEMO_KEY, this.inputText(), {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock to store the demo value',
    })
      .then(() => this.readBack('saved (authenticated)'))
      .catch((error: Error) =>
        this.lastResult.set(`authenticated save failed: ${error.message}`),
      );
  }

  handleDelete(): void {
    deleteItemAsync(DEMO_KEY)
      .then(() => {
        this.storedValue.set(null);
        this.lastResult.set('deleted');
      })
      .catch((error: Error) =>
        this.lastResult.set(`delete failed: ${error.message}`),
      );
  }

  valueLabel(): string {
    return this.storedValue() ?? '(no entry)';
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `secure-store-status-badge secure-store-status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }

  private async readBack(label: string): Promise<void> {
    const value = await getItemAsync(DEMO_KEY);
    this.storedValue.set(value);
    this.lastResult.set(value === null ? `${label}: no entry` : `${label}: ok`);
  }
}
