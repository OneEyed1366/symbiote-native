<script lang="ts">
  import { getThumbnailAsync } from '@symbiote-native/video-thumbnails';
  import type { IVideoThumbnailsResult } from '@symbiote-native/video-thumbnails';
  import ActionButton from '../components/ActionButton.svelte';
  import Card from '../components/Card.svelte';
  import Explorer from '../components/Explorer.svelte';
  import Field from '../components/Field.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';

  const ROUTE = ROUTE_NAME.VideoThumbnails;
  const color = lineColorOf(ROUTE);
  const SAMPLE_VIDEO =
    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
  const PRESET_TIMES_MS = [0, 1000, 3000, 5000];

  let source = $state(SAMPLE_VIDEO);
  let time = $state('1000');
  let quality = $state('0.8');
  let headers = $state('');
  let thumbnail = $state<IVideoThumbnailsResult | null>(null);
  let status = $state('idle');

  function parseHeaders(text: string): Record<string, string> | undefined {
    if (text.trim() === '') {
      return undefined;
    }
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('headers must be a JSON object');
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value)]),
    );
  }

  function handleGenerate(): void {
    status = 'generating…';
    Promise.resolve()
      .then(() =>
        getThumbnailAsync(source, {
          time: Number(time),
          quality: Number(quality),
          headers: parseHeaders(headers),
        }),
      )
      .then(result => {
        thumbnail = result;
        status = 'done';
      })
      .catch((error: Error) => {
        status = `failed: ${error.message}`;
      });
  }
</script>

<ScreenShell
  route={ROUTE}
  testID="video-thumbnails-scroll"
  title="Video Thumbnails"
  body="Grab a still frame from a video, local or remote, at any moment and quality. Use it for covers, previews and scrubbing bars."
>
  <Scenario
    testID="video-thumbnails-result-card"
    title="Show a preview image for a video"
    why="Video lists and feeds need a cover picture. Grab a still frame from a local file or a remote URL instead of shipping separate preview images."
    steps={[
      'Press getThumbnailAsync (the sample clip is already set)',
      'Change the time or quality in the explorer and press again',
    ]}
    expect="A frame from the clip appears below with its size and file URI. A later time gives a different frame."
  >
    <ActionButton
      testID="video-thumbnails-generate-button"
      title="getThumbnailAsync"
      onPress={handleGenerate}
      {color}
    />
    <ResultRow testID="video-thumbnails-status" label="Status" value={status} />
    {#if thumbnail}
      <ResultRow
        testID="video-thumbnails-size"
        label="width × height"
        value={`${thumbnail.width} × ${thumbnail.height}`}
      />
      <ResultRow
        testID="video-thumbnails-uri"
        label="uri"
        value={thumbnail.uri}
      />
      <image
        testID="video-thumbnails-image"
        source={{ uri: thumbnail.uri }}
        style={{ width: '100%', height: 200 }}
        resizeMode="contain"
      ></image>
    {/if}
  </Scenario>
  <Explorer testID="video-thumbnails-explorer" {color}>
    <Card testID="video-thumbnails-params-card" title="Source">
      <Field
        testID="video-thumbnails-source-input"
        label="video uri (local file:// or remote URL)"
        value={source}
        onChange={next => {
          source = next;
        }}
      />
      <Field
        testID="video-thumbnails-time-input"
        label="time (ms)"
        value={time}
        onChange={next => {
          time = next;
        }}
      />
      <view class="button-row">
        {#each PRESET_TIMES_MS as ms (ms)}
          <ActionButton
            testID={`video-thumbnails-time-${ms}`}
            title={`${ms} ms`}
            onPress={() => {
              time = String(ms);
            }}
            {color}
          />
        {/each}
      </view>
      <Field
        testID="video-thumbnails-quality-input"
        label="quality (0.0 - 1.0)"
        value={quality}
        onChange={next => {
          quality = next;
        }}
      />
      <Field
        testID="video-thumbnails-headers-input"
        label="headers (JSON object, remote videos only)"
        value={headers}
        onChange={next => {
          headers = next;
        }}
        placeholder={'{"Authorization": "Bearer …"}'}
      />
    </Card>
  </Explorer>
</ScreenShell>
