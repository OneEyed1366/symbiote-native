<script setup lang="ts">
import { ref } from 'vue';
import MediaLibraryAlbumCards from './MediaLibraryAlbumCards.vue';
import MediaLibraryAssetCards from './MediaLibraryAssetCards.vue';
import MediaLibraryListener from './MediaLibraryListener.vue';
import MediaLibraryPermissions from './MediaLibraryPermissions.vue';
import MediaLibraryQuery from './MediaLibraryQuery.vue';

const assetId = ref('');

function setAssetId(id: string): void {
  assetId.value = id;
}
</script>

<template>
  <MediaLibraryPermissions />
  <MediaLibraryQuery :setAssetId="setAssetId" />
  <MediaLibraryAssetCards :assetId="assetId" :setAssetId="setAssetId" />
  <MediaLibraryAlbumCards :assetId="assetId" />
  <MediaLibraryListener />
</template>
