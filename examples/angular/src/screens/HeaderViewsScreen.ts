import { Component, viewChild } from '@angular/core';
import type { AfterViewInit, TemplateRef } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import type {
  INavigatorHandle,
  IScreenOptionsResolver,
} from '@symbiote-native/navigation/angular';
import { HeaderTapView } from '../components/HeaderTapView';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { BACK_ARROW_SOURCE } from './header-views/back-arrow';
import { BackRecipes } from './header-views/BackRecipes';
import {
  headerOptionsOf,
  navBarFillOf,
  readHeaderViewsSettings,
  VIEW_KIND,
} from './header-views/header-views-settings';
import { LookRecipes } from './header-views/LookRecipes';
import { ViewRecipes } from './header-views/ViewRecipes';

// A header view is a template and the resolver runs outside any component
// So `HeaderViewTemplates` files its templates here once rendered, the resolver refills the handle
const viewCell: {
  left?: TemplateRef<unknown>;
  right?: TemplateRef<unknown>;
  title?: TemplateRef<unknown>;
  tapTarget?: INavigatorHandle;
} = {};

// The route params hold the panel state, so every switch re-runs this resolver
export const headerViewsScreenOptions: IScreenOptionsResolver = ({
  route,
  navigation,
}) => {
  const settings = readHeaderViewsSettings(route.params);
  viewCell.tapTarget = navigation;
  return {
    title: 'Header views',
    headerShown: true,
    headerTintColor: LINE_COLOR.presentation,
    headerTitleColor: '#ffffff',
    headerStyle: navBarFillOf(settings),
    headerUserInterfaceStyle: 'dark',
    ...headerOptionsOf(settings),
    headerBackImageSource: settings.isBackImageCustom
      ? BACK_ARROW_SOURCE
      : undefined,
    headerLeft: settings.left === VIEW_KIND ? viewCell.left : undefined,
    headerRight: settings.right === VIEW_KIND ? viewCell.right : undefined,
    headerTitle: settings.title === VIEW_KIND ? viewCell.title : undefined,
  };
};

// Rendered once beside the stack, App lists it in `OPTION_TEMPLATE_HOSTS`
@Component({
  selector: 'HeaderViewTemplates',
  standalone: true,
  imports: [HeaderTapView],
  template: `
    <ng-template #left>
      <HeaderTapView
        testID="header-views-left-view"
        label="Left"
        (press)="tapped('left')"
      ></HeaderTapView>
    </ng-template>
    <ng-template #right>
      <HeaderTapView
        testID="header-views-right-view"
        label="Right"
        (press)="tapped('right')"
      ></HeaderTapView>
    </ng-template>
    <ng-template #title>
      <HeaderTapView
        testID="header-views-title-view"
        label="Custom title"
        (press)="tapped('title')"
      ></HeaderTapView>
    </ng-template>
  `,
})
export class HeaderViewTemplates implements AfterViewInit {
  private readonly left = viewChild.required<TemplateRef<unknown>>('left');
  private readonly right = viewChild.required<TemplateRef<unknown>>('right');
  private readonly title = viewChild.required<TemplateRef<unknown>>('title');

  ngAfterViewInit(): void {
    viewCell.left = this.left();
    viewCell.right = this.right();
    viewCell.title = this.title();
  }

  tapped(name: string): void {
    viewCell.tapTarget?.setParams({ lastTap: name });
  }
}

// A scroll view first and nothing wrapping it, which a large title needs to collapse
@Component({
  selector: 'HeaderViewsScreen',
  standalone: true,
  imports: [
    BackRecipes,
    LookRecipes,
    ScreenHero,
    ViewRecipes,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <scroll-view
      testID="header-views-scroll"
      class="screen"
      contentInsetAdjustmentBehavior="automatic"
    >
      <view class="scroll-content">
        <ScreenHero
          [route]="route"
          title="Header views"
          body="What fills the native header and how it looks. Each switch rewrites the route params and the header follows."
        ></ScreenHero>
        <ViewRecipes></ViewRecipes>
        <BackRecipes></BackRecipes>
        <LookRecipes></LookRecipes>
      </view>
    </scroll-view>
  `,
})
export class HeaderViewsScreen {
  readonly route = ROUTE_NAME.HeaderViews;
}
