export default () => ({
  app: {
    name: 'HelloFeni API',
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 5000),
    corsOrigin: process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? '*',
  },
});
