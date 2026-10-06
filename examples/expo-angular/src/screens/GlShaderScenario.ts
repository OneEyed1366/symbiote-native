import { Component, computed, input, signal, viewChild } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { GLView } from '@symbiote-native/gl/angular';
import type {
  IExpoWebGLRenderingContext,
  IGLSnapshot,
} from '@symbiote-native/gl/angular';
import { ActionButton } from '../components/ActionButton';
import { ChoiceRow } from '../components/ChoiceRow';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ToggleRow } from '../components/ToggleRow';
import { RATE_CAPS, SHADER_RATE, errorLine } from './gl-frame-loop';
import { injectFrameLoop } from './gl-inject-frame-loop';
import { shaderScene } from './gl-shaders';
import type { IShaderName } from './gl-shaders';

const SHADERS: readonly IShaderName[] = ['plasma', 'waves', 'checker'];

@Component({
  selector: 'GlShaderScenario',
  standalone: true,
  imports: [
    ActionButton,
    ChoiceRow,
    GLView,
    ResultRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
    ToggleRow,
  ],
  template: `
    <Scenario
      testID="gl-shader-scenario"
      title="Run a visual effect and export a frame"
      why="Animated backgrounds, transitions and generated art are a fragment shader over the whole view. Taking a snapshot saves the current frame as an image to share or upload."
      [steps]="steps"
      expect="Each effect animates on its own. After the snapshot a still copy of the frame appears under the buttons with its pixel size."
    >
      @for (key of keys(); track key) {
        <GLView
          #glView
          testID="gl-shader"
          [msaaSamples]="noMsaa"
          class="gl-view"
          [onContextCreate]="onContextCreate"
        />
      }
      <ChoiceRow
        testID="gl-shader-choice"
        label="effect"
        [color]="color()"
        [options]="shaderOptions"
        [(value)]="shader"
      />
      <ResultRow
        testID="gl-shader-fps"
        label="Frames per second"
        [value]="fpsText()"
      />
      <ResultRow
        testID="gl-shader-loop"
        label="Draw loop"
        [value]="frame.view().stats"
      />
      <ChoiceRow
        testID="gl-shader-rate"
        label="frame rate cap"
        [color]="color()"
        [options]="rateCaps"
        [(value)]="maxFps"
      />
      <ToggleRow
        testID="gl-shader-run"
        label="Animate"
        [value]="frame.view().isRunning"
        [color]="color()"
        (valueChange)="frame.loop.toggle($event)"
      />
      <ActionButton
        testID="gl-snapshot"
        title="Take snapshot"
        [color]="color()"
        (press)="capture()"
      />
      <ResultRow
        testID="gl-snapshot-result"
        label="takeSnapshotAsync"
        [value]="line()"
      />
      @if (snapshot(); as shot) {
        <image
          testID="gl-snapshot-image"
          [source]="snapshotSource()"
          class="gl-snapshot"
        />
      }
    </Scenario>
  `,
})
export class GlShaderScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Pick another effect and watch the view restart',
    'Press Take snapshot',
  ];
  readonly shaderOptions = SHADERS.map(item => ({ label: item, value: item }));
  readonly rateCaps = RATE_CAPS;
  readonly noMsaa = 0;

  private readonly handle = viewChild<GLView>('glView');
  readonly maxFps = signal(SHADER_RATE);
  readonly frame = injectFrameLoop(() => this.maxFps());
  readonly shader = signal<IShaderName>('plasma');
  readonly snapshot = signal<IGLSnapshot | null>(null);
  readonly line = signal('no snapshot yet');
  // A new key re-creates the view, which is how a new effect restarts the surface
  readonly keys = computed(() => [this.shader()]);
  readonly snapshotSource = computed(() => ({
    uri: this.snapshot()?.localUri ?? '',
  }));

  fpsText(): string {
    return String(this.frame.view().fps);
  }

  readonly onContextCreate = (gl: IExpoWebGLRenderingContext): void => {
    try {
      this.frame.loop.start(shaderScene(gl, this.shader()));
    } catch (error: unknown) {
      this.line.set(`shader failed: ${errorLine(error)}`);
    }
  };

  async capture(): Promise<void> {
    try {
      const result = await this.handle()?.takeSnapshotAsync({ format: 'png' });
      if (result !== undefined) {
        this.snapshot.set(result);
        this.line.set(`${result.width}x${result.height}`);
      }
    } catch (error: unknown) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }
}
