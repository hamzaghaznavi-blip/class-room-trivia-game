# Class Room Trivia Game

A fast, presentation-ready live quiz (“Smarter Than a 5th Grader” style): add players, pick categories, score from the host view.

| Mode | Behaviour |
|------|-----------|
| **Formal** | No buzzer, no speech — clean for exec demos. |
| **Informal** | Loud wrong-answer buzzer + **spoken** roasts (browser TTS: Urdu-leaning male + Punjabi-mix female lines). Grades **4–6** only for roasts. |

**Islam** is not a category (removed). Comparative religion still appears under *World Religion & Mythology*.

## Links

After you [rename the GitHub repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository) to `class-room-trivia-game` (recommended), use:

| | URL |
|---|-----|
| **Repository** | [github.com/hamzaghaznavi-blip/class-room-trivia-game](https://github.com/hamzaghaznavi-blip/class-room-trivia-game) *(create/rename to match)* |
| **GitHub Pages** | `https://hamzaghaznavi-blip.github.io/class-room-trivia-game/` |

`vite.config.ts` uses `base: '/class-room-trivia-game/'` so asset paths match that repo name.

### Direct entry URLs

- **Formal:** `…/class-room-trivia-game/?mode=formal`
- **Informal:** `…/class-room-trivia-game/?mode=informal`

The setup screen has **copy buttons** for both. Voices depend on the OS/browser (install Urdu/Punjabi/Hindi voices for best results).

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Stack

React, TypeScript, Vite, Tailwind CSS, Motion.
