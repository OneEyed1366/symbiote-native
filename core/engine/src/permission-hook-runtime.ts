// Framework-agnostic twin of expo-modules-core's `usePermission` method-dispatch. Every Expo
// wrapper package's hook/composable/primitive/service imports this, no per-package copy left

export type IPermissionHookBehavior = {
  /** Auto-fetch the current status on mount without asking the user. @default true */
  get?: boolean;
  /** Auto-request the user to grant permission on mount. @default false */
  request?: boolean;
};

export type IPermissionHookMethods<TPermission, TOptions extends object> = {
  getMethod: (options?: TOptions) => Promise<TPermission>;
  requestMethod: (options?: TOptions) => Promise<TPermission>;
};

export type IPermissionHookOptions<TOptions extends object> =
  IPermissionHookBehavior & TOptions;

// `behavior`/`methodOptions` come pre-split from the caller, where the concrete `TOptions` shape
// is known - splitting a generic intersection here would need an unprovable
// `Omit<IPermissionHookOptions<TOptions>, 'get' | 'request'>` -> `TOptions` cast
export type IPermissionApi<TPermission, TOptions extends object> = {
  get: (methodOptions?: TOptions) => Promise<TPermission>;
  request: (methodOptions?: TOptions) => Promise<TPermission>;
};

// The one piece every adapter's hook/composable/primitive would otherwise re-wrap by hand:
// call the method, commit its response to whichever state primitive `setStatus` closes over
export function createPermissionApi<TPermission, TOptions extends object>(
  methods: IPermissionHookMethods<TPermission, TOptions>,
  setStatus: (value: TPermission) => void,
): IPermissionApi<TPermission, TOptions> {
  async function run(
    method: (methodOptions?: TOptions) => Promise<TPermission>,
    methodOptions?: TOptions,
  ): Promise<TPermission> {
    const response = await method(methodOptions);
    setStatus(response);
    return response;
  }

  return {
    get: methodOptions => run(methods.getMethod, methodOptions),
    request: methodOptions => run(methods.requestMethod, methodOptions),
  };
}

export async function resolveInitialPermission<
  TPermission,
  TOptions extends object,
>(
  methods: IPermissionHookMethods<TPermission, TOptions>,
  behavior: IPermissionHookBehavior,
  methodOptions: TOptions | undefined,
): Promise<TPermission | null> {
  const { get = true, request = false } = behavior;
  if (!request && !get) return null;
  const method = request ? methods.requestMethod : methods.getMethod;
  return methodOptions !== undefined && Object.keys(methodOptions).length > 0
    ? method(methodOptions)
    : method();
}

// The result shape every framework adapter's `createPermissionHook` factory returns
export type IPermissionHookResult<TPermission> = [
  TPermission | null,
  () => Promise<TPermission>,
  () => Promise<TPermission>,
];

// The mount-time dispatch every adapter's `createPermissionHook` factory ran identically
// (defaulting `get`/`request`, calling `resolveInitialPermission`, committing a truthy response) -
// `commit` is the one part that's actually framework-specific
// `writeOnly` is the one option shape more than one Expo-wrapper package's permission hook
// forwards (calendar, media-library) - concrete, not generic, so no unprovable-cast split needed
export type IWriteOnlyPermissionOptions = { writeOnly?: boolean };

export function splitWriteOnlyPermissionOptions(
  options?: IPermissionHookOptions<IWriteOnlyPermissionOptions>,
): [IPermissionHookBehavior, IWriteOnlyPermissionOptions | undefined] {
  const { get, request, writeOnly } = options ?? {};
  return [
    { get, request },
    writeOnly === undefined ? undefined : { writeOnly },
  ];
}

export function fetchInitialPermission<TPermission, TOptions extends object>(
  methods: IPermissionHookMethods<TPermission, TOptions>,
  behavior: IPermissionHookBehavior | undefined,
  methodOptions: TOptions | undefined,
  commit: (value: TPermission) => void,
): void {
  resolveInitialPermission(
    methods,
    { get: behavior?.get ?? true, request: behavior?.request ?? false },
    methodOptions,
  ).then(response => {
    if (response) commit(response);
  });
}
