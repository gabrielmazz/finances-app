export type HomeActivityHeatmapSource = { date: Date | null };

export type HomeActivityHeatmap = {
  startDate: string;
  endDate: string;
  dailyActionCounts: Record<string, number>;
  totalActions: number;
};

const isValidDate = (value: Date | null): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const buildHomeActivityHeatmap = (
  sources: HomeActivityHeatmapSource[],
  referenceDate = new Date(),
): HomeActivityHeatmap => {
  if (!isValidDate(referenceDate)) {
    return {
      startDate: "",
      endDate: "",
      dailyActionCounts: {},
      totalActions: 0,
    };
  }

  const year = referenceDate.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
  const dailyActionCounts: Record<string, number> = {};

  for (const source of sources) {
    if (
      !isValidDate(source.date) ||
      source.date < startOfYear ||
      source.date > endOfYear ||
      source.date > referenceDate
    )
      continue;
    const dateKey = toDateKey(source.date);
    dailyActionCounts[dateKey] = (dailyActionCounts[dateKey] ?? 0) + 1;
  }

  return {
    startDate: toDateKey(startOfYear),
    endDate: toDateKey(endOfYear),
    dailyActionCounts,
    totalActions: Object.values(dailyActionCounts).reduce(
      (total, count) => total + count,
      0,
    ),
  };
};
