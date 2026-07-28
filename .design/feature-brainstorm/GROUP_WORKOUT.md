# Live Shared Workout Sessions — Fully Worked-Out Mechanics

Supersedes the earlier draft in this file. Follows on from the one-line mention in `PRODUCT.md` ("live shared workout sessions where each participant logs their own sets independently while watching the other's progress in real time") — worked out in full via a grilling pass. Nothing below is built yet.

**Scope decision**: this ships *decoupled from* the full username/public-profile system in the original roadmap note. It needs only a minimal per-account display name (whatever the user signed up with) plus a lightweight follow-request system, both scoped to this feature. The fuller "mandatory username, searchable public profiles" system stays a separate, later, roadmap item — nothing here blocks on it.

---

## 1. Core model

- Up to **4 participants** per session.
- No real-time sync — participants see each other's progress via **manual refresh or an automatic refresh every ~2 minutes** while the session view is open (no polling when it isn't).
- Joining requires **no prior relationship** — any account can join any session via a **4-character code**, shared out-of-band (read aloud, texted, whatever).
- **Following** (separate from joining a session) *does* require acceptance — a lightweight request/accept flow, not instant.

---

## 2. Starting and joining

- Entry point: a **"Start Group Session" action available from inside an already-started solo workout** (not a pre-workout setup screen, not a new nav item). The button generates a 4-character code and shows it for the creator to share.
- The code is **reusable until the session fills to 4 participants or the session ends** (not single-use / not burned per join). It goes dead once the session is full or over — a stale code can't join a dead session.
- Anyone with the code and an account can enter it and join — same "empty workout" starting point conceptually, except:
  - **Merge-on-connect**: whenever a person's *current in-progress solo workout* connects to a group session — whether they're the creator starting one, or someone joining an existing one via code — all sets they've *already logged* in that in-progress workout get copied into their tab in the shared session view. This isn't forward-only; it's a full merge of "whatever you've done in this workout so far" the moment you connect, then continues appending live from there.
  - If someone has no sets logged yet when they connect, their tab simply starts empty, same effect.

### Session-full / bad-code states (not deep-designed, but named)
- Entering an invalid code: simple error, "session not found."
- Entering a valid code for a session already at 4 participants: "session full," no join.

---

## 3. During the session

### The shared view
- A **tab per participant** at the top of the session view; tapping a tab shows that participant's exercises/sets.
- **Adding an exercise** can be scoped two ways:
  - **"Add to everyone"** — creates an *empty exercise slot* (just the exercise name) in every participant's tab. It does **not** copy sets/weights/reps — each person logs their own numbers, since different people lift different weights for the same movement.
  - **Add individually** — adds the exercise only to the adder's own tab, exactly like solo logging today.
- **Full mutual edit/delete**: any participant can edit or delete *any* piece of information on *any* other active participant's tab — sets, weights, reps, RPE, exercise entries, all of it. This is a deliberate flat trust model for the max-4, code-joined, presumably-in-the-same-room group; there's no owner-only restriction while a session is active.
- **Shared entries carry the full set schema** from the moment they're created — `exercise, kg, reps, rpe, type, machine, pulleyType` (matching the shape a solo set already has, per `functions/index.js`'s `/session/complete` handler) — not a stripped-down version that needs upgrading later. This keeps "finish and save" a straight copy, not a merge of two different shapes.

### Conflict handling
- **Last-write-wins, no conflict protection.** Given the small group size, the 2-minute refresh window, and the low cost of noticing and re-fixing a stray overwrite, this is accepted as-is rather than building version-checked writes or reject-and-retry UI — disproportionate engineering for the actual risk here.

---

## 4. Leaving, finishing, and ending

Three ways a participant's involvement in a session ends — all **self-scoped only**, none of them affect anyone else's session:

