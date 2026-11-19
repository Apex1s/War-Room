# War Room: Design System

Status: v1, 19 Nov 2026. Direction set by the owner: **Retro-Tactical Terminal**, creative and high-energy, built on the 60-30-10 colour rule and the golden ratio. This file wins over older colour notes anywhere else in the repo.

## 1. Copy rules (apply before anything visual)

- **No em dash or en dash, anywhere on screen.** Use a comma, a period, a colon or parentheses. Ranges use "to" ("$100K to $500K") or a plain hyphen ("1-5").
- Model output is cleaned at render time by `cleanPunctuation(text)`: a dash between two digits becomes a hyphen; any other em or en dash, with the spaces around it, becomes ", ". The prompts also ask the models not to write dashes. Apply it in the same place as `rehydrate`, so every AI string passes through both.
- Sentence case for body text and buttons. Labels in the terminal style are UPPERCASE monospace with letter spacing (see §4).
- No emoji. The terminal look uses text tags and simple glyphs (§6).

## 2. Colour: the 60-30-10 rule

| Share | Role | Token | Hex | Use |
|---|---|---|---|---|
| 60% | Background | `bg` | `#121413` Carbon Charcoal | page, app shell, side panel |
| 30% | Surfaces | `surface` | `#1C211E` Matte Olive-Gray | cards, inputs, header, drawers, table rows |
| | Text | `text` | `#E5E7EB` Off-White | primary text, icons |
| | Muted text | `muted` | `#9CA3A0` | secondary text, captions, placeholders (derived from Off-White and Dark Moss) |
| | Hairlines | `line` | `#2D3630` Dark Moss | 1 px borders and dividers only, never text |
| 10% | Accent, live | `mint` | `#10B981` Phosphor Mint | on-device / live telemetry, primary action, focus ring, success |
| 10% | Accent, stress | `orange` | `#F97316` Radar Orange | threat levels, risks, contradictions, failures, blocked egress |

Contrast, measured (WCAG): Off-White 14.9:1 on `bg` and 13.2:1 on `surface`; Mint 7.3:1 and 6.4:1; Orange 6.6:1 and 5.8:1; Muted 7.2:1 and 6.4:1. All pass AA for small text. Dark Moss is 1.5:1, so it is decoration only. Charcoal text on a Mint or Orange fill is 7.3:1 and 6.6:1, fine for buttons and chips.

Rules that keep the accents at 10%:
- One accent per component. Mint and Orange never share a card, except a threat meter next to a source badge.
- Mint means "live, local, safe". Orange means "pressure on your plan". Never swap them.
- Accents colour text, 1 px lines, small fills (chips, dots, meters, the primary button). Never a whole card or section background.
- No other hues. The three Generals are told apart by monogram, name and position, not by colour. The old navy/amber values and `danger`/`safe` red/green are retired.

Implementation: define the tokens once in `packages/ui/src/styles.css` with Tailwind v4 `@theme` (`--color-bg`, `--color-surface`, `--color-text`, `--color-muted`, `--color-line`, `--color-mint`, `--color-orange`) and use `bg-bg`, `bg-surface`, `text-mint`, `border-line` and so on. **No hex literal may remain in any `.tsx` file.** `packages/ui/src/tokens.ts` re-exports the same values for non-CSS uses.

## 3. The golden ratio (phi = 1.618)

**Type scale.** Base 16 px, multiplied and divided by phi:

| Token | Size | Line height | Use |
|---|---|---|---|
| `text-display` | 42 px | 1.15 | report verdict, home title (desktop) |
| `text-title` | 26 px | 1.25 | screen titles, General headline on the report |
| `text-body` | 16 px | 1.618 | body text, moves, quotes |
| `text-label` | 12 px | 1.4 | mono labels, badges, table headers (practical floor, not phi) |

At side-panel and phone width (< 640 px) step every heading down one level: display 26 px, title 20 px.

**Spacing.** Fibonacci steps only: 3, 5, 8, 13, 21, 34, 55, 89 px. Card padding 21 px (13 px under 640 px); gap between cards 13 px; gap between sections 34 px; page top margin 55 px. Define them as `--spacing-*` tokens so `p-21`, `gap-13` and similar work.

