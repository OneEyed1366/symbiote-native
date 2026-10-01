<script setup lang="ts">
import { ref } from 'vue';
import { Album, Asset } from '@symbiote-native/media-library/vue';
import CallConsole from '../components/CallConsole.vue';
import Card from '../components/Card.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { required } from './media-library-helpers';

const props = defineProps<{ assetId: string }>();

const color = lineColorOf(ROUTE_NAME.MediaLibrary);

const title = ref('Symbiote Canary');
const moveAssets = ref(false);

async function album() {
  const found = await Album.get(title.value);
  if (found === null) {
    throw new Error(`no album titled ${title.value}`);
  }
  return found;
}

const calls = [
  {
    label: 'Album.getAll',
    run: async () =>
      Promise.all(
        (await Album.getAll()).map(async item => ({ id: item.id, title: await item.getTitle() })),
      ),
  },
  { label: 'Album.get', run: async () => (await album()).id },
  { label: 'getTitle', run: async () => (await album()).getTitle() },
  { label: 'getAssets', run: async () => (await (await album()).getAssets()).map(item => item.id) },
  {
    label: 'Album.create',
    run: async () =>
      (await Album.create(title.value, [required(props.assetId, 'asset id')], moveAssets.value)).id,
  },
  {
    label: 'add',
    run: async () => (await album()).add(new Asset(required(props.assetId, 'asset id'))),
  },
  {
    label: 'removeAssets',
    run: async () => (await album()).removeAssets([new Asset(required(props.assetId, 'asset id'))]),
  },
  { label: 'delete (album)', run: async () => (await album()).delete() },
  { label: 'Album.delete', run: async () => Album.delete([await album()]) },
];
</script>

<template>
  <Card testID="media-library-album-card" title="Album">
    <Field
      testID="media-library-album-input"
      label="album title"
      :value="title"
      :onChange="next => (title = next)"
    />
    <ToggleRow
      testID="media-library-move-switch"
      label="moveAssets (Album.create)"
      :value="moveAssets"
      :onChange="next => (moveAssets = next)"
      :color="color"
    />
  </Card>
  <CallConsole
    prefix="media-library-album-calls"
    title="Album calls"
    :color="color"
    :calls="calls"
  />
</template>
