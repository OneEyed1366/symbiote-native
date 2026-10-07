import { Component, inject, input, signal, viewChild } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  CameraPermissionsService,
  CameraView,
} from '@symbiote-native/camera/angular';
import { GLView } from '@symbiote-native/gl/angular';
import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/angular';
import { ActionButton } from '../components/ActionButton';
import { ChoiceRow } from '../components/ChoiceRow';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { FILTERS, errorLine } from './gl-frame-loop';
import { injectFrameLoop } from './gl-inject-frame-loop';
import { cameraScene } from './gl-shaders';

@Component({
  selector: 'GlCameraTextureScenario',
  standalone: true,
  imports: [
    ActionButton,
    CameraView,
    ChoiceRow,
    GLView,
    ResultRow,
    Scenario,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <Scenario
      testID="gl-camera-scenario"
      title="Filter the live camera picture on the GPU"
      why="Camera filters, AR overlays and video effects take every camera frame as a texture and draw it through a shader, so the effect keeps up with the preview."
      [steps]="steps"
      expect="The GL view below shows the camera picture, recolored by the chosen filter, and keeps updating. The frame rate line counts the drawn frames."
    >
      @if (permission()?.granted === true) {
        <CameraView
          #cameraSource
          testID="gl-camera-source"
          class="gl-camera-source"
        />
        <GLView
          #glView
          testID="gl-camera-view"
          class="gl-view"
          [onContextCreate]="onContextCreate"
        />
        <ActionButton
          testID="gl-camera-start"
          title="Start live filter"
          [color]="color()"
          (press)="startFilter()"
        />
        <ChoiceRow
          testID="gl-camera-filter"
          label="filter"
          [color]="color()"
          [options]="filters"
          [value]="filter()"
          (valueChange)="changeFilter($event)"
        />
      } @else {
        <ActionButton
          testID="gl-camera-allow"
          title="Allow the camera"
          [color]="color()"
          (press)="allow()"
        />
      }
      <ResultRow
        testID="gl-camera-status"
        label="createCameraTextureAsync"
        [value]="line()"
      />
      <ResultRow
        testID="gl-camera-fps"
        label="Frames per second"
        [value]="fpsText()"
      />
      <text class="hero-body"
        >Needs a device with a camera: the iOS simulator has none.</text
      >
    </Scenario>
  `,
})
export class GlCameraTextureScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Allow the camera',
    'Press Start live filter',
    'Switch between grey, sepia and invert',
  ];
  readonly filters = FILTERS;
  private readonly permissions = inject(CameraPermissionsService);
  readonly permission = this.permissions.connect();
  private readonly camera = viewChild<CameraView>('cameraSource');
  private readonly glView = viewChild<GLView>('glView');
  private context: IExpoWebGLRenderingContext | null = null;
  private mode = 0;
  readonly frame = injectFrameLoop();
  readonly filter = signal(0);
  readonly line = signal('not started');

  fpsText(): string {
    return String(this.frame.view().fps);
  }

  readonly onContextCreate = (gl: IExpoWebGLRenderingContext): void => {
    this.context = gl;
  };

  allow(): void {
    void this.permissions.request();
  }

  changeFilter(value: number): void {
    this.mode = value;
    this.filter.set(value);
  }

  async startFilter(): Promise<void> {
    const node = this.camera()?.getHostNode() ?? null;
    const gl = this.context;
    if (node === null || gl === null) {
      this.line.set('the camera or the GL surface is not ready yet');
      return;
    }
    this.line.set('creating the texture…');
    try {
      const texture = await this.glView()?.createCameraTextureAsync(node);
      if (texture !== undefined) {
        this.frame.loop.start(cameraScene(gl, texture, () => this.mode));
        this.line.set('live');
      }
    } catch (error: unknown) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }
}
