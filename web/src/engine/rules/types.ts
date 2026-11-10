// The shapes the rule modules share (service/dfma/rules/*.py: check(features, part, limits) and passes()).
import type { Frame } from "../features/holes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Feature = { id: string; kind: string; faces: number[]; dims_mm: Record<string, number>; [k: string]: any };
export interface PartSummary { units_in_file: string; frame: Frame; face_count: number }
export type Limits = Record<string, unknown>;
export type Finding = Record<string, unknown> & { rule: string; severity: string; threshold_source: string };
export type Pass = Record<string, unknown> & { rule: string; feature: string; threshold_source: string; title: string };
