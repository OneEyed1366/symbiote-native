import { Component, ElementRef, HostBinding, inject } from '@angular/core';
import { Pressable, Text, anchorHostStyle } from '@symbiote-native/angular';
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import { PlaygroundQueryItemDirective } from './PlaygroundDirectives';

function isStyleRecord(value: unknown): value is IViewStyle {
  return typeof value === 'object' && value !== null;
}

const TILE_BASE_STYLE: IViewStyle = { borderWidth: 2, borderRadius: 8 };

// @HostBinding writes onto THIS component's own ANCHOR host - every composed @Component gets a
// non-painting anchor (angular-adapter §11) - never onto the inner Pressable one level down. It
// is the identical gap ReactiveStyleScreen.ts canaries for class=/[style] at a component's USE
// SITE (angular-adapter §21), just reached through a directive-declared binding instead of a
// template one. Read back with anchorHostStyle and fold it into the inner Pressable's own style,
// or the class/style @HostBinding writes is invisible.
//
// No ngDoCheck poll needed here, unlike Button.ts's anchorStyle: Button's class comes from an
// EXTERNAL caller with no local trigger to dirty its view, so a plain getter would freeze at
// mount (angular-adapter-change-detection §9). Here `active` only ever flips from this
// component's OWN (press) binding, which already marks this view dirty on its own (§2) - the
// same refresh that re-runs `innerStyle` also re-runs the @HostBinding getters below, so a plain
// getter stays correct.
@Component({
  selector: 'PlaygroundHostBindingTile',
  standalone: true,
  imports: [Pressable, Text],
  hostDirectives: [
    { directive: PlaygroundQueryItemDirective, inputs: ['label: tileLabel'] },
  ],
  template: `
    <Pressable
      testID="pg-hostbinding-tile"
      [style]="innerStyle"
      (press)="toggle()"
    >
      <Text class="rstyle-tile-text">{{
        active ? tileLabel + ' · on' : tileLabel + ' · off'
      }}</Text>
    </Pressable>
  `,
})
export class PlaygroundHostBindingTile {
  private readonly elementRef = inject(ElementRef);

  // @Self(): resolve the hostDirectives-composed PlaygroundQueryItemDirective instance off THIS
  // element only, never an ancestor - the InjectOptions counterpart to the parameter decorator.
  private readonly queryItem = inject(PlaygroundQueryItemDirective, {
    self: true,
  });

  active = false;

  @HostBinding('class.pg-hb-active') get isActiveClass(): boolean {
    return this.active;
  }

  @HostBinding('style.borderColor') get borderColor(): string {
    return this.active ? '#3d8bd9' : '#41506a';
  }

  get tileLabel(): string {
    return this.queryItem.label;
  }

  get innerStyle(): IStyleProp<IViewStyle> {
    const anchorStyle = anchorHostStyle(this.elementRef);
    return isStyleRecord(anchorStyle)
      ? [anchorStyle, TILE_BASE_STYLE]
      : TILE_BASE_STYLE;
  }

  toggle(): void {
    this.active = !this.active;
  }
}
