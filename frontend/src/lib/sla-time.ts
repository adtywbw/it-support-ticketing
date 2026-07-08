export type SLATimeUnit = "minutes" | "hours" | "days";

const MINUTES_BY_UNIT: Record<SLATimeUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 24 * 60,
};

export function toMinutes(value: number, unit: SLATimeUnit): number {
  return Math.round(value * MINUTES_BY_UNIT[unit]);
}

export function splitMinutesForInput(minutes: number): {
  value: number;
  unit: SLATimeUnit;
} {
  if (minutes <= 0) {
    return { value: 0, unit: "minutes" };
  }

  if (minutes % MINUTES_BY_UNIT.days === 0) {
    return { value: minutes / MINUTES_BY_UNIT.days, unit: "days" };
  }

  if (minutes > 0 && minutes % MINUTES_BY_UNIT.hours === 0) {
    return { value: minutes / MINUTES_BY_UNIT.hours, unit: "hours" };
  }

  return { value: minutes, unit: "minutes" };
}

export function formatSLADuration(minutes: number): string {
  const { value, unit } = splitMinutesForInput(minutes);
  const singularUnit = unit.slice(0, -1);
  return `${value} ${value === 1 ? singularUnit : unit}`;
}

export function isValidSLAWindow(
  responseTimeMinutes: number,
  resolutionTimeMinutes: number,
): boolean {
  return (
    responseTimeMinutes > 0 &&
    resolutionTimeMinutes > 0 &&
    resolutionTimeMinutes >= responseTimeMinutes
  );
}