1. **Finish your workout** — the normal "end workout" action (same as solo today). Triggers:
   - A **fresh refresh/pull from the shared session data before the save-to-profile call** — so any edits others made to your sets in the last couple minutes aren't lost to a stale local save.
   - Save to your personal account, same `/session/complete`-style flow as today, **tagged as a group session** — your saved workout record notes which other accounts you did it with (not just a boolean flag).
   - Your tab **disappears from the other active participants' view immediately**, and your data becomes **locked** — no one else can edit it from that point on.
2. **Leave the group** — distinct from finishing. You keep working out solo (your own workout keeps going, unsaved), but you exit the shared aspect. Same visible effect as finishing from everyone else's side: **your tab disappears from the remaining participants' view immediately.** No save-to-profile happens yet — that still only occurs whenever you personally finish your own workout later, on your own.
3. **1-hour inactivity auto-finish** — if a participant goes quiet (no set added/edited/deleted, viewing/refreshing doesn't count) for 1 hour, they're **automatically finished and saved**, same as action #1, except the recorded workout **end time is backdated to their last actual activity**, not stretched to include the idle hour — so the saved duration stays honest.

There is **no group-wide "end session for everyone" action** — every exit is individual. The session simply continues to exist as long as at least one participant is still active in it.

### Cleanup
- The `liveSessions` document, its code, and its shared entries only get deleted **once every participant who was in it has individually finished and saved** (whether via manual finish or the 1-hour timeout). Until then it persists, even if it's down to one remaining active participant.
- Nothing about a finished/left participant's *personal* saved data is ever deleted — only the temporary shared-session scaffolding goes away once its job is done.

---

## 5. Following

- A participant can send a **follow request** to anyone visible in the session (tap their tab/name → follow) — no prior username search, since you only ever follow someone you're already sharing a session with.
- Following requires **acceptance**, not instant — a lightweight request/accept model, not full mutual (X can follow Y without Y following X back).
- **Incoming requests** surface as a **badge on the recipient's profile/settings nav icon** — no dedicated inbox screen (would be excess UI surface for one notification type), and not session-scoped-only (so a request from someone who's already left the session is still visible and actionable).
- **On acceptance**, the original requester **also gets a notification** (same badge pattern, other direction) — not silent.
- Once followed, the follower sees whatever the followed person has opted to expose per the existing visibility-toggle system in `PRODUCT.md` (workout sessions visible by default; sleep/nutrition/mentor-chat/etc. off by default) — this feature doesn't change or bypass those toggles, it's just how the follow relationship gets established in the first place.

---

## 6. Data model

Cross-user data doesn't fit the existing per-user wholesale-document pattern — `ARCHITECTURE.md` is explicit that `functions/index.js` loads one Firestore document per user into a module-level `db` variable per request, relying on 1st-gen Cloud Functions' single-request-per-instance guarantee. Reading/writing *multiple* users' data in one request breaks that assumption, and doing it via a side door into per-user docs is exactly the shape of bug that caused the account-data-mixing incident referenced in `SELLABILITY_ANALYSIS.md`. This needs its own collection, entirely separate from any user's per-user document.

```
liveSessions/{sessionId}
  code: string (4 chars, unique among active sessions)
  createdBy: uid
  createdAt: timestamp
  participants: [
    { uid, displayName, status: "active" | "left" | "finished", joinedAt, lastActivityAt }
    ... (max 4)
  ]
  # no "status: closed" field needed — session existence IS its status;
  # deleted once every participant is "left" or "finished"

liveSessions/{sessionId}/entries/{entryId}
  uid              # who this set belongs to (not necessarily who wrote it last)
  lastEditedBy: uid
  exercise
  kg
  reps
  rpe
  type
  machine
  pulleyType
  loggedAt: timestamp
  updatedAt: timestamp
```

- `entries.uid` identifies *whose* set it is (which tab it lives under); `lastEditedBy` tracks who actually wrote the current values, useful for surfacing "edited by X" if ever wanted, though not required for v1.
- Personal per-user solo-logging writes are **unchanged** — they still only happen via `/session/complete` when that user finishes. The shared collection is a parallel, temporary write target that exists only while a session is live, mirrored into the personal record at finish-time (with the pre-save refresh from §4 pulling the latest shared state first).
- `participants[].lastActivityAt` backs the 1-hour timeout — updated only on entry create/edit/delete (§3/§4), not on view/refresh.

