# CLAUDE.md

@AGENTS.md

This repository's canonical agent instructions are maintained in `AGENTS.md`.
Claude Code should load and follow that file through the import above rather
than maintaining a second, drifting copy of the project architecture.

## Claude Code notes

- Work in this repository by default. Treat `../calendar-widget` as a related,
  read-only reference unless the user explicitly requests changes to it.
- Do not infer that the web app owns the companion widget's Pomodoro feature.
  The relationship and the dormant web compatibility hook are documented in
  `AGENTS.md`.
- There are no repository-specific `.claude` commands, agents, or hooks at
  present.
