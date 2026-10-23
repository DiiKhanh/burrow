import { strings } from "../strings";

const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const threeSignificantDigits = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const wholeNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatWatts(value: number | null): string {
  return valid(value) ? oneDecimal.format(value) : strings.unavailable;
}

export function formatTemperature(value: number | null): string {
  return valid(value) ? wholeNumber.format(value) : strings.unavailable;
}

export function formatInteger(value: number | null): string {
  return valid(value) ? wholeNumber.format(value) : strings.unavailable;
}

/** "12.5%", "140%": a process's CPU, where 100% is one core. */
export function formatProcessCPU(value: number): string {
  return valid(value) ? `${threeSignificantDigits.format(value)}${strings.units.percent}` : strings.unavailable;
}

function valid(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}
