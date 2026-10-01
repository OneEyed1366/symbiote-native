<script lang="ts">
  import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/svelte';
  import type { ISmsAttachment } from '@symbiote-native/sms/svelte';
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

  const color = lineColorOf(ROUTE_NAME.Sms);

  let availability = $state('checking');
  let lastResult = $state('idle');
  let recipients = $state('');
  let message = $state('Sent from the Symbiote canary');
  let isAttaching = $state(false);
  let isSecondAttachment = $state(false);
  let isArrayForm = $state(false);
  let uri = $state('');
  let mimeType = $state('image/png');
  let filename = $state('canary.png');

  $effect(() => {
    void isAvailableAsync().then(available => {
      availability = available ? 'yes' : 'no';
    });
  });

  function attachmentsOf(): ISmsAttachment | ISmsAttachment[] | undefined {
    if (!isAttaching) {
      return undefined;
    }
    const first = { uri, mimeType, filename };
    if (!isSecondAttachment) {
      return isArrayForm ? [first] : first;
    }
    return [first, { ...first, filename: `second-${filename}` }];
  }

  function addressesOf(text: string): string[] {
    return text
      .split(',')
      .map(address => address.trim())
      .filter(address => address.length > 0);
  }

  function send(): void {
    const addresses = addressesOf(recipients);
    if (addresses.length === 0) {
      lastResult = 'no recipients';
      return;
    }
    lastResult = 'composer open…';
    const attachments = attachmentsOf();
    sendSMSAsync(
      recipients.includes(',') ? addresses : addresses[0],
      message,
      attachments === undefined ? undefined : { attachments },
    )
      .then(response => {
        lastResult = `result: ${response.result}`;
      })
      .catch((error: Error) => {
        lastResult = `send failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE_NAME.Sms}
  testID="sms-scroll"
  title="SMS"
  body="Open the system SMS composer with recipients, text and attachments already filled in. The user reviews and presses send, so the app needs no SMS permission and never sends by itself."
>
  <Card testID="sms-capability-card" title="Can this device send SMS?">
    <ResultRow testID="sms-available" label="Available" value={availability} />
    <text class="info-text">NO is expected on the iOS simulator and on Android devices without telephony hardware.</text>
  </Card>
  <Scenario
    testID="sms-send-card"
    title="Invite a friend or text support with a prefilled message"
    why="Share an invite code, send a delivery update or contact support by SMS. The composer opens ready to send, with one or many recipients."
    steps={[
      'Enter your own number in recipients',
      'Press Open composer',
      'Send or cancel in the composer',
    ]}
    expect="The composer opens with the recipients and text. Last result says sent or cancelled on iOS, and always unknown on Android because it cannot report the outcome."
  >
    <Field
      testID="sms-recipients-input"
      label="recipients, comma separated"
      value={recipients}
      onChange={next => {
        recipients = next;
      }}
      placeholder="0123456789, 9876543210"
    />
    <Field
      testID="sms-message-input"
      label="message"
      value={message}
      onChange={next => {
        message = next;
      }}
    />
    <ActionButton testID="sms-send-button" title="Open composer" onPress={send} {color} />
    <ResultRow testID="sms-result" label="Last result" value={lastResult} />
  </Scenario>
  <Explorer testID="sms-explorer" {color}>
    <Card testID="sms-attachment-card" title="attachments">
      <ToggleRow
        testID="sms-attach-switch"
        label="attach a file"
        value={isAttaching}
        onChange={next => {
          isAttaching = next;
        }}
        {color}
      />
      <ToggleRow
        testID="sms-array-switch"
        label="pass an array (single attachment)"
        value={isArrayForm}
        onChange={next => {
          isArrayForm = next;
        }}
        {color}
      />
      <ToggleRow
        testID="sms-second-switch"
        label="two attachments (Android keeps the first)"
        value={isSecondAttachment}
        onChange={next => {
          isSecondAttachment = next;
        }}
        {color}
      />
      <Field
        testID="sms-uri-input"
        label="uri (content uri)"
        value={uri}
        onChange={next => {
          uri = next;
        }}
        placeholder="content://..."
      />
      <Field
        testID="sms-mime-input"
        label="mimeType"
        value={mimeType}
        onChange={next => {
          mimeType = next;
        }}
      />
      <Field
        testID="sms-filename-input"
        label="filename"
        value={filename}
        onChange={next => {
          filename = next;
        }}
      />
    </Card>
  </Explorer>
</ScreenShell>
