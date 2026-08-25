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
| Display | **Nunito** | `--font-display` | 700, 800 |
| UI / body | **Nunito** | `--font-ui` | 500, 600, 700 |

**Fallbacks:** Nunito → `system-ui, sans-serif`

**Load:** Google Fonts in page `<head>` (Nunito 500–800). Do not switch to Inter, Roboto, Arial, or system-only stacks for marketing pages.

The script wordmark in `elitedentlogo.png` is the brand face. Site type stays rounded sans (Nunito) so it does not compete with the calligraphy — never typeset “EliteDent” in a second display font.

### Type rules

- Hero taglines and section titles: Nunito extra-bold, slight negative tracking (`letter-spacing: -0.02em` to `-0.025em`)
- Nav / CTA labels: Nunito, uppercase, wide tracking (`~0.08em`–`0.14em`)
- Body / ledes: Nunito, normal case, comfortable line-height (`~1.5`–`1.65`)
- No random italics for emphasis
- No gradient fills on text
- One clear hierarchy per section: title → short support → action
- No numbered labels (01 / 02), no uppercase eyebrow chips above titles

---

## Layout & composition

### First viewport (hero)

- One composition, not a dashboard
- Brand is a hero-level signal (large title), not only nav text; logo stays in the nav
- Typical budget: brand title, one headline idea, one CTA, one dominant figure on the orb
- Soft clinic photo may sit **behind** the orb only when it reads clearly; otherwise keep the solid `--orb` circle and the hands/products figure
- Full-bleed or section-dominant imagery; avoid inset media cards in the hero
- No floating badges, promo chips, or sticker overlays on hero media

### Sections

- One job per section: one purpose, one headline, usually one short supporting sentence
- Prefer whitespace and type hierarchy over boxes
- Cards only when they are the interaction (e.g. service cards that navigate / expand)
- If removing a border, shadow, radius, or fill does not hurt understanding, do not use a card

### Footer

- Minimal: logo image (same mark as nav), links to Home / Services / About, and one Book CTA
- Legal pages (`/support`, `/privacy`, `/impressum`) stay reachable by URL; do not promote them in the marketing footer unless product/legal requires it

### Book (`/book/`)

- Calm single-column form: full name, email, phone, optional message
- No extra sections, stats, or marketing clutter — trust through clarity and restraint
- **Book** / **Consult now** CTAs go to `/book/`
- Submits to `POST /api/book` (Resend): German confirmation to the visitor (ref id + short details + company placeholders); notify `BOOKINGS_INBOX` (default `djanieverlan@gmail.com`)

---

## Components

### Navigation

- Logo image left → always `/`
- Center links (desktop **and** mobile): Home, Services, About
- Right: **Consult now** (navy button → `/book/`)
- Sticky/static bar; no heavy chrome
- Logo mark ~54px tall
- **Home** → `/` · **Services** → `/services/` · **About** → `/about/`
- Desktop: hover (or focus) **Services** to open a single-column panel of the six treatments; each tab deep-links to `/services/#<id>`
- Mobile: no hover panel — **Services** goes to `/services/`

### Buttons / CTAs

- Primary on light: navy text on white, or white text on navy
- Accent links: `--dental-blue`, underline or weight — not pills for decoration
- Prefer modest radius or square corners; avoid `rounded-full` pill clusters
- Closing **cta-band**: full-bleed white, navy button, short Nunito heading

### Service cards (home)

- **One service per row** — large banner blocks (photo + copy), easy to scan
- Photo on the side, fully visible
- Title + short description + “Read more”
- Link to `/services/#<id>` so the services page scrolls to that article

### Services page

- Page hero with a clear treatment-focused title (not vague slogans)
- Article-style sections: paragraphs + simple bullets + image, separated by hairlines
- No dense bordered “box cards”; alternate image side on desktop
- Hash deep-links (`#whitening`, `#aligners`, `#veneers`, `#implants`, `#preventive`, `#restorative`) scroll to that article

### About page (`/about/`)

- Same hero language as services (orb + word-rise)
- Story (copy + image on orb), stats band (`--orb` wash), three values, cta-band
- No fake headshots; clinic imagery from existing assets
- Copy is **placeholder** until the practice supplies real bio, years, and stats

### Home about preview

- One short section after the service cards: headline, 1–2 sentences, link to `/about/`
- Orb + crop of existing smile photography — same motif as the hero, smaller

---

## Motion

- Marketing pages: EN / DE toggle in the nav uses **Google Website Translator** (auto-translates the live DOM; no hardcoded German marketing copy). Choice is stored in `localStorage` (`elitedent-ui-lang`).
- Splash: once per browser session (`sessionStorage` key `elitedent-splash`); not on every Home/logo click
- Splash sequence: Paramount smile orbit (slower) → logo clipped to center implant → clip opens with bounce to full wordmark → flash → logo flies into nav
- Use the **same** `elitedentlogo.png` via `clip-path` for the tooth phase so alignment stays exact (no separate tooth PNG required)
- **Inner pages:** at most three moments — (1) page-hero orb grow + masked title words, (2) lede fade-up, (3) scroll reveal (`.reveal[data-reveal]`) with staggered card copy
- Title words sit in an overflow-hidden `.line`; they rise with `title-rise` (same easing family as the home hero)
- Accent title lines use `--dental-blue` (same as home “Expert Care.”)
- Respect `prefers-reduced-motion: reduce` — settle to final state, skip ornament
- Avoid motion for its own sake; 2–3 intentional moments max on a visually led surface

---

## Imagery

| Asset | Path | Role |
| --- | --- | --- |
| Splash smile | `assets/images/perfectsmile.jpg` | Paramount-style splash background |
| Logo | `assets/images/elitedentlogo.png` | Nav + splash wordmark (clip-path reveals implant first) |
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
2. Nunito for display and UI (script logo is the only calligraphic type)
3. Navy / dental-blue / surface / muted / white / orb only unless using the extended table
4. One section = one job
5. Interactive cards only; no decorative card chrome
6. Inner pages: `home.css` + page sheet (`services.css` or `about.css`); shared shell lives in `home.css`
7. Test reduced motion and mobile (~375px) as well as desktop

---

## Related routes

| Path | Role |
| --- | --- |
| `/` | Splash (first session load) + home (hero, service cards, about preview) |
| `/services/` | Full service detail (hash panels) |
| `/about/` | Practice story, stats, values |
| `/support`, `/privacy`, `/impressum` | App Store / legal — keep content stable; own older visual chrome OK until unified |

Marketing copy on `/`, `/services/`, and `/about/` is placeholder and should be replaced with the clinic’s real wording. Do not invent awards, staff names, or a street address until supplied.
