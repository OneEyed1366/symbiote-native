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
import { View } from '@symbiote-native/angular';

// Every lifecycle hook, in the order Angular actually calls them, each emitting one log line the
// parent renders in an @for list. `tick` is a plain @Input (not `style`/`class`), so it propagates
// and dirties this view normally - none of the angular-adapter-change-detection §13 gotcha
// applies here. Projected content (<ng-content>) is what gives ngAfterContentInit/Checked
// something real to fire for.
@Component({
  selector: 'PlaygroundLifecycleLogger',
  standalone: true,
  imports: [View],
  template: `
    <View class="pg-lifecycle-box" testID="pg-lifecycle-box">
      <ng-content></ng-content>
    </View>
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
    this.hookFired.emit('ngDoCheck');
  }

  ngAfterContentInit(): void {
    this.hookFired.emit('ngAfterContentInit');
  }

  ngAfterContentChecked(): void {
    this.hookFired.emit('ngAfterContentChecked');
  }

  ngAfterViewInit(): void {
    this.hookFired.emit('ngAfterViewInit');
  }

  ngAfterViewChecked(): void {
    this.hookFired.emit('ngAfterViewChecked');
  }

  ngOnDestroy(): void {
    this.hookFired.emit('ngOnDestroy');
  }
}
