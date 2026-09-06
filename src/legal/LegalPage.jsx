import React from "react";
import { useParams, Link } from "react-router-dom";
import { Logo } from "../components/ui";
import { LEGAL_DOCS, LEGAL_CONTACT } from "./legalContent";

const NAV = [
  { slug: "terms-of-service", label: "Terms of Service" },
  { slug: "privacy-policy", label: "Privacy Policy" },
  { slug: "data-processing-terms", label: "Data Processing Terms" },
  { slug: "coach-responsibility-agreement", label: "Coach Agreement" },
];

// Renders one of the four APEX legal documents from src/legal/legalContent.js.
// Public, unauthenticated page (mounted outside any RequireRole route) —
// required by both app stores as a hosted, linkable privacy policy URL,
// and by the coach signup / client activation consent checkboxes.
export default function LegalPage() {
  const { slug } = useParams();
  const doc = LEGAL_DOCS[slug];

  if (!doc) {
    return (
      <div className="w-full min-h-screen bg-white font-sans flex items-center justify-center px-6">
        <p className="text-black/50 text-sm">That document doesn't exist.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-white font-sans flex justify-center">
      <div className="w-full max-w-2xl px-6 py-10 md:py-16">
        <Logo variant="mark" tone="black" className="w-8 h-8 mb-6" />
        <h1 className="text-black text-2xl font-bold mb-1">{doc.title}</h1>
        <p className="text-black/40 text-sm mb-6">APEX Coaching Platform — effective {doc.effectiveDate}</p>

        <nav className="flex flex-wrap gap-x-4 gap-y-1.5 mb-8 pb-6 border-b border-black/8">
          {NAV.map((n) => (
            <Link
              key={n.slug}
              to={`/legal/${n.slug}`}
              className={`text-xs font-semibold ${n.slug === slug ? "text-black underline underline-offset-2" : "text-black/40"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-6 text-black/80 text-sm leading-relaxed">
          {doc.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-black font-semibold text-base mb-2">{section.heading}</h2>
              {section.body.map((item, j) =>
                item === "contact" ? (
                  <p key={j}>
                    Questions regarding this document can be sent to APEX Coaching Platform at{" "}
                    <a href={`mailto:${LEGAL_CONTACT.email}`} className="font-semibold text-black underline">
                      {LEGAL_CONTACT.email}
                    </a>
                    {LEGAL_CONTACT.address ? `. Address: ${LEGAL_CONTACT.address}` : ""}
                    {LEGAL_CONTACT.abn ? `. ABN: ${LEGAL_CONTACT.abn}` : ""}.
                  </p>
                ) : typeof item === "string" ? (
                  <p key={j}>{item}</p>
                ) : (
                  <ul key={j} className="list-disc pl-5 space-y-1.5">
                    {item.list.map((li, k) => (
                      <li key={k}>{li}</li>
                    ))}
                  </ul>
                )
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
