# design.md — Playlist Generator

The visual language of the app. Read this before adding UI so styling stays
intentional and consistent instead of ad-hoc. Tokens map to Tailwind utility
classes (Tailwind v4, no config file — utilities are used directly in JSX).

## Design principles
1. **Dark, quiet, content-first.** The library and the curated playlist are the
   product. Chrome recedes; music metadata is the focus. Near-black canvas, low-
   chroma grays, one saturated accent.
2. **One accent, used sparingly.** Spotify green is reserved for primary actions
   and success. If everything is green, nothing reads as the action.
3. **Calm motion.** Animation clarifies state changes (results arriving, loading)
   — it never decorates for its own sake. Always honor `prefers-reduced-motion`.
4. **Honest feedback.** Loading is indeterminate when the duration is unknowable
   (LLM/network); never fake a percentage.

## Color tokens
| Role | Value / Tailwind | Notes |
|------|------------------|-------|
| Canvas | `#0a0a0a` (body bg) | Near-black, not pure black |
| Surface | `bg-zinc-900` | Cards, inputs |
| Border | `border-zinc-800` / `border-zinc-700` | 800 subtle, 700 for inputs |
| Text primary | `#f5f5f5` / `text-white` | Titles, track names |
| Text secondary | `text-zinc-400` | Supporting copy |
| Text tertiary | `text-zinc-500` / `text-zinc-600` | Artists, years, timestamps |
| Accent | `bg-green-600` → `hover:bg-green-500` | Primary buttons only |
| Success | `text-green-400` | "Playlist saved", granted states |
| Error | `text-red-400` | Failures |

## Typography
- **Family:** `system-ui, -apple-system, sans-serif` (fast, native, no web-font
  load). Revisit only if branding demands a display face.
- **Scale (in use):** page title `text-2xl` semibold; section title `text-xl`
  semibold; body/inputs `text-sm`; meta `text-xs`; stat numbers `text-3xl` bold.
- **Truncation:** long track/artist names use `truncate` + `min-w-0` in flex rows.

## Spacing & shape
- **Radius:** `rounded-xl` for buttons/inputs, `rounded-lg` for list rows,
  `rounded-full` for progress bars/pills.
- **Rhythm:** vertical gaps `gap-2 / gap-3 / gap-6 / gap-8`; control padding
  `px-4 py-2.5` (compact) / `px-4 py-3` (primary). Content column caps at
  `max-w-lg` and is centered.
- **Hover:** interactive rows use `hover:bg-zinc-900`; text links
  `hover:text-white` / `hover:text-zinc-300` with `transition-colors`.

## Motion (GSAP + CSS)
- **Library:** GSAP (`gsap` + `@gsap/react`) is available. Use the `useGSAP()`
  hook (auto-cleanup); scope animations to a ref, don't animate globally.
- **Curated results:** stagger cards in — `opacity 0→1`, `y 12→0`, `duration 0.4`,
  `ease power2.out`, `stagger 0.035`. See `CurateResult` in `LibraryScreen.tsx`.
- **Indeterminate loading:** the `indeterminate-slide` keyframe in `index.css`
  drives a green slice across a `bg-zinc-800` track (see `LoadingBar`). Use for
  curation phases and playlist save.
- **Durations:** entrances 0.3–0.5s; micro-interactions ≤0.2s. Prefer
  `power2.out` / `power3.out` easing. Keep it subtle.
- **Accessibility:** guard every GSAP entrance with
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and skip.

## Component patterns
- **Primary button:** `bg-green-600 hover:bg-green-500 disabled:opacity-40
  rounded-xl px-5 py-3 text-sm font-medium text-white transition-colors`.
- **Text input:** `rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3
  text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500`.
- **List row:** flex, `justify-between`, `px-3 py-2 rounded-lg hover:bg-zinc-900`.
- **Result card:** bordered (`border border-zinc-800 rounded-lg px-4 py-3`),
  stacked track name / artist·year / italic reason.

## Not yet defined (decide before building)
- Public/private playlist toggle styling (v2 — needs `playlist-modify-public`).
- Album-art thumbnails in rows (would add images; lazy-load + fixed size).
- Empty / error illustration states beyond plain text.
- A display typeface, if the app ever wants more personality than system-ui.
