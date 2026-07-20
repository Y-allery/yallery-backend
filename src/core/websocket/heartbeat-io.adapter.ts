import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * A backgrounded iOS app is frozen but its socket still counts as connected
 * until the heartbeat gives up — with socket.io's defaults (25s interval +
 * 20s timeout) that is a ~45s window in which the gateway believes the user
 * is online, emits into the void, and never flags the result as undelivered.
 *
 * Tightening the heartbeat shrinks that window. It does not close it — only
 * acknowledged delivery does that — so this is a mitigation, not the fix.
 *
 * The values are a deliberate middle ground: aggressive enough to cut the
 * window roughly in half, conservative enough that a phone on a flaky mobile
 * network is not disconnected for one late pong (each disconnect costs a
 * reconnect plus a joinRoom replay).
 */
export class HeartbeatIoAdapter extends IoAdapter {
  private static readonly PING_INTERVAL_MS = 15000;
  private static readonly PING_TIMEOUT_MS = 10000;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    return super.createIOServer(port, {
      ...options,
      pingInterval: HeartbeatIoAdapter.PING_INTERVAL_MS,
      pingTimeout: HeartbeatIoAdapter.PING_TIMEOUT_MS,
    });
  }
}
