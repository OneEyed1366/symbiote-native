import { Show, createSignal } from 'solid-js';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { Card, ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { CameraTextureScenario } from './gl-camera';
import { readGpuInfo, renderOffscreen } from './gl-headless';
import type { IHeadlessResult, IInfoResult } from './gl-headless';
import { FilterScenario, ShaderScenario, TriangleScenario } from './gl-scenes';

const ROUTE = ROUTE_NAME.Gl;
const NOT_READ = 'not read';

function HeadlessScenario(props: { color: string }) {
  const [result, setResult] = createSignal<IHeadlessResult>({ snapshot: null, line: 'not run' });
  const run = async () => {
    setResult(previous => ({ snapshot: previous.snapshot, line: 'rendering…' }));
    const next = await renderOffscreen();
    setResult(previous => ({ snapshot: next.snapshot ?? previous.snapshot, line: next.line }));
  };
  return (
    <Scenario
      testID="gl-headless-scenario"
      title="Render an image with no view on screen"
      why="Thumbnails, charts for a report or an image effect for a share can be drawn in the background with a context that has no view, then saved as a file."
      steps={['Press Render offscreen']}
      expect="An orange square image with a violet square in its middle appears below, 256 by 256 pixels. No GL view was on screen while it was drawn."
    >
      <ActionButton testID="gl-headless-run" title="Render offscreen" color={props.color} onPress={() => void run()} />
      <ResultRow testID="gl-headless-result" label="createContextAsync" value={result().line} />
      <Show when={result().snapshot}>
        {snapshot => <image testID="gl-headless-image" source={{ uri: snapshot().localUri }} class="gl-snapshot" />}
      </Show>
    </Scenario>
  );
}

function InfoScenario(props: { color: string }) {
  const [result, setResult] = createSignal<IInfoResult>({ info: null, line: 'logging off' });
  const read = async () => {
    const next = await readGpuInfo();
    setResult(previous => ({ info: next.info ?? previous.info, line: next.line }));
  };
  return (
    <Card testID="gl-info-card" title="What this GPU offers, and call logging">
      <text class="hero-body">
        Apps check the limits before choosing a texture size, and turn on call logging to debug a black view. Logging prints to the Metro console with console.warn.
      </text>
      <ActionButton testID="gl-info" title="Read GPU info and log two calls" color={props.color} onPress={() => void read()} />
      <ResultRow testID="gl-info-version" label="VERSION" value={result().info?.version ?? NOT_READ} />
      <ResultRow testID="gl-info-renderer" label="RENDERER" value={result().info?.renderer ?? NOT_READ} />
      <ResultRow testID="gl-info-vendor" label="VENDOR" value={result().info?.vendor ?? NOT_READ} />
      <ResultRow testID="gl-info-max-texture" label="MAX_TEXTURE_SIZE" value={result().info?.maxTexture ?? NOT_READ} />
      <ResultRow testID="gl-info-logging" label="__expoSetLogging" value={result().line} />
      <text class="hero-body">
        Not shown here: getWorkletContext hands the context to a Reanimated worklet thread.
      </text>
    </Card>
  );
}

export function GlScreen() {
  const color = lineColorOf(ROUTE);
  return (
    <ScreenShell
      route={ROUTE}
      testID="gl-scroll"
      title="GL"
      body="A native OpenGL surface with a WebGL context: custom animation, shader effects, GPU photo filters and offscreen rendering, no UI-view limits."
    >
      <TriangleScenario color={color} />
      <ShaderScenario color={color} />
      <FilterScenario color={color} />
      <CameraTextureScenario color={color} />
      <HeadlessScenario color={color} />
      <InfoScenario color={color} />
    </ScreenShell>
  );
}
