import {
  Component,
  EventEmitter,
  Input,
  Output,
  type AfterContentChecked,
  type AfterContentInit,
  type AfterViewChecked,
  type AfterViewInit,
  type DoCheck,
  type OnChanges,
  type OnDestroy,
  type OnInit,
  type SimpleChanges,
} from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';

// Every lifecycle hook, in the order Angular actually calls them, each emitting one log line the
// parent renders in an @for list. Projected content (<ng-content>) gives ngAfterContentInit/
// Checked something real to fire for.

// THE THREE `*Checked` HOOKS REPORT ONCE: they run on every change-detection pass, and emitting a
// BOUND @Output from one re-dirties the parent forever, so Angular gives up with NG0103 after
// MAXIMUM_REFRESH_RERUNS. A plain-field counter tracks that they keep firing, without dirtying.
@Component({
  selector: 'PlaygroundLifecycleLogger',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view class="pg-lifecycle-box" testID="pg-lifecycle-box">
      <ng-content></ng-content>
      <text testID="pg-lifecycle-checks" class="rstyle-caption">{{
        checkedReadout
      }}</text>
    </view>
  `,
})
export class PlaygroundLifecycleLogger
  implements
    OnChanges,
    OnInit,
    DoCheck,
    AfterContentInit,
    AfterContentChecked,
    AfterViewInit,
    AfterViewChecked,
    OnDestroy
{
  @Input() tick = 0;
  @Output() readonly hookFired = new EventEmitter<string>();

  // Insertion-ordered, so the readout keeps the order Angular calls them in.
  private readonly checkCounts = new Map<string, number>();

  constructor() {
    this.hookFired.emit('constructor');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('tick' in changes)
      this.hookFired.emit(`ngOnChanges(tick=${this.tick})`);
  }

  ngOnInit(): void {
    this.hookFired.emit('ngOnInit');
  }

  ngDoCheck(): void {
    this.reportRepeatingHook('ngDoCheck');
  }

  ngAfterContentInit(): void {
    this.hookFired.emit('ngAfterContentInit');
  }

  ngAfterContentChecked(): void {
    this.reportRepeatingHook('ngAfterContentChecked');
  }

  ngAfterViewInit(): void {
    this.hookFired.emit('ngAfterViewInit');
  }

  ngAfterViewChecked(): void {
    this.reportRepeatingHook('ngAfterViewChecked');
  }

  ngOnDestroy(): void {
    this.hookFired.emit('ngOnDestroy');
  }

  get checkedReadout(): string {
    const counted = [...this.checkCounts].map(
      ([hookName, count]) => `${hookName} ×${count}`,
    );
    return `still running: ${counted.join(' · ')}`;
  }

  private reportRepeatingHook(hookName: string): void {
    const seen = this.checkCounts.get(hookName) ?? 0;
    this.checkCounts.set(hookName, seen + 1);
    // Only the first one goes to the parent: an emit from here dirties the parent's view, and a
    // view that re-dirties itself on every pass cannot be change-detected at all.
    if (seen === 0) this.hookFired.emit(hookName);
  }
}
