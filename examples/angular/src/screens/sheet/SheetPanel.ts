import { Component, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { SwitchRow } from '../../components/SwitchRow';
import { recipeById } from '../../navigation-recipes';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { injectRouteSettings } from '../use-route-settings';
import {
  CONTENT_STYLES,
  DETENT_CHOICES,
  ELEVATION_CHOICES,
  INITIAL_CHOICES,
  RADIUS_CHOICES,
  readSheetSettings,
  sheetParamsOf,
  UNDIMMED_CHOICES,
} from './sheet-settings';
import { injectSheetLines, sheetLog } from './use-sheet-log';

const COLOR = LINE_COLOR.presentation;

// The counter sits first on the screen: it is what stays tappable behind an undimmed sheet
@Component({
  selector: 'BackgroundCounter',
  standalone: true,
  imports: [ActionButton],
  template: `
    <ActionButton
      testID="sheet-background-counter"
      [title]="'Background counter: ' + count()"
      (press)="count.update(current => current + 1)"
      [color]="color"
    ></ActionButton>
  `,
})
export class BackgroundCounter {
  readonly color = COLOR;
  readonly count = signal(0);
}

@Component({
  selector: 'SheetLog',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    @if (lines().length > 0) {
      @for (line of lines(); track $index) {
        <text [testID]="'sheet-log-line-' + $index" class="list-row-text">{{
          line.count > 1 ? line.text + ' x' + line.count : line.text
        }}</text>
      }
    } @else {
      <text class="info-text">
        No sheet event yet, present a sheet and drag it
      </text>
    }
    <ActionButton
      testID="sheet-log-clear"
      title="Clear log"
      (press)="clear()"
      [color]="color"
    ></ActionButton>
  `,
})
export class SheetLog {
  readonly color = COLOR;
  readonly lines = injectSheetLines();

  clear(): void {
    sheetLog.clear();
  }
}

// Each recipe edits the panel, any "Present" button opens a sheet with the whole panel applied
@Component({
  selector: 'SheetPanel',
  standalone: true,
  imports: [
    ActionButton,
    BackgroundCounter,
    LabeledChoice,
    Recipe,
    SheetLog,
    SwitchRow,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <BackgroundCounter></BackgroundCounter>
    <Recipe [recipe]="detentsRecipe">
      <LabeledChoice
        testID="sheet-detents"
        label="sheetAllowedDetents"
        [value]="settings().detents"
        [options]="detentChoices"
        (valueChange)="update({ detents: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="sheet-present"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="initialRecipe">
      <LabeledChoice
        testID="sheet-initial"
        label="sheetInitialDetentIndex"
        [value]="settings().initialDetent"
        [options]="initialChoices"
        (valueChange)="update({ initialDetent: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="sheet-present-initial"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="undimmedRecipe">
      <LabeledChoice
        testID="sheet-undimmed"
        label="sheetLargestUndimmedDetentIndex"
        [value]="settings().undimmed"
        [options]="undimmedChoices"
        (valueChange)="update({ undimmed: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="sheet-present-undimmed"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="grabberRecipe">
      <SwitchRow
        testID="sheet-grabber"
        label="sheetGrabberVisible"
        [value]="settings().isGrabberVisible"
        (valueChange)="update({ isGrabberVisible: $event })"
        [color]="color"
      ></SwitchRow>
      <LabeledChoice
        testID="sheet-radius"
        label="sheetCornerRadius"
        [value]="settings().cornerRadius"
        [options]="radiusChoices"
        (valueChange)="update({ cornerRadius: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="sheet-present-grabber"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="expandRecipe">
      <SwitchRow
        testID="sheet-expand"
        label="sheetExpandsWhenScrolledToEdge"
        [value]="settings().isExpandsOnScroll"
        (valueChange)="update({ isExpandsOnScroll: $event })"
        [color]="color"
      ></SwitchRow>
      <ActionButton
        testID="sheet-present-expand"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="contentRecipe">
      <LabeledChoice
        testID="sheet-content-style"
        label="contentStyle"
        [value]="settings().contentStyle"
        [options]="contentStyles"
        (valueChange)="update({ contentStyle: $event })"
        [color]="color"
      ></LabeledChoice>
      <ActionButton
        testID="sheet-present-content"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="eventsRecipe">
      <SheetLog></SheetLog>
    </Recipe>
    <Recipe [recipe]="footerRecipe">
      <SwitchRow
        testID="sheet-footer"
        label="sheetFooter"
        [value]="settings().hasFooter"
        (valueChange)="update({ hasFooter: $event })"
        [color]="color"
      ></SwitchRow>
      <ActionButton
        testID="sheet-present-footer"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="androidRecipe">
      <LabeledChoice
        testID="sheet-elevation"
        label="sheetElevation"
        [value]="settings().elevation"
        [options]="elevationChoices"
        (valueChange)="update({ elevation: $event })"
        [color]="color"
      ></LabeledChoice>
      <SwitchRow
        testID="sheet-overflow"
        label="sheetShouldOverflowTopInset"
        [value]="settings().isOverflowTopInset"
        (valueChange)="update({ isOverflowTopInset: $event })"
        [color]="color"
      ></SwitchRow>
      <SwitchRow
        testID="sheet-resize-animation"
        label="sheetDefaultResizeAnimationEnabled"
        [value]="settings().isDefaultResizeAnimation"
        (valueChange)="update({ isDefaultResizeAnimation: $event })"
        [color]="color"
      ></SwitchRow>
      <ActionButton
        testID="sheet-present-android"
        title="Present a sheet"
        (press)="present()"
        [color]="color"
      ></ActionButton>
    </Recipe>
    <Recipe [recipe]="stackingRecipe">
      <text class="info-text">
        Present a sheet, then use Present another sheet inside it.
      </text>
    </Recipe>
  `,
})
export class SheetPanel {
  private readonly route = injectRouteSettings(readSheetSettings);

  readonly settings = this.route.settings;
  readonly update = this.route.update;
  readonly color = COLOR;
  readonly detentChoices = DETENT_CHOICES;
  readonly initialChoices = INITIAL_CHOICES;
  readonly undimmedChoices = UNDIMMED_CHOICES;
  readonly radiusChoices = RADIUS_CHOICES;
  readonly contentStyles = CONTENT_STYLES;
  readonly elevationChoices = ELEVATION_CHOICES;
  readonly detentsRecipe = recipeById('sheet-detents');
  readonly initialRecipe = recipeById('sheet-initial');
  readonly undimmedRecipe = recipeById('sheet-undimmed');
  readonly grabberRecipe = recipeById('sheet-grabber');
  readonly expandRecipe = recipeById('sheet-expand-scroll');
  readonly contentRecipe = recipeById('sheet-content-style');
  readonly eventsRecipe = recipeById('sheet-events');
  readonly footerRecipe = recipeById('sheet-footer');
  readonly androidRecipe = recipeById('sheet-android');
  readonly stackingRecipe = recipeById('sheet-stacking');

  present(): void {
    this.route.navigation.push(
      ROUTE_NAME.SheetDemo,
      sheetParamsOf(this.settings()),
    );
  }
}
