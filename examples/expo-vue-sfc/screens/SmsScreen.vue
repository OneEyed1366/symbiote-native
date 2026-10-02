<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { isAvailableAsync, sendSMSAsync } from '@symbiote-native/sms/vue';
import type { ISmsAttachment } from '@symbiote-native/sms/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Sms);

const availability = ref('checking');
const lastResult = ref('idle');
const recipients = ref('');
const message = ref('Sent from the Symbiote canary');
const isAttaching = ref(false);
const isSecondAttachment = ref(false);
const isArrayForm = ref(false);
const uri = ref('');
const mimeType = ref('image/png');
const filename = ref('canary.png');

onMounted(() => {
  void isAvailableAsync().then(available => {
    availability.value = available ? 'yes' : 'no';
  });
});

function attachmentsOf(): ISmsAttachment | ISmsAttachment[] | undefined {
  if (!isAttaching.value) {
    return undefined;
  }
  const first = { uri: uri.value, mimeType: mimeType.value, filename: filename.value };
  if (!isSecondAttachment.value) {
    return isArrayForm.value ? [first] : first;
  }
  return [first, { ...first, filename: `second-${filename.value}` }];
}

function addressesOf(text: string): string[] {
  return text
    .split(',')
    .map(address => address.trim())
    .filter(address => address.length > 0);
}

function send(): void {
  const addresses = addressesOf(recipients.value);
  if (addresses.length === 0) {
    lastResult.value = 'no recipients';
    return;
  }
  lastResult.value = 'composer open…';
  const attachments = attachmentsOf();
  sendSMSAsync(
    recipients.value.includes(',') ? addresses : addresses[0],
    message.value,
    attachments === undefined ? undefined : { attachments },
  )
    .then(response => {
      lastResult.value = `result: ${response.result}`;
    })
    .catch((error: Error) => {
      lastResult.value = `send failed: ${error.message}`;
    });
}
</script>

<template>
  <ScreenShell
    :route="ROUTE_NAME.Sms"
    testID="sms-scroll"
    title="SMS"
    body="Open the system SMS composer with recipients, text and attachments already filled in. The user reviews and presses send, so the app needs no SMS permission and never sends by itself."
  >
    <Card testID="sms-capability-card" title="Can this device send SMS?">
      <ResultRow testID="sms-available" label="Available" :value="availability" />
      <text class="info-text">
        NO is expected on the iOS simulator and on Android devices without telephony hardware.
      </text>
    </Card>
    <Scenario
      testID="sms-send-card"
      title="Invite a friend or text support with a prefilled message"
      why="Share an invite code, send a delivery update or contact support by SMS. The composer opens ready to send, with one or many recipients."
      :steps="[
        'Enter your own number in recipients',
        'Press Open composer',
        'Send or cancel in the composer',
      ]"
      expect="The composer opens with the recipients and text. Last result says sent or cancelled on iOS, and always unknown on Android because it cannot report the outcome."
    >
      <Field
        testID="sms-recipients-input"
        label="recipients, comma separated"
        :value="recipients"
        :onChange="next => (recipients = next)"
        placeholder="0123456789, 9876543210"
      />
      <Field
        testID="sms-message-input"
        label="message"
        :value="message"
        :onChange="next => (message = next)"
      />
      <ActionButton testID="sms-send-button" title="Open composer" :onPress="send" :color="color" />
      <ResultRow testID="sms-result" label="Last result" :value="lastResult" />
    </Scenario>
    <Explorer testID="sms-explorer" :color="color">
      <Card testID="sms-attachment-card" title="attachments">
        <ToggleRow
          testID="sms-attach-switch"
          label="attach a file"
          :value="isAttaching"
          :onChange="next => (isAttaching = next)"
          :color="color"
        />
        <ToggleRow
          testID="sms-array-switch"
          label="pass an array (single attachment)"
          :value="isArrayForm"
          :onChange="next => (isArrayForm = next)"
          :color="color"
        />
        <ToggleRow
          testID="sms-second-switch"
          label="two attachments (Android keeps the first)"
          :value="isSecondAttachment"
          :onChange="next => (isSecondAttachment = next)"
          :color="color"
        />
        <Field
          testID="sms-uri-input"
          label="uri (content uri)"
          :value="uri"
          :onChange="next => (uri = next)"
          placeholder="content://..."
        />
        <Field
          testID="sms-mime-input"
          label="mimeType"
          :value="mimeType"
          :onChange="next => (mimeType = next)"
        />
        <Field
          testID="sms-filename-input"
          label="filename"
          :value="filename"
          :onChange="next => (filename = next)"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
