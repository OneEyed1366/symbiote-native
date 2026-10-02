<script setup lang="ts">
import { ref } from 'vue';
import { ContactAccessButton } from '@symbiote-native/contacts/vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const color = lineColorOf(ROUTE_NAME.Contacts);
const CAPTIONS = [
  { label: 'default', value: 'default' },
  { label: 'email', value: 'email' },
  { label: 'phone', value: 'phone' },
] as const;

const query = ref('');
const caption = ref<(typeof CAPTIONS)[number]['value']>('default');
const ignoredEmails = ref('');
const ignoredPhones = ref('');

const BUTTON_STYLE = { height: 52 };
const isAvailable = String(ContactAccessButton.isAvailable());

function split(text: string): string[] {
  return text
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}
</script>

<template>
  <Card testID="contacts-access-card" title="ContactAccessButton (iOS 18+)">
    <ResultRow testID="contacts-access-available" label="isAvailable" :value="isAvailable" />
    <Field
      testID="contacts-access-query-input"
      label="query"
      :value="query"
      :onChange="next => (query = next)"
    />
    <ChoiceRow
      testID="contacts-access-caption"
      label="caption"
      :options="CAPTIONS"
      :value="caption"
      :onChange="next => (caption = next)"
      :color="color"
    />
    <Field
      testID="contacts-access-emails-input"
      label="ignoredEmails (comma separated)"
      :value="ignoredEmails"
      :onChange="next => (ignoredEmails = next)"
    />
    <Field
      testID="contacts-access-phones-input"
      label="ignoredPhoneNumbers (comma separated)"
      :value="ignoredPhones"
      :onChange="next => (ignoredPhones = next)"
    />
    <ContactAccessButton
      testID="contacts-access-button"
      :query="query"
      :caption="caption"
      :ignoredEmails="split(ignoredEmails)"
      :ignoredPhoneNumbers="split(ignoredPhones)"
      :tintColor="color"
      backgroundColor="#ffffff"
      textColor="#0b1622"
      :style="BUTTON_STYLE"
    />
  </Card>
</template>
