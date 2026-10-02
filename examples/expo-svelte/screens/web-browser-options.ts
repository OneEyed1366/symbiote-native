import { WebBrowserPresentationStyle } from '@symbiote-native/web-browser';
import type { IAuthSessionOpenOptions } from '@symbiote-native/web-browser';

export const DEFAULT_STYLE = 'default';

export type IOptionsForm = {
  toolbarColor: string;
  secondaryToolbarColor: string;
  controlsColor: string;
  browserPackage: string;
  enableBarCollapsing: boolean;
  showTitle: boolean;
  enableDefaultShareMenuItem: boolean;
  showInRecents: boolean;
  createTask: boolean;
  useProxyActivity: boolean;
  readerMode: boolean;
  preferEphemeralSession: boolean;
  preferUniversalLinks: boolean;
  dismissButtonStyle: string;
  presentationStyle: string;
};
export type ISetOptions = (patch: Partial<IOptionsForm>) => void;

export const INITIAL_OPTIONS: IOptionsForm = {
  toolbarColor: '#0b1622',
  secondaryToolbarColor: '',
  controlsColor: '',
  browserPackage: '',
  enableBarCollapsing: true,
  showTitle: false,
  enableDefaultShareMenuItem: false,
  showInRecents: false,
  createTask: true,
  useProxyActivity: false,
  readerMode: false,
  preferEphemeralSession: false,
  preferUniversalLinks: false,
  dismissButtonStyle: DEFAULT_STYLE,
  presentationStyle: DEFAULT_STYLE,
};

const DISMISS_STYLES: readonly IAuthSessionOpenOptions['dismissButtonStyle'][] =
  ['done', 'close', 'cancel'];

function optional(text: string): string | undefined {
  return text.trim() === '' ? undefined : text.trim();
}

export function toOpenOptions(form: IOptionsForm): IAuthSessionOpenOptions {
  return {
    toolbarColor: optional(form.toolbarColor),
    secondaryToolbarColor: optional(form.secondaryToolbarColor),
    controlsColor: optional(form.controlsColor),
    browserPackage: optional(form.browserPackage),
    enableBarCollapsing: form.enableBarCollapsing,
    showTitle: form.showTitle,
    enableDefaultShareMenuItem: form.enableDefaultShareMenuItem,
    showInRecents: form.showInRecents,
    createTask: form.createTask,
    useProxyActivity: form.useProxyActivity,
    readerMode: form.readerMode,
    preferEphemeralSession: form.preferEphemeralSession,
    preferUniversalLinks: form.preferUniversalLinks,
    dismissButtonStyle: DISMISS_STYLES.find(
      style => style === form.dismissButtonStyle,
    ),
    presentationStyle: Object.values(WebBrowserPresentationStyle).find(
      style => style === form.presentationStyle,
    ),
  };
}

export function choices(values: readonly string[]) {
  return [DEFAULT_STYLE, ...values].map(value => ({ label: value, value }));
}
