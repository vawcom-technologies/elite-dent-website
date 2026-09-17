# HKP consultation — handoff

## Flow

1. `/hkp/` info → `/book/` form (contact + HKP upload + consent)
2. Local HKP check → save to `data/` → optional Resend notify
3. `/admin/` review: Annehmen / Ablehnen / Löschen
4. Approve only flips status today — **no follow-up action wired yet**

## What changed

Was: consult form emailed only, no HKP store/admin.  
Now: HKP page + upload form, server store, admin dashboard, consent/retention/delete, privacy section for this flow.

Main pieces: `hkp/`, `book/`, `admin/`, `api/hkp.js`, `api/hkp-admin.js`, `lib/hkpStore.js`, `lib/hkpValidate.js`.

## GDPR

HKP uploads are health-related data, so we have to be careful.

**Already handled**
- User must tick a consent box before sending the form
- Privacy page explains this website form (`/privacy/#website-beratung`)
- Data is kept for 24 months, then deleted automatically
- Admin can delete a request and its file anytime
- Email provider (Resend) is named in the privacy page
- Stored files are not committed to git

**Still to sort for production**
- Encrypt stored files/data on the server
- Sign a processor agreement with Resend (and the host) if required
- Backups and who can access the admin/data in production

## Open questions

**For client — after admin approves on the dashboard, what should happen overall?**  
(Examples only: email the user, send a booking link, propose times, notify clinic again, or handle offline. Same idea for reject.)

**For the team**

- Confirm hosting (local `data/` JSON vs real DB/storage for production)

