# KilimoOrbit mobile: design brief (editorial pass, 16 Oct 2026)

**Central idea.** A printed agricultural almanac (the kind a co-op hands out each season):
warm paper, a soft serif for what matters, small tracked labels in a technical face, and
full-bleed photographs of Kenyan farms that turn like pages of a photo essay. Read
outdoors, one-handed, on a cheap Android phone, often by someone more fluent in Kiswahili
than in reading, so legibility still comes first.

**Impression.** Warm · assured · alive.

This pass keeps the product's structure, features and section colours, and replaces the
type, the palette and the still photographs.

## Reference (principles only)
Inspected basix-venture-route.vercel.app. Taken: a light-weight serif display with tight
tracking and one italic accent word in the brand green; a warm paper ground with
near-white surfaces and warm hairline borders; small uppercase tracked labels in a
technical face above every block; one deep-green solid primary, outlined white secondary;
12px radii and a very soft two-layer shadow; a dark forest panel as the one high-contrast
moment. Nothing copied: no text, code, logos or assets.

## Typography
- Display: **Fraunces** (already a dependency) 500 for the big lines, 600 for card
  headlines, **400 italic** for the one accent word (the farmer's name, the "Orbit" of the
  wordmark). Tracking −0.5 to −1 at display sizes.
- Labels: **Space Grotesk** 600, uppercase, +1.4 tracking: eyebrows, stat captions,
  header page names, tags' sibling labels. It plays the reference's mono-label role
  without adding a font.
- Text: **Nunito Sans** 400–800 for body, buttons, inputs (no new dependency).
- Scale (`T` in `components/Kit.tsx`, ratio ≈ 1.25):
  label 12/16 · meta 14/20 · body **16/24** · title 17/22 · headline 20/26 (Fraunces 600) ·
  display 28/32 (Fraunces 500) · displayLg 36/40 (Fraunces 500) · big 34/38 (Fraunces 600,
  tabular). Phone heroes scale the display down by width, never below 26px.
- Line length capped by the 760px column (~70 characters of body).

## Colour (Shamba, the daylight default)
| Role | Hex | Contrast |
|---|---|---|
| bg (sisal paper) | `#F3EEE2` | — |
| panel (surface) | `#FFFDF8` | — |
| raised (sage tint, hover) | `#ECF1E6` | — |
| line (warm hairline) | `#E2DACA` | decorative |
| ink | `#14201B` | 14.5:1 bg |
| dim | `#56615B` | 5.6:1 bg, 6.3:1 panel |
| **accent (tea leaf)** | `#1A6642` | 6.0:1 bg; white on it 7.0:1 |
| ok | `#14724A` | 5.1:1 bg |
| alert | `#B3261E` | 5.8:1 bg; white on it 6.5:1 |
| water | `#1F55C2` | 5.9:1 |
| amber | `#8F4F0E` | 5.7:1 |
| violet / teal / rose | `#5A45A6` / `#0D6E66` / `#A23B55` | ≥ 5.3:1 |
| hero forest | `#0F2A21` | — |
| **maize gold** (marks on forest and photos) | `#E9B44C` | 8.1:1 on forest |

The old yellow-lime primary (`#4A7600`) is gone: it read as a warning colour and fought
the photographs. Loam and Nyota (dark) keep their values. Status never relies on colour
alone: tags carry a word, the risk dot sits next to a label.

## Layout (spacious pass, 16 Oct 2026)
Reference inspected: aws.amazon.com (principles only, nothing copied). Taken: content
grouped into a few titled sections, each opened by a medium-weight display heading
(32px/500 there) on the left edge, with large, even whitespace between sections instead
of boxes and rules; news-style rows that turn by themselves with a pause control and
the next card peeking; a heading never competes with the content under it.

- 4px base; scale `S` = 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80.
- Page rhythm from `useSpace()` in `components/Kit.tsx`:

  | | phone < 600 | medium 600–899 | wide ≥ 900 |
  |---|---|---|---|
  | screen side padding | 20 | 32 | 40 |
  | gap between cards | 20 | 20 | 24 |
  | gap between sections | 48 | 64 | 80 |
  | padding inside a card | 20 | 24 | 24 |

