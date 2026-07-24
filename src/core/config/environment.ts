/**
 * Single definition of "we are live", used to gate developer tooling that must
 * never be reachable in production (Swagger + its pre-authorised admin token,
 * the Bull Board queue dashboard).
 *
 * Reads process.env directly rather than ConfigService: the callers are Nest's
 * module decorators and the bootstrap function, both of which run outside the
 * DI graph.
 */
export function isProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Whether developer tooling may be mounted. Deliberately opt-IN rather than
 * "not production": the live droplet runs with NODE_ENV=dev, so a
 * production-only gate would have silently left Swagger — which serves a
 * never-expiring admin JWT — open to the internet. Absent flag means closed.
 *
 * Set ENABLE_DEV_TOOLS=true locally to get Swagger and /queues back.
 */
export function areDevToolsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isProductionEnvironment(env)) {
    return false;
  }
  return env.ENABLE_DEV_TOOLS === 'true';
}
