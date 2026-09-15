import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DatePreset = "today" | "last7" | "month" | "all" | "custom";

export type DateRangeValue = {
  preset: DatePreset;
  from?: string; // yyyy-mm-dd
  to?: string;
};

export function getRangeBounds(v: DateRangeValue): { start?: Date; end?: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  switch (v.preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "last7": {
      const s = startOfDay(now);
      s.setDate(s.getDate() - 6);
      return { start: s, end: endOfDay(now) };
    }
    case "month":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: endOfDay(now),
      };
    case "all":
      return {};
    case "custom":
      return {
        start: v.from ? new Date(v.from + "T00:00:00") : undefined,
        end: v.to ? new Date(v.to + "T23:59:59.999") : undefined,
      };
  }
}

export function inRange(dateISO: string, v: DateRangeValue): boolean {
  const { start, end } = getRangeBounds(v);
  const d = new Date(dateISO);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last7", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All" },
  { key: "custom", label: "Custom" },
];

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => {
        const active = value.preset === p.key;
        return (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className={cn("rounded-md", active && "shadow-sm")}
            onClick={() => onChange({ ...value, preset: p.key })}
          >
            {p.label}
          </Button>
        );
      })}
      {value.preset === "custom" && (
        <div className="flex items-center gap-2 ml-2">
          <Input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 w-[150px]"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 w-[150px]"
          />
        </div>
      )}
    </div>
  );
}

export const defaultDateRange: DateRangeValue = { preset: "today" };
