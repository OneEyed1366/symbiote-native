// Bottom accessory of the native tab bar, an iOS 26 feature with one content view per environment
// Core decides if it exists and folds the view props, an adapter renders the app content inside

import { StyleSheet } from '@symbiote-native/engine';
import { wireTabsEvent } from './native-tabs-events';
import { IOS_PLATFORM } from './platform-names';

const ENVIRONMENTS = ['regular', 'inline'] as const;

export type ITabsBottomAccessoryEnvironment = (typeof ENVIRONMENTS)[number];

export type ITabsBottomAccessoryEnvironmentEvent = {
  environment: ITabsBottomAccessoryEnvironment;
};

export type ITabsBottomAccessoryInput = {
  os: string;
  osVersion: string | number;
  hasAccessory: boolean;
  onEnvironmentChange?: (event: ITabsBottomAccessoryEnvironmentEvent) => void;
};

export type ITabsBottomAccessoryContent = {
  environment: ITabsBottomAccessoryEnvironment;
  viewName: string;
  props: Record<string, unknown>;
};

export type ITabsBottomAccessory = {
  viewName: string;
  props: Record<string, unknown>;
  contents: ITabsBottomAccessoryContent[];
};

const ACCESSORY_VIEW_NAME = 'RNSTabsBottomAccessory';
const CONTENT_VIEW_NAME = 'RNSTabsBottomAccessoryContent';
const MIN_IOS_VERSION = 26;

// An unknown environment reads as the regular one, which is the native default
function readEnvironmentChange(
  record: Record<string, unknown>,
): ITabsBottomAccessoryEnvironmentEvent {
  const environment = ENVIRONMENTS.find(name => name === record.environment);
  return { environment: environment ?? 'regular' };
}

function resolveContent(
  environment: ITabsBottomAccessoryEnvironment,
): ITabsBottomAccessoryContent {
  return {
    environment,
    viewName: CONTENT_VIEW_NAME,
    props: {
      environment,
      collapsable: false,
      style: [StyleSheet.absoluteFill],
    },
  };
}

export function resolveTabsBottomAccessory(
  input: ITabsBottomAccessoryInput,
): ITabsBottomAccessory | undefined {
  const isSupported =
    input.os === IOS_PLATFORM &&
    parseInt(String(input.osVersion), 10) >= MIN_IOS_VERSION;
  if (!input.hasAccessory || !isSupported) return undefined;
  const props: Record<string, unknown> = {
    collapsable: false,
    style: [StyleSheet.absoluteFill],
  };
  const onEnvironmentChange = wireTabsEvent(
    input.onEnvironmentChange,
    readEnvironmentChange,
  );
  if (onEnvironmentChange) props.onEnvironmentChange = onEnvironmentChange;
  return {
    viewName: ACCESSORY_VIEW_NAME,
    props,
    contents: ENVIRONMENTS.map(resolveContent),
  };
}
