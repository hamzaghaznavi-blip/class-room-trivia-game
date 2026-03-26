# Formal

**Formal** is a live “Smarter Than a 5th Grader”–style quiz studio: add players, pick categories, run the timer, and score from the host view.

- **Formal** — default presentation; no extra effects on wrong answers.
- **Informal** — same rules and scoring; on a **wrong** answer: short **buzzer** sound, and for **grades 4–6** a random **Roman-Urdu** “boys’ banter” line (generic, no names).

## Links

| | URL |
|---|-----|
| **Repository** | [github.com/hamzaghaznavi-blip/smarter-than-5th-grader](https://github.com/hamzaghaznavi-blip/smarter-than-5th-grader) |
| **GitHub Pages (live app)** | [hamzaghaznavi-blip.github.io/smarter-than-5th-grader](https://hamzaghaznavi-blip.github.io/smarter-than-5th-grader/) |

Share the **Pages** link for guests; keep the **host** device private if you use scoring controls.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output is in `dist/`. `vite.config.ts` uses `base: '/smarter-than-5th-grader/'` for GitHub Pages under the repo name path.

## Stack

React, TypeScript, Vite, Tailwind CSS, Motion.
