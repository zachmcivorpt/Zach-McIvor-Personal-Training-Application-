// Train Solo welcome email — sent once to every new Train Solo account.
//
// Inside the iOS app, Train Solo can't show prices or point to the website
// to buy (Apple guideline 3.1.1). Apple does allow contacting your own
// users OUTSIDE the app about other ways to buy, using the email they gave
// you — so this email is how someone who signs up in the app learns where
// to get a program. It's a commercial message under Australia's Spam Act
// 2003 (inferred consent from the account relationship): it identifies
// the sender and gives a working opt-out (reply "unsubscribe").
//
// Sending is plain SMTP (nodemailer), so any provider works — Gmail with
// an app password, Resend, Brevo, etc. Configured from functions/.env
// (written by .github/workflows/deploy-functions.yml from repo secrets):
//   SMTP_HOST, SMTP_PORT (465 = TLS, 587 = STARTTLS), SMTP_USER, SMTP_PASS,
//   MAIL_FROM (e.g. "APEX <you@gmail.com>"), MAIL_REPLY_TO (optional),
//   SITE_URL (optional, defaults to the live web app).
// Until SMTP_HOST/SMTP_USER/SMTP_PASS are set it sends nothing.

const DEFAULT_SITE_URL = "https://apexcoachingplatform-appl.vercel.app";

function smtpConfigured(env = process.env) {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Pure: the message for one customer. `name` is whatever they typed at
// sign-up (may be blank); only the first word is used in the greeting.
function buildWelcomeEmail({ name, siteUrl = DEFAULT_SITE_URL }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  const greeting = first ? `Hi ${first},` : "Hi,";
  const link = `${siteUrl.replace(/\/+$/, "")}/solo/login`;
  const subject = "Welcome to APEX Train Solo";

  const text = [
    greeting,
    "",
    "Welcome to APEX Train Solo. Your account is ready.",
    "",
    "Train Solo gives you a complete, coach-built program: every session planned for you, every lift logged, and your personal bests tracked automatically.",
    "",
    "Browse the programs and choose yours here:",
    link,
    "",
    "Log in with this email address, then open Catalogue. Once a program is yours, it's ready in the APEX app under My Training.",
    "",
    "Zach McIvor",
    "APEX",
    "",
    "You're receiving this because you created an APEX Train Solo account. Reply \"unsubscribe\" and we won't email you again.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F5F4F1;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0A0A0B;">
<tr><td style="font-size:13px;font-weight:800;letter-spacing:0.18em;padding-bottom:32px;">APEX</td></tr>
<tr><td style="font-size:26px;font-weight:800;line-height:1.2;padding-bottom:16px;">Welcome to Train Solo</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#3A3A3E;padding-bottom:14px;">${escapeHtml(greeting)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#3A3A3E;padding-bottom:14px;">Your account is ready. Train Solo gives you a complete, coach-built program: every session planned for you, every lift logged, and your personal bests tracked automatically.</td></tr>
<tr><td style="padding:12px 0 24px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0A0A0B;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.04em;padding:14px 26px;border-radius:999px;">Browse programs</a></td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#6B6B70;padding-bottom:28px;border-bottom:1px solid rgba(10,10,11,0.08);">Log in with this email address, then open Catalogue. Once a program is yours, it's ready in the APEX app under My Training.</td></tr>
<tr><td style="font-size:14px;line-height:1.6;padding-top:20px;">Zach McIvor<br><span style="color:#6B6B70;">APEX</span></td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#AFAFB4;padding-top:28px;">You're receiving this because you created an APEX Train Solo account. Reply &ldquo;unsubscribe&rdquo; and we won't email you again.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { subject, text, html };
}

async function sendWelcomeEmail({ to, name }, env = process.env) {
  // Required lazily so the rest of functions/ never depends on it loading.
  const nodemailer = require("nodemailer");
  const port = Number(env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  const { subject, text, html } = buildWelcomeEmail({ name, siteUrl: env.SITE_URL || DEFAULT_SITE_URL });
  await transport.sendMail({
    from: env.MAIL_FROM || env.SMTP_USER,
    ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
    to,
    subject,
    text,
    html,
    // Base64, not quoted-printable: QP wraps long lines with a space left
    // just before the soft line break, which some mail readers drop —
    // "Train Solo gives" arrived as "Train Sologives".
    textEncoding: "base64",
  });
}

module.exports = { buildWelcomeEmail, sendWelcomeEmail, smtpConfigured, DEFAULT_SITE_URL };
