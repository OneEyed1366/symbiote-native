import { Component } from '@angular/core';
import { ScreenShell } from '../components/ScreenShell';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { GlCameraTextureScenario } from './GlCameraTextureScenario';
import { GlFilterScenario } from './GlFilterScenario';
import { GlHeadlessScenario } from './GlHeadlessScenario';
import { GlInfoScenario } from './GlInfoScenario';
import { GlShaderScenario } from './GlShaderScenario';
import { GlTriangleScenario } from './GlTriangleScenario';

const ROUTE = ROUTE_NAME.Gl;

@Component({
  selector: 'GlScreen',
  standalone: true,
  imports: [
    GlCameraTextureScenario,
    GlFilterScenario,
    GlHeadlessScenario,
    GlInfoScenario,
    GlShaderScenario,
    GlTriangleScenario,
    ScreenShell,
  ],
  template: `
    <ScreenShell
      [route]="route"
      testID="gl-scroll"
      title="GL"
      body="A native OpenGL surface with a WebGL context: custom animation, shader effects, GPU photo filters and offscreen rendering, no UI-view limits."
    >
      <GlTriangleScenario [color]="color" />
      <GlShaderScenario [color]="color" />
      <GlFilterScenario [color]="color" />
      <GlCameraTextureScenario [color]="color" />
      <GlHeadlessScenario [color]="color" />
      <GlInfoScenario [color]="color" />
    </ScreenShell>
  `,
})
export class GlScreen {
  readonly route = ROUTE;
  readonly color = lineColorOf(ROUTE);
}
