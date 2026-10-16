import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  Input,
} from '@angular/core';
import { SymbioteHostPropsDirective } from '@symbiote-native/angular';
import {
  DEFAULT_BUFFER_SIZE,
  performanceStyles,
  type IPerformanceMonitorProps,
} from '../core/performance-monitor';
import { PerformanceReading } from './performance-reading';

export type { IPerformanceMonitorProps };

// A JS and a UI frame rate, as upstream's overlay shows them
@Component({
  selector: 'PerformanceMonitor',
  standalone: true,
  imports: [SymbioteHostPropsDirective, PerformanceReading],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<view [symbioteHostProps]="monitor">
    <PerformanceReading kind="JS" [smoothingFrames]="smoothingFrames" />
    <PerformanceReading kind="UI" [smoothingFrames]="smoothingFrames" />
  </view>`,
})
export class PerformanceMonitor {
  // Frames kept for smoothing at the highest rate, so a bigger value is a steadier number
  @Input() smoothingFrames: number = DEFAULT_BUFFER_SIZE;

  protected readonly monitor = { style: performanceStyles.monitor };
}
