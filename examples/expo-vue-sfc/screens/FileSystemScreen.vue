<script setup lang="ts">
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import FileSystemLegacy from './FileSystemLegacy.vue';
import FileSystemModern from './FileSystemModern.vue';
import FileSystemNetwork from './FileSystemNetwork.vue';
import FileSystemNote from './FileSystemNote.vue';

const ROUTE = ROUTE_NAME.FileSystem;
const color = lineColorOf(ROUTE);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="file-system-scroll"
    title="File System"
    body="Read, write, copy, move and download files and folders in the app's own storage, with progress and cancellable transfers. Everything here stays inside this app's cache and documents folders."
  >
    <FileSystemNote />
    <Explorer testID="file-system-explorer" :color="color">
      <FileSystemModern />
      <FileSystemNetwork />
      <FileSystemLegacy />
    </Explorer>
  </ScreenShell>
</template>
