import { Component, computed, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { injectRoute } from '@symbiote-native/navigation/angular';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/angular';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { ContainerRecipe, ToastRecipes } from './overlays/OverlayRecipes';
import { ToastHost } from './overlays/ToastHost';
import { readIsModal } from './read-params';

// The same route opens twice, the second time as a modal that covers the first
export const overlayContainersScreenOptions: IScreenOptionsResolver = ({
  route,
}) => {
  const isModal = readIsModal(route.params);
  return {
    title: isModal ? 'Overlays (modal)' : 'Overlays and containers',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
    stackPresentation: isModal ? 'modal' : undefined,
  };
};

@Component({
  selector: 'OverlayContainersScreen',
  standalone: true,
  imports: [
    ContainerRecipe,
    ScreenHero,
    ToastHost,
    ToastRecipes,
    SYMBIOTE_ELEMENTS,
  ],
  template: `
    <view class="screen">
      <scroll-view testID="overlays-scroll" class="screen">
        <view class="scroll-content">
          <ScreenHero
            [route]="screenRoute"
            title="Overlays and containers"
            body="What is drawn above a native modal and what holds screens without a navigator."
          ></ScreenHero>
          <ToastRecipes
            [isOverlayModal]="isOverlayModal()"
            (overlayModalChange)="isOverlayModal.set($event)"
          ></ToastRecipes>
          <ContainerRecipe></ContainerRecipe>
        </view>
      </scroll-view>
      @if (!isModal()) {
        <ToastHost [isOverlayModal]="isOverlayModal()"></ToastHost>
      }
    </view>
  `,
})
export class OverlayContainersScreen {
  private readonly route = injectRoute();

  readonly screenRoute = ROUTE_NAME.OverlayContainers;
  readonly isOverlayModal = signal(false);
  readonly isModal = computed(() => readIsModal(this.route().params));
}
