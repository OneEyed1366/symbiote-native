import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  deserializeNavigatorState,
  serializeNavigatorState,
} from '@symbiote-native/navigation';
import type { INavigatorState } from '@symbiote-native/navigation';
import {
  injectNavigationState,
  injectStackNavigation,
} from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import {
  breakSnapshot,
  PRESET_CHOICES,
  presetState,
} from './persistence-presets';
import { injectSnapshot, snapshotStore } from './use-snapshot';

const COLOR = LINE_COLOR.routing;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'restore failed';
}

@Component({
  selector: 'PersistenceRecipes',
  standalone: true,
  imports: [ActionButton, LabeledChoice, Recipe, SYMBIOTE_ELEMENTS],
  template: `
    <text testID="persist-depth" class="info-text">
      current stack depth: {{ state().routes.length }}
    </text>
    <ActionButton
      testID="persist-push"
      title="Push Details to change the depth"
      (press)="pushDetails()"
      [color]="color"
    ></ActionButton>
    <Recipe [recipe]="saveRecipe">
      <ActionButton
        testID="persist-serialize"
        title="Serialize current stack"
        (press)="serialize()"
        [color]="color"
      ></ActionButton>
      <text-input
        testID="persist-snapshot"
        [multiline]="true"
        [value]="snapshot() ?? ''"
        (valueChange)="setSnapshot($event)"
        [placeholder]="emptyText"
        placeholderTextColor="#41506a"
        class="text-input snapshot-input"
      ></text-input>
    </Recipe>
    <Recipe [recipe]="restoreRecipe">
      <ActionButton
        testID="persist-restore"
        title="Restore serialized snapshot"
        (press)="restore()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="invalidRecipe">
      <ActionButton
        testID="persist-break"
        title="Break the snapshot"
        (press)="setSnapshot(brokenSnapshot)"
        [color]="color"
      ></ActionButton>
      @if (error() !== undefined) {
        <text testID="persist-error" class="info-text"
          >error: {{ error() }}</text
        >
      }
    </Recipe>
    <Recipe [recipe]="resetRecipe">
      <LabeledChoice
        testID="persist-preset"
        label="stack to reset to"
        [value]="preset()"
        [options]="presetChoices"
        (valueChange)="preset.set($event)"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="persist-reset"
        title="reset(state)"
        (press)="resetToPreset()"
        [color]="color"
      ></ActionButton>
    </Recipe>
  `,
})
export class PersistenceRecipes {
  private readonly navigation = injectStackNavigation();

  readonly color = COLOR;
  readonly emptyText =
    'tap Serialize to capture the current route stack as JSON';
  readonly brokenSnapshot = breakSnapshot();
  readonly presetChoices = PRESET_CHOICES;
  readonly saveRecipe = recipeById('persist-save');
  readonly restoreRecipe = recipeById('persist-restore');
  readonly invalidRecipe = recipeById('persist-invalid');
  readonly resetRecipe = recipeById('persist-reset');
  readonly state = injectNavigationState<INavigatorState>(current => current);
  readonly snapshot = injectSnapshot();
  readonly error = signal<string | undefined>(undefined);
  readonly preset = signal<(typeof PRESET_CHOICES)[number]>('details');

  setSnapshot(text: string): void {
    snapshotStore.set(text);
  }

  pushDetails(): void {
    this.navigation.push(ROUTE_NAME.Details, { id: '1' });
  }

  serialize(): void {
    this.error.set(undefined);
    this.setSnapshot(
      JSON.stringify(serializeNavigatorState(this.state()), null, 2),
    );
  }

  restore(): void {
    const current = this.snapshot();
    if (current === undefined) return;
    try {
      const parsed: unknown = JSON.parse(current);
      this.navigation.reset(deserializeNavigatorState(parsed));
      this.error.set(undefined);
    } catch (thrown) {
      this.error.set(errorText(thrown));
    }
  }

  resetToPreset(): void {
    this.navigation.reset(presetState(this.preset()));
  }
}
