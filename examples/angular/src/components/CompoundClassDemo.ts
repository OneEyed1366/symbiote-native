import { Component } from '@angular/core';
import { Text, View } from '@symbiote-native/angular';
import { ActionButton } from './ActionButton';
// static look lives in the compiled stylesheet
import './CompoundClassDemo.css';

// The compound-class rule, on screen. What each badge proves:
//   plain    — `.badge` alone; the compound rule must NOT reach it.
//   loud     — static class="badge loud". `.loud` has no standalone rule of its own, so the only
//              thing that can change its look is `.badge.loud` resolving — and `.badge`'s padding
//              and radius must survive, since the compound rule restates only the two colours.
//   dynamic  — the same pair through a [class] binding, so the value the resolver sees is a
//              string it never saw at build time. Both paths must agree.
//
// The dynamic badge's LABEL is deliberately constant: the e2e journey proves the rule by
// screenshot-diffing that badge across the toggle, and a label that changed with the state would
// make the diff pass even with the compound rule dead.
//
// Twin of ../../../react/components/CompoundClassDemo.tsx.
@Component({
  selector: 'CompoundClassDemo',
  standalone: true,
  imports: [View, Text, ActionButton],
  template: `
    <View class="section">
      <Text class="section-label">Compound class · component stylesheet</Text>
      <View class="row">
        <View class="badge" testID="angular-compound-badge-plain">
          <Text class="badge-text">plain</Text>
        </View>
        <View class="badge loud" testID="angular-compound-badge-loud">
          <Text class="badge-text">loud</Text>
        </View>
        <View [class]="dynamicClass" testID="angular-compound-badge-dynamic">
          <Text class="badge-text">dynamic</Text>
        </View>
      </View>
      <Text class="note-text" testID="angular-compound-badge-readout">{{ readout }}</Text>
      <ActionButton
        testID="angular-compound-badge-toggle"
        [title]="isLoud ? 'Drop .loud' : 'Add .loud'"
        color="#dd0031"
        (press)="toggle()"
      ></ActionButton>
    </View>
  `,
})
export class CompoundClassDemo {
  isLoud = false;

  get dynamicClass(): string {
    return this.isLoud ? 'badge loud' : 'badge';
  }

  get readout(): string {
    return this.isLoud
      ? 'dynamic badge carries both tokens — accent border, same pill shape'
      : 'dynamic badge carries only .badge — grey border';
  }

  toggle(): void {
    this.isLoud = !this.isLoud;
  }
}
