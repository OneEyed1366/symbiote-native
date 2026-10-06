import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { renderOffscreen } from './gl-headless';
import type { IHeadlessResult } from './gl-headless';

@Component({
  selector: 'GlHeadlessScenario',
  standalone: true,
  imports: [ActionButton, ResultRow, Scenario, SYMBIOTE_ELEMENTS],
  template: `
    <Scenario
      testID="gl-headless-scenario"
      title="Render an image with no view on screen"
      why="Thumbnails, charts for a report or an image effect for a share can be drawn in the background with a context that has no view, then saved as a file."
      [steps]="steps"
      expect="An orange square image with a violet square in its middle appears below, 256 by 256 pixels. No GL view was on screen while it was drawn."
    >
      <ActionButton
        testID="gl-headless-run"
        title="Render offscreen"
        [color]="color()"
        (press)="run()"
      />
      <ResultRow
        testID="gl-headless-result"
        label="createContextAsync"
        [value]="result().line"
      />
      @if (result().snapshot !== null) {
        <image
          testID="gl-headless-image"
          [source]="source()"
          class="gl-snapshot"
        />
      }
    </Scenario>
  `,
})
export class GlHeadlessScenario {
  readonly color = input.required<string>();

  readonly steps = ['Press Render offscreen'];
  readonly result = signal<IHeadlessResult>({
    snapshot: null,
    line: 'not run',
  });
  readonly source = computed(() => ({
    uri: this.result().snapshot?.localUri ?? '',
  }));

  async run(): Promise<void> {
    this.result.update(previous => ({
      snapshot: previous.snapshot,
      line: 'rendering…',
    }));
    const next = await renderOffscreen();
    this.result.update(previous => ({
      snapshot: next.snapshot ?? previous.snapshot,
      line: next.line,
    }));
  }
}
