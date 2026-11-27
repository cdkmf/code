# NationXpress Enterprises — Netlify + Supabase website

A responsive B2B logistics website with a private, Supabase-backed operations dashboard.

## What works when configured

- Public website: homepage, services, network, company information, carrier tracking links, quote form.
- Enquiries: quote submissions stored in Supabase with restricted staff read access.
- Staff login: Supabase email/password authentication. Authenticated users must ALSO be in `staff_profiles` with `active=true` to access data.
- Operations: searchable shipment register, statuses, shipment editor, carrier filter, party-wise rate editor, cost/revenue/margin estimates, action alerts, and CSV MIS/billing/rate exports.
- CSV import: matches headers, validates data, ignores duplicates by `(vendor,docket)`; up to 500 rows per upload. Data saved in Supabase, not localStorage.

## Important limitations

- **Not deployed yet** until a Netlify account owner performs the setup below. A connected GitHub account alone does not grant Netlify access.
- Supabase project **NationXpress Enterprises** in `ap-south-1` has been created; schema migration applied and public project URL/publishable key configured in `config.js`. **Never use a service_role / secret key** in client-side code.
- Import supports CSV, not `.xlsx` or scanned PDF. For Excel, export as CSV first.
- Sample cost calculation = chargeable weight × rate. Excludes GST, ODA, TDD, fuel, minimum docket, taxes, insurance, volume weight calculations, and vendor-specific terms.
- The shipment list loads up to 5,000 most recent records; leads up to 500. Pagination will be needed for larger production data.
- Tracking buttons open official carrier websites. No live integrated carrier APIs are included.
- This does **not** send emails or notify staff of quotes. Enquiries appear in the portal.
- Public quote inserts are authenticated by database rules for admin reads, but no rate limit/CAPTCHA exists yet. Before attracting large traffic, add Turnstile/edge-function rate limiting and anti-spam protections.
- GA4 remains disabled pending a consent mechanism. `GA4_ID` is only a placeholder.
- No staff user is hardcoded. The very first user must be registered and explicitly authorized in Supabase.
- No real shipment/customer data is bundled. Testing with sensitive records should follow a security review.

## 1. Finish Supabase staff administration (project is already created)

1. Open the existing project at https://supabase.com/dashboard/project/cjdvzcftqtpmzofohguq. The database schema has already been deployed. Do not rerun it unless you intend to update the schema.
2. Open **Authentication > Providers**. Configure email/password sign-in; disable public self-signup for a staff-only portal, or restrict signups by invitation.
3. Under **Authentication > Users**, invite or create your first staff user, then copy their **UUID**.
4. In **SQL Editor**, run (replace placeholder):
   ```sql
   insert into public.staff_profiles (user_id,display_name,role,active)
   values ('REAL-USER-UUID', 'NationXpress Admin','admin',true);
   ```
5. Project URL and publishable key are already in `config.js`. These are public browser credentials, unlike the `service_role` key.
6. Verify email confirmation and login. Check that unapproved authenticated users cannot query shipment/rate/enquiry rows.

## 2. Publish to Netlify for free

**Option A: Netlify Drop (fastest).** Open https://app.netlify.com/drop and drag the extracted `nationxpress-production` folder into Netlify. It is a static site: no build command required. Deployment creates a free `*.netlify.app` address (subject to availability).

**Option B: Connect GitHub (best for updates).** Place website files at the repository root of a dedicated NationXpress repository, or in a `nationxpress-production/` folder of another repository. In Netlify choose **Add new project > Import from Git > GitHub**, then select the repo. If stored in a subfolder, set **Base directory** and **Publish directory** to that folder, with no build command. Configure deploy previews and choose your free site subdomain.

## 3. Smoke test

- Submit a quote and see it in staff portal.
- Log in with approved staff and verify unauthorized users are rejected.
- Create a rate for a customer name and carrier, then add a shipment with the same carrier and from-party name.
- Confirm totals and missing-rate flags, then export the MIS CSV.
- Try uploading a small CSV with the headers specified in the workspace.
- Check mobile menu, tracking links, and the login route on a published Netlify URL.

## Typical CSV headers

`Docket Number,Weight,Date,From Party Name,Ship-To Party Name,From Location,Ship-To Location,ART,Vendor,Status,Billing Status`

Accepted dates: `YYYY-MM-DD`, `DD/MM/YYYY`, and `DD-Mon-YY`. Enclose commas inside quoted CSV fields.

## Developer notes

No npm install required. Files are static HTML/CSS/JavaScript; `app.js` imports Supabase JS from esm.sh. For local development use `python -m http.server 8000` and visit http://localhost:8000 (do not use file:// for ES modules). Deploy over HTTPS.

Run the site through a security and accessibility QA review before using it with confidential customer information. Consider automated backups, document storage permissions, audit logs, more robust rate rules and customer accounts as a later phase.

## WhatsApp-first quote experience

The public homepage prominently displays the owner-provided WhatsApp number **+91 75739 69762**. The fast three-field quote form opens WhatsApp with a pre-filled message (the visitor must press Send in WhatsApp; it does **not** automatically create a database lead). The full quotation form writes to `public.quote_leads` when Supabase is configured. Only authorized staff can read the leads table. The operations dashboard shows a WhatsApp reply link and statuses **New, Contacted, Quoted, Won, Lost**.

For a new database, run `supabase/schema.sql`. If the previous schema was already applied, run `supabase/upgrade_quotes.sql` instead to add lead status and staff update access. Never publicly share the service role key. This site does not automatically send owner notifications or read WhatsApp messages. The owner must review new enquiries in the portal; future notifications require a secure server-side integration with explicit consent and anti-spam measures.

## Conversion-focused homepage update (November 2026)

The new homepage highlights same-day pickup **requests**, not guaranteed fulfillment. All pickups depend on location, booking cutoff, carrier availability and shipment readiness. It includes a service-first headline, immediate WhatsApp enquiry flow, corporate rate CTA, pickup explainer, industries served, FAQs, mobile contact bar and improved SEO description.

WhatsApp enquiries open in WhatsApp and are **not automatically stored** in Supabase. The detailed quote form stores leads in Supabase; authorized staff can review them under Enquiries. Do not imply automatic WhatsApp lead capture.

To publish changes to existing Netlify site, ensure it is connected to repository `cdkmf/code`, production branch `master`, base directory `nationxpress-production`, build command empty and publish directory `.`. Netlify must deploy the latest commit. Confirm in Deploys and test the live site.
