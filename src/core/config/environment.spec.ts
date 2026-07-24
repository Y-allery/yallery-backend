import { areDevToolsEnabled, isProductionEnvironment } from './environment';

describe('isProductionEnvironment', () => {
  it('is true only for the exact production marker', () => {
    expect(isProductionEnvironment({ NODE_ENV: 'production' })).toBe(true);
  });

  it('treats dev/test/unset environments as non-production', () => {
    expect(isProductionEnvironment({ NODE_ENV: 'dev' })).toBe(false);
    expect(isProductionEnvironment({ NODE_ENV: 'development' })).toBe(false);
    expect(isProductionEnvironment({ NODE_ENV: 'test' })).toBe(false);
    expect(isProductionEnvironment({})).toBe(false);
  });
});

describe('areDevToolsEnabled', () => {
  it('is closed by default, including when NODE_ENV is the droplet value "dev"', () => {
    expect(areDevToolsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(areDevToolsEnabled({ NODE_ENV: 'dev' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });

  it('opens only on the explicit opt-in flag', () => {
    expect(
      areDevToolsEnabled({
        NODE_ENV: 'dev',
        ENABLE_DEV_TOOLS: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      areDevToolsEnabled({ ENABLE_DEV_TOOLS: '1' } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('never opens in production even with the flag set', () => {
    expect(
      areDevToolsEnabled({
        NODE_ENV: 'production',
        ENABLE_DEV_TOOLS: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});
