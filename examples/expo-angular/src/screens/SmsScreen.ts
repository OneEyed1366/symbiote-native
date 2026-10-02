import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/angular';
import type { ISmsAttachment } from '@symbiote-native/sms/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { Explorer } from '../components/Explorer';
import { Field } from '../components/Field';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ScreenShell } from '../components/ScreenShell';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

function addressesOf(text: string): string[] {
  return text
    .split(',')
    .map(address => address.trim())
    .filter(address => address.length > 0);
}

@Component({
  selector: 'SmsScreen',
  standalone: true,
  imports: [
    ActionButton,
    Card,
    Explorer,
    Field,
    ResultRow,
    Scenario,
    ScreenShell,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="sms-scroll"
      title="SMS"
      body="Open the system SMS composer with recipients, text and attachments already filled in. The user reviews and presses send, so the app needs no SMS permission and never sends by itself."
    >
      <Card testID="sms-capability-card" title="Can this device send SMS?">
        <ResultRow
          testID="sms-available"
          label="Available"
          [value]="availability()"
        />
        <text class="info-text">
          NO is expected on the iOS simulator and on Android devices without
          telephony hardware.
        </text>
      </Card>
      <Scenario
        testID="sms-send-card"
        title="Invite a friend or text support with a prefilled message"
        why="Share an invite code, send a delivery update or contact support by SMS. The composer opens ready to send, with one or many recipients."
        [steps]="sendSteps"
        expect="The composer opens with the recipients and text. Last result says sent or cancelled on iOS, and always unknown on Android because it cannot report the outcome."
      >
        <Field
          testID="sms-recipients-input"
          label="recipients, comma separated"
          [(value)]="recipients"
          placeholder="0123456789, 9876543210"
        />
        <Field testID="sms-message-input" label="message" [(value)]="message" />
        <ActionButton
          testID="sms-send-button"
          title="Open composer"
          [color]="color"
          (press)="send()"
        />
        <ResultRow
          testID="sms-result"
          label="Last result"
          [value]="lastResult()"
        />
      </Scenario>
      <Explorer testID="sms-explorer" [color]="color">
        <ng-template>
          <Card testID="sms-attachment-card" title="attachments">
            <ToggleRow
              testID="sms-attach-switch"
              label="attach a file"
              [(value)]="isAttaching"
              [color]="color"
            />
            <ToggleRow
              testID="sms-array-switch"
              label="pass an array (single attachment)"
              [(value)]="isArrayForm"
              [color]="color"
            />
            <ToggleRow
              testID="sms-second-switch"
              label="two attachments (Android keeps the first)"
              [(value)]="isSecondAttachment"
              [color]="color"
            />
            <Field
              testID="sms-uri-input"
              label="uri (content uri)"
              [(value)]="uri"
              placeholder="content://..."
            />
            <Field
              testID="sms-mime-input"
              label="mimeType"
              [(value)]="mimeType"
            />
            <Field
              testID="sms-filename-input"
              label="filename"
              [(value)]="filename"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class SmsScreen {
  readonly route = ROUTE_NAME.Sms;
  readonly color = lineColorOf(ROUTE_NAME.Sms);
  readonly sendSteps = [
    'Enter your own number in recipients',
    'Press Open composer',
    'Send or cancel in the composer',
  ];

  readonly availability = signal('checking');
  readonly lastResult = signal('idle');
  readonly recipients = signal('');
  readonly message = signal('Sent from the Symbiote canary');
  readonly isAttaching = signal(false);
  readonly isSecondAttachment = signal(false);
  readonly isArrayForm = signal(false);
  readonly uri = signal('');
  readonly mimeType = signal('image/png');
  readonly filename = signal('canary.png');

  constructor() {
    void isAvailableAsync().then(available => {
      this.availability.set(available ? 'yes' : 'no');
    });
  }

  private attachmentsOf(): ISmsAttachment | ISmsAttachment[] | undefined {
    if (!this.isAttaching()) {
      return undefined;
    }
    const first = {
      uri: this.uri(),
      mimeType: this.mimeType(),
      filename: this.filename(),
    };
    if (!this.isSecondAttachment()) {
      return this.isArrayForm() ? [first] : first;
    }
    return [first, { ...first, filename: `second-${this.filename()}` }];
  }

  send(): void {
    const recipients = this.recipients();
    const addresses = addressesOf(recipients);
    if (addresses.length === 0) {
      this.lastResult.set('no recipients');
      return;
    }
    this.lastResult.set('composer open…');
    const attachments = this.attachmentsOf();
    sendSMSAsync(
      recipients.includes(',') ? addresses : addresses[0],
      this.message(),
      attachments === undefined ? undefined : { attachments },
    )
      .then(response => this.lastResult.set(`result: ${response.result}`))
      .catch((error: Error) =>
        this.lastResult.set(`send failed: ${error.message}`),
      );
  }
}
