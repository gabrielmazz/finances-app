import { buildHomeActivityHeatmap } from "@/utils/homeActivityHeatmap";

describe("buildHomeActivityHeatmap", () => {
  it("counts actions by day in the current calendar year", () => {
    const heatmap = buildHomeActivityHeatmap(
      [
        { date: new Date(2026, 0, 1, 9) },
        { date: new Date(2026, 0, 1, 18) },
        { date: new Date(2026, 7, 14, 10) },
        { date: new Date(2025, 11, 31, 10) },
        { date: new Date(2026, 7, 15, 10) },
      ],
      new Date(2026, 7, 14, 12),
    );

    expect(heatmap.startDate).toBe("2026-01-01");
    expect(heatmap.endDate).toBe("2026-12-31");
    expect(heatmap.dailyActionCounts).toEqual({
      "2026-01-01": 2,
      "2026-08-14": 1,
    });
    expect(heatmap.totalActions).toBe(3);
  });
});
