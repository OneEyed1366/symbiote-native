// The get/request wrapper every adapter's `usePermissions` needs, extracted once so
// `src/vue`/`src/solid`/`src/svelte`/`src/react` each supply only their own state primitive

export type IPermissionsApi<TPermission> = {
  get: () => Promise<TPermission>;
  request: () => Promise<TPermission>;
};

export function createPermissionsApi<TPermission>(
  getMethod: () => Promise<TPermission>,
  requestMethod: () => Promise<TPermission>,
  record: (response: TPermission) => void,
): IPermissionsApi<TPermission> {
  return {
    get: async () => {
      const response = await getMethod();
      record(response);
      return response;
    },
    request: async () => {
      const response = await requestMethod();
      record(response);
      return response;
    },
  };
}
