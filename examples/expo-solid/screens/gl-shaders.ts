import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/solid';

export type IShaderName = 'plasma' | 'waves' | 'checker';

const QUAD_VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const TRIANGLE_VERTEX = `
attribute vec2 position;
attribute vec3 color;
uniform float angle;
varying vec3 tint;
void main() {
  float c = cos(angle);
  float s = sin(angle);
  gl_Position = vec4(position.x * c - position.y * s, position.x * s + position.y * c, 0.0, 1.0);
  tint = color;
}`;

const TRIANGLE_FRAGMENT = `
precision mediump float;
varying vec3 tint;
void main() {
  gl_FragColor = vec4(tint, 1.0);
}`;

// `mediump` is a real 16-bit float on iOS, `time` loses its fraction after a few minutes
const HIGH_PRECISION = 'precision highp float;';

const FRAGMENTS: Record<IShaderName, string> = {
  plasma: `
${HIGH_PRECISION}
varying vec2 uv;
uniform float time;
void main() {
  float v = sin(uv.x * 10.0 + time) + sin(uv.y * 10.0 + time * 1.3) + sin((uv.x + uv.y) * 8.0 + time * 0.7);
  gl_FragColor = vec4(0.5 + 0.5 * sin(v), 0.5 + 0.5 * sin(v + 2.1), 0.5 + 0.5 * sin(v + 4.2), 1.0);
}`,
  waves: `
${HIGH_PRECISION}
varying vec2 uv;
uniform float time;
void main() {
  float wave = sin(uv.x * 20.0 + time * 2.0) * 0.05 + 0.5;
  float line = smoothstep(0.02, 0.0, abs(uv.y - wave));
  gl_FragColor = vec4(vec3(0.05, 0.2, 0.5) + line * vec3(0.9, 0.9, 1.0), 1.0);
}`,
  checker: `
${HIGH_PRECISION}
varying vec2 uv;
uniform float time;
void main() {
  vec2 cell = floor(uv * 8.0 + vec2(time, 0.0));
  float on = mod(cell.x + cell.y, 2.0);
  gl_FragColor = vec4(mix(vec3(0.1, 0.1, 0.2), vec3(0.9, 0.7, 0.2), on), 1.0);
}`,
};

const FILTER_FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D photo;
uniform int mode;
void main() {
  vec4 texel = texture2D(photo, vec2(uv.x, 1.0 - uv.y));
  float grey = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
  if (mode == 1) {
    gl_FragColor = vec4(vec3(grey), 1.0);
  } else if (mode == 2) {
    gl_FragColor = vec4(grey * 1.2, grey * 1.0, grey * 0.8, 1.0);
  } else if (mode == 3) {
    gl_FragColor = vec4(1.0 - texel.rgb, 1.0);
  } else {
    gl_FragColor = texel;
  }
}`;

const FULLSCREEN_QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const TRIANGLE = new Float32Array([
  0, 0.8, 1, 0, 0, -0.8, -0.7, 0, 1, 0, 0.8, -0.7, 0, 0, 1,
]);
const FLOAT_BYTES = 4;
const MS_PER_SECOND = 1_000;

function compile(
  gl: IExpoWebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error('createShader returned null');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      `shader failed: ${gl.getShaderInfoLog(shader) ?? 'no log'}`,
    );
  }
  return shader;
}

export function buildProgram(
  gl: IExpoWebGLRenderingContext,
  vertex: string,
  fragment: string,
): WebGLProgram {
  const program = gl.createProgram();
  if (program === null) {
    throw new Error('createProgram returned null');
  }
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      `link failed: ${gl.getProgramInfoLog(program) ?? 'no log'}`,
    );
  }
  return program;
}

function uploadVertices(
  gl: IExpoWebGLRenderingContext,
  data: Float32Array,
): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
}

export type IFrameDrawer = (timeMs: number) => void;

// A spinning triangle with one color per corner, `angle` turns with time
export function triangleScene(gl: IExpoWebGLRenderingContext): IFrameDrawer {
  const program = buildProgram(gl, TRIANGLE_VERTEX, TRIANGLE_FRAGMENT);
  uploadVertices(gl, TRIANGLE);
  gl.useProgram(program);
  const stride = 5 * FLOAT_BYTES;
  const position = gl.getAttribLocation(program, 'position');
  const color = gl.getAttribLocation(program, 'color');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(color);
  gl.vertexAttribPointer(color, 3, gl.FLOAT, false, stride, 2 * FLOAT_BYTES);
  const angle = gl.getUniformLocation(program, 'angle');
  return time => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.05, 0.07, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(angle, time / MS_PER_SECOND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.endFrameEXP();
  };
}

function bindQuad(gl: IExpoWebGLRenderingContext, program: WebGLProgram): void {
  uploadVertices(gl, FULLSCREEN_QUAD);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
}

// A fragment shader over the whole view, `time` is its only input
export function shaderScene(
  gl: IExpoWebGLRenderingContext,
  name: IShaderName,
): IFrameDrawer {
  const program = buildProgram(gl, QUAD_VERTEX, FRAGMENTS[name]);
  bindQuad(gl, program);
  const timeUniform = gl.getUniformLocation(program, 'time');
  return time => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(timeUniform, time / MS_PER_SECOND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.endFrameEXP();
  };
}

// The camera keeps the texture fresh, the filter mode is read at every frame
export function cameraScene(
  gl: IExpoWebGLRenderingContext,
  texture: WebGLTexture,
  getMode: () => number,
): IFrameDrawer {
  const program = buildProgram(gl, QUAD_VERTEX, FILTER_FRAGMENT);
  bindQuad(gl, program);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const modeUniform = gl.getUniformLocation(program, 'mode');
  return () => {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1i(modeUniform, getMode());
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.endFrameEXP();
  };
}

export type IFilterScene = { draw: (mode: number) => void };

// The photo goes in as a texture, `mode` picks the filter: 0 none, 1 grey, 2 sepia, 3 invert
export function filterScene(
  gl: IExpoWebGLRenderingContext,
  photo: unknown,
): IFilterScene {
  const program = buildProgram(gl, QUAD_VERTEX, FILTER_FRAGMENT);
  bindQuad(gl, program);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // expo-gl takes an asset with a `localUri` where the DOM takes an image element
  Reflect.apply(gl.texImage2D, gl, [
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    photo,
  ]);
  const modeUniform = gl.getUniformLocation(program, 'mode');
  return {
    draw: mode => {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1i(modeUniform, mode);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.endFrameEXP();
    },
  };
}
