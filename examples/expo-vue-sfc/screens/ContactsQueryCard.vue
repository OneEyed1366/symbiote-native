<script setup lang="ts">
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { SORT_CHOICES } from './contacts-query';
import type { IQuery, ISetQuery } from './contacts-query';

defineProps<{ query: IQuery; setQuery: ISetQuery; color: string }>();
</script>

<template>
  <Card testID="contacts-query-card" title="Query options">
    <Field
      testID="contacts-limit-input"
      label="limit"
      :value="query.limit"
      :onChange="limit => setQuery({ limit })"
    />
    <Field
      testID="contacts-offset-input"
      label="offset"
      :value="query.offset"
      :onChange="offset => setQuery({ offset })"
    />
    <Field
      testID="contacts-name-input"
      label="name filter"
      :value="query.name"
      :onChange="name => setQuery({ name })"
    />
    <ChoiceRow
      testID="contacts-sort"
      label="sortOrder"
      :options="SORT_CHOICES"
      :value="query.sortOrder"
      :onChange="sortOrder => setQuery({ sortOrder })"
      :color="color"
    />
    <ToggleRow
      testID="contacts-raw-switch"
      label="rawContacts (iOS)"
      :value="query.rawContacts"
      :onChange="rawContacts => setQuery({ rawContacts })"
      :color="color"
    />
  </Card>
</template>
