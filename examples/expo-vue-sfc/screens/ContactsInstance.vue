<script setup lang="ts">
import { computed, ref } from 'vue';
import { Contact, NonGregorianCalendar } from '@symbiote-native/contacts/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { ACCESSORS, FIELD_CHOICES, MISSING, collectionGroups } from './contacts-instance-calls';
import { recordFrom } from './contacts-query';

const props = defineProps<{ contactId: string; setContactId: (id: string) => void }>();

const color = lineColorOf(ROUTE_NAME.Contacts);

const field = ref('givenName');
const value = ref('Renamed');

const id = computed(() => props.contactId.trim());
const groups = computed(() => (id.value === '' ? [] : collectionGroups(new Contact(id.value))));

function contactFor(): Contact {
  if (id.value === '') {
    throw new Error(MISSING);
  }
  return new Contact(id.value);
}

const instanceCalls = [
  { label: 'getFullName', run: () => contactFor().getFullName() },
  { label: 'getThumbnail', run: () => contactFor().getThumbnail() },
  { label: 'getIsFavourite', run: async () => contactFor().getIsFavourite?.() },
  { label: 'setIsFavourite', run: async () => contactFor().setIsFavourite?.(true) },
  { label: 'getBirthday', run: async () => contactFor().getBirthday?.() },
  {
    label: 'setBirthday',
    run: async () => contactFor().setBirthday?.({ year: 1990, month: 5, day: 17 }),
  },
  {
    label: 'getNonGregorianBirthday',
    run: async () => contactFor().getNonGregorianBirthday?.(),
  },
  {
    label: 'setNonGregorianBirthday',
    run: async () =>
      contactFor().setNonGregorianBirthday?.({
        calendar: NonGregorianCalendar.hebrew,
        month: 1,
        day: 1,
      }),
  },
  { label: 'patch', run: () => contactFor().patch({ note: 'patched by the canary' }) },
  { label: 'update', run: () => contactFor().update(recordFrom('Updated', 'Demo')) },
  {
    label: 'editWithForm',
    run: () => contactFor().editWithForm({ allowsEditing: true, message: 'Symbiote' }),
  },
  { label: 'delete', run: () => contactFor().delete() },
];

const accessorCalls = [
  { label: 'get', run: () => ACCESSORS[field.value].get(contactFor()) },
  { label: 'set', run: () => ACCESSORS[field.value].set(contactFor(), value.value) },
];
</script>

<template>
  <Card testID="contacts-selected-card" title="Selected contact">
    <Field
      testID="contacts-id-input"
      label="contact id"
      :value="contactId"
      :onChange="setContactId"
      placeholder="set by create / getAll / presentPicker"
    />
  </Card>
  <CallConsole
    prefix="contacts-instance"
    title="Contact (instance calls)"
    :color="color"
    :calls="instanceCalls"
  />
  <Card testID="contacts-accessor-card" title="Field accessors">
    <ChoiceRow
      testID="contacts-accessor-field"
      label="field (get<Field> / set<Field>)"
      :options="FIELD_CHOICES"
      :value="field"
      :onChange="next => (field = next)"
      :color="color"
    />
    <Field
      testID="contacts-accessor-value-input"
      label="value for set"
      :value="value"
      :onChange="next => (value = next)"
    />
  </Card>
  <CallConsole
    prefix="contacts-accessor"
    title="Selected field"
    :color="color"
    :calls="accessorCalls"
  />
  <text v-if="id === ''" class="info-text">{{ MISSING }}</text>
  <template v-else>
    <CallConsole
      v-for="(calls, index) in groups"
      :key="index"
      :prefix="`contacts-collection-${index}`"
      :title="calls[0].label.replace('add', '')"
      :color="color"
      :calls="calls"
    />
  </template>
</template>
