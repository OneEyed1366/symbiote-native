import { Component, input, signal } from '@angular/core';
import { GLView } from '@symbiote-native/gl/angular';
import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/angular';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { ToggleRow } from '../components/ToggleRow';
import { errorLine } from './gl-frame-loop';
import { injectFrameLoop } from './gl-inject-frame-loop';
import { triangleScene } from './gl-shaders';

@Component({
  selector: 'GlTriangleScenario',
  standalone: true,
  imports: [GLView, ResultRow, Scenario, ToggleRow],
  template: `
    <Scenario
      testID="gl-triangle-scenario"
      title="Draw your own animation on the GPU"
      why="Games, loaders, charts and visual effects that a view tree cannot do run as WebGL: a vertex and a fragment shader draw every frame at screen speed, outside the UI layout."
      [steps]="steps"
      expect="A triangle with a red, green and blue corner spins smoothly on a dark background. The frame rate line settles near the screen refresh rate, 60 on most devices."
    >
      <GLView
        testID="gl-triangle"
        class="gl-view"
        [onContextCreate]="onContextCreate"
      />
      <ResultRow testID="gl-triangle-status" label="Surface" [value]="line()" />
      <ResultRow
        testID="gl-triangle-fps"
        label="Frames per second"
        [value]="fpsText()"
      />
      <ResultRow
        testID="gl-triangle-loop"
        label="Draw loop"
        [value]="frame.view().stats"
      />
      <ToggleRow
        testID="gl-triangle-run"
        label="Animate"
        [value]="frame.view().isRunning"
        [color]="color()"
        (valueChange)="frame.loop.toggle($event)"
      />
    </Scenario>
  `,
})
export class GlTriangleScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Wait for the triangle to appear',
    'Watch it turn and read the frame rate',
  ];
  readonly frame = injectFrameLoop();
  readonly line = signal('waiting for the surface');

  fpsText(): string {
    return String(this.frame.view().fps);
  }

  readonly onContextCreate = (gl: IExpoWebGLRenderingContext): void => {
    try {
      this.frame.loop.start(triangleScene(gl));
      this.line.set('drawing');
    } catch (error: unknown) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  };
}
