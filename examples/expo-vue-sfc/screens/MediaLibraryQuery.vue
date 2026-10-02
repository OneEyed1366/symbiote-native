<script setup lang="ts">
import { ref } from 'vue';
import { Album, AssetField, MediaSubtype, MediaType, Query } from '@symbiote-native/media-library/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { optionalNumber } from './media-library-helpers';

const props = defineProps<{ setAssetId: (id: string) => void }>();

const color = lineColorOf(ROUTE_NAME.MediaLibrary);
const FIELDS = Object.values(AssetField).map(value => ({ label: value, value }));
const OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;
const OPERATOR_CHOICES = OPERATORS.map(item => ({ label: item, value: item }));

const field = ref(AssetField.CREATION_TIME);
const operator = ref<(typeof OPERATORS)[number]>('gt');
const value = ref('0');
const limit = ref('5');
const offset = ref('0');
const orderField = ref(AssetField.CREATION_TIME);
const isAscending = ref(false);
const albumTitle = ref('');

const fieldTypesHint = `Field types: ${Object.values(MediaType).join(', ')} for mediaType, and media subtypes ${Object.values(MediaSubtype).join(', ')}.`;

async function build(): Promise<Query> {
  const query = new Query();
  query[operator.value](field.value, Number(value.value));
  const max = optionalNumber(limit.value);
  if (max !== undefined) {
    query.limit(max);
  }
  query.offset(optionalNumber(offset.value) ?? 0);
  query.orderBy({ key: orderField.value, ascending: isAscending.value });
  if (albumTitle.value.trim() !== '') {
    const album = await Album.get(albumTitle.value.trim());
    if (album === null) {
      throw new Error(`no album titled ${albumTitle.value}`);
    }
    query.album(album);
  }
  return query;
}

const calls = [
  {
    label: 'exe',
    run: async () => {
      const assets = await (await build()).exe();
      props.setAssetId(assets[0]?.id ?? '');
      return assets.map(asset => asset.id);
    },
  },
  { label: 'exeForMetadata', run: async () => (await build()).exeForMetadata() },
];
</script>

<template>
  <Card testID="media-library-query-card" title="Query builder">
    <ChoiceRow
      testID="media-library-field"
      label="filter field"
      :options="FIELDS"
      :value="field"
      :onChange="next => (field = next)"
      :color="color"
    />
    <ChoiceRow
      testID="media-library-operator"
      label="operator (gt, gte, lt, lte)"
      :options="OPERATOR_CHOICES"
      :value="operator"
      :onChange="next => (operator = next)"
      :color="color"
    />
    <Field
      testID="media-library-value-input"
      label="value"
      :value="value"
      :onChange="next => (value = next)"
    />
    <Field
      testID="media-library-limit-input"
      label="limit"
      :value="limit"
      :onChange="next => (limit = next)"
    />
    <Field
      testID="media-library-offset-input"
      label="offset"
      :value="offset"
      :onChange="next => (offset = next)"
    />
    <ChoiceRow
      testID="media-library-order-field"
      label="orderBy key"
      :options="FIELDS"
      :value="orderField"
      :onChange="next => (orderField = next)"
      :color="color"
    />
    <ToggleRow
      testID="media-library-ascending-switch"
      label="orderBy ascending"
      :value="isAscending"
      :onChange="next => (isAscending = next)"
      :color="color"
    />
    <Field
      testID="media-library-album-title-input"
      label="album title (Query.album)"
      :value="albumTitle"
      :onChange="next => (albumTitle = next)"
    />
    <text class="info-text">{{ fieldTypesHint }}</text>
  </Card>
  <CallConsole
    prefix="media-library-query-calls"
    title="Query results"
    :color="color"
    :calls="calls"
  />
</template>
