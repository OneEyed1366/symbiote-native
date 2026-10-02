import { Component } from '@angular/core';
import {
  clearSharedPayloads,
  getResolvedSharedPayloadsAsync,
  getSharedPayloads,
  injectIncomingShare,
} from '@symbiote-native/sharing/angular';
import type { IResolvedSharePayload } from '@symbiote-native/sharing/angular';
import { ActionButton } from '../components/ActionButton';
import { CallConsole } from '../components/CallConsole';
import { ResultRow } from '../components/ResultRow';
import { Scenario } from '../components/Scenario';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

@Component({
  selector: 'SharingIncomingCards',
  standalone: true,
  imports: [ActionButton, CallConsole, ResultRow, Scenario],
  template: `
    <Scenario
      testID="sharing-incoming-card"
      title="Receive what other apps share into yours"
      why="Appear in the share sheet so users can send a link, text or image straight into the app. The host app needs a share target (iOS Share Extension, Android intent filter), which this package does not generate."
      [steps]="steps"
      expect="The shared payload count goes up and each item is listed with its type and value. Clear empties the list."
    >
      <ResultRow
        testID="sharing-incoming-count"
        label="sharedPayloads"
        [value]="'' + incoming().sharedPayloads.length"
      />
      <ResultRow
        testID="sharing-incoming-resolving"
        label="isResolving"
        [value]="'' + incoming().isResolving"
      />
      <ResultRow
        testID="sharing-incoming-error"
        label="error"
        [value]="incoming().error?.message ?? 'none'"
      />
      <ResultRow
        testID="sharing-incoming-resolved"
        label="resolvedSharedPayloads"
        [value]="'' + incoming().resolvedSharedPayloads.length"
      />
      @for (
        payload of incoming().resolvedSharedPayloads;
        track $index;
        let index = $index
      ) {
        @for (row of rowsOf(payload); track row[0]) {
          <ResultRow
            [testID]="'sharing-payload-' + index + '-' + row[0]"
            [label]="row[0]"
            [value]="row[1]"
          />
        }
      }
      <ActionButton
        testID="sharing-incoming-refresh"
        title="refreshSharePayloads"
        [color]="color"
        (press)="incoming().refreshSharePayloads()"
      />
      <ActionButton
        testID="sharing-incoming-clear"
        title="clearSharedPayloads (hook)"
        [color]="color"
        (press)="incoming().clearSharedPayloads()"
      />
    </Scenario>
    <CallConsole
      prefix="sharing-incoming-calls"
      title="Imperative incoming share calls"
      [color]="color"
      [calls]="calls"
    />
  `,
})
export class SharingIncomingCards {
  readonly color = lineColorOf(ROUTE_NAME.Sharing);
  readonly incoming = injectIncomingShare();
  readonly steps = [
    'In another app, share some text or an image to this app',
    'Come back to this screen',
  ];

  readonly calls = [
    { label: 'getSharedPayloads', run: async () => getSharedPayloads() },
    {
      label: 'getResolvedSharedPayloadsAsync',
      run: () => getResolvedSharedPayloadsAsync(),
    },
    { label: 'clearSharedPayloads', run: async () => clearSharedPayloads() },
  ];

  rowsOf(payload: IResolvedSharePayload): [string, string][] {
    return [
      ['shareType', payload.shareType],
      ['value', payload.value],
      ['contentUri', String(payload.contentUri)],
      ['contentType', String(payload.contentType)],
      ['contentMimeType', String(payload.contentMimeType)],
      ['originalName', String(payload.originalName)],
      ['contentSize', String(payload.contentSize)],
    ];
  }
}
