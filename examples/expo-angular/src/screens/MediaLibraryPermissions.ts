import { Component, computed, effect, signal } from '@angular/core';
import {
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
} from '@symbiote-native/media-library/angular';
import type {
  IGranularPermission,
  IMediaLibraryNextPermissionResponse,
} from '@symbiote-native/media-library/angular';
import { CallConsole } from '../components/CallConsole';
import { Card } from '../components/Card';
import { ResultRow } from '../components/ResultRow';
import { ToggleRow } from '../components/ToggleRow';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';

const GRANULAR: IGranularPermission[] = ['photo', 'video'];

@Component({
  selector: 'MediaLibraryPermissions',
  standalone: true,
  imports: [CallConsole, Card, ResultRow, ToggleRow],
  template: `
    <Card testID="media-library-permissions-card" title="Permissions">
      <ToggleRow
        testID="media-library-write-only-switch"
        label="writeOnly"
        [(value)]="isWriteOnly"
        [color]="color"
      />
      <ResultRow
        testID="media-library-permission-hook"
        label="usePermissions"
        [value]="permissionText()"
      />
    </Card>
    <CallConsole
      prefix="media-library-permission-calls"
      title="Permission calls"
      [color]="color"
      hint="granularPermissions (photo, video) only matter on Android 13+."
      [calls]="calls"
    />
  `,
})
export class MediaLibraryPermissions {
  readonly color = lineColorOf(ROUTE_NAME.MediaLibrary);

  readonly isWriteOnly = signal(false);
  private readonly permission =
    signal<IMediaLibraryNextPermissionResponse | null>(null);
  private readonly granular = computed(() =>
    this.isWriteOnly() ? undefined : GRANULAR,
  );

  readonly permissionText = computed(() => {
    const permission = this.permission();
    return permission === null
      ? 'loading…'
      : `${permission.status}, access ${permission.accessPrivileges ?? 'n/a'}`;
  });

  readonly calls = [
    {
      label: 'getPermissionsAsync',
      run: () => getPermissionsAsync(this.isWriteOnly(), this.granular()),
    },
    {
      label: 'requestPermissionsAsync',
      run: () => requestPermissionsAsync(this.isWriteOnly(), this.granular()),
    },
    {
      label: 'presentPermissionsPicker',
      run: () => presentPermissionsPicker(),
    },
  ];

  constructor() {
    // Reloads the status whenever `writeOnly` flips, ignoring a stale answer
    effect(onCleanup => {
      const writeOnly = this.isWriteOnly();
      const granularPermissions = this.granular();
      let isStale = false;
      onCleanup(() => {
        isStale = true;
      });
      this.permission.set(null);
      void getPermissionsAsync(writeOnly, granularPermissions).then(
        response => {
          if (!isStale) {
            this.permission.set(response);
          }
        },
      );
    });
  }
}
