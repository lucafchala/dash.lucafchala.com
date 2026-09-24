# CLAUDE.md — dash.lucafchala.com

Orientation for AI assistants. Read it before changing anything. User-facing docs (Portuguese) are in `README.md`; the ecosystem design system is in the lucafchala.com README.

---

## What this is

A private control panel (password + Turnstile) that manages **PURLs** (short links), **pastes** and quick links for the lucafchala.com ecosystem. The app is a single `index.html` with inline HTML + CSS + JS, and no framework or build step. GitHub is the database: the app reads and writes files in four repos through the Contents API, and every commit becomes a Cloudflare Pages deploy.

A few Pages Functions provide the backend:

| File | Role |
|---|---|
| `functions/_middleware.js` | Auth gate for every path except `PUBLIC_PATHS`/`PUBLIC_PREFIXES` and `/api/healthz`. Login = `DASH_PASSWORD` (constant-time compare) + Turnstile + rate limit (KV if `DASH_KV`, else in-memory). Session cookie `dash_session` = `exp.HMAC(exp)` keyed by the password, 24 h, HttpOnly/Secure/SameSite=Strict. `/logout` clears it. Unauthenticated `/api/*` gets **401 JSON** (not a 302). The login page sets its own security headers (`_headers` doesn't apply to Function responses) and has no inline script. `next=` is validated to be same-origin |
| `functions/api/github.js` | GitHub Contents API proxy using the `GH_PAT` secret. `GET` returns `{configured, repos}`. `POST {path, method, body}` accepts only `GET/PUT/DELETE` on `<owner>/<repo>/contents/<segments>` for allowlisted repos (default 4, override with `GH_REPOS`). It rejects `%`, `\`, `?`, `#`, whitespace, and `.`/`..` segments — fetch() would decode `%2e%2e` into a path traversal |
| `functions/api/healthz.js` | Public config probe (booleans only) used by status |

Tests: `node --test tests/*.test.mjs` (proxy traversal cases, middleware 401/redirect/login/open-redirect/logout/fail-closed).

---

## Repository structure

```
index.html            # the entire app — HTML, CSS, JS inline (two scripts, hash-pinned in _headers)
data.json             # source of truth for PURLs
functions/            # _middleware.js, api/github.js, api/healthz.js
tests/                # node:test suites for the functions
sw.js                 # service worker
manifest.json, icon.svg, robots.txt, _headers, fonts/
README.md             # user docs (PT)
CLAUDE.md             # this file
```

**All application code is in `index.html`.** Don't create separate JS/CSS files for the app.

---

## Ecosystem — what the dash writes

| Repo | Files |
|---|---|
| `lucafchala/dash.lucafchala.com` | `data.json` |
| `lucafchala/lucafchala.com` | `_redirects`, `404.js`, `404.html` |
| `lucafchala/url.lucafchala.com` (optional; empty setting disables) | `_redirects`, `data.json`, `url.js`, `index.html`, `404.js`, `404.html` |
| `lucafchala/paste.lucafchala.com` | `pastes.json`, `{slug}/index.html` (shells), `sitemap.xml` |

---

## Data model

`data.json`:

```json
{ "redirects": [ { "slug": "instagram", "destination": "https://…", "group": "contact" },
                 { "slug": "github", "destination": "https://…", "group": "contact", "status": 301 } ] }
```

- Groups: `contact`, `events`, `video`, `tools` (`GROUPS`).
- `status` is only present when 301. Absent means **302** (the default, because browsers cache 301 forever).
- `normalizePurl()` enforces this shape and key order. `genDataJson()` must stay byte-stable.

`pastes.json`: `{ "pastes": [ { slug, subtitle, description, description_en, lang, [type: "pgp", fingerprint], content } ] }`.

---

## Save flow (read this before touching saving)

- **Load:** when authed, `loadPurls()` / `loadPastes()` read `data.json` / `pastes.json` **from GitHub** and keep `sha` + `content` in `purl` / `paste`. Unauthenticated users get the public copies, read-only. If loading fails, `loaded` is false and **saving is refused**; the old code would overwrite the file with an empty list.
- **Snapshot:** `savePurls()` / `savePastes()` snapshot the items at the start; the save bars are disabled while saving.
- **Gate write:** first the source-of-truth file, with `baseSha` from load (`applyWrite` with `baseSha` in the write). A `409` → `resolveConflict()` shows the remote diff and offers reload / overwrite. Nothing else is written until then.
- **Derived writes:** `derivedPurlWrites()` / `pasteWrites()` go through `runWrites()`:
  - grouped by repo — **sequential within a repo, parallel across repos**. GitHub rejects concurrent commits to one branch with 409. Never `Promise.all` writes to the same repo;
  - each write fetches the current file and **skips it if the content is identical** (no empty commits);
  - `getFile` returns `null` only on 404; other errors propagate;
  - scripts are written before the HTML that loads them.
- **Page guard:** paste writes carry `guard: isManagedPastePage`. Pages without the `dash:paste-shell` marker (or the legacy template's `fetch('/pastes.json')`) are **never overwritten or deleted**. Hand-built pages (`nirvana-…`, `vela_f5-2024`, `cloudspot_deprecation`) stay untouched.
- **Report:** `report()` shows per-file results. Failures get a retry that re-runs only the failed writes.
- **Sync / regenerate:** "sincronizar" / "regenerar páginas" re-run the derived writes from saved data. Use them after changing a generator.

---

## Generators (`index.html`, "Generators" section)

`genRedirectsFile`, `genDataJson`, `gen404Html` + `gen404Js`, `genUrlIndex` + `genUrlJs`, `genPasteShell`, `genPastesJson`, `genPasteSitemap`.

- **Deterministic output** — same data, same bytes. No timestamps or random values.
- **No inline scripts or `on*=` in generated HTML.** Target sites run `script-src 'self'`; behaviour lives in the generated `404.js` / `url.js` and in the paste repo's `paste.js`.
- **Every generated file starts with a `generated by dash.lucafchala.com (genX)` marker.** CI in url/paste checks for it.
- **Shared prefs code:** `GEN_PREFS_JS` is the theme/lang bootstrap shared by generated scripts (the `lf_theme`/`lf_lang` cookies on `.lucafchala.com`). `GEN_FONTS` / `GEN_BASE` / `GEN_CONTROLS` are the shared CSS and controls.
- **Escapes inside the inline script:**
  - write `<\/script>` for closing tags and `<\!--` for HTML comments;
  - **never** put a literal `</script` or `<!--` in the inline script. `<!--` can switch the HTML parser into "escaped" script mode, where the real `</script>` no longer closes the block. CI enforces this;
  - generated JS uses `String.raw` so its regex backslashes survive.
- **Proving output:** the committed files in the target repos must equal what the generators produce. After changing a generator, run the dash (or its generators in a browser) and commit the output, or press sync.

---

## CSP (important)

`_headers` has `script-src 'self' 'sha256-…' 'sha256-…'`: one hash for the tiny theme bootstrap in `<head>`, one for the app script. **Any edit to either inline script changes its hash** — regenerate (snippet in README → "Segurança") or the app is blocked. CI's "CSP hashes cover every inline script" step fails on drift.

- **Events:** there are no `onclick=` attributes. All events go through `data-action` + one delegated `click` listener, plus `submit`/`input`/`keydown` listeners.
- **`connect-src`:** `'self'`, `https://api.github.com` (legacy PAT mode), `https://paste.lucafchala.com` (public pastes), `https://status.lucafchala.com` (hub status dots).

---

## Service worker

`sw.js`:
- **Never** caches a response with `redirected: true` or a non-2xx/opaque one. A redirected login page cached under `/` caused a permanent `net::ERR_FAILED`.
- Navigations are network-first (offline falls back to the last good `/`).
- `/api/*`, `/data.json`, `/login`, `/logout` and every cross-origin request bypass it.
- Bump `CACHE` when the precache list changes.

---

## GitHub helpers

```js
ghFetch(path, { method, body })   // proxy (serverGh) or direct with gh_pat; throws GhError(message, status); 401 from the middleware → sessionExpired()
getFile(repo, path)                // → { sha, content } | null (404 only)
putFile(repo, path, content, sha, message)
deleteFile(repo, path, sha, message)
applyWrite(write, results) / runWrites(writes, results)
cfg()                              // { pat, repoHome, repoDash, repoPaste, repoUrl }; repoUrl '' = disabled
isAuth()                           // serverGh || !!pat
```

`localStorage`: `gh_repo_*`, legacy `gh_pat`, `theme`, `lang`. Prefs are written through `writePref()` (cookie + localStorage).

---

## UI conventions

- **i18n:** every string is in `STRINGS.pt` / `STRINGS.en` — no hardcoded UI text. Static elements use `data-i18n` / `data-i18n-attr`; `applyLang()` walks them.
- **Dialogs:** native `<dialog>` — `openModal()`, the generic `openDialog({title, body, actions})`, `confirmDialog()`. The paste editor never closes on a backdrop click.
- **Feedback:** `toast(msg, {error, action, onAction})` in an `aria-live` region; no `alert()` / `confirm()`.
- **Validation:** `checkSlug()` (regex, `RESERVED_PURL` / `RESERVED_PASTE`, duplicates) and `checkDest()`, with errors shown inline via `showFieldError()`.
- **Dirty state:** JSON comparison against the saved snapshot. `diffBySlug()` feeds the counters and the conflict dialog.

---

## Common tasks

- **Add a PURL group:** extend `GROUPS`, `STRINGS.*.groups`, `URL_T.*.g_<group>`, and the CI list in `checks.yml` ("data.json is valid").
- **Add a reserved path:** when a target site gains a top-level file, add it to `RESERVED_PURL` (and the CI list).
- **Change the 404 / url index / paste shell:** edit the generator, reload the dash, press sync / regenerate (or regenerate the files and commit them in the target repos).
- **Change what gets written on save:** `derivedPurlWrites()` / `pasteWrites()`. Keep the sequential-within-repo rule and the script-before-HTML order.

---

## Things to avoid

- Frameworks, build steps, separate app JS/CSS files.
- `Promise.all` over writes to the same repo.
- Saving when `loaded` is false, or reading PURLs from the deployed site while authed. Use the GitHub copy and its SHA.
- Inline `on*=` handlers, `innerHTML` with unescaped data (use `esc()`), `alert()`/`confirm()`.
- Comments that describe *what* code does. Comment only non-obvious *why* (like the sequential-write rule).
