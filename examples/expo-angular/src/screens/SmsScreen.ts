import { Component, signal } from '@angular/core';
import { SafeAreaView, ScrollView, Text, TextInput, View } from '@symbiote-native/angular';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/angular';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

/**
 * @symbiote-native/sms canary demo: a capability card (isAvailableAsync), a composer card with
 * recipients and a message, and the result the composer reported back. The app never sends
 * anything itself — it opens the system composer prefilled, and the user sends or backs out.
 */
@Component({
  selector: 'SmsScreen',
  standalone: true,
  imports: [ActionButton, SafeAreaView, ScrollView, Text, TextInput, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView testID="sms-scroll" class="screen" contentContainerStyle="scroll-content">
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">{{ heroBadgeCode }}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">SMS</Text>
            <Text class="hero-body">
              @symbiote-native/sms — opens the system SMS composer prefilled with recipients and a
              message. Sending stays the user's call; the app only drafts.
            </Text>
          </View>
        </View>

        <View testID="sms-capability-card" class="sms-card">
          <Text class="sms-card-title">Capabilities</Text>
          <View testID="sms-available" class="sms-row">
            <Text class="sms-row-label">Available</Text>
            <View [class]="statusBadgeClass(isAvailable())">
              <Text class="sms-status-text">{{ statusLabel(isAvailable()) }}</Text>
            </View>
          </View>
          <Text class="sms-note">
            NO on the iOS simulator — it ships no Messages app — and on Android devices without
            telephony hardware. A real iPhone answers YES.
          </Text>
        </View>

        <View testID="sms-compose-card" class="sms-card">
          <Text class="sms-card-title">Compose</Text>
          <TextInput
            testID="sms-recipients-input"
            class="text-input"
            placeholder="Recipients, comma separated"
            placeholderTextColor="#41506a"
            [value]="recipients()"
            (valueChange)="recipients.set($event)"
          ></TextInput>
          <TextInput
            testID="sms-message-input"
            class="text-input"
            placeholder="Message"
            placeholderTextColor="#41506a"
            [value]="message()"
            (valueChange)="message.set($event)"
          ></TextInput>
          <ActionButton
            testID="sms-send-button"
            title="Open composer"
            (press)="handleSend()"
            [color]="lineColor"
          ></ActionButton>
        </View>

        <View testID="sms-result-card" class="sms-card">
          <Text class="sms-card-title">Last result</Text>
          <View class="sms-row">
            <Text class="sms-row-label">Status</Text>
            <Text testID="sms-result" class="sms-value-text">{{ lastResult() }}</Text>
          </View>
          <Text class="sms-note">
            Android always reports unknown: reading the real outcome needs the READ_SMS permission
            Google restricts to default-SMS-app publishers. Only iOS distinguishes sent from
            cancelled.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  `,
})
export class SmsScreen {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sms];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };

  readonly isAvailable = signal<ICapabilityStatus>('checking');
  readonly recipients = signal('0123456789');
  readonly message = signal('Sent from the Symbiote canary');
  readonly lastResult = signal('idle');

  constructor() {
    isAvailableAsync().then(available => this.isAvailable.set(toCapabilityStatus(available)));
  }

  handleSend(): void {
    const addresses = this.recipients()
      .split(',')
      .map(address => address.trim())
      .filter(address => address !== '');
    if (addresses.length === 0) {
      this.lastResult.set('enter at least one recipient');
      return;
    }
    this.lastResult.set('composer open…');
    // Rejects rather than resolving when the device has no messaging app at all, which is the
    // simulator's answer — the capability card above says so before the button is ever pressed.
    sendSMSAsync(addresses, this.message())
      .then(response => this.lastResult.set(response.result))
      .catch((error: Error) => this.lastResult.set(`failed: ${error.message}`));
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `sms-status-badge sms-status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking' ? 'CHECKING…' : status === 'yes' ? 'YES' : 'NO';
  }
}
