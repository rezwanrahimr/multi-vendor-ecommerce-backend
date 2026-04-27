const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];

export function validateEnv(config: Record<string, unknown>) {
  const nodeEnv = String(config.NODE_ENV ?? 'development');

  if (nodeEnv !== 'test') {
    const missing = REQUIRED_ENV.filter((key) => !config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: Number(config.PORT ?? 5000),
  };
}
