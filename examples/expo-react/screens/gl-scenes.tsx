import { useEffect, useRef, useState } from 'react';
import { GLView } from '@symbiote-native/gl/react';
import type { IExpoWebGLRenderingContext, IGLSnapshot, IGLViewHandle } from '@symbiote-native/gl/react';
import { Asset } from '@symbiote-native/asset';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { filterScene, shaderScene, triangleScene } from './gl-shaders';
import type { IFilterScene, IFrameDrawer, IShaderName } from './gl-shaders';
import { photoUrl } from './image-assets';

const MS_PER_SECOND = 1_000;
// A report re-renders the screen, so reports are rare and the animation is left alone between them
const REPORT_WINDOW_MS = 5_000;
const FULL_RATE = 60;
// A display frame comes a little early or late, a tight cap would skip every other one
const FRAME_SLACK_MS = 3;
const RATE_CAPS = [60, 30, 15].map(rate => ({ label: `${rate} fps`, value: rate }));
const SHADER_RATE = 30;
const SHADERS: readonly IShaderName[] = ['plasma', 'waves', 'checker'];
export const FILTERS = [
  { label: 'original', value: 0 },
  { label: 'grey', value: 1 },
  { label: 'sepia', value: 2 },
  { label: 'invert', value: 3 },
];

export function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IFrameReport = { fps: number; frames: number; timeMs: number };

type IFrameLoop = {
  frame: { current: number | null };
  draw: IFrameDrawer;
  getMaxFps: () => number;
  onReport: (report: IFrameReport) => void;
};

// The time handed to `draw` counts from the first frame, a frame comes at most `maxFps` times
// a second, a report comes once per window
function runFrames({ frame, draw, getMaxFps, onReport }: IFrameLoop): void {
  let origin: number | null = null;
  let windowStart = 0;
  let lastDrawn = -MS_PER_SECOND;
  let count = 0;
  let frames = 0;
  const step = (now: number) => {
    origin ??= now;
    const time = now - origin;
    if (time - lastDrawn >= MS_PER_SECOND / getMaxFps() - FRAME_SLACK_MS) {
      draw(time);
      lastDrawn = time;
      count += 1;
      frames += 1;
    }
    if (time - windowStart >= REPORT_WINDOW_MS) {
      onReport({ fps: Math.round((count * MS_PER_SECOND) / (time - windowStart)), frames, timeMs: Math.round(time) });
      windowStart = time;
      count = 0;
    }
    frame.current = requestAnimationFrame(step);
  };
  frame.current = requestAnimationFrame(step);
}

// The GL thread is shared, two busy scenes make each other stutter: starting one pauses the other
let pauseRunningScene: (() => void) | null = null;

// A render loop that stops with the component and can be paused, with a report of its frames
export function useFrameLoop(maxFps = FULL_RATE) {
  const cap = useRef(maxFps);
  cap.current = maxFps;
  const frame = useRef<number | null>(null);
  const surfaces = useRef(0);
  const [stats, setStats] = useState('not started');
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const drawer = useRef<IFrameDrawer | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const pauseThisScene = useRef(() => {
    stop();
    setIsRunning(false);
  });
  const loop = (draw: IFrameDrawer) => {
    stop();
    // Only another scene is paused, its own earlier run would turn the toggle off again
    if (pauseRunningScene !== pauseThisScene.current) pauseRunningScene?.();
    pauseRunningScene = pauseThisScene.current;
    runFrames({
      frame,
      draw,
      getMaxFps: () => cap.current,
      onReport: report => {
        setFps(report.fps);
        setStats(`${report.frames} frames, loop time ${report.timeMs} ms, surfaces created ${surfaces.current}`);
      },
    });
  };
  // A new surface gets one frame at once, so a paused scene is not blank, then the loop runs
  const start = (draw: IFrameDrawer) => {
    surfaces.current += 1;
    drawer.current = draw;
    draw(0);
    if (isRunning) loop(draw);
  };
  const toggle = (value: boolean) => {
    setIsRunning(value);
    stop();
    if (value && drawer.current !== null) loop(drawer.current);
  };
  return { fps, stats, start, isRunning, toggle };
}

