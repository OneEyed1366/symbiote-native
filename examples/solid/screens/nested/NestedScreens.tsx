import {
  Stack,
  useNavigation,
  useStackNavigation,
} from '@symbiote-native/navigation/solid';
import { ActionButton } from '../../components/ActionButton';
import { LabeledChoice } from '../../components/LabeledChoice';
import { Recipe } from '../../components/Recipe';
import { ScreenHero } from '../../components/ScreenHero';
import { SwitchRow } from '../../components/SwitchRow';
import { LINE_COLOR } from '../../navigation-lines';
import { recipeById } from '../../navigation-recipes';
import { ROUTE_NAME } from '../../routes';
import { useNestedPanel } from './nested-panel';
import { CONTAINER_CHOICES, innerStackStyleOf } from './nested-settings';

const COLOR = LINE_COLOR.structure;
const INNER_ROOT = 'InnerRoot';
const INNER_DETAIL = 'InnerDetail';
const parentRecipe = recipeById('nested-parent');
const headerRecipe = recipeById('nested-double-header');
const containerRecipe = recipeById('nested-container');

const INNER_HEADER = {
  headerShown: true,
  headerTintColor: COLOR,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#13243a' },
  headerUserInterfaceStyle: 'dark',
} as const;

// This tab is the content of a root Stack screen, `getParent()` walks one hop up to that Stack
export function NestedHomeScreen() {
  const { settings, update } = useNestedPanel();
  const navigation = useNavigation();
  const parent = navigation().getParent();
  const canPopParent = parent !== undefined && 'pop' in parent;
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.NestedNavigators}
          title="Nested navigators"
          body="A Tab navigator inside a Stack screen, with a Stack inside one of its tabs."
        />
        <Recipe recipe={parentRecipe}>
          <text class="info-text">
            {`parent navigator reachable via getParent(): ${canPopParent ? 'yes (Stack)' : 'no'}`}
          </text>
          <ActionButton
            testID="nested-pop-parent"
            title="Pop parent Stack (via getParent)"
            onPress={() => {
              if (parent !== undefined && 'pop' in parent) parent.pop();
            }}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={headerRecipe}>
          <SwitchRow
            testID="nested-parent-header"
            label="headerShown of the parent screen"
            value={settings().isParentHeader}
            onChange={isParentHeader => update({ isParentHeader })}
            color={COLOR}
          />
        </Recipe>
        <Recipe recipe={containerRecipe}>
          <LabeledChoice
            testID="nested-container"
            label="nativeContainerStyle of the inner Stack"
            value={settings().container}
            options={CONTAINER_CHOICES}
            onChange={container => update({ container })}
            color={COLOR}
          />
        </Recipe>
      </view>
    </scroll-view>
  );
}

export function NestedInfoScreen() {
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Nested Tab · Info</text>
        <text class="info-text">
          A second tab, proving the nested Tab bar switches focus normally.
        </text>
      </view>
    </scroll-view>
  );
}

// Paints no background of its own, so the colour of the stack container shows through
function InnerRootScreen() {
  const navigation = useStackNavigation();
  return (
    <view class="nested-inner">
      <text class="section-label">Inner stack</text>
      <ActionButton
        testID="nested-inner-push"
        title="Push detail"
        onPress={() => navigation().push(INNER_DETAIL)}
        color={COLOR}
      />
    </view>
  );
}

function InnerDetailScreen() {
  const navigation = useStackNavigation();
  return (
    <view class="nested-inner">
      <text class="section-label">Inner detail</text>
      <ActionButton
        testID="nested-inner-pop"
        title="Pop"
        onPress={() => navigation().pop()}
        color={COLOR}
      />
    </view>
  );
}

export function NestedInnerStack() {
  const { settings } = useNestedPanel();
  return (
    <Stack nativeContainerStyle={innerStackStyleOf(settings())}>
      <Stack.Screen
        name={INNER_ROOT}
        component={InnerRootScreen}
        options={{ title: 'Inner stack', ...INNER_HEADER }}
      />
      <Stack.Screen
        name={INNER_DETAIL}
        component={InnerDetailScreen}
        options={{ title: 'Inner detail', ...INNER_HEADER }}
      />
    </Stack>
  );
}
