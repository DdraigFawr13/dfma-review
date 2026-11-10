// Port of service/dfma/drivers.py (port spec S3): what makes a part cost more to make, each with a count, a weight
// and a score (count x weight), ranked high to low. No time or dollars (D-003). The drivers, their labels and weights,
// and which rules feed which driver are in config/drivers.toml; every starting weight is an estimate.
import { driversConfig } from "./settings";
import { round } from "./units";

export interface CostDriver {
  driver: string; label: string; count: number; weight: number; score: number; weight_source: string; findings: string[];
}
interface DriverConfig { label: string; count: string; weight: number; source: string; under_in?: number; rules?: string[] }

/** The drivers with a count above 0, sorted by score (high first), then by key (A to Z). */
export function costDrivers(findings: { id: string; rule: string }[], setups: unknown[],
  tools: { undersized: boolean; diameter_in: number | null }[]): CostDriver[] {
  const out: CostDriver[] = [];
  for (const [key, d] of Object.entries(driversConfig() as Record<string, DriverConfig>)) {
    let count = 0;
    let ids: string[] = []; // the findings a driver counts; none for setups and tools
    if (d.count === "setups") count = Math.max(setups.length - 1, 0);
    else if (d.count === "tools") count = tools.length;
    else if (d.count === "small") {
      count = tools.filter((t) => t.undersized || (t.diameter_in !== null && t.diameter_in < d.under_in! - 1e-9)).length;
    } else if (d.count === "findings") {
      ids = findings.filter((f) => d.rules!.includes(f.rule)).map((f) => f.id);
      count = ids.length;
    }
    if (count > 0) {
      out.push({ driver: key, label: d.label, count, weight: Number(d.weight), score: round(count * Number(d.weight), 6),
        weight_source: d.source, findings: ids });
    }
  }
  return out.sort((a, b) => b.score - a.score || (a.driver < b.driver ? -1 : a.driver > b.driver ? 1 : 0));
}

/** The rules config/drivers.toml maps to a driver: while any is not checked yet, the cost total is partial. */
export function driverRules(): string[] {
  return [...new Set(Object.values(driversConfig() as Record<string, DriverConfig>).flatMap((d) => d.rules ?? []))];
}
