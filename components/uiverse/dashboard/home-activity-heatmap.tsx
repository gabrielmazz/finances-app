"use dom";

import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import { MantineProvider } from "@mantine/core";
import { Heatmap } from "@mantine/charts";
import type { DOMProps } from "expo/dom";

type Props = {
  data: Record<string, number>;
  startDate: string;
  endDate: string;
  isDarkMode: boolean;
  dom?: DOMProps;
};

const monthLabels = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

export default function HomeActivityHeatmap({
  data,
  startDate,
  endDate,
  isDarkMode,
}: Props) {
  const textColor = isDarkMode ? "#CBD5E1" : "#475569";
  return (
    <MantineProvider forceColorScheme={isDarkMode ? "dark" : "light"}>
      <style>
        {"html, body { background-color: transparent !important; }"}
      </style>
      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <Heatmap
          data={data}
          startDate={startDate}
          endDate={endDate}
          withMonthLabels
          withWeekdayLabels
          weekdayLabels={["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]}
          monthLabels={monthLabels}
          firstDayOfWeek={1}
          withOutsideDates={false}
          rectSize={13}
          rectRadius={3}
          gap={3}
          splitMonths
          colors={[
            isDarkMode ? "#1E293B" : "#E2E8F0",
            "#475569",
            "#0EA5E9",
            "#38BDF8",
            "#FACC15",
          ]}
          styles={{
            monthLabel: { fill: textColor },
            weekdayLabel: { fill: textColor },
          }}
          withTooltip
          getTooltipLabel={({ date, value }) =>
            `${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}: ${value ?? 0} ${value === 1 ? "ação" : "ações"}`
          }
        />
      </div>
    </MantineProvider>
  );
}