export function TriangleScenario({ color }: { color: string }) {
  const { fps, stats, start, isRunning, toggle } = useFrameLoop();
  const [line, setLine] = useState('waiting for the surface');
  const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
    try {
      start(triangleScene(gl));
      setLine('drawing');
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="gl-triangle-scenario"
      title="Draw your own animation on the GPU"
      why="Games, loaders, charts and visual effects that a view tree cannot do run as WebGL: a vertex and a fragment shader draw every frame at screen speed, outside the UI layout."
      steps={['Wait for the triangle to appear', 'Watch it turn and read the frame rate']}
      expect="A triangle with a red, green and blue corner spins smoothly on a dark background. The frame rate line settles near the screen refresh rate, 60 on most devices."
    >
      <GLView testID="gl-triangle" className="gl-view" onContextCreate={onContextCreate} />
      <ResultRow testID="gl-triangle-status" label="Surface" value={line} />
      <ResultRow testID="gl-triangle-fps" label="Frames per second" value={String(fps)} />
      <ResultRow testID="gl-triangle-loop" label="Draw loop" value={stats} />
      <ToggleRow testID="gl-triangle-run" label="Animate" value={isRunning} onChange={toggle} color={color} />
    </Scenario>
  );
}

export function ShaderScenario({ color }: { color: string }) {
  const handle = useRef<IGLViewHandle>(null);
  const [maxFps, setMaxFps] = useState(SHADER_RATE);
  const { fps, stats, start, isRunning, toggle } = useFrameLoop(maxFps);
  const [shader, setShader] = useState<IShaderName>('plasma');
  const [snapshot, setSnapshot] = useState<IGLSnapshot | null>(null);
  const [line, setLine] = useState('no snapshot yet');
  const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
    try {
      start(shaderScene(gl, shader));
    } catch (error: unknown) {
      setLine(`shader failed: ${errorLine(error)}`);
    }
  };
  const capture = () => {
    handle.current
      ?.takeSnapshotAsync({ format: 'png' })
      .then(result => {
        setSnapshot(result);
        setLine(`${result.width}x${result.height}`);
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="gl-shader-scenario"
      title="Run a visual effect and export a frame"
      why="Animated backgrounds, transitions and generated art are a fragment shader over the whole view. Taking a snapshot saves the current frame as an image to share or upload."
      steps={['Pick another effect and watch the view restart', 'Press Take snapshot']}
      expect="Each effect animates on its own. After the snapshot a still copy of the frame appears under the buttons with its pixel size."
    >
      <GLView key={shader} testID="gl-shader" ref={handle} msaaSamples={0} className="gl-view" onContextCreate={onContextCreate} />
      <ChoiceRow testID="gl-shader-choice" label="effect" color={color} value={shader} options={SHADERS.map(item => ({ label: item, value: item }))} onChange={setShader} />
      <ResultRow testID="gl-shader-fps" label="Frames per second" value={String(fps)} />
      <ResultRow testID="gl-shader-loop" label="Draw loop" value={stats} />
      <ChoiceRow testID="gl-shader-rate" label="frame rate cap" color={color} value={maxFps} options={RATE_CAPS} onChange={setMaxFps} />
      <ToggleRow testID="gl-shader-run" label="Animate" value={isRunning} onChange={toggle} color={color} />
      <ActionButton testID="gl-snapshot" title="Take snapshot" color={color} onPress={capture} />
      <ResultRow testID="gl-snapshot-result" label="takeSnapshotAsync" value={line} />
      {snapshot !== null && <image testID="gl-snapshot-image" source={{ uri: snapshot.localUri }} className="gl-snapshot" />}
    </Scenario>
  );
}

export function FilterScenario({ color }: { color: string }) {
  const scene = useRef<IFilterScene | null>(null);
  const [filter, setFilter] = useState(0);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [line, setLine] = useState('downloading the photo…');
  useEffect(() => {
    Asset.fromURI(photoUrl('1025', 512))
      .downloadAsync()
      .then(downloaded => {
        setAsset(downloaded);
        setLine('photo ready');
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  }, []);
  useEffect(() => {
    scene.current?.draw(filter);
  }, [filter]);
  const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
    try {
      scene.current = filterScene(gl, asset);
      scene.current.draw(filter);
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="gl-filter-scenario"
      title="Apply a photo filter on the GPU"
      why="Photo editors upload the picture as a texture and a shader recolors every pixel at once, so a filter changes the preview instantly even on a large image."
      steps={['Wait until the photo is ready', 'Press grey, sepia, invert and original in turn']}
      expect="The picture is redrawn at once for every filter: grey is monochrome, sepia is warm brown, invert flips every color, original returns the photo."
    >
      <ResultRow testID="gl-filter-status" label="Photo" value={line} />
      {asset !== null && <GLView key={asset.uri} testID="gl-filter" className="gl-view" onContextCreate={onContextCreate} />}
      <ChoiceRow testID="gl-filter-choice" label="filter" color={color} value={filter} options={FILTERS} onChange={setFilter} />
    </Scenario>
  );
}
