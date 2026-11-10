import { Component, computed, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  SymbioteHostPropsDirective,
} from '@symbiote-native/angular';
import {
  FadeOutRight,
  SharedTransitionBoundary,
  SlideInDown,
} from '@symbiote-native/reanimated/angular';
import { ActionButton } from '../../components/ActionButton';
import { ACCENT } from './colors';
import { Section } from './Section';

const SHARED_TAG = 'demo-shared-box';
const FIRST = 'first';
const SECOND = 'second';

type IScreen = typeof FIRST | typeof SECOND;

// Two fake screens in one view: no navigator is needed when a boundary says which one is active
// The flag that turns the native side on is `ENABLE_SHARED_ELEMENT_TRANSITIONS` in `package.json`
@Component({
  selector: 'SharedTransitionSection',
  standalone: true,
  imports: [
    ActionButton,
    SharedTransitionBoundary,
    Section,
    SYMBIOTE_ELEMENTS,
    SymbioteHostPropsDirective,
  ],
  template: `
    <Section
      title="Shared element transition"
      note="the box flies from the first fake screen to the second, turning on the way"
    >
      <text class="ra-note">{{ showingNote() }}</text>
      <view class="ra-fake-screen">
        <SharedTransitionBoundary [isActive]="isFirstActive()">
          <view
            class="ra-box ra-shared-first"
            [symbioteHostProps]="sharedProps"
          ></view>
        </SharedTransitionBoundary>
      </view>
      @if (isSecondShown()) {
        <view class="ra-fake-screen" [symbioteHostProps]="screenProps">
          <SharedTransitionBoundary [isActive]="isSecondShown()">
            <view
              class="ra-box ra-shared-second"
              [symbioteHostProps]="sharedProps"
            ></view>
          </SharedTransitionBoundary>
        </view>
      }
      <ActionButton
        testID="ra-shared-toggle"
        title="toggle screen"
        [color]="accent"
        (press)="toggle()"
      />
    </Section>
  `,
})
export class SharedTransitionSection {
  readonly showing = signal<IScreen>(FIRST);
  readonly showingNote = computed(() => `showing: ${this.showing()}`);
  readonly isFirstActive = computed(() => this.showing() === FIRST);
  readonly isSecondShown = computed(() => this.showing() === SECOND);

  readonly sharedProps = { sharedTransitionTag: SHARED_TAG };
  readonly screenProps = { entering: SlideInDown, exiting: FadeOutRight };
  readonly accent = ACCENT;

  toggle(): void {
    this.showing.set(this.showing() === FIRST ? SECOND : FIRST);
  }
}
