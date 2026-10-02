import { useCallback, useState } from 'react';
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

function ParamsCard({
  params,
  setParams,
}: {
  params: IParams;
  setParams: ISetParams;
}) {
  const color = lineColorOf(ROUTE);
  return (
    <Card testID="video-thumbnails-params-card" title="Source">
      <Field
        testID="video-thumbnails-source-input"
        label="video uri (local file:// or remote URL)"
        value={params.source}
        onChange={source => setParams({ source })}
      />
      <Field
        testID="video-thumbnails-time-input"
        label="time (ms)"
        value={params.time}
        onChange={time => setParams({ time })}
      />
      <view className="button-row">
        {PRESET_TIMES_MS.map(ms => (
          <ActionButton
            key={ms}
            testID={`video-thumbnails-time-${ms}`}
            title={`${ms} ms`}
            onPress={() => setParams({ time: String(ms) })}
            color={color}
          />
        ))}
      </view>
      <Field
        testID="video-thumbnails-quality-input"
        label="quality (0.0 - 1.0)"
        value={params.quality}
        onChange={quality => setParams({ quality })}
      />
      <Field
        testID="video-thumbnails-headers-input"
        label="headers (JSON object, remote videos only)"
        value={params.headers}
        onChange={headers => setParams({ headers })}
        placeholder='{"Authorization": "Bearer …"}'
      />
    </Card>
  );
}

function ResultCard({
  params,
}: {
  params: IParams;
}) {
  const [thumbnail, setThumbnail] = useState<IVideoThumbnailsResult | null>(
    null,
  );
  const [status, setStatus] = useState('idle');

  const handleGenerate = useCallback(() => {
    setStatus('generating…');
    Promise.resolve()
      .then(() =>
        getThumbnailAsync(params.source, {
          time: Number(params.time),
          quality: Number(params.quality),
          headers: parseHeaders(params.headers),
        }),
      )
      .then(result => {
        setThumbnail(result);
        setStatus('done');
      })
      .catch((error: Error) => setStatus(`failed: ${error.message}`));
  }, [params]);

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
      <ResultRow testID="video-thumbnails-status" label="Status" value={status} />
      {thumbnail !== null && (
        <>
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
          />
        </>
      )}
    </Scenario>
  );
}

export function VideoThumbnailsScreen() {
  const [params, setParamsState] = useState<IParams>({
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
      <ResultCard params={params} />
      <Explorer testID="video-thumbnails-explorer" color={lineColorOf(ROUTE)}>
        <ParamsCard params={params} setParams={setParams} />
      </Explorer>
    </ScreenShell>
  );
}
