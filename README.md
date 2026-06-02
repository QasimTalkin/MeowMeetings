# 🐱 MeowMeetings

> A macOS menu bar app that sends a cat across your screen to remind you about meetings.

No OAuth. No permissions dialog. No Electron splash screen. Just a cat.

![A glassmorphic banner being dragged across the screen by an animated SVG cat](.github/preview.png)

---

## What it does

MeowMeetings sits silently in your menu bar and syncs with Google Calendar via a private iCal feed. When a meeting is coming up, an animated vector cat walks from right to left across the **center of your screen**, pulling a glassmorphic banner showing the meeting title, a live countdown, and action buttons.

- **Join** — opens the video call link and the cat sprints off-screen
- **Snooze** — cat panics and runs, reminder comes back in 2 minutes
- **Dismiss** — cat walks away gracefully
- **Click the cat** — it meows at you

---

## Features

- Animated SVG cat with walking leg cycle, tail swing, and body bobbing
- Glassmorphic notification banner with live countdown (ticks every second)
- Click-through overlay — only the cat and banner are interactive
- 5 cat breeds: Orange Tabby, Calico, Tuxedo, Siamese, Midnight Void
- 100% local & private — no cloud, no accounts, just a secret iCal URL
- 10-second setup

---

## Stack

| | |
|---|---|
| Runtime | Electron 31 (Chromium + Node.js 22) |
| UI | Vanilla HTML / CSS / JS |
| Styling | Glassmorphism, `backdrop-filter`, CSS keyframe animations |
| Calendar | Custom ICS parser — no external library |
| Storage | Plain JSON via `fs` |
| Graphics | Pure inline SVG |

---

## Setup

**Prerequisites:** Node.js 18+ and npm.

```bash
git clone https://github.com/your-username/meow-meetings.git
cd meow-meetings
npm install
npm start
```

### Connect your calendar

1. Open **Google Calendar** in a browser
2. Hover over your calendar in the left sidebar → three dots → **Settings and sharing**
3. Scroll to **Integrate calendar** → copy **Secret address in iCal format**
4. Click the MeowMeetings menu bar icon → Settings → paste the URL → Save

> Keep the iCal URL private — it grants read access to your calendar without a password.

---

## Configuration

All settings are in the app's Settings panel:

| Setting | Options |
|---|---|
| Alert timing | 10 min / 5 min / 2 min / at start |
| Cat breed | Tabby / Calico / Tuxedo / Siamese / Void |
| Walking speed | Slow / Normal / Fast |
| Meow volume | Muted / Soft / Normal |

Hit **Test Cat Walk** to preview without waiting for a real meeting.

---

## Building a distributable

```bash
npm run package
```

Outputs a universal macOS `.dmg` in `dist/`.

---

## License

MIT
