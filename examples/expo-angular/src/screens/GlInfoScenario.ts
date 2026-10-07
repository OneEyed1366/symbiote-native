import { Component, computed, input, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../components/ActionButton';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { readGpuInfo } from './gl-headless';
import type { IInfoResult } from './gl-headless';

const NOT_READ = 'not read';

@Component({
  selector: 'GlInfoScenario',
  standalone: true,
  imports: [ActionButton, Card, ResultRow, SYMBIOTE_ELEMENTS],
  template: `
    <Card testID="gl-info-card" title="What this GPU offers, and call logging">
      <text class="hero-body">
        Apps check the limits before choosing a texture size, and turn on call
        logging to debug a black view. Logging prints to the Metro console with
        console.warn.
      </text>
      <ActionButton
        testID="gl-info"
        title="Read GPU info and log two calls"
        [color]="color()"
        (press)="read()"
      />
      <ResultRow testID="gl-info-version" label="VERSION" [value]="version()" />
      <ResultRow
        testID="gl-info-renderer"
        label="RENDERER"
        [value]="renderer()"
      />
      <ResultRow testID="gl-info-vendor" label="VENDOR" [value]="vendor()" />
      <ResultRow
        testID="gl-info-max-texture"
        label="MAX_TEXTURE_SIZE"
        [value]="maxTexture()"
      />
      <ResultRow
        testID="gl-info-logging"
        label="__expoSetLogging"
        [value]="result().line"
      />
      <text class="hero-body">
        Not shown here: getWorkletContext hands the context to a Reanimated
        worklet thread.
      </text>
    </Card>
  `,
})
export class GlInfoScenario {
  readonly color = input.required<string>();

  readonly result = signal<IInfoResult>({ info: null, line: 'logging off' });
  readonly version = computed(() => this.result().info?.version ?? NOT_READ);
  readonly renderer = computed(() => this.result().info?.renderer ?? NOT_READ);
  readonly vendor = computed(() => this.result().info?.vendor ?? NOT_READ);
  readonly maxTexture = computed(
    () => this.result().info?.maxTexture ?? NOT_READ,
  );

  async read(): Promise<void> {
    const next = await readGpuInfo();
    this.result.update(previous => ({
      info: next.info ?? previous.info,
      line: next.line,
    }));
  }
}
