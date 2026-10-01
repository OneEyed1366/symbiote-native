<script setup lang="ts">
import { WebBrowserPresentationStyle } from '@symbiote-native/web-browser';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import Field from '../components/Field.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { choices } from './web-browser-options';
import type { IOptionsForm, ISetOptions } from './web-browser-options';

defineProps<{ form: IOptionsForm; setForm: ISetOptions }>();

const color = lineColorOf(ROUTE_NAME.WebBrowser);
</script>

<template>
  <Card testID="web-browser-options-card" title="Browser options">
    <Field
      testID="web-browser-toolbar-input"
      label="toolbarColor"
      :value="form.toolbarColor"
      :onChange="toolbarColor => setForm({ toolbarColor })"
    />
    <Field
      testID="web-browser-secondary-input"
      label="secondaryToolbarColor (Android)"
      :value="form.secondaryToolbarColor"
      :onChange="secondaryToolbarColor => setForm({ secondaryToolbarColor })"
    />
    <Field
      testID="web-browser-controls-input"
      label="controlsColor (iOS)"
      :value="form.controlsColor"
      :onChange="controlsColor => setForm({ controlsColor })"
    />
    <Field
      testID="web-browser-package-input"
      label="browserPackage (Android)"
      :value="form.browserPackage"
      :onChange="browserPackage => setForm({ browserPackage })"
    />
    <ToggleRow
      testID="web-browser-collapse-switch"
      label="enableBarCollapsing"
      :value="form.enableBarCollapsing"
      :onChange="enableBarCollapsing => setForm({ enableBarCollapsing })"
      :color="color"
    />
    <ToggleRow
      testID="web-browser-title-switch"
      label="showTitle (Android)"
      :value="form.showTitle"
      :onChange="showTitle => setForm({ showTitle })"
      :color="color"
    />
    <ToggleRow
      testID="web-browser-share-switch"
      label="enableDefaultShareMenuItem (Android)"
      :value="form.enableDefaultShareMenuItem"
      :onChange="enableDefaultShareMenuItem => setForm({ enableDefaultShareMenuItem })"
      :color="color"
    />
    <ToggleRow
      testID="web-browser-recents-switch"
      label="showInRecents (Android)"
      :value="form.showInRecents"
      :onChange="showInRecents => setForm({ showInRecents })"
      :color="color"
    />
    <ToggleRow
      testID="web-browser-task-switch"
      label="createTask (Android)"
      :value="form.createTask"
      :onChange="createTask => setForm({ createTask })"
      :color="color"
    />
    <ToggleRow
      testID="web-browser-proxy-switch"
      label="useProxyActivity (Android)"
      :value="form.useProxyActivity"
      :onChange="useProxyActivity => setForm({ useProxyActivity })"
      :color="color"
    />
    <ToggleRow
      testID="web-browser-reader-switch"
      label="readerMode (iOS)"
      :value="form.readerMode"
      :onChange="readerMode => setForm({ readerMode })"
      :color="color"
    />
    <ChoiceRow
      testID="web-browser-dismiss-style"
      label="dismissButtonStyle (iOS)"
      :options="choices(['done', 'close', 'cancel'])"
      :value="form.dismissButtonStyle"
      :onChange="dismissButtonStyle => setForm({ dismissButtonStyle })"
      :color="color"
    />
    <ChoiceRow
      testID="web-browser-presentation"
      label="presentationStyle (iOS)"
      :options="choices(Object.values(WebBrowserPresentationStyle))"
      :value="form.presentationStyle"
      :onChange="presentationStyle => setForm({ presentationStyle })"
      :color="color"
    />
  </Card>
</template>
