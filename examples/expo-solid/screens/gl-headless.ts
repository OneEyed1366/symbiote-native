import {
  GLLoggingOption,
  createContextAsync,
  destroyContextAsync,
  takeSnapshotAsync,
} from '@symbiote-native/gl/solid';
import type {
  IExpoWebGLRenderingContext,
  IGLSnapshot,
} from '@symbiote-native/gl/solid';
import { errorLine } from './gl-frame-loop';

const OFFSCREEN_SIZE = 256;

export type IInfo = {
  version: string;
  renderer: string;
  vendor: string;
  maxTexture: string;
};

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
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    OFFSCREEN_SIZE,
    OFFSCREEN_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.viewport(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
  gl.clearColor(0.98, 0.45, 0.09, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    OFFSCREEN_SIZE / 4,
    OFFSCREEN_SIZE / 4,
    OFFSCREEN_SIZE / 2,
    OFFSCREEN_SIZE / 2,
  );
  gl.clearColor(0.4, 0.2, 0.8, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.flush();
  return framebuffer;
}

export type IHeadlessResult = { snapshot: IGLSnapshot | null; line: string };

export async function renderOffscreen(): Promise<IHeadlessResult> {
  try {
    const gl = await createContextAsync();
    try {
      const framebuffer = drawOffscreen(gl);
      const snapshot = await takeSnapshotAsync(gl, {
        framebuffer,
        format: 'png',
      });
      return {
        snapshot,
        line: `${snapshot.width}x${snapshot.height}, context ${gl.contextId}`,
      };
    } finally {
      await destroyContextAsync(gl);
    }
  } catch (error: unknown) {
    return { snapshot: null, line: `failed: ${errorLine(error)}` };
  }
}

export type IInfoResult = { info: IInfo | null; line: string };

export async function readGpuInfo(): Promise<IInfoResult> {
  try {
    const gl = await createContextAsync();
    try {
      const info = readInfo(gl);
      gl.__expoSetLogging(
        GLLoggingOption.METHOD_CALLS | GLLoggingOption.RESOLVE_CONSTANTS,
      );
      gl.clearColor(0, 0, 0, 1);
      gl.__expoSetLogging(GLLoggingOption.DISABLED);
      return {
        info,
        line: 'two calls were logged to the Metro console with their constants named',
      };
    } finally {
      await destroyContextAsync(gl);
    }
  } catch (error: unknown) {
    return { info: null, line: `failed: ${errorLine(error)}` };
  }
}
