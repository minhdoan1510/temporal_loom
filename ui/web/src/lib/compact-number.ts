const COMPACT_UNITS = [
  { value: 1_000_000_000_000, suffix: "nghìn tỷ" },
  { value: 1_000_000_000, suffix: "tỷ" },
  { value: 1_000_000, suffix: "triệu" },
  { value: 1_000, suffix: "nghìn" },
] as const;

export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  const unit = COMPACT_UNITS.find((item) => abs >= item.value);
  if (!unit) {
    return abs >= 100 || Number.isInteger(value) ? Math.round(value).toString() : value.toFixed(1);
  }

  return `${formatShortDecimal(value / unit.value)} ${unit.suffix}`;
}

function formatShortDecimal(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 1,
  }).format(value);
}
