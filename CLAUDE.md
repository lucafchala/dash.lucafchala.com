# CLAUDE.md — dash.lucafchala.com

This file orients AI assistants working on this codebase. Read it before making any changes.

---

## What this is

**dash.lucafchala.com** is a personal control panel — a single-page app for managing PURLs (permanent redirects), pastes, and hub links across the lucafchala.com ecosystem. There is no backend, no framework, no build step. Everything lives in `index.html` as inline HTML + CSS + JS. Persistence is handled entirely via the **GitHub Contents API** using a PAT stored in `localStorage`.

---

## Repository structure

```
dash.lucafchala.com/
├── index.html      # the entire application — HTML, CSS, and JS all inline
├── data.json       # source of truth for all PURLs (redirects)
├── manifest.json   # PWA manifest
├── sw.js           # service worker (stale-while-revalidate cache)
├── icon.svg        # app icon
├── README.md       # user-facing documentation (Portuguese)
└── CLAUDE.md       # this file
```

**All application code is in `index.html`.** There are no separate `.js` or `.css` files. When editing, open only `index.html`.

---

## The ecosystem — related repos

The dash manages files across four GitHub repositories:

| Repo | Domain | What the dash writes there |
|---|---|---|
| `lucafchala/lucafchala.com` | lucafchala.com | `_redirects`, `404.html` |
| `lucafchala/dash.lucafchala.com` | dash.lucafchala.com | `data.json` |
| `lucafchala/paste.lucafchala.com` | paste.lucafchala.com | `pastes.json`, `{slug}/index.html` |
| `lucafchala/url.lucafchala.com` | url.lucafchala.com | `_redirects`, `data.json`, `index.html`, `404.html` |

The url repo is **optional** — configured in settings. All others are required.

---

## How PURLs work

### Data model

PURLs live in `data.json`:

```json
{
  "redirects": [
    { "slug": "instagram", "destination": "https://...", "group": "contact" }
  ]
}
```

Groups: `contact`, `events`, `video`, `tools`. Rendered as collapsible sections. `events` and `video` start collapsed on url.lucafchala.com.

### Save flow (`savePurlsToGitHub`)

On save, the dash:
1. Generates `_redirects` (Cloudflare Pages format: `/<slug>  <dest>  301`)
2. Generates `data.json`
3. Fetches current SHAs for all files to be written
4. Writes files to repos — **sequential within the same repo, parallel across repos**

> **Critical**: GitHub API returns 409 if two commits land on the same branch simultaneously. Never use `Promise.all` for writes to the same repo. Always `await` them one after another.

Write order:
```
repoHome:  _redirects → 404.html  (sequential)
repoDash:  data.json              (parallel with repoHome, different repo)
repoUrl:   _redirects → data.json → index.html → 404.html  (all sequential)
```

### Generated files

The dash generates three files inline and pushes them to other repos:

- **`genRedirectsFile(items)`** — Cloudflare Pages `_redirects` format, grouped with comments
- **`genUrlIndex()`** — full `index.html` for url.lucafchala.com (read-only PURL listing + hub grid)
- **`gen404Html()`** — `404.html` for both lucafchala.com and url.lucafchala.com (same file, domain-aware via `location.hostname` at runtime)

---

## How Pastes work

Pastes are stored in `pastes.json` in the paste repo. Each paste has:
- `slug`, `title`, `subtitle`, `type` (`text` or `pgp`), `lang`, `content`

On save:
1. `pastes.json` is updated in the paste repo
2. For **new** pastes, a `{slug}/index.html` is created using `PASTE_TEMPLATE` — a static HTML page that fetches `pastes.json` at runtime to render content

The paste template is a self-contained HTML file inlined as a template string in `index.html`.

---

## How the 404 page works

`gen404Html()` generates a single `404.html` that handles both `lucafchala.com` and `url.lucafchala.com`:

- **Toast warning**: shown only when arriving via a real bad slug. Logic: `slug && slug !== '404' && slug !== '404.html'` (prevents toast on direct `/404` visits)
- **"Ver todos os links" button**: points to `https://url.lucafchala.com` on lucafchala.com, or `/` on url.lucafchala.com — detected at runtime via `location.hostname === 'url.lucafchala.com'`
- **Contact**: `suporte@lucafchala.com`
- **Language**: Brazilian Portuguese

---

## How url.lucafchala.com works

The url index (`genUrlIndex()`) is a read-only version of the dash's PURL view. Key details:

