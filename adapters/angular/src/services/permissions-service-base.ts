import { signal, type Signal } from '@angular/core';

// Общая часть сервисов разрешений всех Expo-пакетов, наследник передаёт пару методов
// Сбой автозапроса попадает в `error`, а не в unhandled rejection: null-статус с непустым `error`
// значит "запрос упал", а не "ещё не было"
export abstract class PermissionsServiceBase<TPermission, TOptions = void> {
  private readonly status = signal<TPermission | null>(null);
  private readonly fetchError = signal<Error | null>(null);
  private isAutoFetchStarted = false;

  readonly error: Signal<Error | null> = this.fetchError.asReadonly();

  protected constructor(
    private readonly getMethod: (options?: TOptions) => Promise<TPermission>,
    private readonly requestMethod: (
      options?: TOptions,
    ) => Promise<TPermission>,
  ) {}

  // Защёлка, а не проверка `status() === null`: упавший запрос оставляет null навсегда
  connect(): Signal<TPermission | null> {
    if (!this.isAutoFetchStarted) {
      this.isAutoFetchStarted = true;
      this.get().catch((cause: unknown) => {
        this.fetchError.set(
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      });
    }
    return this.status.asReadonly();
  }

  async get(options?: TOptions): Promise<TPermission> {
    return this.store(await this.getMethod(options));
  }

  async request(options?: TOptions): Promise<TPermission> {
    return this.store(await this.requestMethod(options));
  }

  private store(response: TPermission): TPermission {
    this.status.set(response);
    this.fetchError.set(null);
    return response;
  }
}
