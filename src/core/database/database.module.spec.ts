import { resolveDatabasePoolSize } from './database.module';

describe('resolveDatabasePoolSize', () => {
  it('defaults to 40, well under the managed MySQL 151-connection cap', () => {
    expect(resolveDatabasePoolSize(undefined)).toBe(40);
    expect(resolveDatabasePoolSize('')).toBe(40);
  });

  it('honours DATABASE_POOL_SIZE', () => {
    expect(resolveDatabasePoolSize('80')).toBe(80);
  });

  it('ignores values that would leave the app with no usable pool', () => {
    expect(resolveDatabasePoolSize('0')).toBe(40);
    expect(resolveDatabasePoolSize('-5')).toBe(40);
    expect(resolveDatabasePoolSize('lots')).toBe(40);
  });
});
