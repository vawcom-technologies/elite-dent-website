# Elite Dent — App Store legal / support pages

Static HTTPS pages for **App Store Connect**. No backend, no login.

App: **Elite Dent** · Bundle ID `com.elitedent.dentalLabAi` · Version **1.0.0** · iPad (clinic + lab staff).

Provider: **Erlan Djaniev**, trading as Elite Dent (sole proprietorship), Hirsauer Straße 63, 75180 Pforzheim, Germany.

## 1. App Store Connect fields

In App Store Connect → the Elite Dent iPad app → **App Information**:

| Field | URL to paste |
| --- | --- |
| **Support URL** | `https://elite-d.de/support` |
| **Privacy Policy URL** | `https://elite-d.de/privacy` |

Impressum (German TMG; not an App Store field, but required on Elite Dent’s public site): `https://elite-d.de/impressum`

## 2. Both URLs must be public HTTPS

Apple opens these in a browser. They must be:

- `https://` (not `http://`)
- on a real public host (not `localhost`, not `127.0.0.1`, not a LAN IP)
- reachable without login, VPN, or basic-auth

Host the folders `support/`, `privacy/`, `impressum/`, `forgot-password/`, and `confirm-email/` at the domain root (each `index.html` becomes `/support`, `/privacy`, `/impressum`, `/forgot-password`, `/confirm-email`).

## 3. Company details used on the pages

| Field | Value |
| --- | --- |
| Legal name | Erlan Djaniev, handelnd unter Elite Dent (Einzelunternehmen) |
| Address | Hirsauer Straße 63, 75180 Pforzheim, Germany |
| Email | elitedent@outlook.de |
| Phone | +49 176 25858231 |
| Commercial register | None (sole proprietorship) |
| VAT ID | DE464085701 |
| Data protection contact | Owner (no separate DPO appointed) |
| Professional liability | Alte Leipziger Versicherung AG, Alte-Leipziger-Platz 1, 61440 Oberursel, €100,000 |

Do **not** put demo passwords, API keys, or patient data on these pages.

## 4. Production paths

```
https://elite-d.de/support
https://elite-d.de/privacy
https://elite-d.de/impressum
https://elite-d.de/forgot-password
https://elite-d.de/confirm-email
```

Legal pages default to **German**, with an **EN** toggle (stored in `localStorage`). Append `?lang=en` or `?lang=de` to force a language.

Auth landing pages (`forgot-password`, `confirm-email`) are English UI and talk to the Elite Dent production Supabase project. Backend redirects already point here:

- `PASSWORD_RESET_REDIRECT_URL=https://elite-d.de/forgot-password/`
- `EMAIL_CONFIRM_REDIRECT_URL=https://elite-d.de/confirm-email/`

In Supabase → Authentication → URL configuration, allow those two HTTPS URLs (and set Site URL to `https://elite-d.de` or the confirm-email path as needed).

## Pages in this set

| Path | File | Purpose |
| --- | --- | --- |
| `/support` | `support/index.html` | Support URL — how to get help, FAQ, reviewer note |
| `/privacy` | `privacy/index.html` | Privacy Policy URL — GDPR notice |
| `/impressum` | `impressum/index.html` | TMG legal notice |
| `/forgot-password` | `forgot-password/index.html` | Password-reset landing from Supabase email link |
| `/confirm-email` | `confirm-email/index.html` | Signup email-confirmation landing from Supabase |

Shared chrome for legal pages: `assets/css/legal.css`, `assets/js/legal.js`. Auth pages share `assets/css/fonts.css` and Nunito fonts under `assets/fonts/`.

Do not change the Flutter iOS app, `Info.plist`, or signing for these URLs. Paste the HTTPS links in App Store Connect after the host is live.
