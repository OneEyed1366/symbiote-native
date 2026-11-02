import { createSignal, Show } from 'solid-js';
import { useRoute } from '@symbiote-native/navigation/solid';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/solid';
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

export function OverlayContainersScreen() {
  const [isOverlayModal, setIsOverlayModal] = createSignal(false);
  const route = useRoute();
  return (
    <view class="screen">
      <scroll-view testID="overlays-scroll" class="screen">
        <view class="scroll-content">
          <ScreenHero
            route={ROUTE_NAME.OverlayContainers}
            title="Overlays and containers"
            body="What is drawn above a native modal and what holds screens without a navigator."
          />
          <ToastRecipes
            isOverlayModal={isOverlayModal()}
            onOverlayModalChange={value => setIsOverlayModal(value)}
          />
          <ContainerRecipe />
        </view>
      </scroll-view>
      <Show when={!readIsModal(route().params)}>
        <ToastHost isOverlayModal={isOverlayModal()} />
      </Show>
    </view>
  );
}
