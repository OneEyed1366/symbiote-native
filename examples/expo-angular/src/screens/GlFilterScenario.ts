import { Component, effect, input, signal } from '@angular/core';
import { Asset } from '@symbiote-native/asset';
import { GLView } from '@symbiote-native/gl/angular';
import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/angular';
import { ChoiceRow } from '../components/ChoiceRow';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { FILTERS, errorLine } from './gl-frame-loop';
import { filterScene } from './gl-shaders';
import type { IFilterScene } from './gl-shaders';
import { photoUrl } from './image-assets';

@Component({
  selector: 'GlFilterScenario',
  standalone: true,
  imports: [ChoiceRow, GLView, ResultRow, Scenario],
  template: `
    <Scenario
      testID="gl-filter-scenario"
      title="Apply a photo filter on the GPU"
      why="Photo editors upload the picture as a texture and a shader recolors every pixel at once, so a filter changes the preview instantly even on a large image."
      [steps]="steps"
      expect="The picture is redrawn at once for every filter: grey is monochrome, sepia is warm brown, invert flips every color, original returns the photo."
    >
      <ResultRow testID="gl-filter-status" label="Photo" [value]="line()" />
      @if (asset(); as loaded) {
        @for (key of [loaded.uri]; track key) {
          <GLView
            testID="gl-filter"
            class="gl-view"
            [onContextCreate]="onContextCreate"
          />
        }
      }
      <ChoiceRow
        testID="gl-filter-choice"
        label="filter"
        [color]="color()"
        [options]="filters"
        [(value)]="filter"
      />
    </Scenario>
  `,
})
export class GlFilterScenario {
  readonly color = input.required<string>();

  readonly steps = [
    'Wait until the photo is ready',
    'Press grey, sepia, invert and original in turn',
  ];
  readonly filters = FILTERS;
  private scene: IFilterScene | null = null;
  readonly filter = signal(0);
  readonly asset = signal<Asset | null>(null);
  readonly line = signal('downloading the photo…');

  constructor() {
    void this.download();
    // The read comes first, `scene?.draw(filter())` skips it while `scene` is null
    effect(() => {
      const filter = this.filter();
      this.scene?.draw(filter);
    });
  }

  private async download(): Promise<void> {
    try {
      this.asset.set(
        await Asset.fromURI(photoUrl('1025', 512)).downloadAsync(),
      );
      this.line.set('photo ready');
    } catch (error: unknown) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  }

  readonly onContextCreate = (gl: IExpoWebGLRenderingContext): void => {
    try {
      this.scene = filterScene(gl, this.asset());
      this.scene.draw(this.filter());
    } catch (error: unknown) {
      this.line.set(`failed: ${errorLine(error)}`);
    }
  };
}
