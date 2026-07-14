# Smart Calendar Assistant

[English](README.md) | [简体中文](README.zh-CN.md)

A browser-based Google Calendar assistant with natural-language event management, intelligent scheduling, calendar views, review planning, and time statistics. It is built with plain HTML, CSS, and JavaScript—without a framework, build step, or backend server.

> This project is currently in personal testing. While the Google OAuth consent screen remains in testing mode, only accounts added as test users can sign in.

## Features

- Create, update, query, complete, and delete Google Calendar events using natural language.
- Schedule tasks into free time using real calendar events and local planning rules.
- Plan a day or week in batches and write confirmed events to Calendar.
- Display color-coded events in week and day views.
- Analyze time by tag, date, and activity name, with AI-generated weekly reports.
- Configure exam subjects, dates, and target hours locally to generate and adjust review tasks.
- Sync review tasks to Google Calendar.
- Switch between multiple Google accounts and store tokens and the DeepSeek API key with local encryption.

## Relationship to Calendar Widget

The companion desktop application is maintained in the separate [`calendar-widget`](https://github.com/brightcolin/calendar-widget) repository.

The applications do not load each other's source code or share localStorage. They work together through the same Google Calendar account:

- The web app creates and updates calendar events.
- The Widget uses read-only access to display today's events from the primary calendar.
- Both recognize the `#tag event name` title convention.
- Pomodoro data is stored only by the Widget.

Changes to tag names or the event-title format must be checked in both repositories.

## Quick Start

There is no build step. Serve the repository through a static HTTP server instead of opening `index.html` directly:

```powershell
git clone https://github.com/brightcolin/smart-calendar.git
cd smart-calendar
python -m http.server 8080
```

Alternatively:

```powershell
npx serve .
```

Then open `http://localhost:8080`.

Before signing in locally, add the local origin to the authorized JavaScript origins of your Google OAuth client. Production deployments must use HTTPS, and their actual origins must also be authorized.

## Google OAuth Setup

1. Create a Google Cloud project and enable the Google Calendar API.
2. Configure the OAuth consent screen. During testing, add your Google account as a test user.
3. Create an OAuth client of the **Web application** type.
4. Add every JavaScript origin you will use, such as the local development origin and the GitHub Pages origin.
5. Set `GOOGLE_CLIENT_ID` near the top of `app.js` to the OAuth Client ID.

The application currently requests these scopes:

```text
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/userinfo.profile
https://www.googleapis.com/auth/userinfo.email
```

An OAuth Client ID is a public identifier, not an access token. Never commit a Client Secret, Access Token, or Refresh Token.

## DeepSeek Setup

After signing in, open **Settings** and enter a DeepSeek API key. AI requests are sent directly from the browser to the DeepSeek API.

The key is encrypted before being written to browser localStorage, but this does not protect it from malicious same-origin scripts, XSS, browser extensions, or anyone who already has access to the local operating-system account. Use a dedicated key, set an appropriate spending limit, and revoke it if exposure is suspected.

## Personal Planning and Privacy

The public source does not contain the author's timetable, routines, exam dates, or review tasks. Personal data is stored in the current browser:

- **Settings → Personal planning rules** stores classes, routines, protected time, and priorities.
- **Review → Manage subjects** stores exam subjects, dates, and target hours.
- The Review page generates a generic plan from local subjects and allows individual tasks to be edited.
- **Export personal configuration** downloads a JSON file containing private data.
- **Import personal configuration** replaces the review plan in the current browser.

Do not upload exported personal configuration to a public repository. This repository ignores `/private/` and `/备考计划.md`, but these paths should never be force-added with `git add -f`.

## Tags and Event Format

The recommended event-title format is:

```text
#tag event name
```

The default tags are `学习` (study), `课程` (class), `科研` (research), `社工` (community work), `运动` (exercise), `娱乐` (leisure), `工作` (work), and `其他` (other).

Event descriptions may contain these compatibility fields:

```text
预估时长：90分钟
实际：80分钟
状态：已完成
标签：学习
```

Do not change these formats casually. Historical events, statistics, and the desktop Widget depend on them.

## Deployment

The application can be deployed to GitHub Pages, Cloudflare Pages, or another static hosting service:

1. Deploy the repository's HTML, CSS, and JavaScript files.
2. Ensure that the site uses HTTPS.
3. Add the full site origin to the OAuth client's authorized JavaScript origins.
4. Open the deployed site, sign in, and configure local settings.

There is no backend. Calendar events are stored by Google; the local task mirror and personal settings are stored in browser localStorage.

## Project Structure

```text
index.html      Page structure and settings interface
style.css       Application styles
auth.js         Google OAuth, multiple accounts, and local encryption
calendar.js     Google Calendar API, event format, and tags
ai.js           DeepSeek requests, natural-language actions, and scheduling
stats.js        Time statistics and AI weekly reports
calview.js      Week and day calendar views
review.js       Local review subjects/tasks, import/export, and Calendar sync
app.js          Application state, navigation, and shared UI helpers
AGENTS.md       Codex project instructions
CLAUDE.md       Claude Code entry point that imports AGENTS.md
```

Scripts are loaded by `index.html` in this order:

```text
auth.js → calendar.js → ai.js → stats.js → calview.js → review.js → app.js
```

## Development and Verification

The repository currently has no automated test or lint command. After making changes, at minimum:

1. Open the application through a static HTTP server.
2. Check the browser console.
3. Test affected sign-in, Calendar, and settings flows.
4. Confirm that user-controlled content is HTML-escaped.
5. If tags or event formats change, also check `calendar-widget`.

Codex reads `AGENTS.md`. Claude Code imports the same instructions through `CLAUDE.md`, keeping both tools aligned.

## Known Limitations

- The DeepSeek API key is available to the browser and is unsuitable when the page code or browser environment cannot be trusted.
- Google Calendar is authoritative for events; the local task mirror can temporarily drift.
- Personal configuration exists only in the current browser by default. Export a backup before clearing site data.
- There is no offline support, Web App Manifest, or Service Worker.
- The generic review-plan generator provides initial time blocks that still need to be adjusted for the user's actual schedule.

## License

[MIT License](LICENSE)
