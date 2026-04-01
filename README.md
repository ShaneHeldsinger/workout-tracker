# LIFT - Workout Tracker PWA

A fully vibe-coded workout tracker built as a Progressive Web App. No frameworks, no build tools, no dependencies - just vanilla HTML, CSS, and JavaScript.

Built entirely through conversational AI pair programming with Claude.

## Features

- **Create workouts** - Define exercises with sets, reps, rest time, and optional weight (per-exercise or per-set)
- **Drag-to-reorder** - Grab the grip handle to rearrange exercises with smooth animations
- **Exercise types** - Regular, Warm-up, and Cool-down with visual badges
- **Train mode** - Start any workout, track sets with dot indicators, skip exercises if machines are busy
- **Rest timer** - Circular countdown between sets with skip option
- **Undo** - 8-second window to undo an accidental set completion
- **Workout history** - View past workouts with date, duration, exercises, weights, and completion status
- **Delete history** - Remove individual entries or clear all history
- **Fully offline** - Service worker caches everything, works without internet
- **Installable PWA** - Add to home screen on iOS/Android for native app feel
- **Local storage** - All data saved locally on device

## Setup

Just serve the files statically. No build step needed.

```bash
# Local development
python3 -m http.server 8080
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository
2. Go to Settings > Pages > Source: main branch
3. Access at `https://yourusername.github.io/workout-tracker/`
4. Install as PWA from Safari (iOS) or Chrome (Android)

## Tech Stack

- Vanilla HTML/CSS/JS (zero dependencies)
- Service Worker for offline caching
- localStorage for data persistence
- CSS custom properties, flexbox, animations
- Touch-optimized for iPhone 13

## Vibe Coded

This entire app was built through conversation - describing features in plain English and iterating on the output. Every line of code, every design decision, every animation was generated through AI pair programming. No code was written by hand.
