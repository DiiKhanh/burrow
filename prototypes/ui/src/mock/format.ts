export function formatBytes(bytes: number): string {
  if (bytes < 1e3) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1e3;
  let unit = 0;
  while (value >= 1e3 && unit < units.length - 1) {
    value /= 1e3;
    unit++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function splitBytes(bytes: number): [string, string] {
  const [value, unit] = formatBytes(bytes).split(" ");
  return [value, unit];
}
