# Life Hub site

Public repo. Do not add IDs, tokens or bank data to any file here.

Exceptions: the Apps Script exec URL is in `index.html` (bank approval callback, 18 Oct 2026) and in `shared/auth.js` (Google sign-in, 22 Oct 2026). The Google OAuth client ID in `shared/auth.js` is public by design. The URL alone grants nothing: every route on it needs the money token or SYNC_TOKEN, except `connect=redirect`, which needs a state the backend made in the last hour and uses once.

Full project context (private, outside this repo):
@../lifehub-script/CLAUDE.md

## Quick rules
- Push: `python3 bump.py && git add -A && git commit -m "..." && git push`. Always run `bump.py` first (cache-busting).
- **Menu:** `shared/nav.js`, one copy for every page (each page has `<div id="lhn"></div>` followed by its script tag). A new page = one line in `GROUPS`; `scripts-check.js` fails if a page is missing from the menu or does not load it.
- Shared files: `shared/theme.css`, `shared/sync.js`, `shared/travel.js`, `shared/year.js` + `shared/year.css` (the year grid, the day list and the category picker styles, used by Money and Business), `shared/catpick.js`.
- Checks (no network): `node money/classify-check.js`, `node money/year-check.js`, `node money/render-check.js`, `node business/match-check.js`, `node business/render-check.js`, `node home-check.js`, `node scripts-check.js`, `node boot-check.js`, `node jar/check.js`. Run them all after touching `money/app.js`, `business/app.js`, `index.html` or anything in `shared/`.
- Backend changes go in `../lifehub-script` (clasp, personal user). See the private file.
- `index.html` finishes a bank approval: the bank app lands on `/?code=&state=`, the page sends it to `connect=redirect`, shows the result and drops the code from the URL. The Money page starts one with the **Approve** buttons on the Accounts tab.
- Every page loads `shared/auth.js` first in `<head>` (Google sign-in gate, see the private file section 8). New pages must too.
- Reply style: short, plain language (ASD-STE100), direct and honest.
