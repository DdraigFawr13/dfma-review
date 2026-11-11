import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { test } from "vitest";
import { analyze } from "../engine/analyze";
import { loadNodeOc } from "../engine/node";
import { build, mainModel, toStep } from "./shape";

const R = "/home/user/dfma-review/";
const STEPS: { [k: string]: string } = { ctc_01: "nist_ctc_01_asme1_ap242-e1.stp", ctc_02: "nist_ctc_02_asme1_ap242-e2.stp", ctc_03: "nist_ctc_03_asme1_ap242-e2.stp",
  ctc_04: "nist_ctc_04_asme1_ap242-e1.stp", ctc_05: "nist_ctc_05_asme1_ap242-e1.stp", ftc_06: "nist_ftc_06_asme1_ap242-e2.stp", ftc_07: "nist_ftc_07_asme1_ap242-e2.stp",
  ftc_08: "nist_ftc_08_asme1_ap242-e2.stp", ftc_09: "nist_ftc_09_asme1_ap242-e1.stp", ftc_10: "nist_ftc_10_asme1_ap242-e2.stp", ftc_11: "nist_ftc_11_asme1_ap242-e2.stp" };

function summary(r: any) {
  const kinds: { [k: string]: number } = {};
  for (const f of r.features) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
  const holes = r.features.filter((f: any) => f.kind === "hole")
    .map((h: any) => `${h.dims_mm.diameter.toFixed(2)}x${(h.dims_mm.depth ?? 0).toFixed(1)}${h.blind ? "b" : "t"}`).sort();
  return { vol: r.part.volume_mm3, faces: r.part.face_count, kinds, findings: r.findings.length, rules: [...new Set(r.findings.map((f: any) => f.rule))].sort(), holes };
}

test("shape from ipt", async () => {
  const oc = await loadNodeOc();
  const dir = R + "tests/inventor/files/";
  const out: any[] = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".ipt"))) {
    const key = /(ctc|ftc)_\d\d/.exec(name)![0];
    const rec: any = { file: name };
    try {
      const recs = await mainModel(new Uint8Array(readFileSync(dir + name)));
      let built; try { built = build(oc, recs); } catch (e: any) { rec.err = "build threw: " + (oc.OCJS?.getStandard_FailureData ? "" : "") + String(e); built = { solid: null, res: {} }; }
      const { solid, res } = built;
      rec.build = res;
      if (solid) {
        const step = toStep(oc, solid);
        rec.fromIpt = summary(analyze(oc, step, name + ".stp", "mill", "al6061"));
      }
    } catch (e: any) { rec.err = String(e?.stack ?? e).slice(0, 400); }
    if (STEPS[key]) {
      try { rec.fromStep = summary(analyze(oc, new Uint8Array(readFileSync(R + "tests/nist/.cache/NIST-PMI-STEP-Files/" + STEPS[key])), STEPS[key], "mill", "al6061")); }
      catch (e: any) { rec.stepErr = String(e).slice(0, 200); }
    }
    out.push(rec);
  }
  writeFileSync(process.env.OUT!, JSON.stringify(out, null, 1));
}, 600000);