- Fetches `/data.json` at runtime. Falls back to `https://dash.lucafchala.com/data.json` if local fetch fails (handles fresh/empty repos)
- Reuses the same CSS design tokens and components as the dash (copy-pasted as minified inline CSS)
- Hub grid at the top (PÁGINAS section) with links to all ecosystem services
- No editing — buttons are copy/open only

---

## GitHub API helpers (in index.html)

```js
getFile(repo, path)           // GET /repos/{repo}/contents/{path} → { content, sha }
putFile(repo, path, content,  // PUT — creates or updates a file
        sha, message)         // sha = undefined to create, existing sha to update
cfg()                         // returns { token, repoHome, repoDash, repoPaste, repoUrl }
isAuth()                      // true if PAT is set in localStorage
```

All stored in `localStorage`:
- `gh_token` — GitHub PAT (needs `repo` scope)
- `gh_repo_home`, `gh_repo_dash`, `gh_repo_paste`, `gh_repo_url` — repo identifiers (`owner/name`)
- `theme` — `dark` or `light`
- `lang` — `pt` or `en`

---

## UI state

### Internationalisation

All UI strings are in the `STRINGS` object near the bottom of `index.html`:

```js
const STRINGS = {
  pt: { h1: '...', groups: { contact: 'contato', ... }, ... },
  en: { h1: '...', groups: { contact: 'contact', ... }, ... }
};
function s() { return STRINGS[lang]; }
```

### Rendering

PURLs and pastes are rendered by `renderRedirects()` and `renderPastes()` — they re-build the DOM from the in-memory arrays (`redirects`, `pastes`). There is no virtual DOM or reactivity library.

Dirty-checking is `JSON.stringify` comparison between the live array and a deep-cloned `savedRedirects` / `savedPastes` snapshot.

### Save bar

`.save-bar` is `position: sticky; bottom: 20px`. It becomes visible when there are unsaved changes **and** the user is authenticated. It hides on save or discard.

---

## Design system

See `README.md` → **Guia de Design** for the full reference. Summary:

- **Fonts**: Cormorant Garamond (serif, titles) + JetBrains Mono (mono, everything else) via Google Fonts
- **Palette**: warm dark (`#0d0c0a` bg, `#c08030` accent) with a light variant
- **Tokens**: `--bg`, `--border`, `--text`, `--muted`, `--accent`, `--accent-dim`, `--ctrl-bg`
- **Layout**: `max-width: 680px`, centered, `padding: 48px 32px 72px`
- **Animation**: `rise` keyframe (`opacity 0 + translateY(18px)` → natural), staggered with delays
- **Components**: `.rule` (section divider), `.hub` (service card), `.act-btn` (inline action), `.ctrl-btn` (top bar), `.save-bar`, `.modal-overlay`

---

## PWA

- `manifest.json` — app name, icons, theme color
- `sw.js` — caches the app shell with stale-while-revalidate. On code changes, increment the cache version in `sw.js` if you need to bust the cache.

---

## Common tasks

### Add a new PURL group

1. Add the group key to the `ORDER` array in `genRedirectsFile()`
2. Add the label to `STRINGS.pt.groups` and `STRINGS.en.groups`
3. Add it to the `<select>` options in the add-form and edit-form HTML in `index.html`

### Change what gets synced on save

Edit `savePurlsToGitHub()`. Follow the sequential-within-same-repo rule.

### Change the 404 page content

Edit `gen404Html()`. The next PURL save will push the updated file to both `lucafchala.com` and `url.lucafchala.com`.

### Change the url.lucafchala.com index

Edit `genUrlIndex()`. The next PURL save will push it to the url repo.

### Change hub links

The hub grid in the url index is hardcoded in `genUrlIndex()`. Edit the `<a class="hub">` elements there.

---

## Things to avoid

- **Do not add frameworks or build steps.** Everything must work as a plain HTML file served statically.
- **Do not use `Promise.all` for writes to the same GitHub repo/branch.** Each `putFile` creates a commit; parallel commits cause SHA 409 conflicts.
- **Do not read `data.json` to get current PURLs at runtime.** On page load, the dash fetches `data.json` from GitHub and holds it in memory as `redirects`. Treat that array as the source of truth during a session.
- **Do not create separate JS/CSS files.** Keep everything inline in `index.html`.
- **Do not add comments that describe what code does.** Only comment when the WHY is non-obvious (e.g. the sequential-write constraint above).
