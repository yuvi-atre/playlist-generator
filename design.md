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

| Role           | Value / Tailwind                      | Notes                            |
| -------------- | ------------------------------------- | -------------------------------- |
| Canvas         | `#0a0a0a` (body bg)                   | Near-black, not pure black       |
| Surface        | `bg-zinc-900`                         | Cards, inputs                    |
| Border         | `border-zinc-800` / `border-zinc-700` | 800 subtle, 700 for inputs       |
| Text primary   | `#f5f5f5` / `text-white`              | Titles, track names              |
| Text secondary | `text-zinc-400`                       | Supporting copy                  |
| Text tertiary  | `text-zinc-500` / `text-zinc-600`     | Artists, years, timestamps       |
| Accent         | `bg-green-600` → `hover:bg-green-500` | Primary buttons only             |
| Success        | `text-green-400`                      | "Playlist saved", granted states |
| Error          | `text-red-400`                        | Failures                         |

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

## Motion — follows the Impeccable spec (github.com/pbakaus/impeccable)

- **Easing:** `ease-out-quart` = `cubic-bezier(0.165, 0.84, 0.44, 1)` (GSAP equivalent `expo.out`).
  Const `EASE_QUART` in `LibraryScreen.tsx` for the Tailwind arbitrary value. NO bounce/elastic/linear
  (linear only for the indeterminate progress bar).
- **Durations:** entrances/exits 200–300ms; hover/micro ≤200ms. Success ~260ms.
- **Only animate `transform` + `opacity`.** Never width/height/top/left. Hover lift = `-translate-y`.
- **`prefers-reduced-motion` is non-negotiable** — every entrance guards on it (`prefersReducedMotion()`
  helper for GSAP; `motion-reduce:` utilities for CSS transitions).

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
- **Result card:** `group` row — index number, `AlbumArt`, then track name / artist·year / genre
  pills / italic reason (left-border quote). Hover: `-translate-y-0.5` + border/bg lift, `EASE_QUART`.
- **Album art (`AlbumArt`):** thumbnail from `track.albumArt` (free in `/me/tracks`; NO extra call).
  Lazy-loaded, reveals opacity 0→1 + scale 0.97→1, equalizer-glyph fallback. 44px cards / 36px rows.
- **Genre pills:** `rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400`, max 3 per card.
  Review screen only (reuses Last.fm genres fetched during curation — see HANDOFF).
- **Robot mascots:** inline SVG components (`RobotMascot.tsx`), animated via `index.css` keyframes —
  NOT `.svg` files (editor optimizer strips them). `RobotHero` (login/landing), `RobotTyping` (search).
- **Two-column workspace:** `lg:grid-cols-[24rem_1fr]` (`max-w-6xl`) — sticky controls left (title,
  stats, enlarged `py-4 text-base` vibe prompt, `BrandBanner`), bounded scroll pane right
  (`.custom-scrollbar`, `max-h-[70vh]` / `calc(100vh-…)`). Single column below `lg`.
- **BrandBanner:** branded card (robot + wordmark + live `robot-eq` equalizer, green radial glow)
  anchoring the left column. The "genres" stat is real but fills in async — background Last.fm
  enrichment of the full library runs after render (non-blocking, cached).

## Not yet defined (decide before building)

- Public/private playlist toggle styling (v2 — needs `playlist-modify-public`).
- 2×2 album-art cover mosaic + animated save-success (checkmark/confetti) on the review screen.
- Empty / error illustration states beyond plain text.
- A display typeface, if the app ever wants more personality than system-ui.
