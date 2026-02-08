import { DEFAULT_STABILITY_CONFIG } from "./provider-stability";

export type ChartOptions = {
  maxPoints?: number;
  width?: number;
  height?: number;
};

export function renderBarChart(
  values: number[],
  labels: string[],
  options: ChartOptions = {}
): string {
  if (values.length === 0 || labels.length === 0) {
    return "";
  }

  const maxPoints = options.maxPoints ?? DEFAULT_STABILITY_CONFIG.maxChartPoints;
  const width = options.width ?? 40;

  const minLength = Math.min(values.length, labels.length);
  const effectiveLength = Math.min(minLength, maxPoints);

  const effectiveValues = values.slice(0, effectiveLength);
  const effectiveLabels = labels.slice(0, effectiveLength);

  const maxValue = Math.max(...effectiveValues);
  if (maxValue === 0) {
    return effectiveLabels.map(label => `${label} | `).join("\n");
  }

  const lines: string[] = [];
  for (let i = 0; i < effectiveLength; i++) {
    const value = effectiveValues[i] ?? 0;
    const label = effectiveLabels[i] ?? "";
    const barLength = Math.max(1, Math.round((value / maxValue) * width));
    const bar = "#".repeat(barLength);
    lines.push(`${label} | ${bar}`);
  }

  return lines.join("\n");
}

export function renderSparkline(
  values: number[],
  options: ChartOptions = {}
): string {
  if (values.length === 0) {
    return "";
  }

  const maxPoints = options.maxPoints ?? DEFAULT_STABILITY_CONFIG.maxChartPoints;
  const effectiveValues = values.slice(-maxPoints);

  if (effectiveValues.length === 1) {
    return "▄";
  }

  const min = Math.min(...effectiveValues);
  const max = Math.max(...effectiveValues);

  if (min === max) {
    return "▄".repeat(effectiveValues.length);
  }

  const chars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const range = max - min;

  return effectiveValues
    .map(value => {
      const normalized = (value - min) / range;
      const index = Math.min(
        chars.length - 1,
        Math.floor(normalized * chars.length)
      );
      return chars[index];
    })
    .join("");
}