- **Sections** (`Section` in Kit): a Fraunces 500 title (24/30 phone, 30/36 from 600px),
  one dim line under it, then its cards. No box, no rule: the whitespace is the divider.
  Card labels inside a section are level-3 headings.
- Today has three: *On the farm today* (weather, tasks), *Markets and the season*
  (market, climate; hidden when the board has neither), *Discover* (news, shows, quiz).
- Content column 760px on phone/tablet, 1120px two-column from 980px of content width;
  on wide Today the quiz keeps half the width and the other half is left open.
- Breakpoints: phone < 600, medium 600–899 (sheets become dialogs), wide ≥ 900 (sidebar docks).

## Components
- Radius `R`: 8 · 12 (buttons, inputs, rows) · 16 (cards) · 20 (heroes, sheets) · 999 (chips, tags).
- Cards: panel on paper, 1px warm hairline, shadow `0 1px 2px` + `0 8px 24px -8px`
  (ink at 4% / 8%). Dark themes: a lit top edge instead.
- **Border weights** (`B` in Kit), three and only three: `line` 1px for every surface,
  inner tile and divider; `control` 2px for every control outline (inputs, options,
  chips, checkboxes, steppers, secondary buttons); `rule` 3px for accent bars on callouts.
  Whole pixels only: 1.5px renders as 1px on ordinary desktop screens and would merge
  controls with surfaces. Selection and state change a border's colour and fill, never
  its weight, so nothing shifts. Focus is a separate 3px outline ring. Inner rows and
  tiles use radius 12. Exempt, because they are drawings rather than borders: the hero's
  2px gold ledger rule, chart dots and orbit rings, step and status circles, the
  returning farmer's 3px initials ring.
- **Living cards** (web, pointer devices): under the pointer the hairline takes its
  section's colour at 55% (65% on dark themes; weather blue, farm green, news violet,
  quiz teal…, from the card's `domain` or the eyebrow inside it), the shadow deepens to
  `0 16px 32px -14px` (ink 18%) and the card rises 2px. Border 180ms, shadow and lift
  240ms, ease-out. Keyboard focus inside a card (`:focus-visible`, so not a mouse
  click) colours its border without the lift. Cards inside
  a turning row (Pager) colour but don't rise, because the scroll row would clip them.
  Reduced motion: the colour still fades, nothing rises. Alert and accent cards keep
  their colour and only deepen. Plain CSS (`surfaceAttr` / `[data-ko-surface]`), no
  re-render.
- Buttons: primary 52px (small 44px), accent fill, white 800 label; secondary 2px `dim`
  outline on panel; ghost text-only in accent; danger in alert. Disabled 45% + `disabled`.
- Every touch target ≥ 44×44 (icon buttons 48).
- Inputs: visible label above, 2px `dim` well, 3px accent focus ring, reserved status line.
- States: `Skeleton`, `Notice` (left bar + icon + word), `Empty` with one action.

## Icons and loading (refinement, 16 Oct 2026)
- **One icon language.** Every mark (Listen speaker, check, chevrons, sun/moon, no-network,
  plus) is a Material Design Icons vector through `components/Icon.tsx`; the glyph kit in
  `components/Glyphs.tsx` keeps its names and props but no longer draws shapes from
  bordered boxes, which broke apart at 12–22px. The Listen speaker shows one wave at rest;
  the outer waves pulse while it speaks (static on reduced motion).
- **Crops** each carry one widely supported emoji (beans 🌱, sukuma wiki 🥬), so chips
  never mix pictures with two-letter codes; letters remain only for crops the server adds.
- **Fonts on the web**: font-display swap, the icon font loaded with the text faces, and
  the first paint waits at most 1.2s for them (phones keep the splash until they load).
  One Space Grotesk cut (600) is bundled; Bold was unused.
- **Focus on full-width rows** (sidebar settings) is drawn inside the edge
  (`focusRingInset`), so the scroll pane cannot clip its sides.
- Hero → first content: two card gaps, not a section gap, so the hero belongs to its screen.

## Sidebar (refinement, 16 Oct 2026)
The rail is the almanac's spine: one step deeper than the page, with the cards pulled
forward on it.
- **Ground** `rail` token: Shamba `#ECE5D4` (ink 13:1, dim 5.1:1), Loam `#0C160E`,
  Nyota `#090E1C`. Docked and drawer share it; sign-out sits on it too.
