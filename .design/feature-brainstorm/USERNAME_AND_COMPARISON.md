# Username System & Muscle Comparison — Fully Worked-Out Mechanics

Follows [[GROUP_WORKOUT.md]] (`/home/george/Code/dashboard/.design/feature-brainstorm/GROUP_WORKOUT.md`), which shipped decoupled from a full username system by using a minimal display name + lightweight follow-request flow. This doc replaces that lightweight groundwork with the real thing, worked out via a grilling pass, and adds a new muscle-comparison feature that depends on it. Nothing below is built yet.

---

## 1. Username

- **Mandatory on first login**, but low-friction: pre-filled with a suggested value (slugified account name + random suffix, e.g. Google name "George Cronin" → suggestion `georgecronin-jasjflj`), accept-or-edit rather than a blank required field.
- **Every account must have a username — not just new signups.** This has to be enforced at the gate, not just at signup time: any authenticated request from an account with no `username` set on `db.profile` gets redirected to the same mandatory pre-filled step before anything else loads, whether that account is brand new or has existed since before this feature shipped (e.g. George's own current account). Same rule applies retroactively — no account should ever be able to stay in a no-username state indefinitely just because it predates this feature.
- **Format**: lowercase letters, numbers, and hyphens only. 3–20 characters.
- **Uniqueness**: case-insensitive (compare/store lowercased) — "George" and "george" collide.
- **Changeable** later from Settings, same format/uniqueness rules re-validated on change — but **rate-limited to once per month** (needs a `lastUsernameChangeAt` timestamp to enforce).
- **Not shown in the UI as a visible handle anywhere by default** — it exists to guarantee a unique identity and to power **open prefix search** (see §3), not to be displayed next to someone's name in tabs/lists. It does show up on a profile view screen (§4).

### Uniqueness enforcement
No cross-user querying exists in the current architecture (`ARCHITECTURE.md`: one Firestore doc per user, loaded wholesale, no cross-collection queries). Uniqueness needs its own structure:

```
usernames/{lowercasedUsername}
  uid
```

- Document ID *is* the uniqueness key — Firestore guarantees no two docs share an ID.
- Claimed via a **transaction**: check-then-create atomically, closing the race window where two people could both pass an availability check at the same instant.
- On rename: same transaction deletes the old `usernames/{old}` doc and creates the new one — exactly one live mapping per user at all times.

---

## 2. Display name

Separate from username — a cosmetic, non-unique field.

- **Format**: letters (any language/unicode letters) + spaces + hyphens. **No numbers.**
- **Freeform otherwise** — reasonable length cap (e.g. 30 chars), no rate limit on changes (it's not a lookup key, so rapid changes carry none of the confusion risk a username change would).
- Pre-filled at first login (same step as username) from the user's actual Google account name, verbatim — spaces preserved (e.g. "George Cronin" stays as typed, not forced into "George-Cronin").

### First-name-only display rule
**What's shown to other people is always derived down to the first token of `displayName`** — consistently, everywhere it's shown to someone else (session tabs, follow lists, follow-request badges, profile views, comparison screens). The full `displayName` as entered is visible only to the account owner themselves (their own Settings/profile).

Practically: derive a `displayNameFirst` value (first whitespace-delimited token) and use *that* field on every external-facing surface; the full `displayName` field is read only when rendering the owner's own view of their own profile.

### First-login flow, combined
Both `username` and `displayName` are prompted and pre-filled on the **same mandatory first-login step** — no separate later step, no window where the app has no cosmetic name to show.

---

## 3. Search

- **Open prefix search** — any authenticated user can search any username, no prior connection required (mirrors the "Twitter tag" mental model this was explicitly compared to). Solves the chicken-and-egg problem a connection-gated search would create.
- **Prefix match, not exact-only** — implemented as a Firestore range query over the `usernames` collection:
  ```
  usernames
    .where('__name__', '>=', prefix)
    .where('__name__', '<', prefix + '')
  ```
- Lives in the **Profile area** of the app — same place the follow-request badge lives (§5), consolidating all social-feature entry points into one hub rather than spreading them across the nav, per `PRODUCT.md`'s sparseness principle.

---

## 4. Profile view

Reached by search result tap, or from a session participant's tab/name (carried over from `GROUP_WORKOUT.md`'s "follow by tapping someone in a session" flow — both paths land on the same profile screen now).

- **Non-follower view (minimal)**: first name (derived, per §2) + username + a "Follow" button. Nothing else — no follower counts, no mutual-session badges, no vanity metrics (matches `PRODUCT.md`'s anti-reference stance against social-proof numbers).
- **Follower view**: whatever the profile owner has made visible per the existing per-category visibility-toggle system (workout sessions visible-by-default to followers, sleep/nutrition/mentor-chat off by default) — this feature doesn't change or bypass those toggles, it's just the new entry point for establishing the follow relationship that makes those toggles apply.
- The muscle-comparison entry point (§6) also lives here, gated by mutual follow + mutual comparison-toggle (§6).

---

## 5. Follow

Carried over from `GROUP_WORKOUT.md` §5, restated for completeness now that search/profile exist as additional entry points (not just tapping someone in a shared session):

- **One-directional, request-based** — X can send Y a follow request from Y's profile (via search, or via a shared session); Y must accept, it's not instant.
- **Incoming requests**: badge on the recipient's Profile nav icon. No dedicated inbox screen.
- **On acceptance**: the original requester **also gets a notification** (same badge pattern, reverse direction) — not silent.
- Following is inherently asymmetric — X follows Y doesn't require Y follows X back — **except** where the muscle-comparison feature specifically requires mutuality (§6).

---

## 6. Muscle comparison

A new feature: compare **per-muscle strength score** and **per-muscle training stimulus** (rolling 7/14/30-day window) between two mutually-followed, mutually-opted-in users.

### Gating
- **Separate visibility toggle**, off by default, distinct from the "workout sessions visible" toggle. Reasoning: a single visible session ("did legs Tuesday") is a much smaller disclosure than a persistent, always-current rollup of someone's overall relative strength — closer in sensitivity to the off-by-default sleep/nutrition/mentor-chat categories than to the on-by-default session-log category.
- **Requires mutual follow AND mutual toggle** — both people must follow each other *and* both must have the comparison toggle on, or the view shows neither side. A "comparison" inherently exposes your data to them as much as the reverse; making it symmetric is what keeps that fair.
- Since computation is on-demand (no caching, see below), turning the toggle off takes effect immediately — no stale cached comparison lingers after consent is withdrawn.

### What's compared
Two metrics, each its own sub-view/tab within the comparison screen:

1. **Strength score** — per-muscle, via `computeMuscleLevels` (`functions/strengthStandards.js:394`), which already normalizes by bodyweight and sex and is fatigue-corrected per (lift, muscle) pair. Not windowed — reflects current standing.
2. **Stimulus** — per-muscle, via `computeStimulusContributions` (`functions/adaptation.js:86`), filtered to a **selectable rolling window: 7, 14, or 30 days**. The window selector only applies to this sub-view (strength score isn't windowed).

### Display
**Both** a dual body diagram and a per-muscle table, for each sub-view:
- Dual diagram: reuses the existing colored-body-diagram visualization pattern from the Adaptation tab (`S5`), rendered twice (once per person) rather than attempting a single split-color diagram — avoids inventing a dual-encoding scheme for two people's data on one diagram.
- Table: muscle name, your value, their value, side by side — precise, easy to eyeball who's ahead and by how much.

### Backend
- **On-demand, no caching.** `computeMuscleLevels`/`computeStimulusContributions` are already cheap enough to run per-request for a solo view (per existing Adaptation-tab usage); running them twice (once per user) on comparison-view-open is an acceptable doubling, not a new performance concern.
- **Read-only, both users' documents loaded in one request** — this breaks the "one document per request" assumption in `ARCHITECTURE.md`, same as the group-workout feature already does, but since there's no `save()`/mutation involved here (purely read + compute + return), it doesn't carry the request-scoped-mutable-`db` risk that pattern was originally guarding against. Load both docs into local variables; never touch the module-level `db` global for this endpoint.
- New endpoint, e.g. `GET /compare/:otherUid?metric=strength|stimulus&window=7|14|30` — checks mutual-follow + mutual-toggle server-side before returning anything (never trust a client-side gate for this).

---

## 7. Explicitly out of scope / not decided here

- No public discovery beyond prefix search (no "suggested users," no trending/popular accounts).
- No caching/precompute for comparisons — revisit only if load ever becomes a real concern (unlikely at this app's scale).
- Rate-limiting on search or follow-request spam wasn't designed — flagged as a follow-up if abuse ever becomes a real concern, not scoped now.
- Firestore security rules for the `usernames` collection (open read for search, transaction-gated write) weren't drafted in this pass — needed before implementation, same category of work as `GROUP_WORKOUT.md` §7.
