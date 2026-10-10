/**
 * Hybrid logical clock: a wall-clock millisecond plus a counter, so a device's
 * timestamps keep increasing even when its clock jumps back, and never fall
 * behind a timestamp it has received. Conflicting edits resolve to the later
 * HLC (ADR 0001); the device id breaks exact ties.
 */

export interface Hlc {
  wallTime: number;
  counter: number;
  deviceId: string;
}

const WALL_TIME_DIGITS = 15;
const COUNTER_DIGITS = 6;
const HLC_PATTERN = new RegExp(`^(\\d{${WALL_TIME_DIGITS}})-(\\d{${COUNTER_DIGITS}})-(.+)$`);

export const initialHlc = (deviceId: string): Hlc => ({ wallTime: 0, counter: 0, deviceId });

/** The timestamp for a local write. */
export function tickHlc(clock: Hlc, now: number): Hlc {
  if (now > clock.wallTime) return { ...clock, wallTime: now, counter: 0 };
  return { ...clock, counter: clock.counter + 1 };
}

/** The device's clock after seeing a timestamp from another device. */
export function receiveHlc(clock: Hlc, remote: Hlc, now: number): Hlc {
  const wallTime = Math.max(clock.wallTime, remote.wallTime, now);
  const localCounter = clock.wallTime === wallTime ? clock.counter : -1;
  const remoteCounter = remote.wallTime === wallTime ? remote.counter : -1;
  return { ...clock, wallTime, counter: Math.max(localCounter, remoteCounter) + 1 };
}

export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime;
  if (a.counter !== b.counter) return a.counter - b.counter;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId < b.deviceId ? -1 : 1;
}

/** Fixed-width, so formatted timestamps sort as strings the way compareHlc orders them. */
export function formatHlc(hlc: Hlc): string {
  const wallTime = String(hlc.wallTime).padStart(WALL_TIME_DIGITS, "0");
  const counter = String(hlc.counter).padStart(COUNTER_DIGITS, "0");
  return `${wallTime}-${counter}-${hlc.deviceId}`;
}

export const isHlc = (formatted: string): boolean => HLC_PATTERN.test(formatted);

export function parseHlc(formatted: string): Hlc {
  const match = HLC_PATTERN.exec(formatted);
  if (!match) throw new Error(`Not a hybrid logical clock timestamp: ${formatted}`);
  const [, wallTime = "", counter = "", deviceId = ""] = match;
  return {
    // eslint-disable-next-line arch/no-ad-hoc-money-parse -- a clock reading, not an amount
    wallTime: Number(wallTime),
    // eslint-disable-next-line arch/no-ad-hoc-money-parse -- a clock counter, not an amount
    counter: Number(counter),
    deviceId,
  };
}
