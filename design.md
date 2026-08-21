# EliteDent — Design system

Source of truth for colors, type, motion, and layout rules. Prefer CSS variables in `assets/css/home.css` (`:root`). Keep new pages aligned with this file.

---

## Brand

- **Name:** EliteDent (one word in UI; legal pages may say “Elite Dent”)
- **Logo:** `assets/images/elitedentlogo.png` — use in nav; link always goes to `/` (home)
- **Tone:** Clean, clinical, calm, premium — dental care first, not lifestyle clutter

---

## Color

### Marketing site (active tokens)

| Token | Hex | CSS variable | Use |
| --- | --- | --- | --- |
| Navy / primary | `#1D3557` | `--navy` | Headings, body text, primary buttons, overlays |
| Dental blue / accent | `#4A90E2` | `--dental-blue` | CTAs, links, focus, accent title lines |
| Surface | `#F4F8FC` | `--surface` | Page canvas (home / services) |
| Orb | `#D9EBF9` | `--orb` | Hero circle (matches `heroimg` blue bg) |
| Muted | `#6B7C93` | `--muted` | Secondary labels, nav links, lede |
| White | `#FFFFFF` | `--white` | Cards on dark media, CTA fills, footer |

### Splash-only

| Role | Hex | Notes |
| --- | --- | --- |
| Splash hold | `#0F1C2E` | Dark hold while assets decode |
| Planning surface | `#E4EBF4` | Listed in splash `:root`; prefer `--surface` on new UI |

### Extended palette (product / app — from site planning)

Use when building booking, auth, or status UI. Do not invent new hues without updating this table.

| Role | Hex | Soft companion |
| --- | --- | --- |
| Surface (app) | `#E4EBF4` | — |
| Surface deep | `#D8E2EE` | — |
| Neo / sidebar | `#EAF0F7` | — |
| Card | `#EEF3F9` | — |
| Inset / inputs | `#DDE5F0` | — |
| Border / silver | `#D0DBE8` / `#A8B0BD` | Dividers, chrome |
| Review / AI | `#8B7CF6` | Status only — not marketing chrome |
| Success | `#1F9D63` | Soft `#E8F8F0` |
| Warning | `#E09B2D` | Soft `#FFF5E6` |
| Danger | `#E05252` | Soft `#FDECEC` |

Auth screens (when built): light cool wash `#EAF1F8` → surface → `#DCE6F2`; navy→blue for brand moments only, not purple gradients.

---

## Typography

| Role | Family | CSS variable | Weights in use |
| --- | --- | --- | --- |
| Display | **Fraunces** (opsz) | `--font-display` | 560, 650, 700 |
| UI / body | **Manrope** | `--font-ui` | 500, 600, 700 |

**Fallbacks:** Fraunces → `"Times New Roman", serif` · Manrope → `system-ui, sans-serif`

**Load:** Google Fonts in page `<head>` (Fraunces opsz + Manrope). Do not switch to Inter, Roboto, Arial, or system-only stacks for marketing pages.

### Type rules

- Brand and hero titles: Fraunces, tight tracking (`letter-spacing: -0.02em` to `-0.035em`)
- Nav / CTA labels: Manrope, uppercase, wide tracking (`~0.08em`–`0.14em`)
- Body / ledes: Manrope, normal case, comfortable line-height (`~1.5`–`1.65`)
- No random italics for emphasis
- No gradient fills on text
- One clear hierarchy per section: eyebrow → title → short support → action

---

## Layout & composition

### First viewport (hero)

- One composition, not a dashboard
- Brand is a hero-level signal (large title or logo), not only nav text
- Typical budget: brand, one headline idea, one short support line (optional), one CTA, one dominant image
- Full-bleed or section-dominant imagery; avoid inset media cards in the hero
- No floating badges, promo chips, or sticker overlays on hero media

### Sections

- One job per section: one purpose, one headline, usually one short supporting sentence
- Prefer whitespace and type hierarchy over boxes
- Cards only when they are the interaction (e.g. service cards that navigate / expand)
- If removing a border, shadow, radius, or fill does not hurt understanding, do not use a card

### Footer

- Minimal: brand mark/name
- Legal pages (`/support`, `/privacy`, `/impressum`) stay reachable by URL; do not promote them in the marketing footer unless product/legal requires it

---

## Components

### Navigation

- Logo image left → always `/`
- Center links (desktop): Home, Services, About
- Right: Book (consultation)
- Sticky/static bar; no heavy chrome

### Buttons / CTAs

- Primary on light: navy text on white, or white text on navy
- Accent links: `--dental-blue`, underline or weight — not pills for decoration
- Prefer modest radius or square corners; avoid `rounded-full` pill clusters

### Service cards (home)

- Image behind, navy scrim (`rgb(29 53 87 / ~0.72)`), white type
- Short description + “Read more”
- Link to `/services/#<id>` so the services page opens that panel

### Services page panels

- Hairline list, expand/collapse one panel
- Hash deep-links must keep working

---

## Motion

- Prefer short, purposeful motion (fade / slight rise / one camera settle)
- Splash: once per browser session (`sessionStorage` key `elitedent-splash`); not on every Home/logo click
- Splash smile + logo animations start together only after both assets are ready
- Respect `prefers-reduced-motion: reduce` — settle to final state, skip ornament
- Avoid motion for its own sake; 2–3 intentional moments max on a visually led surface

---

## Imagery

| Asset | Path | Role |
| --- | --- | --- |
| Splash smile | `assets/images/perfectsmile.jpg` | Paramount-style splash only |
| Logo | `assets/images/elitedentlogo.png` | Nav + splash wordmark |
| Hero | `assets/images/heroimg.png` | Home hero figure |
| Hero smile crop | `assets/images/herosmile.png` | Optional teeth-focused media |
| Card / support media | `perfectsmile.jpg`, `perfectsmile2.jpg`, etc. | Service cards, not hero clutter |

- Hero orb color must stay matched to hero image blue (`#D9EBF9`)
- Focus dental outcomes (teeth, care tools), not decorative lifestyle clutter

---

## Do not use (consistency / anti-patterns)

- Purple-on-white or purple→indigo marketing themes
- Default “AI” looks: cream `#F4F1EA` + terracotta + generic serif, or dense broadsheet columns
- Decorative pill tags, emoji rows, glow stacks, multi-layer shadows
- Gradient text, random italics, neon accents
- Dark mode as default for marketing
- New font families without updating this doc and `:root`

---

## CSS checklist for new UI

1. Use existing `:root` variables; add a token here if a new color is required
2. Fraunces for display, Manrope for UI
3. Navy / dental-blue / surface / muted / white only unless using the extended table
4. One section = one job
5. Interactive cards only; no decorative card chrome
6. Test reduced motion and mobile (~375px) as well as desktop

---

## Related routes

| Path | Role |
| --- | --- |
| `/` | Splash (first session load) + home |
| `/services/` | Full service detail |
| `/support`, `/privacy`, `/impressum` | App Store / legal — keep content stable; own older visual chrome OK until unified |
