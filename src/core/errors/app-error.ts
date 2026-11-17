export class AppError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toSafeError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  // SQLite/Drizzle may wrap a trigger failure. Only translate our exact, fixed
  // integrity tokens, never arbitrary database messages or source text.
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth += 1) {
    const token = cause.message.trim();
    if (/^(DEMAND_[A-Z_]+|INVALID_CAMPAIGN_STATE)$/u.test(token))
      return {
        code: token,
        message: 'A operação foi bloqueada para preservar a Demanda e sua proveniência.',
      };
    cause = cause.cause;
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Ocorreu um erro interno. Consulte os logs locais para obter ajuda.',
  };
}