- **Profile** is one pressable card (panel, hairline, soft shadow): avatar a forest coin
  with Fraunces initials and a gold seed (the logotype's), name in Fraunces 600 18/24,
  phone in tabular figures, a tinted status chip with its word, and "Edit ›" in the accent.
  Hover lifts it 2px and warms the border; press gives 1.5%.
- **Navigation**: 52px rows, Nunito Sans 600 16/22 (700 when selected), icons in `dim`
  inside a 36px well. The selected row is the card surface pulled forward, its well filled
  with the accent (`aria-current="page"`, no extra marker); it eases in over 220ms. Hover: a 6% ink wash
  fades in (160ms) and the icon and label lean 2–3px right; press shrinks the well 8%.
- **Settings**: eyebrow, then a quiet `dim` 14/20 600 sub-label above each control; read-aloud, server, photo credits and app status share one card with inset
  hairlines, each row washing and nudging its chevron on hover.
- **Motto** set as an epigraph: a 32px maize-gold rule, the label, then the line in the
  Fraunces italic 18/26. No box.
- Reduced motion: washes still fade; nothing moves.

## Listen
The Listen pill is tinted with the accent (10%, 16% hover, 20% speaking) behind a 55%
accent hairline, so it reads as an invitation. It **breathes**: three 1.5s breaths when it
appears (pill swells 3.5%, a ring leaves it), again on hover or focus (a running cycle is
never restarted), then rests. Speaking, it reads "Reading…" and is named "Reading…, Stop". Kept
under 5s so it needs no pause control (WCAG 2.2.2); never while speaking, never on
reduced motion.

## Motion
- **Photo heroes turn by themselves**: every screen hero holds a small set of related
  photographs. Each slide drifts slowly (Ken Burns, 1.00 → 1.07 scale with a small pan,
  7s), then the next one slides in from the right (24px) while cross-fading, 700ms
  ease-out. Dots show position and are tappable; a 44px pause/play control is always
  present (WCAG 2.2.2). Credit line follows the visible photo.
- **One moving hero per screen.** Heroes inside a screen (SACCOs, nurseries) and Chat's
  hero hold a single still photo. No photo opens two screens; Today (the overview) turns
  through four sections' photos.
- **News and shows turn by themselves too** (`Pager` `autoplay`): every story card is
  its own card; news 6.5s, shows 7.5s (offset so the rows never turn together); the
  active dot is a track that fills toward the next turn (scaleX, so no relayout; held, it
  waits where it is). Unselected dots ~3:1 on the page. Phone and tablet show 32px of the
  next card; side by side on wide Today they don't peek (two edges would meet in the
  gutter). Holds while a pointer is over it or focus is inside; stops for good when the
  farmer swipes, taps a dot or an arrow, or presses pause (44px, always shown, first in the
  tab order). On the web a row turns only while half of it is on screen. Never on
  reduced motion, never while the screen is out of focus, no haptic and no live
  announcement when it turns by itself. The quiz never turns by itself.
- **No words on photographs**: the credit badge is gone from every hero (it read as
  "CIAT · CC BY-SA" over the picture). Attribution stays complete under Settings → Photo
  credits (author, licence, source link for each), which the licences allow.
- Over photos the scrim starts at 50% forest and reaches 95%, and the 12px eyebrow is
  near-white (gold only on its icon, the dots and the ledger rule), so labels hold AA on
  any photo.
- Card entrance: fade + rise stagger (≤ 90ms steps); press 0.97 spring; tick pop.
- Sheets 180ms; skeleton shimmer 750ms.
- **Reduced motion**: heroes show the first photo still, never auto-advance (dots still
  switch instantly); entrances render in place; pulses are static.

## Signature
The **photo almanac hero**: on Today, a turning sequence of Kenyan farm photographs under a
forest scrim, the greeting in large Fraunces with the farmer's name in italic, and the
three numbers that decide the day (next rain, best price, tasks due) as a ledger line
under a maize-gold rule. The wordmark repeats it: "Kilimo" upright, *Orbit* in italic.
