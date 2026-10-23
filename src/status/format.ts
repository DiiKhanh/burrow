import { strings } from "../strings";

const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
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

function valid(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}
