const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const REQUIRED_PRODUCTION_ENV = [
  'JWT_EXPIRES_IN',
  'NODE_ENV',
  'PORT',
];

const CLOUDINARY_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

export function validateEnv(config: Record<string, unknown>) {
  const nodeEnv = String(config.NODE_ENV ?? 'development');

  if (nodeEnv !== 'test') {
    const missing = REQUIRED_ENV.filter((key) => !config[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  if (nodeEnv === 'production') {
    const missing = REQUIRED_PRODUCTION_ENV.filter((key) => !config[key]);
    const hasCorsOrigin = Boolean(config.CORS_ORIGIN || config.FRONTEND_URL);
    const hasAnyCloudinaryConfig = CLOUDINARY_ENV.some((key) => config[key]);
    const missingCloudinary = hasAnyCloudinaryConfig
      ? CLOUDINARY_ENV.filter((key) => !config[key])
      : [];

    if (!hasCorsOrigin) {
      missing.push('CORS_ORIGIN or FRONTEND_URL');
    }

    if (missingCloudinary.length > 0) {
      missing.push(...missingCloudinary);
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missing.join(', ')}`,
      );
    }
  }

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: Number(config.PORT ?? 5000),
  };
}
