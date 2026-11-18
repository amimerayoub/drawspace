# Appwrite bandwidth audit (STEP 0)

Scope: every live call site of `custom_words`, `createJWT`, `account.get`, `listRows`, `getRow`,
`createRow`, `updateRow`, `upsertRow`, `player_progression`, `user_statistics`, `profiles`,
`sessions` in `src/` (SPA) and `server/src/` (API). Tests, docs and migration scripts excluded
(they do not run in production). Measured top consumers from Appwrite Usage -> Bandwidth:
custom_words 8.2 MB, /v1/account 4.4 MB, /v1/account/jwts 3.9 MB, player_progression 1.5 MB,
user_statistics 1.3 MB, profiles 0.7 MB.

All row reads go through `RowRepository` (server/src/repositories/rowRepository.ts:8-35):
`findOne` = listRows equal+limit(1), `list` = listRows with caller queries. **No call site uses
`Query.select`, so every row downloads full Appwrite metadata ($id, $createdAt, $updatedAt,
$permissions, $databaseId, $tableId, ...).** The only existing cache in the data layer is
XpConfigRepository (5 s).

## Backend

| # | file:line | runs in | frequency | cached? |
|---|---|---|---|---|
| B1 | server/src/repositories/wordRepository.ts:14 | `WordRepository.active()` listRows custom_words `[isActive=true, limit 500]`, all fields | called from socket/handlers.ts:274 `offerWords()` -> **once per round** (round start, intermission next-round handlers.ts:338, drawer-disconnect finishRound path) | no |
| B2 | server/src/auth/verifyJwt.ts:8 | `database.accountForJwt(jwt).get()` = GET /v1/account | auth/middleware.ts:18 and :34 -> **every authenticated HTTP request**; socket/handlers.ts:77 -> **every socket handshake/reconnect** | no |
| B3 | server/src/repositories/progressionRepository.ts:64-68 | `leaderboard()` = 4 listRows: player_progression limit 500, profiles limit 500, user_statistics limit 500, titles limit 200, all fields | **per GET /api/progression/leaderboard request** (pre-T4 SPA fetched it 9x/session; post-T4 1x/session but server still recomputes) | no server cache (T5 added HTTP Cache-Control only) |
| B4 | server/src/repositories/progressionRepository.ts:33-38 | `dashboard()` = 9 listRows (player_progression 1, user_statistics 1, achievements 200, user_achievements 200, titles 200, user_titles 200, challenges 200, user_challenges 200, xp_transactions 100) + xpConfig.get | **per GET /api/progression/me** (session start, Achievements/Challenges views, post-mutation refresh) | only xpConfig (5 s) |
| B5 | server/src/repositories/statisticsRepository.ts:19 | `get()` findOne user_statistics | per GET /api/statistics/me, per dashboard (B4), per recordMatch (:24) | no |
| B6 | server/src/repositories/profileRepository.ts:21 | `get()` findOne profiles | per GET /api/profiles/me, per ensure (:31, guest+signup), per update (:49), per markRegistered (:63) | no |
| B7 | server/src/repositories/progressionRepository.ts:113-121, 182-199, 124-147, 149-162, 164-180 | `recordMatch` -> award (xp_transactions find+insert, player_progression find+patch), statistics.recordMatch (find+patch), unlockEligible (achievements list 200 + per-achievement user_achievements find/insert + progression find/patch), unlockTitles (titles list 200 + user_titles find/insert), updateChallenges (challenges list 200 + user_challenges find/patch) | **once per player per finished match** (matchPersistenceService.ts:27 via handlers.ts:325/352, idempotent by transaction id, retried with backoff) | no; catalog lists re-read per player |
| B8 | server/src/repositories/guestRepository.ts:14, 18, 21, 25, 28 | guest_sessions findOne/insert/patch | per guest sign-in and per guest->account migration | no (low frequency, acceptable) |
| B9 | server/src/repositories/adminDataRepository.ts:28, 35, 39 | words list 500 / upsert / delete | admin Words screen load and admin word mutations | no; **mutation points for invalidateWords()** |
| B10 | server/src/content/wordService.ts:89, 176, 185, 226, 257, 271, 321, 341, 357 | word CRUD, bulk active/delete, category rename/reassign, import paging | admin content API + MCP only | no; **mutation points for invalidateWords()** |
| B11 | server/src/routes/contentApiV1.ts:160-166, 168-169 | public GET /api/v1/words (paginated active words) and /words/categories | any client, paginated but enumerable -> leaks the game word pool | no |
| B12 | server/src/mcp/tools.ts:131, 158, 199, 200, 233 | MCP word list/delete/export/stats | MCP key holders only | no (low frequency) |
| B13 | server/src/repositories/adminUserRepository.ts:41, 54, 68-102 | users.list + profiles/statistics/progression/roles lists for admin Users screen | admin page loads and moderation actions | no (admin-only, low frequency) |
| B14 | server/src/repositories/xpConfigRepository.ts:28 | xp_config read | per award/dashboard | **yes, 5 s in-memory** (the only existing cache) |

