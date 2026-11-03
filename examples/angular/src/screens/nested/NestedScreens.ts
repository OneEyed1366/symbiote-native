import { Component, computed } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  injectNavigation,
  injectStackNavigation,
  ScreenDirective,
  Stack,
} from '@symbiote-native/navigation/angular';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { ScreenHero } from '../../components/ScreenHero';
import { SwitchRow } from '../../components/SwitchRow';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { injectNestedPanel } from './nested-panel';
import { CONTAINER_CHOICES, innerStackStyleOf } from './nested-settings';

const COLOR = LINE_COLOR.structure;
const INNER_ROOT = 'InnerRoot';
const INNER_DETAIL = 'InnerDetail';

const INNER_HEADER = {
  headerShown: true,
  headerTintColor: COLOR,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#13243a' },
  headerUserInterfaceStyle: 'dark',
} as const;

// This tab is the content of a root Stack screen, `getParent()` walks one hop up to that Stack
@Component({
  selector: 'NestedHomeScreen',
  standalone: true,
  imports: [
    ActionButton,
    LabeledChoice,
    Recipe,
    ScreenHero,
    SwitchRow,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Nested navigators"
          body="A Tab navigator inside a Stack screen, with a Stack inside one of its tabs."
        ></ScreenHero>
        <Recipe [recipe]="parentRecipe">
          <text class="info-text">
            parent navigator reachable via getParent(): {{ parentText }}
          </text>
          <ActionButton
            testID="nested-pop-parent"
            title="Pop parent Stack (via getParent)"
            (press)="popParent()"
            [color]="color"
          ></ActionButton>
        </Recipe>
        <Recipe [recipe]="headerRecipe">
          <SwitchRow
            testID="nested-parent-header"
            label="headerShown of the parent screen"
            [value]="settings().isParentHeader"
            (valueChange)="update({ isParentHeader: $event })"
            [color]="color"
          ></SwitchRow>
        </Recipe>
        <Recipe [recipe]="containerRecipe">
          <LabeledChoice
            testID="nested-container"
            label="nativeContainerStyle of the inner Stack"
            [value]="settings().container"
            [options]="containerChoices"
            (valueChange)="update({ container: $event })"
            [color]="color"
          ></LabeledChoice>
        </Recipe>
      </view>
    </scroll-view>
  `,
})
export class NestedHomeScreen {
  private readonly panel = injectNestedPanel();
  private readonly parent = injectNavigation().getParent();

  readonly route = ROUTE_NAME.NestedNavigators;
  readonly settings = this.panel.settings;
  readonly update = this.panel.update;
  readonly color = COLOR;
  readonly containerChoices = CONTAINER_CHOICES;
  readonly parentRecipe = recipeById('nested-parent');
  readonly headerRecipe = recipeById('nested-double-header');
  readonly containerRecipe = recipeById('nested-container');
  readonly parentText =
    this.parent !== undefined && 'pop' in this.parent ? 'yes (Stack)' : 'no';

  popParent(): void {
    if (this.parent !== undefined && 'pop' in this.parent) this.parent.pop();
  }
}

@Component({
  selector: 'NestedInfoScreen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Nested Tab · Info</text>
        <text class="info-text">
          A second tab, proving the nested Tab bar switches focus normally.
        </text>
      </view>
    </scroll-view>
  `,
})
export class NestedInfoScreen {}

// Paints no background of its own, so the colour of the stack container shows through
@Component({
  selector: 'InnerRootScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="nested-inner">
      <text class="section-label">Inner stack</text>
      <ActionButton
        testID="nested-inner-push"
        title="Push detail"
        (press)="navigation.push(innerDetail)"
        [color]="color"
      ></ActionButton>
    </view>
  `,
})
export class InnerRootScreen {
  readonly navigation = injectStackNavigation();
  readonly color = COLOR;
  readonly innerDetail = INNER_DETAIL;
}

@Component({
  selector: 'InnerDetailScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <view class="nested-inner">
      <text class="section-label">Inner detail</text>
      <ActionButton
        testID="nested-inner-pop"
        title="Pop"
        (press)="navigation.pop()"
        [color]="color"
      ></ActionButton>
    </view>
  `,
})
export class InnerDetailScreen {
  readonly navigation = injectStackNavigation();
  readonly color = COLOR;
}

@Component({
  selector: 'NestedInnerStack',
  standalone: true,
  imports: [ScreenDirective, Stack],
  template: `
    <Stack [nativeContainerStyle]="containerStyle()">
      <ng-template
        symbioteScreen
        [name]="innerRoot"
        [component]="innerRootScreen"
        [options]="rootOptions"
      ></ng-template>
      <ng-template
        symbioteScreen
        [name]="innerDetail"
        [component]="innerDetailScreen"
        [options]="detailOptions"
      ></ng-template>
    </Stack>
  `,
})
export class NestedInnerStack {
  private readonly settings = injectNestedPanel().settings;

  readonly innerRoot = INNER_ROOT;
  readonly innerDetail = INNER_DETAIL;
  readonly innerRootScreen = InnerRootScreen;
  readonly innerDetailScreen = InnerDetailScreen;
  readonly rootOptions = { title: 'Inner stack', ...INNER_HEADER };
  readonly detailOptions = { title: 'Inner detail', ...INNER_HEADER };
  readonly containerStyle = computed(() => innerStackStyleOf(this.settings()));
}
