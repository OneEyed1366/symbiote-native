import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Injector,
  Input,
  inject,
  runInInjectionContext,
  type OnInit,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import {
  createCircularDoublesBuffer,
  measureJsFrames,
  performanceStyles,
  readingUpdater,
  uiFrameMeter,
} from '../core/performance-monitor';
import { hooks } from './services/hooks';
import { onDestroy } from './services/track';

const { useAnimatedProps, useFrameCallback, useSharedValue } = hooks;

export type IPerformanceKind = 'JS' | 'UI';

// One frame rate of the overlay. The inputs arrive after the constructor, so what needs
// `smoothingFrames` starts in `ngOnInit`, inside the injection context the services need
@Component({
  selector: 'PerformanceReading',
  standalone: true,
  imports: [SymbioteHostPropsDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<view [symbioteHostProps]="container">
    <text-input [symbioteHostProps]="reading" />
  </view>`,
})
export class PerformanceReading implements OnInit {
  @Input({ required: true }) kind!: IPerformanceKind;
  @Input({ required: true }) smoothingFrames!: number;

  protected readonly container = { style: performanceStyles.container };
  protected reading: Record<string, unknown> = {};
  private readonly injector = inject(Injector);

  ngOnInit(): void {
    runInInjectionContext(this.injector, () => {
      const fps = useSharedValue<string | null>(null);
      this.start(fps);
      const animatedProps = useAnimatedProps(readingUpdater(this.kind, fps));
      this.reading = {
        style: performanceStyles.text,
        animatedProps,
        editable: false,
      };
    });
  }

  private start(fps: ReturnType<typeof useSharedValue<string | null>>): void {
    if (this.kind === 'JS') {
      const buffer = createCircularDoublesBuffer(this.smoothingFrames);
      onDestroy(measureJsFrames(buffer, fps));
      return;
    }
    const circularBuffer = useSharedValue<ReturnType<
      typeof createCircularDoublesBuffer
    > | null>(null);
    useFrameCallback(uiFrameMeter(this.smoothingFrames, circularBuffer, fps));
  }
}