**Layout.** The War Room on desktop splits 61.8% / 38.2%: the left column holds the round, the move and the three General cards; the right column holds the referee verdict, the crowd wall and the hybrid stats. The report uses the same split (verdict and risks left, counter-strategies and next steps right). Content max width 1180 px. Under 1024 px the columns stack, main column first.

**Radius.** 3 px on chips and inputs, 8 px on cards and buttons. Nothing rounder: the terminal look wants corners.

## 4. Typography

- **Mono:** JetBrains Mono (400, 600) for labels, badges, data, latency, tokens such as `[COMPANY_1]`, and the brand mark.
- **Sans:** Inter (400, 500, 600) for body text, moves and quotes.
- Install both from npm (`@fontsource/jetbrains-mono`, `@fontsource/inter`) and import them in `styles.css`. Do not load fonts from a CDN: the app must work offline and must not call third parties.
- Terminal label style: `font-mono text-label uppercase tracking-[0.12em] text-muted`. Use it for section labels ("ROUND 1 OF 3", "REFEREE", "THE CROWD", "HYBRID TELEMETRY").

## 5. Texture and motion (the high-energy part, kept calm)

- **Grid:** the page background carries a faint 21 px grid drawn with `line` at 35% opacity (one CSS background, no image). Cards sit on top in solid `surface`.
- **Live dot:** a 5 px Mint dot with a slow 1.618 s pulse marks anything running on-device right now. Nothing else pulses.
- **Cursor:** the brand mark ends in a blinking block cursor `WAR ROOM_` (1 s steps). The only other blinking element allowed is the cursor inside an empty move composer.
- **Streaming:** while a model is writing, show the text tag `[THINKING]` in muted mono with three dots stepping, not a spinner.
- **Threat meter:** five 13 x 5 px cells; filled cells are Orange, empty cells are `line`. Replaces "Threat 3/5" text (keep the number in a muted label next to it).
- Respect `prefers-reduced-motion`: no pulse, no blink, no dot stepping.

## 6. Components

| Component | Spec |
|---|---|
| Source badge | Mono label. On-device: Mint text and Mint 1 px border, glyph `●`, text `ON-DEVICE 16.7S`. Cloud: Off-White text, `line` border, glyph `○`, text `CLOUD 8.7S`. Mock: muted text, dashed `line` border, text `MOCK`. Model name in muted text after a middle dot. |
| Primary button | Mint fill, Charcoal text, 8 px radius, 13 px x 21 px padding. Hover: Mint at 90%. One primary button per screen. |
| Secondary button | Transparent, Off-White text, `line` border, hover border Mint. |
| Card | `surface` fill, 1 px `line` border, 8 px radius, 21 px padding. No shadow. |
| General card | Monogram square (34 px, `line` border, mono initials), name, role in muted text, headline in `text-title` at desktop, threat meter, move, rationale, "Targets" line with an Orange left rule (3 px). Failed state: Orange text "HOLDS POSITION THIS ROUND" and a Retry secondary button. |
| Firewall diff | Original side: removed spans with Orange underline and Orange text. Abstracted side: tokens as Mint mono chips on `bg`. The red/green of the old design is gone. |
| Crowd wall | Five quotes, sentiment as a 5-step bar (Mint for positive, Orange for negative, `line` for neutral). |
| Referee panel | Summary in body text. Contradictions in an Orange-ruled block. Score changes as mono "+1 / 0 / -1". |
| Hybrid telemetry | Mono numbers in `text-title`, Mint for on-device share, labels in terminal style. |
| Egress inspector | Drawer from the right on `surface`, payloads in mono 12 px on `bg`. Blocked payloads with an Orange "BLOCKED" tag. |
| Basic-redaction notice | Orange 1 px border chip: `BASIC REDACTION: ON-DEVICE AI UNAVAILABLE`. |

## 7. Done when

- `grep -rP "\x{2014}|\x{2013}" packages/ui/src apps/*/src apps/*/index.html apps/extension/sidepanel.html apps/extension/public` returns nothing, and `cleanPunctuation` has unit tests.
- `grep -rE "#[0-9A-Fa-f]{6}" packages/ui/src --include=*.tsx` returns nothing.
- No emoji in UI strings.
- Home, Brief, Firewall review, War Room, Report and Replay checked at 1280 px, 400 px (side panel) and 375 px (phone), with no horizontal scroll.
- Lighthouse accessibility score of 95 or more on the hosted Home page.
