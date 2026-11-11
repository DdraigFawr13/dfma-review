// The four examples (UI fixes B1): files of tests/parts, with the process each is reviewed for. The one home of the
// list: the page's buttons and menu (main.ts) and the Vite plugin that serves and copies the files (vite.config.ts).

export const EXAMPLES: { name: string; process: "mill" | "turn" }[] = [
  { name: "report_sample", process: "mill" },
  { name: "angled_hole_in_pocket", process: "mill" },
  { name: "slender_shaft", process: "turn" },
  { name: "clean_one_setup", process: "mill" },
];