### Backend endpoints (new, additive — none touch the existing per-user `db` load/save path)
- `POST /session` — create, generates code, returns sessionId + code.
- `POST /session/join` — join by code (validates not full, not ended).
- `POST /session/:id/merge` — bulk-copy the caller's current in-progress local sets into their tab on connect (creator on start, joiner on join).
- `POST /session/:id/entries` — create/edit/delete a set on any participant's tab (mutual, while both are still active).
- `GET /session/:id` — full session + entries, used by manual/2-min-poll refresh.
- `POST /session/:id/finish` — self-scoped: refresh-then-save-to-profile, tag as group session, remove from others' view, lock.
- `POST /session/:id/leave` — self-scoped: remove from others' view, no save.
- (1-hour timeout handled server-side, e.g. a scheduled function checking `lastActivityAt` across active sessions, auto-triggering the same finish path with backdated end time.)
- `POST /follow-request`, `POST /follow-request/:id/accept` — separate from sessions, but only reachable from within a shared session's participant list for now.

---

## 7. Security rules sketch

Current `firestore.rules` is fully open (`allow read, write: if true` on `peak/{doc}`) — a pre-existing gap, independent of this feature, that should be fixed before *any* multi-user surface goes live, this one included.

```
match /liveSessions/{sessionId} {
  allow create: if request.auth != null
    && request.resource.data.createdBy == request.auth.uid;

  allow read: if request.auth != null
    && request.auth.uid in resource.data.participants[*].uid;

  // Joining/leaving/finishing mutate `participants` only — enforced
  // server-side via the Cloud Function endpoints above (join caps at 4,
  // finish/leave only touch the caller's own entry in the array), not
  // via open client-side field writes.
  allow update: if request.auth != null
    && request.auth.uid in resource.data.participants[*].uid;

  match /entries/{entryId} {
    // Full mutual read/write while both the editor and the entry's owner
    // are still "active" participants — deliberately not scoped to
    // "only the entry's own uid may write it," per the flat-trust model.
    allow read: if request.auth != null
      && request.auth.uid in get(/databases/$(database)/documents/liveSessions/$(sessionId)).data.participants[*].uid;

    allow create, update, delete: if request.auth != null
      && request.auth.uid in get(/databases/$(database)/documents/liveSessions/$(sessionId)).data.participants[*].uid
      && get(/databases/$(database)/documents/liveSessions/$(sessionId)).data.participants
           .filter(p => p.uid == resource.data.uid)[0].status == "active";
      // i.e. can't touch an entry whose owner has already left/finished —
      // matches "locked the moment someone finishes or leaves" from §4
  }
}
```

Notes carried over from the earlier pass, still true:
- `participants[*].uid` array-of-maps membership checks need verifying against the current Firestore rules-engine syntax at implementation time — may be simpler in practice to maintain a flat `participantUids: [uid, ...]` field purely for rule matching, alongside the richer `participants` array used for display/status.
- Nothing here grants access to another participant's per-user `peak/{uid}`-style document — that boundary stays exactly as tight as it is today. The full mutual-trust model is deliberately scoped to the narrow, temporary, auditable `liveSessions` collection only.

---

## 8. Explicitly out of scope for this feature

- No live chat, comments, reactions, cheering mechanics.
- No leaderboard/ranking within a session.
- No pushing participants toward the same exercise selection — the shared element is presence/timing, not programming.
- No group-wide "end for everyone" action — every exit is individual (§4).
- No dedicated notifications inbox — a badge on the existing profile/settings entry point covers both request-received and request-accepted cases (§5).
- The full public-username/searchable-directory system — deferred, this feature doesn't need it (§ "Scope decision" above).
