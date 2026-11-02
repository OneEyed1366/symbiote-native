import { useState } from 'react';
import { useRoute } from '@symbiote-native/navigation/react';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/react';
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
  const [isOverlayModal, setIsOverlayModal] = useState(false);
  const isModal = readIsModal(useRoute().params);
  return (
    <view className="screen">
      <scroll-view testID="overlays-scroll" className="screen">
        <view className="scroll-content">
          <ScreenHero
            route={ROUTE_NAME.OverlayContainers}
            title="Overlays and containers"
            body="What is drawn above a native modal and what holds screens without a navigator."
          />
          <ToastRecipes
            isOverlayModal={isOverlayModal}
            onOverlayModalChange={setIsOverlayModal}
          />
          <ContainerRecipe />
        </view>
      </scroll-view>
      {!isModal && <ToastHost isOverlayModal={isOverlayModal} />}
    </view>
  );
}
