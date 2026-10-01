<script lang="ts">
  import {
    composeAsync,
    getClients,
    isAvailableAsync,
  } from '@symbiote-native/mail-composer';
  import type { IMailClient } from '@symbiote-native/mail-composer';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const ROUTE = ROUTE_NAME.MailComposer;
  const color = lineColorOf(ROUTE);

  let availability = $state('checking…');
  let clients = $state<IMailClient[]>([]);
  let recipients = $state('');
  let ccRecipients = $state('');
  let bccRecipients = $state('');
  let subject = $state('Symbiote canary');
  let body = $state('Sent from the Symbiote canary');
  let attachments = $state('');
  let isHtml = $state(false);
  let result = $state('idle');

  $effect(() => {
    void isAvailableAsync().then(available => {
      availability = available ? 'YES' : 'NO';
    });
  });

  function splitList(text: string): string[] {
    return text
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  function describeClient(client: IMailClient): string {
    return `${client.label} (${client.url ?? client.packageName ?? '?'})`;
  }

  function handleCompose(): void {
    result = 'composer open…';
    composeAsync({
      recipients: splitList(recipients),
      ccRecipients: splitList(ccRecipients),
      bccRecipients: splitList(bccRecipients),
      subject,
      body: isHtml ? `<h1>${body}</h1>` : body,
      isHtml,
      attachments: splitList(attachments),
    })
      .then(response => {
        result = `status: ${response.status}`;
      })
      .catch((error: Error) => {
        result = `compose failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="mail-composer-scroll"
  title="Mail Composer"
  body="Open the system mail composer with a ready draft: recipients, subject, text and attachments. The user stays in control and the app never sends anything by itself."
>
  <Card testID="mail-composer-capability-card" title="Capabilities">
    <ResultRow
      testID="mail-composer-available"
      label="Available"
      value={availability}
    />
    <text class="info-text">
      NO is expected on the iOS simulator (no Mail account configured).
    </text>
    <ActionButton
      testID="mail-composer-clients-button"
      title="List mail clients"
      onPress={() => {
        clients = getClients();
      }}
      {color}
    />
    <ResultRow
      testID="mail-composer-clients"
      label="Clients"
      value={clients.length === 0
        ? 'none listed'
        : clients.map(describeClient).join(', ')}
    />
  </Card>

  <Scenario
    testID="mail-composer-compose-card"
    title="Let users write to support without leaving the app"
    why="One tap opens the system mail composer with the address, subject and text already filled in. The user only reviews and presses send, and the app never sees their mail account."
    steps={[
      'Enter your own address in To',
      'Press Open composer',
      'Send, save as draft or cancel in the composer',
    ]}
    expect="The composer opens prefilled. Last result says sent, saved or cancelled on iOS. Android always says sent, the chooser hands the draft to another app."
  >
    <Field
      testID="mail-composer-recipients-input"
      label="To (comma separated)"
      value={recipients}
      onChange={next => {
        recipients = next;
      }}
      placeholder="support@example.com"
    />
    <Field
      testID="mail-composer-subject-input"
      label="Subject"
      value={subject}
      onChange={next => {
        subject = next;
      }}
    />
    <Field
      testID="mail-composer-body-input"
      label="Body"
      value={body}
      onChange={next => {
        body = next;
      }}
    />
    <ActionButton
      testID="mail-composer-compose-button"
      title="Open composer"
      onPress={handleCompose}
      {color}
    />
    <ResultRow testID="mail-composer-result" label="Last result" value={result} />
  </Scenario>

  <Explorer testID="mail-composer-explorer" {color}>
    <Card testID="mail-composer-advanced-card" title="Copies, HTML body and attachments">
      <Field
        testID="mail-composer-cc-input"
        label="ccRecipients"
        value={ccRecipients}
        onChange={next => {
          ccRecipients = next;
        }}
      />
      <Field
        testID="mail-composer-bcc-input"
        label="bccRecipients"
        value={bccRecipients}
        onChange={next => {
          bccRecipients = next;
        }}
      />
      <ToggleRow
        testID="mail-composer-html-switch"
        label="isHtml (wraps body in an h1)"
        value={isHtml}
        onChange={next => {
          isHtml = next;
        }}
        {color}
      />
      <Field
        testID="mail-composer-attachments-input"
        label="attachments (file:// URIs, comma separated)"
        value={attachments}
        onChange={next => {
          attachments = next;
        }}
        placeholder="file:///…/report.pdf"
      />
    </Card>
  </Explorer>
</ScreenShell>
