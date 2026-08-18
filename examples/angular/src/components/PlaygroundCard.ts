import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  ContentChildren,
  QueryList,
  contentChild,
  contentChildren,
} from '@angular/core';
import { Text, View } from '@symbiote-native/angular';
import { PlaygroundQueryItemDirective } from './PlaygroundDirectives';

// Content projection: a named slot (`select="[card-header]"`) plus the default, unqualified slot
// for everything else - both project straight into the retained SymbioteNode tree, same as any
// other child (no DOM insertion point required).
//
// Also the @ContentChild/@ContentChildren + contentChild()/contentChildren() half of the query
// section: decorator-based and signal-based content queries side by side, both resolving the
// SAME projected PlaygroundQueryItemDirective instances - @ViewChild's half lives on
// ApiPlaygroundScreen itself, querying its own view-local tiles instead of projected content.
@Component({
  selector: 'PlaygroundCard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // PlaygroundQueryItemDirective is only a query TARGET TYPE here (@ContentChild's argument),
  // never used as a template tag by THIS component's own template - so it stays a plain TS
  // import above, not a Component `imports` entry (which is for template-tag usage only).
  imports: [Text, View],
  template: `
    <View class="pg-card" testID="pg-card">
      <ng-content select="[card-header]"></ng-content>
      <ng-content></ng-content>
      <Text testID="pg-card-content-query" class="rstyle-caption">{{
        'content children — decorator: ' +
          allContentItems.length +
          ' · signal: ' +
          allContentItemsSignal().length +
          ' · first (decorator): ' +
          (firstContentItem?.label ?? '—') +
          ' · first (signal): ' +
          (firstContentItemSignal()?.label ?? '—')
      }}</Text>
    </View>
  `,
})
export class PlaygroundCard {
  @ContentChild(PlaygroundQueryItemDirective)
  readonly firstContentItem?: PlaygroundQueryItemDirective;
  @ContentChildren(PlaygroundQueryItemDirective)
  readonly allContentItems!: QueryList<PlaygroundQueryItemDirective>;

  readonly firstContentItemSignal = contentChild(PlaygroundQueryItemDirective);
  readonly allContentItemsSignal = contentChildren(
    PlaygroundQueryItemDirective,
  );
}
