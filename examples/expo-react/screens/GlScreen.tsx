import { useState } from 'react';
import {
  GLLoggingOption,
  createContextAsync,
  destroyContextAsync,
  takeSnapshotAsync,
} from '@symbiote-native/gl/react';
import type { IExpoWebGLRenderingContext, IGLSnapshot } from '@symbiote-native/gl/react';
import { ActionButton } from '../components/ActionButton';
import { Card, ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { CameraTextureScenario } from './gl-camera';
import { FilterScenario, ShaderScenario, TriangleScenario } from './gl-scenes';

const ROUTE = ROUTE_NAME.Gl;
const OFFSCREEN_SIZE = 256;

function errorLine(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type IInfo = { version: string; renderer: string; vendor: string; maxTexture: string };

function readInfo(gl: IExpoWebGLRenderingContext): IInfo {
  return {
    version: String(gl.getParameter(gl.VERSION)),
    renderer: String(gl.getParameter(gl.RENDERER)),
    vendor: String(gl.getParameter(gl.VENDOR)),
    maxTexture: String(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
  };
}

// Orange background and a violet square, drawn into a texture of its own and not onto a screen
function drawOffscreen(gl: IExpoWebGLRenderingContext): WebGLFramebuffer {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, OFFSCREEN_SIZE, OFFSCREEN_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
  gl.clearColor(0.98, 0.45, 0.09, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(OFFSCREEN_SIZE / 4, OFFSCREEN_SIZE / 4, OFFSCREEN_SIZE / 2, OFFSCREEN_SIZE / 2);
  gl.clearColor(0.4, 0.2, 0.8, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.flush();
  return framebuffer;
}

function HeadlessScenario({ color }: { color: string }) {
  const [snapshot, setSnapshot] = useState<IGLSnapshot | null>(null);
  const [line, setLine] = useState('not run');
  const run = () => {
    setLine('rendering…');
    createContextAsync()
      .then(async gl => {
        try {
          const framebuffer = drawOffscreen(gl);
          const result = await takeSnapshotAsync(gl, { framebuffer, format: 'png' });
          setSnapshot(result);
          setLine(`${result.width}x${result.height}, context ${gl.contextId}`);
        } finally {
          await destroyContextAsync(gl);
        }
      })
      .catch((error: unknown) => setLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Scenario
      testID="gl-headless-scenario"
      title="Render an image with no view on screen"
      why="Thumbnails, charts for a report or an image effect for a share can be drawn in the background with a context that has no view, then saved as a file."
      steps={['Press Render offscreen']}
      expect="An orange square image with a violet square in its middle appears below, 256 by 256 pixels. No GL view was on screen while it was drawn."
    >
      <ActionButton testID="gl-headless-run" title="Render offscreen" color={color} onPress={run} />
      <ResultRow testID="gl-headless-result" label="createContextAsync" value={line} />
      {snapshot !== null && <image testID="gl-headless-image" source={{ uri: snapshot.localUri }} className="gl-snapshot" />}
    </Scenario>
  );
}

function InfoScenario({ color }: { color: string }) {
  const [info, setInfo] = useState<IInfo | null>(null);
  const [logLine, setLogLine] = useState('logging off');
  const read = () => {
    createContextAsync()
      .then(async gl => {
        try {
          setInfo(readInfo(gl));
          gl.__expoSetLogging(GLLoggingOption.METHOD_CALLS | GLLoggingOption.RESOLVE_CONSTANTS);
          gl.clearColor(0, 0, 0, 1);
          gl.__expoSetLogging(GLLoggingOption.DISABLED);
          setLogLine('two calls were logged to the Metro console with their constants named');
        } finally {
          await destroyContextAsync(gl);
        }
      })
      .catch((error: unknown) => setLogLine(`failed: ${errorLine(error)}`));
  };
  return (
    <Card testID="gl-info-card" title="What this GPU offers, and call logging">
      <text className="hero-body">
        Apps check the limits before choosing a texture size, and turn on call logging to debug a black view. Logging prints to the Metro console with console.warn.
      </text>
      <ActionButton testID="gl-info" title="Read GPU info and log two calls" color={color} onPress={read} />
      <ResultRow testID="gl-info-version" label="VERSION" value={info?.version ?? 'not read'} />
      <ResultRow testID="gl-info-renderer" label="RENDERER" value={info?.renderer ?? 'not read'} />
      <ResultRow testID="gl-info-vendor" label="VENDOR" value={info?.vendor ?? 'not read'} />
      <ResultRow testID="gl-info-max-texture" label="MAX_TEXTURE_SIZE" value={info?.maxTexture ?? 'not read'} />
      <ResultRow testID="gl-info-logging" label="__expoSetLogging" value={logLine} />
      <text className="hero-body">
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
