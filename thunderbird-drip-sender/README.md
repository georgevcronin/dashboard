# Drip Sender

A Thunderbird MailExtension that takes every message currently in your Drafts
folder(s) and sends them out one at a time on a schedule you control (e.g.
every 15 minutes between 1pm and 3pm, Mon–Fri).

## A note on manifest version

This extension targets **Manifest V3**, which is what current Thunderbird
(128+) treats as the supported/default manifest version — MV2 is legacy at
this point. Thunderbird's MV3 background pages are still plain scripts
(`background.scripts`, not a service worker like Chrome/Firefox MV3), and
they're non-persistent event pages that Thunderbird can terminate when idle —
which is exactly why this extension uses the `alarms` API instead of
`setTimeout`/`setInterval`, and keeps all state in `storage.local`.

## How it works

- **`Queue Drafts for Drip Sending`** — right-click any folder in the folder
  pane and choose this, or open the toolbar popup and click **Queue Drafts
  Now**. Either way, it snapshots every account's Drafts folder (sorted
  oldest-first by date) into a persistent queue. New drafts added afterward
  are *not* picked up automatically — re-run the command to refresh the queue.
- Every minute, an alarm wakes the background script, which checks:
  1. Is today an allowed day, and has the current time passed one of the
     configured send-time "slots"?
  2. Has that slot already been used (so we don't send twice in one slot)?
  3. Is the queue non-empty and not paused?
  - If all yes, it opens the next queued draft with `compose.beginNew()` and
    sends it with `compose.sendMessage()`, then removes it from the queue.
  - If a draft fails to send (or no longer exists), it's logged and skipped —
    the schedule moves on to the next draft rather than getting stuck.
  - If the queue has more drafts than there are slots in a day, sending
    continues on the next allowed day, same window.
- The window/day check is re-derived from the clock on every run, so a
  late-firing alarm, a Thunderbird restart mid-schedule, or reloading the
  add-on will never send outside the configured window.

## Loading it for testing

1. Open Thunderbird.
2. Go to **Tools → Developer Tools → Debug Add-ons** (or **about:debugging**
   in older versions).
3. Click **Load Temporary Add-on…**.
4. Select `manifest.json` in this folder.
5. The extension icon appears in the toolbar; a **Drip Sender** entry appears
   under **Add-ons → Preferences/Options** for the schedule settings.

Temporary add-ons are unloaded when Thunderbird restarts — reload them the
same way each session while testing.

## Configuring the schedule

Open the extension's options page (toolbar popup icon → gear, or
**Add-ons Manager → Drip Sender → Preferences**):

- **Days to send on** — checkboxes, default Mon–Fri.
- **Start time / End time** — default 1:00 PM–3:00 PM, in your local time.
- **Interval (minutes)** — default 15. Send "slots" are computed as
  `start, start+interval, start+2*interval, ...` up to but not exceeding the
  end time.

Click **Save**. Changes apply on the next alarm tick (within a minute).

## Using it

1. Put the messages you want sent into any account's Drafts folder.
2. Right-click a folder in the folder pane → **Queue Drafts for Drip
   Sending** (or use **Queue Drafts Now** in the toolbar popup).
3. Open the toolbar popup any time to see: how many drafts are queued, how
   many have been sent, the next scheduled send time, and a recent-activity
   log.
4. Use **Pause/Resume** to temporarily stop sending without losing the
   queue, or **Clear Queue** to discard it entirely.

## Permissions used

| Permission | Why |
|---|---|
| `messagesRead` | List messages in the Drafts folder(s). |
| `accountsRead` | Look up folders (needed by `folders.query`) and read folder info on message headers. |
| `compose` | Open a queued draft for sending via `compose.beginNew()`. |
| `compose.send` | Actually send it via `compose.sendMessage()`. |
| `storage` | Persist the queue, schedule, progress, and log across restarts. |
| `alarms` | Wake the background script roughly once a minute without relying on timers that die with the event page. |
| `menus` | Add the folder-pane context menu item. |

## Packaging as a `.xpi`

A Thunderbird `.xpi` is just a zip of the extension's files with a `.xpi`
extension. From inside this folder:

```sh
zip -r -X ../drip-sender.xpi manifest.json common.js background.js \
  popup.html popup.js options.html options.js
```

Then in Thunderbird: **Add-ons Manager → gear icon → Install Add-on From
File…** and select `drip-sender.xpi`. For distribution outside your own
profile (e.g. via addons.thunderbird.net), the `.xpi` needs to be signed by
Mozilla; for personal/permanent local use, installing the unsigned `.xpi`
this way is sufficient.
