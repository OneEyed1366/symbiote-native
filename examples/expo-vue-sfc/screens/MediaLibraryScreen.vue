<script setup lang="ts">
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import MediaLibraryLegacy from './MediaLibraryLegacy.vue';
import MediaLibraryModern from './MediaLibraryModern.vue';
import MediaLibraryRecent from './MediaLibraryRecent.vue';

const ROUTE = ROUTE_NAME.MediaLibrary;
const color = lineColorOf(ROUTE);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="media-library-scroll"
    title="Media Library"
    body="Read and manage the user's photos, videos and albums: list recent media, save new files, create albums and watch for changes. Delete and create buttons in the explorer act on the ids you pass, so the read-only calls are safe to tap freely."
  >
    <MediaLibraryRecent />
    <Explorer testID="media-library-explorer" :color="color">
      <MediaLibraryModern />
      <MediaLibraryLegacy />
    </Explorer>
  </ScreenShell>
</template>
