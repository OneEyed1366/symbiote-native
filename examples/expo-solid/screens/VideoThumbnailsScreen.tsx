import { For, Show, createSignal, type Accessor } from 'solid-js';
import { getThumbnailAsync } from '@symbiote-native/video-thumbnails';
import type { IVideoThumbnailsResult } from '@symbiote-native/video-thumbnails';
import { ActionButton } from '../components/ActionButton';
import { Explorer, Scenario } from '../components/Scenario';
import {
  Card,
  Field,
  ResultRow,
  ScreenShell,
  lineColorOf,
} from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';

const ROUTE = ROUTE_NAME.VideoThumbnails;
const SAMPLE_VIDEO =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const PRESET_TIMES_MS = [0, 1000, 3000, 5000];

type IParams = {
  source: string;
  time: string;
  quality: string;
  headers: string;
};
type ISetParams = (patch: Partial<IParams>) => void;

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

function ParamsCard(props: { params: IParams; setParams: ISetParams }) {
  const color = lineColorOf(ROUTE);
  return (
    <Card testID="video-thumbnails-params-card" title="Source">
      <Field
        testID="video-thumbnails-source-input"
        label="video uri (local file:// or remote URL)"
        value={props.params.source}
        onChange={source => props.setParams({ source })}
      />
      <Field
        testID="video-thumbnails-time-input"
        label="time (ms)"
        value={props.params.time}
        onChange={time => props.setParams({ time })}
      />
      <view class="button-row">
        <For each={PRESET_TIMES_MS}>
          {ms => (
            <ActionButton
              testID={`video-thumbnails-time-${ms}`}
              title={`${ms} ms`}
              onPress={() => props.setParams({ time: String(ms) })}
              color={color}
            />
          )}
        </For>
      </view>
      <Field
        testID="video-thumbnails-quality-input"
        label="quality (0.0 - 1.0)"
        value={props.params.quality}
        onChange={quality => props.setParams({ quality })}
      />
      <Field
        testID="video-thumbnails-headers-input"
        label="headers (JSON object, remote videos only)"
        value={props.params.headers}
        onChange={headers => props.setParams({ headers })}
        placeholder='{"Authorization": "Bearer …"}'
      />
    </Card>
  );
}

function ResultCard(props: { params: IParams }) {
  const [thumbnail, setThumbnail] = createSignal<IVideoThumbnailsResult | null>(
    null,
  );
  const [status, setStatus] = createSignal('idle');

  const handleGenerate = () => {
    setStatus('generating…');
    Promise.resolve()
      .then(() =>
        getThumbnailAsync(props.params.source, {
          time: Number(props.params.time),
          quality: Number(props.params.quality),
          headers: parseHeaders(props.params.headers),
        }),
      )
      .then(result => {
        setThumbnail(result);
        setStatus('done');
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  };

  return (
    <Scenario
      testID="video-thumbnails-result-card"
      title="Show a preview image for a video"
      why="Video lists and feeds need a cover picture. Grab a still frame from a local file or a remote URL instead of shipping separate preview images."
      steps={['Press getThumbnailAsync (the sample clip is already set)', 'Change the time or quality in the explorer and press again']}
      expect="A frame from the clip appears below with its size and file URI. A later time gives a different frame."
    >
      <ActionButton
        testID="video-thumbnails-generate-button"
        title="getThumbnailAsync"
        onPress={handleGenerate}
        color={lineColorOf(ROUTE)}
      />
      <ResultRow testID="video-thumbnails-status" label="Status" value={status()} />
      <Show when={thumbnail()}>
        {(result: Accessor<IVideoThumbnailsResult>) => (
          <>
            <ResultRow
              testID="video-thumbnails-size"
              label="width × height"
              value={`${result().width} × ${result().height}`}
            />
            <ResultRow
              testID="video-thumbnails-uri"
              label="uri"
              value={result().uri}
            />
            <image
              testID="video-thumbnails-image"
              source={{ uri: result().uri }}
              style={{ width: '100%', height: 200 }}
              resizeMode="contain"
            />
          </>
        )}
      </Show>
    </Scenario>
  );
}

export function VideoThumbnailsScreen() {
  const [params, setParamsState] = createSignal<IParams>({
    source: SAMPLE_VIDEO,
    time: '1000',
    quality: '0.8',
    headers: '',
  });
  const setParams: ISetParams = patch =>
    setParamsState(previous => ({ ...previous, ...patch }));

  return (
    <ScreenShell
      route={ROUTE}
      testID="video-thumbnails-scroll"
      title="Video Thumbnails"
      body="Grab a still frame from a video, local or remote, at any moment and quality. Use it for covers, previews and scrubbing bars."
    >
      <ResultCard params={params()} />
      <Explorer testID="video-thumbnails-explorer" color={lineColorOf(ROUTE)}>
        <ParamsCard params={params()} setParams={setParams} />
      </Explorer>
    </ScreenShell>
  );
}
