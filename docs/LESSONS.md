# Lessons

One line per mistake. Read the entries for an area before working in it. When a mistake repeats, bump its count; at ×2 it also becomes a rule (in DECISIONS, AGENTS.md, or proposed to AI-Master-Instructions). Mark retired entries SUPERSEDED; never delete them.

Format: `- <area> · <mistake> · <root cause> · <rule> · ×<n> (<YYYY-MM-DD>)`

- forms · The first brainstorm form showed no answer boxes and Morgan reported it broken · CONFIG items lacked `type: "text"`, so the template treated them as option questions and threw · load a form locally (Playwright) and check it renders answer boxes before sending the link · ×1 (2026-11-06)
- spec · first-version spec: 6 fresh checks found 4, 2, 8 and 3 high/major issues per pass (access axes, sharp-corner tools, metric drill masking odd_hole, fillets read as holes); fixes 40+, contested 0, escalated 3 (machine estimates, packages, small additions) · checks read the whole spec and each fix pass added new detail to check · run the narrow zero-decision pass on changed sections only, and expect 3-4 passes on a 450-line spec · ×1 (2026-11-06)
- env · Browser tests failed with "timeout: expected float, got undefined"; a later fix pinned Playwright 1.64.1, which doesn't solve with Node 22 · on conda-forge `playwright` is the Node driver and `playwright-python` the client, and the solver had paired driver 1.60 with client 1.64; the in-place fix was never tried on a fresh build · pin both at one version, and rebuild a fresh environment from the final environment.yml before pushing · ×1 (2026-11-06)
- ci · Typed an action's commit SHA from memory into ci.yml · no lookup before writing · take every action SHA from `git ls-remote` on its repo in the same session (WS-06) · ×1 (2026-11-06)
