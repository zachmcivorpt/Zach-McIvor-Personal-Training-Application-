import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildWelcomeEmail, smtpConfigured, DEFAULT_SITE_URL } = require("./soloWelcomeEmail.js");

describe("Train Solo welcome email", () => {
  it("greets by first name and links to the website's Train Solo login", () => {
    const { subject, text, html } = buildWelcomeEmail({ name: "  Jordan Smith " });
    expect(subject).toBe("Welcome to APEX Train Solo");
    expect(text.startsWith("Hi Jordan,")).toBe(true);
    expect(text).toContain(`${DEFAULT_SITE_URL}/solo/login?next=catalogue`);
    expect(html).toContain(`href="${DEFAULT_SITE_URL}/solo/login?next=catalogue"`);
  });

  it("has a plain greeting with no name, and uses a custom site URL without doubling slashes", () => {
    const { text } = buildWelcomeEmail({ name: "", siteUrl: "https://example.com/" });
    expect(text.startsWith("Hi,")).toBe(true);
    expect(text).toContain("https://example.com/solo/login?next=catalogue");
  });

  it("identifies the sender and offers an opt-out (Spam Act)", () => {
    const { text, html } = buildWelcomeEmail({ name: "Sam" });
    expect(text).toContain("Zach McIvor");
    expect(text).toMatch(/Reply "unsubscribe"/);
    expect(html).toContain("unsubscribe");
  });

  it("escapes a name typed with HTML in it", () => {
    const { html } = buildWelcomeEmail({ name: "<b>Eve</b>" });
    expect(html).not.toContain("<b>Eve");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });

  it("is only configured once host, user and password are all set", () => {
    expect(smtpConfigured({})).toBe(false);
    expect(smtpConfigured({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@gmail.com", SMTP_PASS: "" })).toBe(false);
    expect(smtpConfigured({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@gmail.com", SMTP_PASS: "x" })).toBe(true);
  });
});