## Frontend

| # | file:line | runs in | frequency | cached? |
|---|---|---|---|---|
| F1 | src/lib/jwtCache.ts:32 | `appwriteAccount.createJWT()` - the **only** createJWT call site | on demand when <60 s of token life left; single-flight promise shared | **yes** (T3: in-memory {token,exp}, never localStorage); socketClient auth callback reuses it, reconnects do not mint new JWTs |
| F2 | src/services/backendAuth.service.ts:48 | `appwriteAccount.get()` in `currentUser()` | AuthProvider mount (context/AuthContext.tsx:35) + every `refresh()` (Achievements.tsx:28 after equip, Challenges.tsx:30 after claim, Profile.tsx:62 after save) | no (React state only holds the derived session) |
| F3 | src/services/backendAuth.service.ts:59 | `account.get()` in signIn | per sign-in (needed for email) | n/a |
| F4 | src/services/backendAuth.service.ts:90 | `account.get()` in updateProfile ownership check | per profile save | no (could use context user id) |
| F5 | src/services/backendAuth.service.ts:18-21 | `toUser()` = GET /api/statistics/me + GET /api/progression/me | per currentUser/signIn/signUp/continueAsGuest | no |
| F6 | src/services/backendAuth.service.ts:49, 60, 69 | GET /api/profiles/me | same triggers as F5 | no |
| F7 | src/services/backendAuth.service.ts:14, 84 | `deleteSession('current')` (Appwrite sessions endpoint) | per signIn/signUp/guest/signOut (needed to clear lingering sessions) | n/a |
| F8 | src/services/backendAuth.service.ts:77 | `createAnonymousSession()` | per guest sign-in | n/a |
| F9 | src/routes/Lobby.tsx:31-38 | GET /api/rooms (auth none) | mount + manual Refresh button; `refresh` is useCallback([]) so the effect runs once | no polling; no socket push for the room list |
| F10 | src/game/useGameEngine.ts:342, src/routes/GameRoom.tsx:112, src/hooks/useSound.ts:88 | setInterval | local UI ticks only (round timer, countdown, sound loop) - **no network polling anywhere** | n/a |
| F11 | leaderboard/landing/achievements/config queries | TanStack Query (T4) | staleTime leaderboard 60 s, blog/achievements/config 5 min, /me 30 s; measured 1 leaderboard GET per session post-T4 (was 9) | **yes** |
| F12 | /api/admin/me | not called anywhere in the SPA | admin role comes from /api/profiles/me `adminRole` (T4) | n/a |

## Where the megabytes come from

- **custom_words 8.2 MB**: B1, 500 full-metadata rows per round, every round, every room.
- **/v1/account 4.4 MB**: B2 (one Appwrite account fetch per authenticated HTTP request and per
  socket handshake) plus F2/F3/F4 browser-side account.get.
- **/v1/account/jwts 3.9 MB**: measured on the pre-T3 deploy where every authenticated apiGet
  minted a JWT; F1 (T3 cache) already removes this once deployed.
- **player_progression 1.5 MB / user_statistics 1.3 MB / profiles 0.7 MB**: B3 (three 500-row
  full-table scans per leaderboard request, 9 requests per session pre-T4) plus B4/B5/B6 per /me.
- Write volume (B7) is already end-of-match and idempotent; its cost is re-reading catalog
  tables (achievements/titles/challenges, 200 rows each) per player and no read caching.

## Fix map (tasks BW1-BW6)

- BW1: B1 -> paged, select-only, TTL 1 h in-memory words cache, single-flight, startup warm,
  stale-on-error, invalidateWords() wired to B9/B10; B11 word pool exposure closed.
- BW2: B2 -> cached verification (token hash -> identity until exp, max 10 min); F2/F4 -> single
  bootstrap/store read; F1 already compliant.
- BW3: B4/B5/B6 -> 30 s TTL LRU per userId + select-only reads; /api/me/bootstrap; B7 catalog
  lists cached and zero-delta writes skipped.
- BW4: F5/F6 -> one bootstrap call; F11 already compliant; F9/F10 no polling to remove.
- BW5: B3 -> 30-60 s server compute cache + ETag/304 on public and /me GETs + compression.
- BW6: counter around the Appwrite client (all tables + account/jwts), admin-only stats route;
  guest 5/h per IP already shipped in T9.