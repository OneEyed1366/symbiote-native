import { Show } from 'solid-js';
import { useRoute } from '@symbiote-native/navigation/solid';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/solid';
import { ScreenHero } from '../components/ScreenHero';
import { LINE_COLOR } from '../navigation-lines';
import { ROUTE_NAME } from '../routes';
import { SheetBody } from './sheet/SheetBody';
import { SheetPanel } from './sheet/SheetPanel';
import { readSheetSettings, sheetOptionsOf } from './sheet/sheet-settings';
import { sheetLog } from './sheet/use-sheet-log';

function renderFooter() {
  return (
    <view testID="sheet-footer-bar" class="sheet-footer">
      <text class="sheet-footer-text">Sheet footer</text>
    </view>
  );
}

// The panel is a plain screen, a sheet is the same route pushed again with the panel as params
// The header stays opaque, a `formSheet` has its own header height accounting
export const sheetDemoScreenOptions: IScreenOptionsResolver = ({ route }) => {
  const settings = readSheetSettings(route.params);
  return {
    title: settings.isSheet ? 'Sheet' : 'Sheet presentation',
    headerShown: true,
    headerTintColor: LINE_COLOR.presentation,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
    ...sheetOptionsOf(settings),
    sheetFooter: settings.isSheet && settings.hasFooter ? renderFooter : undefined,
    onSheetDetentChanged: ({ index, isStable }) =>
      sheetLog.append(
        'detent',
        `detent ${index}, ${isStable ? 'stable' : 'moving'}`,
        { isTick: !isStable },
      ),
  };
};

// The scroll view is the first child with no `SafeAreaView` above it, so a taller detent fills it
export function SheetDemoScreen() {
  const route = useRoute();
  return (
    <scroll-view testID="sheet-scroll" class="screen">
      <Show
        when={readSheetSettings(route().params).isSheet}
        fallback={
          <view class="scroll-content">
            <ScreenHero
              route={ROUTE_NAME.SheetDemo}
              title="Sheet presentation"
              body="Pick how the sheet looks and behaves, then present it. A sheet is this route pushed again."
            />
            <SheetPanel />
          </view>
        }
      >
        <SheetBody />
      </Show>
    </scroll-view>
  );
}
