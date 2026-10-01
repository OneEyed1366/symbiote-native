<script lang="ts">
  import Explorer from '../components/Explorer.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import MediaLibraryLegacy from './MediaLibraryLegacy.svelte';
  import MediaLibraryModern from './MediaLibraryModern.svelte';
  import MediaLibraryRecent from './MediaLibraryRecent.svelte';

  const ROUTE = ROUTE_NAME.MediaLibrary;
</script>

<ScreenShell
  route={ROUTE}
  testID="media-library-scroll"
  title="Media Library"
  body="Read and manage the user's photos, videos and albums: list recent media, save new files, create albums and watch for changes. Delete and create buttons in the explorer act on the ids you pass, so the read-only calls are safe to tap freely."
>
  <MediaLibraryRecent />
  <Explorer testID="media-library-explorer" color={lineColorOf(ROUTE)}>
    <MediaLibraryModern />
    <MediaLibraryLegacy />
  </Explorer>
</ScreenShell>
