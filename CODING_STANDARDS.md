# Coding standards

The review checklist for a diff. Lint, both tsc programs, Knip and the unit tests already enforce the mechanical rules (`node scripts/pre-push.mjs`); this file points at the judgment calls they can't check.

- **Data rules**: every rule in CLAUDE.md "Rules that break data if ignored". For each change, ask what happens offline and when two devices edit the same record.
- **Code conventions**: CLAUDE.md "Code conventions".
- **UI**: `DESIGN.md`, the sections the diff touches; "Writing in the UI" for any copy.
- **Domain words and decisions**: `GLOSSARY.md`, `docs/adr/`, and Decisions & Deferrals in `docs/plans/rearchitecture/plan.md`.
- **Record types and events**: `docs/agents/new-record-type.md`.
