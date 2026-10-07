<script lang="ts">
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import BasicScenario from './BasicScenario.svelte';
  import CacheScenario from './CacheScenario.svelte';
  import CustomControlsScenario from './CustomControlsScenario.svelte';
  import FeedScenario from './FeedScenario.svelte';
  import FullscreenScenario from './FullscreenScenario.svelte';
  import PlayerExplorer from './PlayerExplorer.svelte';
  import ReelsScenario from './ReelsScenario.svelte';
  import ThumbnailsScenario from './ThumbnailsScenario.svelte';
  import TracksScenario from './TracksScenario.svelte';

  const ROUTE = ROUTE_NAME.Video;
  const color = lineColorOf(ROUTE);

  let isMounted = $state(true);
</script>

<ScreenShell
  route={ROUTE}
  testID="video-scroll"
  title="Video"
  body="expo-video: a native player object plus a view. System or custom controls, feeds, fullscreen, picture in picture, thumbnails, tracks and an on-disk cache."
>
  <Card testID="video-mount-card" title="Players on this screen">
    <ToggleRow testID="video-mount" label="Mount the players below" value={isMounted} onChange={value => (isMounted = value)} {color} />
    <ResultRow testID="video-mount-state" label="Why" value="the cache calls work only while no player exists" />
  </Card>
  {#if isMounted}
    <BasicScenario />
    <CustomControlsScenario {color} />
    <FeedScenario {color} />
    <ReelsScenario {color} />
    <FullscreenScenario {color} />
    <ThumbnailsScenario {color} />
    <TracksScenario {color} />
  {/if}
  <CacheScenario {color} {isMounted} />
  {#if isMounted}
    <PlayerExplorer {color} />
  {/if}
</ScreenShell>
