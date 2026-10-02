<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { composeAsync, getClients, isAvailableAsync } from '@symbiote-native/mail-composer';
import type { IMailClient } from '@symbiote-native/mail-composer';
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

const ROUTE = ROUTE_NAME.MailComposer;
const color = lineColorOf(ROUTE);

const availability = ref('checking…');
const clients = ref<IMailClient[]>([]);
const recipients = ref('');
const ccRecipients = ref('');
const bccRecipients = ref('');
const subject = ref('Symbiote canary');
const body = ref('Sent from the Symbiote canary');
const attachments = ref('');
const isHtml = ref(false);
const result = ref('idle');

onMounted(() => {
  void isAvailableAsync().then(available => {
    availability.value = available ? 'YES' : 'NO';
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

function listClients(): void {
  clients.value = getClients();
}

function handleCompose(): void {
  result.value = 'composer open…';
  composeAsync({
    recipients: splitList(recipients.value),
    ccRecipients: splitList(ccRecipients.value),
    bccRecipients: splitList(bccRecipients.value),
    subject: subject.value,
    body: isHtml.value ? `<h1>${body.value}</h1>` : body.value,
    isHtml: isHtml.value,
    attachments: splitList(attachments.value),
  })
    .then(response => {
      result.value = `status: ${response.status}`;
    })
    .catch((error: Error) => {
      result.value = `compose failed: ${error.message}`;
    });
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="mail-composer-scroll"
    title="Mail Composer"
    body="Open the system mail composer with a ready draft: recipients, subject, text and attachments. The user stays in control and the app never sends anything by itself."
  >
    <Card testID="mail-composer-capability-card" title="Capabilities">
      <ResultRow testID="mail-composer-available" label="Available" :value="availability" />
      <text class="info-text">NO is expected on the iOS simulator (no Mail account configured).</text>
      <ActionButton
        testID="mail-composer-clients-button"
        title="List mail clients"
        :onPress="listClients"
        :color="color"
      />
      <ResultRow
        testID="mail-composer-clients"
        label="Clients"
        :value="clients.length === 0 ? 'none listed' : clients.map(describeClient).join(', ')"
      />
    </Card>

    <Scenario
      testID="mail-composer-compose-card"
      title="Let users write to support without leaving the app"
      why="One tap opens the system mail composer with the address, subject and text already filled in. The user only reviews and presses send, and the app never sees their mail account."
      :steps="[
        'Enter your own address in To',
        'Press Open composer',
        'Send, save as draft or cancel in the composer',
      ]"
      expect="The composer opens prefilled. Last result says sent, saved or cancelled on iOS. Android always says sent, the chooser hands the draft to another app."
    >
      <Field
        testID="mail-composer-recipients-input"
        label="To (comma separated)"
        :value="recipients"
        :onChange="next => (recipients = next)"
        placeholder="support@example.com"
      />
      <Field
        testID="mail-composer-subject-input"
        label="Subject"
        :value="subject"
        :onChange="next => (subject = next)"
      />
      <Field
        testID="mail-composer-body-input"
        label="Body"
        :value="body"
        :onChange="next => (body = next)"
      />
      <ActionButton
        testID="mail-composer-compose-button"
        title="Open composer"
        :onPress="handleCompose"
        :color="color"
      />
      <ResultRow testID="mail-composer-result" label="Last result" :value="result" />
    </Scenario>

    <Explorer testID="mail-composer-explorer" :color="color">
      <Card testID="mail-composer-advanced-card" title="Copies, HTML body and attachments">
        <Field
          testID="mail-composer-cc-input"
          label="ccRecipients"
          :value="ccRecipients"
          :onChange="next => (ccRecipients = next)"
        />
        <Field
          testID="mail-composer-bcc-input"
          label="bccRecipients"
          :value="bccRecipients"
          :onChange="next => (bccRecipients = next)"
        />
        <ToggleRow
          testID="mail-composer-html-switch"
          label="isHtml (wraps body in an h1)"
          :value="isHtml"
          :onChange="next => (isHtml = next)"
          :color="color"
        />
        <Field
          testID="mail-composer-attachments-input"
          label="attachments (file:// URIs, comma separated)"
          :value="attachments"
          :onChange="next => (attachments = next)"
          placeholder="file:///…/report.pdf"
        />
      </Card>
    </Explorer>
  </ScreenShell>
</template>
