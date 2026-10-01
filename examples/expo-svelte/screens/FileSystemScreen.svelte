<script lang="ts">
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import FileSystemLegacy from './FileSystemLegacy.svelte';
  import FileSystemModern from './FileSystemModern.svelte';
  import FileSystemNetwork from './FileSystemNetwork.svelte';
  import FileSystemNote from './FileSystemNote.svelte';

  const ROUTE = ROUTE_NAME.FileSystem;
</script>

<ScreenShell
  route={ROUTE}
  testID="file-system-scroll"
  title="File System"
  body="Read, write, copy, move and download files and folders in the app's own storage, with progress and cancellable transfers. Everything here stays inside this app's cache and documents folders."
>
  <FileSystemNote />
  <Explorer testID="file-system-explorer" color={lineColorOf(ROUTE)}>
    <FileSystemModern />
    <FileSystemNetwork />
    <FileSystemLegacy />
  </Explorer>
</ScreenShell>
