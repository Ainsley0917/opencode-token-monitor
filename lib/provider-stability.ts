export type StabilityConfig = {
  maxChars: number;
  maxTableRows: number;
  maxChartPoints: number;
};

export const DEFAULT_STABILITY_CONFIG: StabilityConfig = {
  maxChars: 20000,
  maxTableRows: 50,
  maxChartPoints: 14,
};

export type TruncatedResult = {
  content: string;
  truncated: boolean;
  originalLength: number;
  message?: string;
};

export function truncateOutput(
  content: string,
  config: Partial<StabilityConfig> = {}
): TruncatedResult {
  const mergedConfig = { ...DEFAULT_STABILITY_CONFIG, ...config };
  const originalLength = content.length;

  if (originalLength <= mergedConfig.maxChars) {
    return {
      content,
      truncated: false,
      originalLength,
    };
  }

  const truncatedContent = content.slice(0, mergedConfig.maxChars);
  const message = `\n\n---\n⚠️ Output truncated (${originalLength} → ${mergedConfig.maxChars} chars). Use \`token_export\` tool for full data.`;

  return {
    content: truncatedContent + message,
    truncated: true,
    originalLength,
    message,
  };
}

export function limitTableRows<T>(
  rows: T[],
  config: Partial<StabilityConfig> = {}
): { rows: T[]; truncated: boolean; totalCount: number } {
  const mergedConfig = { ...DEFAULT_STABILITY_CONFIG, ...config };
  const totalCount = rows.length;

  if (totalCount <= mergedConfig.maxTableRows) {
    return {
      rows,
      truncated: false,
      totalCount,
    };
  }

  return {
    rows: rows.slice(0, mergedConfig.maxTableRows),
    truncated: true,
    totalCount,
  };
}

export function getDebugInfo(sections: string[]): string {
  if (sections.length === 0) {
    return "Debug Info: 0 sections";
  }

  const sectionStats = sections
    .map((section, index) => {
      const lines = section.split("\n").length;
      return `Section ${index}: length: ${section.length}, lines: ${lines}`;
    })
    .join("\n");

  return `Debug Info: ${sections.length} sections\n${sectionStats}`;
}
