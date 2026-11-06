# Decisions

Settled rules for this project. Not a changelog: an entry stays while the rule is in force. Change a rule here in the same change that changes the behaviour. Mark ideas Proposed until the owner approves them; mark retired entries SUPERSEDED with a pointer, never delete them.

## D-001 Concept chosen

- **Status:** Accepted (2026-11-06)
- **Decision:** Build the staged tool in [docs/CONCEPT.md](CONCEPT.md): (1) STEP report with DFM/DFA findings, setups, tool changes and time; (2) single-user design review; (3) DXF drawing check against ASME Y14.5-2018; (4) DXF drawing generation. Code measures, templates write; no runtime AI unless Morgan approves. Portable hosting.
- **Why:** Morgan's pick in brainstorm round 1 ([page](https://claude.ai/artifact/QRrJhDYjzW3NapQUBGR6rH)), after 4 concepts and a fresh critique. Reasons for each dropped concept are in the brief.

## D-002 Full master setup with the web-app layer

- **Status:** Accepted (2026-11-06)
- **Decision:** Use AI-Master-Instructions `v4.11.0`, full profile, layers `core` and `project-types/web-app`. Add a stack layer once design picks the stack.
- **Why:** a multi-stage plan with a UI and CI needs the full setup; `lite` is for scripts and one-offs (master D-056).
