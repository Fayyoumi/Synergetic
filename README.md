# Synergetic Insights and Consulting — Website

A static, no-build-step website (plain HTML/CSS/JS) for **Synergetic Insights and
Consulting**, ready to upload directly to GoDaddy hosting.

## Structure

```
index.html          Homepage
about.html           About Us
services.html        Services (Monitoring & Evaluation, Learning & KM, Research, Data Analysis)
contact.html         Contact page with form
404.html             Custom "page not found" page
robots.txt           Search engine crawl rules
sitemap.xml          Sitemap for SEO
assets/css/style.css Site styling (colors, fonts, layout)
assets/js/main.js    Mobile menu, active nav highlight, contact form submission
assets/img/          Logo and favicon (SVG)
```

## Brand

- **Colors**: navy `#002A58` (primary), red `#FF0000` (accent), gray `#676767` (body text)
  — set as CSS variables at the top of `assets/css/style.css` (`:root { ... }`), so you
  can change them once and they apply site-wide.
- **Fonts**: Montserrat (headings) + Open Sans (body), loaded from Google Fonts.
  These were **not specified** in the info I had — if your brand guideline calls for
  different fonts, update the `<link href="https://fonts.googleapis.com/...">` tag in
  every page `<head>` and the `--font-heading` / `--font-body` variables in `style.css`.
- **Logo**: `assets/img/logo.svg` and `favicon.svg` are placeholder, text/icon-based
  marks built from your brand colors. Replace them with your real logo file (SVG or PNG)
  — keep the same filenames, or update the `<img src="...">` references across all
  HTML files.

## Content to review before launch

I didn't have your company profile document, so some content is generic/placeholder
and should be checked:

- **Contact page & footer**: office address, phone number, and email
  (`info@synergetic-consulting.com` is a guess based on your domain — confirm this
  mailbox exists or change it).
- **About page**: mission/values text is written to be accurate but generic — add
  specifics from your company profile (years active, notable clients/sectors, team).
- **Services page**: the four service areas and their bullet lists — expand or edit
  based on your actual service offerings.
- **Social links** in the footer (`#` placeholders) — add your real LinkedIn/X URLs.

## Contact form setup

The contact form posts to [Formspree](https://formspree.io) (a free service — no
backend/server needed, works on any static host including GoDaddy):

1. Create a free Formspree account and a new form.
2. Copy the endpoint URL (looks like `https://formspree.io/f/xxxxxxxx`).
3. In `contact.html`, replace `YOUR_FORM_ID` in:
   ```html
   <form id="contact-form" action="https://formspree.io/f/YOUR_FORM_ID" method="POST">
   ```
4. Test the form after deploying.

If your GoDaddy plan includes PHP hosting, you could alternatively point the form
at a PHP mail script instead.

## Deploying to GoDaddy

**Option A — cPanel File Manager (easiest, no FTP client needed):**

1. Log in to your GoDaddy account → **My Products** → find your hosting plan → **Manage**.
2. Open **File Manager** (or cPanel → File Manager).
3. Navigate to `public_html` (this is your site's web root).
4. Upload all files/folders from this project (`index.html`, `about.html`,
   `services.html`, `contact.html`, `404.html`, `robots.txt`, `sitemap.xml`, and the
   `assets/` folder) directly into `public_html`, preserving the folder structure.
5. Visit `https://synergetic-consulting.com` to confirm it's live.

**Option B — FTP:**

1. Get your FTP credentials from GoDaddy hosting dashboard (**Settings → FTP Users**).
2. Use an FTP client (e.g. FileZilla) to connect.
3. Upload all project files into `public_html`, preserving folder structure.

No build tools, Node.js, or database are required — it's plain static files.

## Local preview

You can preview the site locally before uploading. From this folder, run any simple
static server, e.g.:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.
