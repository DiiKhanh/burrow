// Sizes and speeds as Finder shows them: decimal units (1 KB = 1000 bytes),
// en-US, at most three significant digits.
import { strings } from "./strings";

const [BYTE, ...BYTE_MULTIPLES] = strings.units.bytes;
const STEP = 1000;

const threeSignificantDigits = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "12.6 GB", "860 MB", "999 B"; "-" for a missing or invalid size. */
export function formatBytes(bytes: number | null): string {
  if (!isQuantity(bytes)) return strings.unavailable;
  if (Math.round(bytes) < STEP) return `${Math.round(bytes)} ${BYTE}`;
  return scale(bytes / STEP, BYTE_MULTIPLES);
}

/** "1.5 KB/s", "45.3 MB/s"; "-" for a missing or invalid speed. */
export function formatSpeed(bytesPerSecond: number | null): string {
  if (!isQuantity(bytesPerSecond)) return strings.unavailable;
  return scale(bytesPerSecond / STEP, strings.units.speed);
}

/** "30" for 30.16 percent; the unit is shown apart. "-" for a missing value. */
export function formatPercent(percent: number | null): string {
  return isQuantity(percent) ? wholeNumber.format(percent) : strings.unavailable;
}

/** "3.76": a load average, as Activity Monitor shows it. "-" for a missing value. */
export function formatLoad(load: number | null): string {
  return isQuantity(load) ? twoDecimals.format(load) : strings.unavailable;
}

function isQuantity(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

/** Formats value in the first unit, moving up a unit while it rounds to 1000 or more. */
function scale(value: number, units: readonly string[]): string {
  let unit = 0;
  let scaled = value;
  while (roundToSignificant(scaled) >= STEP && unit < units.length - 1) {
    scaled /= STEP;
    unit++;
  }
  return `${threeSignificantDigits.format(scaled)} ${units[unit]}`;
}

function roundToSignificant(value: number): number {
  return Number(value.toPrecision(3));
}
