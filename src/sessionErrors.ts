/** La sesión WIBI no se puede renovar. El HTTP debe responder 401 invalid_token. */
export class WibiSessionExpiredError extends Error {
  readonly oauthError = "invalid_token" as const;

  constructor(
    message = "Sesión WIBI inválida o expirada. Volvé a conectar el conector."
  ) {
    super(message);
    this.name = "WibiSessionExpiredError";
  }
}

export function isWibiSessionExpired(error: unknown): boolean {
  return (
    error instanceof WibiSessionExpiredError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: string }).name === "WibiSessionExpiredError")
  );
}

/** Rechazo definitivo de /auth/refresh. Un timeout o un corte de red no entra acá. */
export function isInvalidRefreshMessage(message: string): boolean {
  return /refresh token inv[aá]lido|refresh token expirado|inv[aá]lido o expirado/i.test(message);
}
