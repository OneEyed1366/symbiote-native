import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  composeAsync,
  getClients,
  isAvailableAsync,
} from '@symbiote-native/mail-composer';
import type { IMailClient } from '@symbiote-native/mail-composer';
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

function splitList(text: string): string[] {
  return text
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

function describeClient(client: IMailClient): string {
  return `${client.label} (${client.url ?? client.packageName ?? '?'})`;
}

@Component({
  selector: 'MailComposerScreen',
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
      testID="mail-composer-scroll"
      title="Mail Composer"
      body="Open the system mail composer with a ready draft: recipients, subject, text and attachments. The user stays in control and the app never sends anything by itself."
    >
      <Card testID="mail-composer-capability-card" title="Capabilities">
        <ResultRow
          testID="mail-composer-available"
          label="Available"
          [value]="availability()"
        />
        <text class="info-text"
          >NO is expected on the iOS simulator (no Mail account
          configured).</text
        >
        <ActionButton
          testID="mail-composer-clients-button"
          title="List mail clients"
          [color]="color"
          (press)="listClients()"
        />
        <ResultRow
          testID="mail-composer-clients"
          label="Clients"
          [value]="clientsText()"
        />
      </Card>

      <Scenario
        testID="mail-composer-compose-card"
        title="Let users write to support without leaving the app"
        why="One tap opens the system mail composer with the address, subject and text already filled in. The user only reviews and presses send, and the app never sees their mail account."
        [steps]="composeSteps"
        expect="The composer opens prefilled. Last result says sent, saved or cancelled on iOS. Android always says sent, the chooser hands the draft to another app."
      >
        <Field
          testID="mail-composer-recipients-input"
          label="To (comma separated)"
          [(value)]="recipients"
          placeholder="support@example.com"
        />
        <Field
          testID="mail-composer-subject-input"
          label="Subject"
          [(value)]="subject"
        />
        <Field
          testID="mail-composer-body-input"
          label="Body"
          [(value)]="body"
        />
        <ActionButton
          testID="mail-composer-compose-button"
          title="Open composer"
          [color]="color"
          (press)="compose()"
        />
        <ResultRow
          testID="mail-composer-result"
          label="Last result"
          [value]="result()"
        />
      </Scenario>

      <Explorer testID="mail-composer-explorer" [color]="color">
        <ng-template>
          <Card
            testID="mail-composer-advanced-card"
            title="Copies, HTML body and attachments"
          >
            <Field
              testID="mail-composer-cc-input"
              label="ccRecipients"
              [(value)]="ccRecipients"
            />
            <Field
              testID="mail-composer-bcc-input"
              label="bccRecipients"
              [(value)]="bccRecipients"
            />
            <ToggleRow
              testID="mail-composer-html-switch"
              label="isHtml (wraps body in an h1)"
              [(value)]="isHtml"
              [color]="color"
            />
            <Field
              testID="mail-composer-attachments-input"
              label="attachments (file:// URIs, comma separated)"
              [(value)]="attachments"
              placeholder="file:///…/report.pdf"
            />
          </Card>
        </ng-template>
      </Explorer>
    </ScreenShell>
  `,
})
export class MailComposerScreen {
  readonly route = ROUTE_NAME.MailComposer;
  readonly color = lineColorOf(ROUTE_NAME.MailComposer);
  readonly composeSteps = [
    'Enter your own address in To',
    'Press Open composer',
    'Send, save as draft or cancel in the composer',
  ];

  readonly availability = signal('checking…');
  private readonly clients = signal<IMailClient[]>([]);
  readonly recipients = signal('');
  readonly ccRecipients = signal('');
  readonly bccRecipients = signal('');
  readonly subject = signal('Symbiote canary');
  readonly body = signal('Sent from the Symbiote canary');
  readonly attachments = signal('');
  readonly isHtml = signal(false);
  readonly result = signal('idle');

  readonly clientsText = computed(() => {
    const clients = this.clients();
    return clients.length === 0
      ? 'none listed'
      : clients.map(describeClient).join(', ');
  });

  constructor() {
    void isAvailableAsync().then(available => {
      this.availability.set(available ? 'YES' : 'NO');
    });
  }

  listClients(): void {
    this.clients.set(getClients());
  }

  compose(): void {
    this.result.set('composer open…');
    composeAsync({
      recipients: splitList(this.recipients()),
      ccRecipients: splitList(this.ccRecipients()),
      bccRecipients: splitList(this.bccRecipients()),
      subject: this.subject(),
      body: this.isHtml() ? `<h1>${this.body()}</h1>` : this.body(),
      isHtml: this.isHtml(),
      attachments: splitList(this.attachments()),
    })
      .then(response => this.result.set(`status: ${response.status}`))
      .catch((error: Error) =>
        this.result.set(`compose failed: ${error.message}`),
      );
  }
}
