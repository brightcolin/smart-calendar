# AGENTS.md

## Project scope

This repository contains the web version of Smart Calendar Assistant. It is a
pure frontend SPA built with plain HTML, CSS, and JavaScript. There is no
framework, bundler, backend, or build step.

Keep source and documentation files encoded as UTF-8. Preserve the existing
Chinese UI copy unless a task explicitly asks to rewrite it.

## Companion repository

The sibling directory `../calendar-widget` is a related but independent
Electron application:

- This repository does not import, bundle, or load files from
  `calendar-widget` at runtime.
- The two applications authenticate independently and keep separate browser /
  Electron localStorage data.
- Their functional integration is Google Calendar: both can read events from
  the same Google Calendar account. The web app can modify events, while the
  widget currently requests read-only Calendar access.
- Event title conventions are shared implicitly. The widget recognizes the
  `#标签 活动名` prefix to color events, so changes to tag names or title format
  must be checked against `../calendar-widget/renderer.js`.
- The Pomodoro implementation and its `pomo_cfg`, `pomo_today`, and
  `pomo_history` keys belong to `calendar-widget`; those values are not shared
  with this web app.
- `calendar.js` currently contains a small `Pomodoro` refresh compatibility
  hook, but this repository has no `pomodoro.js` or `pomodoroModal`. Treat the
  hook as dormant compatibility code. Do not delete it merely because the
  module is absent; first confirm whether a web Pomodoro port is still planned.

Unless the user explicitly includes the sibling repository in the requested
changes, treat `../calendar-widget` as read-only reference material.

## Running the app

Serve the repository through a static HTTP server, for example:

```powershell
python -m http.server 8080
```

Alternatively:

```powershell
npx serve .
```

There is no build command. Production deployment must use HTTPS because Google
OAuth and the Web Crypto API require a secure context. The deployment origin
must be listed in the OAuth client's authorized JavaScript origins.

## Architecture

`index.html` loads scripts at the bottom of the page in this dependency order:

```text
auth.js -> calendar.js -> ai.js -> stats.js -> calview.js -> review.js -> app.js
```

Each module is an IIFE that exposes a global object. Cross-module calls use
these globals directly:

| Global | File | Responsibility |
| --- | --- | --- |
| `Auth` | `auth.js` | Google OAuth token flow, accounts, encrypted local secrets |
| `Cal` | `calendar.js` | Google Calendar REST API, event CRUD and normalization |
| `AI` | `ai.js` | DeepSeek requests, natural-language actions and scheduling |
| `Stats` | `stats.js` | Statistics and AI weekly reports |
| `CalView` | `calview.js` | Week/day calendar visualization |
| `Review` | `review.js` | Exam review plan, rescheduling and Calendar sync |
| `App`, `UI` | `app.js` | App state, navigation and shared UI helpers |

Do not reorder scripts or rename globals without checking every direct
cross-module call. Shared helpers such as `esc()`, `fmtMins()`, `handleKey()`,
and `autoResize()` are defined in `app.js`.

## Data and integration contracts

- Google Calendar is authoritative for calendar events; `sca_tasks` is only a
  local mirror and may drift.
- Event titles use `#标签 活动名`. Legacy suffix and bracketed tag formats are
  still normalized by `calendar.js`.
- Event descriptions may contain metadata lines such as `预估时长：N分钟`,
  `实际：N分钟`, `状态：已完成`, and `标签：X`. Preserve compatibility when
  changing parsing or serialization.
- Use `esc()` for every user-controlled value interpolated into `innerHTML`.
- Do not commit Google access tokens, DeepSeek API keys, OAuth client secrets,
  or copied browser storage. The Google web client ID in `app.js` is an OAuth
  identifier, not an access token, but changes to it must remain intentional.
- Browser requests are expected to go only to Google and DeepSeek endpoints.

Important web-app localStorage keys:

| Key | Purpose |
| --- | --- |
| `sca_tasks` | Local task mirror |
| `sca_cfg` | App configuration |
| `sca_accounts` | Encrypted account/token data |
| `sca_active` | Active account email |
| `sca_dskey` | Encrypted DeepSeek API key |
| `sca_review` | Local exam subjects and review tasks |

## Main customization points

- `app.js`: `GOOGLE_CLIENT_ID` and top-level application state.
- `ai.js`: `buildSystemPrompt()` for generic scheduling behavior; personal
  planning rules come from `sca_cfg.planningRules` and must not be hardcoded.
- `calendar.js`: `TAG_COLOR` and `TAG_HEX` for tag mappings.
- `review.js`: locally stored subjects/tasks, generic plan generation, and
  private JSON import/export.

Public source must not contain real personal timetables, routines, exam dates,
or study tasks. Keep local backups under `/private/` or in ignored personal
notes, and never force-add those paths to Git.

## Editing expectations

- Prefer narrow, behavior-preserving changes in this global-script codebase.
- Do not introduce a framework, package manager workflow, or build system
  unless explicitly requested.
- Preserve localStorage and Google Calendar data compatibility.
- Keep unrelated user changes, including untracked planning documents.
- When a change affects the event title/tag contract, inspect the companion
  widget before concluding that the change is local to this repository.

## Verification

There is currently no automated test or lint suite. After changes:

1. Serve the repository over HTTP and load the affected screen.
2. Check the browser console for syntax and runtime errors.
3. Exercise the changed navigation, modal, and rendering paths.
4. For Calendar work, verify the relevant create/read/update/delete operation
   and confirm metadata remains parseable after a reload.
5. For user-visible HTML, test special characters and confirm output is escaped.
6. If tags, event titles, or shared Calendar behavior changed, also assess the
   effect on `../calendar-widget` and report any follow-up needed there.
7. For review/settings changes, verify local JSON import/export and confirm a
   fresh browser profile starts without personal subjects or planning rules.
