<script lang="ts">
  import {
    Album,
    AssetField,
    MediaSubtype,
    MediaType,
    Query,
  } from '@symbiote-native/media-library/svelte';
  import CallConsole from '../components/CallConsole.svelte';
  import Card from '../components/Card.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import Field from '../components/Field.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import { optionalNumber } from './media-library-helpers';

  let { setAssetId }: { setAssetId: (id: string) => void } = $props();

  const color = lineColorOf(ROUTE_NAME.MediaLibrary);
  const FIELDS = Object.values(AssetField).map(value => ({ label: value, value }));
  const OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;
  const OPERATOR_CHOICES = OPERATORS.map(item => ({ label: item, value: item }));

  let field = $state(AssetField.CREATION_TIME);
  let operator = $state<(typeof OPERATORS)[number]>('gt');
  let value = $state('0');
  let limit = $state('5');
  let offset = $state('0');
  let orderField = $state(AssetField.CREATION_TIME);
  let isAscending = $state(false);
  let albumTitle = $state('');

  async function build(): Promise<Query> {
    const query = new Query();
    query[operator](field, Number(value));
    const max = optionalNumber(limit);
    if (max !== undefined) {
      query.limit(max);
    }
    query.offset(optionalNumber(offset) ?? 0);
    query.orderBy({ key: orderField, ascending: isAscending });
    if (albumTitle.trim() !== '') {
      const album = await Album.get(albumTitle.trim());
      if (album === null) {
        throw new Error(`no album titled ${albumTitle}`);
      }
      query.album(album);
    }
    return query;
  }
</script>

<Card testID="media-library-query-card" title="Query builder">
  <ChoiceRow testID="media-library-field" label="filter field" options={FIELDS} value={field} onChange={next => (field = next)} {color} />
  <ChoiceRow testID="media-library-operator" label="operator (gt, gte, lt, lte)" options={OPERATOR_CHOICES} value={operator} onChange={next => (operator = next)} {color} />
  <Field testID="media-library-value-input" label="value" value={value} onChange={next => (value = next)} />
  <Field testID="media-library-limit-input" label="limit" value={limit} onChange={next => (limit = next)} />
  <Field testID="media-library-offset-input" label="offset" value={offset} onChange={next => (offset = next)} />
  <ChoiceRow testID="media-library-order-field" label="orderBy key" options={FIELDS} value={orderField} onChange={next => (orderField = next)} {color} />
  <ToggleRow testID="media-library-ascending-switch" label="orderBy ascending" value={isAscending} onChange={next => (isAscending = next)} {color} />
  <Field testID="media-library-album-title-input" label="album title (Query.album)" value={albumTitle} onChange={next => (albumTitle = next)} />
  <text class="info-text">
    {`Field types: ${Object.values(MediaType).join(', ')} for mediaType, and media subtypes ${Object.values(MediaSubtype).join(', ')}.`}
  </text>
</Card>
<CallConsole
  prefix="media-library-query-calls"
  title="Query results"
  {color}
  calls={[
    {
      label: 'exe',
      run: async () => {
        const assets = await (await build()).exe();
        setAssetId(assets[0]?.id ?? '');
        return assets.map(asset => asset.id);
      },
    },
    { label: 'exeForMetadata', run: async () => (await build()).exeForMetadata() },
  ]}
/>
