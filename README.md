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
favicon.ico          Legacy favicon (icon mark cropped from the logo)
assets/css/style.css Site styling (colors, fonts, layout)
assets/js/main.js    Mobile menu, active nav highlight, contact form submission
assets/img/          Logo, favicon, and icon assets
```

## Brand

- **Colors**: navy `#002A58` (primary), gray `#676767` (body text), and red-orange
  `#FF4300` (accent) — all read from your logo file's embedded colors. Note: this is
  `#FF4300`, not pure `#FF0000` — that's what's actually in `Artboard 8.svg`, so I used
  it for visual consistency with the logo. Say the word if you actually want pure red
  instead. Colors are set as CSS variables at the top of `assets/css/style.css`
  (`:root { ... }`), so you can change them once and they apply site-wide.
- **Fonts**: Poppins (headings, matching the rounded bold sans of the "Synergetic"
  wordmark) + PT Serif (used for small-caps "eyebrow" labels, matching the serif
  small-caps "INSIGHTS AND CONSULTING" tagline in the logo) + Open Sans (body text).
  Loaded from Google Fonts in every page `<head>`.
- **Logo**: your real logo (`assets/img/Artboard 8.svg`, as uploaded) is used in two
  derived forms:
  - `assets/img/logo.svg` — full-color version, used in the header and anywhere on a
    light background.
  - `assets/img/logo-white.svg` — same logo with the navy wordmark recolored to white
    and the gray tagline lightened, for use on dark navy backgrounds (footer, hero
    watermark areas) where the navy text would otherwise be invisible.
  - `assets/img/icon-*.png` — the icon mark (red square + white "S") cropped out of
    the logo at several sizes, used for the favicon and as a decorative brand mark.
  - If you update the logo later, regenerate `logo-white.svg` by swapping the navy/gray
    hex values in a copy of the file, and re-crop the icon for the favicon.

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

The contact form posts to `contact-handler.php`, which emails submissions directly to
`info@synergetic-consulting.com` using PHP's `mail()` function. This requires PHP hosting
(standard on GoDaddy cPanel plans, including Web Hosting Economy) — no third-party account
needed.

- Make sure `contact-handler.php` is uploaded to `public_html` alongside the other files.
- Test the form after deploying by submitting it and checking the inbox for
  `info@synergetic-consulting.com` (including spam/junk on the first test).
- If messages aren't arriving, check with GoDaddy support that PHP `mail()` is enabled for
  your hosting plan, or ask them to check your account's mail sending logs.

If you ever move to a static-only host without PHP, you'd need to swap this out for a
service like [Formspree](https://formspree.io) instead — change the form's `action` in
`contact.html` to the Formspree endpoint.

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
