# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

There is no build step. All files are plain HTML/CSS/JS served statically.

**To run locally:** Use any static HTTP server, for example:
```
npx serve .
# or
python -m http.server 8080
```

**Must be served over HTTPS in production** — Google OAuth blocks `http://` and `file://` origins. Use GitHub Pages, Cloudflare Pages, or a local HTTPS proxy for testing OAuth.

To deploy: push all files to a GitHub Pages branch. The `GOOGLE_CLIENT_ID` on line 6 of `app.js` must match the OAuth client configured at console.cloud.google.com with the deployment origin in "Authorized JavaScript origins."

## Architecture

Pure frontend SPA — no bundler, no framework, no backend. All JS files are loaded via `<script src="">` tags at the bottom of `index.html` in dependency order:

```
auth.js → calendar.js → ai.js → stats.js → calview.js → pomodoro.js → review.js → app.js
```

Each module is an IIFE that exposes a global object. Cross-module calls use these globals directly:

| Global | Module | Responsibility |
|--------|--------|----------------|
| `Auth` | auth.js | Google OAuth2 token flow, multi-account management, AES-GCM encryption |
| `Cal` | calendar.js | Google Calendar REST API wrapper, event CRUD, tag/color normalization |
| `AI` | ai.js | DeepSeek API calls, NL→JSON action parsing, secretary scheduling logic |
| `CalView` | calview.js | Week/day visual grid, event block positioning |
| `Stats` | stats.js | Statistics charts, AI weekly report |
| `Pomodoro` | pomodoro.js | Pomodoro timer, focus time logging to linked tasks |
| `Review` | review.js | Exam review planner, AI rescheduling, calendar sync |
| `App` + `UI` | app.js | App state, navigation, shared UI helpers (toast, modals, event cards) |

`app.js` also defines shared helpers used across modules: `esc()` (XSS-safe HTML escaping), `fmtMins()`, `handleKey()`, `autoResize()`.

## Key Data Flows

**Authentication:** `Auth.init()` → checks localStorage for saved token → if valid, calls `App.onLogin()` which initializes all modules. Token auto-refreshes silently every 50 min via `google.accounts.oauth2`.

**Calendar API:** All calls go through `Cal.req()` which attaches the Bearer token from `Auth.getActiveToken()`. On 401, shows the token warning banner. Events are normalized by `normalizeEvent()` which parses the `#tag title` prefix format and extracts metadata from the description field.

**AI chat flow:** `AI.sendMessage()` → `buildSystemPrompt()` (embeds today's schedule, date references, secretary rules) → `callDS()` (DeepSeek API) → parse JSON action → dispatch to `handleCreate/Modify/Query/Plan()`.

**Event title format:** Tags are stored as prefixes: `#学习 微积分复习`. Legacy formats (`活动名 #标签` and `【标签】活动名`) are also parsed. The description field stores: `预估时长：N分钟`, `实际：N分钟`, `状态：已完成`, `标签：X`.

## localStorage Keys

| Key | Content | Encrypted |
|-----|---------|-----------|
| `sca_tasks` | Local task mirror with `estMins`, `actualMins`, `done` | No |
| `sca_cfg` | App config (activeCalId, defReminder, reviewTime) | No |
| `sca_accounts` | Multi-account list with tokens | AES-GCM |
| `sca_active` | Active account email | No |
| `sca_dskey` | DeepSeek API key | AES-GCM |
| `sca_review` | Exam review plan tasks | No |
| `pomo_cfg` | Pomodoro timer settings | No |

**Encryption:** AES-GCM 256-bit. Key derived from device fingerprint via PBKDF2 (100,000 iterations). The key is never stored — re-derived on each decrypt. This means encrypted data is not portable between devices/browsers.

## Customization Points

- **Google Client ID:** `app.js` line 6 — `GOOGLE_CLIENT_ID`
- **Secretary rules / class schedule:** `ai.js` → `buildSystemPrompt()` — hardcodes the user's weekly timetable, protected time slots (lunch 12:15–13:30, exercise 17:00–18:00), and task priority ordering
- **Tag system:** `calendar.js` → `TAG_COLOR` (Google Calendar colorId mapping) and `TAG_HEX` (UI hex colors) — valid tags are `['学习','课程','科研','社工','运动','娱乐','工作','其他']`
- **Exam review subjects/schedule:** `review.js` → `SUBJECTS` array and `generateDefaultPlan()` — hardcoded 28-day study plan through 2026-06-16

## Important Constraints

- The app **requires HTTPS** — Google OAuth2 (`accounts.google.com/gsi/client`) and Web Crypto API both require a secure context.
- DeepSeek API is called **directly from the browser** — the API key is never sent to any server other than `api.deepseek.com`.
- There is **no server-side validation** — all data comes from Google Calendar (authoritative) or localStorage (local mirror). The local task store (`sca_tasks`) can drift from Google Calendar; `Cal.loadTodayEvents()` is the source of truth for UI rendering.
- `esc()` must be used for all user-controlled strings interpolated into `innerHTML` — the codebase uses this consistently; maintain this pattern to avoid XSS.
