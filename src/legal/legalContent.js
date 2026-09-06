// Structured content for the four APEX legal documents, rendered by
// LegalPage.jsx. Source text lives in /legal/*.md at the repo root (kept
// as the canonical drafts) — this file mirrors that content in a shape
// React can render directly, one section per array entry. A section's
// `body` is an array of either a plain paragraph string or a
// `{ list: [...] }` bullet list.
export const LEGAL_CONTACT = {
  email: "apexplatformmanagement@outlook.com",
  address: "", // fill in once you have a business address you want published
  abn: "", // optional — leave blank if you don't have one yet
};

const EFFECTIVE_DATE = "6 September 2026";

export const LEGAL_DOCS = {
  "privacy-policy": {
    title: "Privacy Policy",
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        heading: "1. About this Privacy Policy",
        body: [
          'This Privacy Policy explains how APEX Coaching Platform ("APEX", "we", "us" or "our") collects, holds, uses, discloses and protects personal information.',
          "APEX intends to handle personal information consistently with the Privacy Act 1988 (Cth), including the Australian Privacy Principles (\"APPs\"), to the extent applicable.",
          "This Privacy Policy is intended to satisfy the transparency requirements applicable to an APP privacy policy and will be reviewed and updated as APEX's activities, technology and legal obligations change.",
        ],
      },
      {
        heading: "2. About APEX",
        body: [
          "APEX provides technology infrastructure for coaching businesses and their clients.",
          "APEX does not itself provide fitness, medical, healthcare, therapeutic or nutrition coaching.",
          "Where a coach provides those services using APEX, the coach is responsible for the professional advice and services they provide.",
        ],
      },
      {
        heading: "3. Information we collect",
        body: [
          "Depending on how you use APEX, we may collect:",
          { list: ["Account information — name, email address, telephone number, username, password credentials in protected form, profile information, account preferences, and authentication information."] },
          {
            list: [
              "Client and coaching information — depending on the features used: coaching goals, progress information, measurements, activity information, exercise-related information, appointment information, communications, notes, forms, documents, photographs or videos, program information, and information supplied by coaches or clients.",
            ],
          },
          {
            list: [
              "Sensitive information — some information uploaded to APEX may constitute sensitive information under Australian law, including health information. APEX does not require users to upload sensitive information unless reasonably necessary for the relevant service. Where a coach uploads or controls Client Data containing sensitive information, the coach remains responsible for ensuring that the relevant collection and use is lawful and appropriately authorised.",
            ],
          },
          {
            list: [
              "Payment information — where payments are processed, payment information may be collected directly by third-party payment providers. APEX may receive limited transaction information such as payment status, transaction reference, billing details or subscription status.",
            ],
          },
          {
            list: [
              "Technical information — IP address, device information, browser type, operating system, log information, access times, usage information, security events, diagnostic information, and cookies or similar technologies.",
            ],
          },
        ],
      },
      {
        heading: "4. How we collect information",
        body: [
          "We may collect information directly from you; from your coach or organisation; when you create an account; when you use the Platform; through forms; through communications; through integrated services; from payment providers; through cookies and similar technologies; and from other lawful sources.",
          "Where reasonably practicable, APEX will provide notice at or before collection, or as soon as practicable afterwards, regarding the matters required by applicable privacy law.",
        ],
      },
      {
        heading: "5. Why we collect and use information",
        body: [
          "APEX may collect, hold, use and disclose personal information for purposes including: creating and managing accounts; providing Platform functionality; enabling communication between coaches and clients; storing coaching information; facilitating scheduling and appointments; processing payments; providing customer support; authentication and account security; preventing fraud and abuse; monitoring and improving Platform performance; troubleshooting; maintaining records; complying with legal obligations; responding to requests and complaints; managing disputes; protecting APEX and users; sending service communications; and other purposes reasonably necessary to provide the Platform.",
          "APEX will not use personal information for a purpose unrelated to the purpose for which it was collected unless permitted or required by law.",
        ],
      },
      {
        heading: "6. Sensitive information and health information",
        body: [
          "Because APEX is a coaching technology platform, users may choose to store health-related information on the Platform.",
          "APEX will handle sensitive information in accordance with applicable legal requirements. Where APEX itself determines that sensitive information is reasonably necessary to provide a service and consent is required, APEX will seek appropriate consent.",
          "Coaches must not collect excessive health information merely because the Platform makes it technically possible to do so, and should only request information reasonably necessary for their services.",
        ],
      },
      {
        heading: "7. Client Data controlled by coaches",
        body: [
          "A coach or coaching organisation may upload and manage Client Data through APEX. Where this occurs, APEX may process that information on behalf of the coach or organisation to provide the Platform.",
          "The coach or organisation remains responsible for determining what Client Data is collected, ensuring the collection is lawful, obtaining any required consent, providing required privacy notices, ensuring appropriate authority exists to upload the information, determining appropriate retention periods, and responding to client requests where the coach is the relevant responsible entity.",
        ],
      },
      {
        heading: "8. Disclosure of personal information",
        body: [
          "APEX may disclose information to: employees and contractors; hosting and cloud infrastructure providers; payment processors; email and communications providers; authentication providers; analytics providers; customer support providers; scheduling and calendar providers; security providers; professional advisers; insurers; auditors; regulators and government authorities where legally required; purchasers or successors of APEX in connection with a corporate transaction; and other parties where authorised or required by law.",
        ],
      },
      {
        heading: "9. Overseas disclosures",
        body: [
          "Some third-party service providers may store or process information outside Australia. Where applicable, APEX will comply with the requirements governing overseas disclosure of personal information, including APP 8.",
          "A current list of significant overseas hosting or service-provider locations may be obtained by contacting APEX at the address below.",
        ],
      },
      {
        heading: "10. Cookies and analytics",
        body: [
          "APEX may use cookies, logs, analytics and similar technologies to keep users signed in, remember preferences, improve performance, understand Platform usage, detect security issues, measure functionality, and improve the user experience.",
        ],
      },
      {
        heading: "11. Direct marketing",
        body: [
          "APEX may send service-related communications necessary to operate an account. Where permitted, APEX may also send marketing communications. You may opt out of marketing communications at any time.",
        ],
      },
      {
        heading: "12. Security",
        body: [
          "APEX takes reasonable steps to protect personal information from misuse, interference, loss, unauthorised access, unauthorised modification and unauthorised disclosure — including access controls, authentication controls, encryption where appropriate, logging, monitoring, backup and recovery procedures, and vendor management.",
          "No system can be guaranteed to be completely secure.",
        ],
      },
      {
        heading: "13. Data breaches",
        body: [
          "If APEX becomes aware of a suspected data breach, we will investigate and take reasonable steps to contain, assess and remediate the incident. Where the Notifiable Data Breaches scheme applies and an eligible data breach occurs, APEX will comply with applicable notification requirements.",
        ],
      },
      {
        heading: "14. Data quality",
        body: [
          "APEX takes reasonable steps to ensure personal information it uses is accurate, up to date and complete where required for its purposes. Where a coach controls Client Data, requests concerning its accuracy may need to be directed to that coach.",
        ],
      },
      {
        heading: "15. Access to personal information",
        body: [
          "Subject to applicable exceptions, you may request access to personal information APEX holds about you by contacting us at the details below. We may need to verify your identity before providing access.",
        ],
      },
      {
        heading: "16. Correction",
        body: [
          "If you believe information held by APEX is inaccurate, incomplete, out of date or misleading, you may request correction. Where the information is controlled by a coach, APEX may refer the request to that coach.",
        ],
      },
      {
        heading: "17. De-identification and deletion",
        body: [
          "Where personal information is no longer required for a lawful purpose, APEX will take reasonable steps to destroy or de-identify it unless retention is required or authorised by law. Backups may continue to contain information for a limited period before being overwritten.",
        ],
      },
      {
        heading: "18. Complaints",
        body: [
          "If you believe APEX has mishandled your personal information, you may make a complaint including your name, contact details, a description of the issue, relevant dates, and any supporting information. If you are dissatisfied with our response, you may complain to the Office of the Australian Information Commissioner (OAIC).",
        ],
      },
      {
        heading: "19. Automated decision-making",
        body: [
          "APEX may use automated technologies for operational purposes such as fraud detection, security monitoring and technical optimisation. APEX does not currently intend to use automated decision-making to make decisions that significantly affect an individual's rights or interests without appropriate human oversight, except where expressly disclosed.",
        ],
      },
      {
        heading: "20. Children's information",
        body: [
          "APEX is not primarily designed for children. Where children use APEX, the relevant coach, parent or guardian must ensure that collection and use of the child's personal information complies with applicable law.",
        ],
      },
      {
        heading: "21. Third-party websites and services",
        body: [
          "The Platform may contain links or integrations with third-party services. APEX is not responsible for the privacy practices of independent third parties.",
        ],
      },
      {
        heading: "22. Changes to this Privacy Policy",
        body: [
          "APEX may update this Privacy Policy from time to time. The updated version will be published through the Platform, with a new effective date.",
        ],
      },
      {
        heading: "23. Contact",
        body: ["contact"],
      },
    ],
  },

  "terms-of-service": {
    title: "Terms of Service",
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        heading: "1. About these Terms",
        body: [
          'These Terms of Service ("Terms") govern your access to and use of the APEX Coaching Platform ("APEX", "Platform", "we", "us" or "our"). By creating an account, accessing the Platform, accepting an invitation from a coach, or otherwise using the Platform, you agree to be bound by these Terms.',
          "These Terms should be read together with the APEX Privacy Policy, Data Processing & Privacy Terms, and Coach Responsibility and Client Data Agreement.",
        ],
      },
      {
        heading: "2. What APEX is",
        body: [
          "APEX is a technology platform designed to assist coaches and their clients with coaching administration, communication, information management, scheduling, programs, resources, progress tracking and related functionality.",
          "APEX is a technology provider and does not itself provide fitness, medical, healthcare, therapeutic, psychological, dietary or nutrition coaching or professional advice. Unless expressly stated otherwise, APEX does not assess your physical condition, diagnose or treat any condition, prescribe exercise or rehabilitation, provide medical or nutrition advice, or replace a qualified health professional.",
        ],
      },
      {
        heading: "3. Your relationship with your coach",
        body: [
          "Your coach is responsible for the professional services, advice, programs and communications they provide to you. APEX does not endorse, guarantee, supervise or independently verify a coach's qualifications, advice, or the safety or suitability of any program.",
          "Where you have a medical condition, injury, disability, pregnancy or other health concern, you should obtain appropriate professional medical advice before undertaking physical activity or following health-related recommendations.",
        ],
      },
      {
        heading: "4. Eligibility",
        body: [
          "You must be legally capable of entering into these Terms. If you are under 18, you may only use APEX with the involvement and consent of a parent or guardian, where required by law.",
        ],
      },
      {
        heading: "5. Account registration",
        body: [
          "You agree to provide accurate, current and complete information and keep it updated. You must not create an account using another person's identity, impersonate another person, or provide false registration information.",
        ],
      },
      {
        heading: "6. Account security",
        body: [
          "You are responsible for maintaining the confidentiality and security of your login credentials: use a strong password, enable multi-factor authentication where available, and notify APEX immediately if you suspect unauthorised access.",
        ],
      },
      {
        heading: "7. Acceptable use",
        body: [
          "You must not use the Platform to breach any law, infringe another's rights, upload malicious code, attempt unauthorised access, upload unlawful or abusive material, misuse another person's personal information, impersonate anyone, or provide services you are not legally or professionally authorised to provide.",
        ],
      },
      {
        heading: "8. Client data",
        body: [
          "Where you upload information about clients through APEX (\"Client Data\"), you remain responsible for ensuring you have the appropriate authority, consent or other lawful basis to collect, use and disclose it, and that it is not retained longer than reasonably necessary.",
        ],
      },
      {
        heading: "9. Privacy",
        body: [
          "APEX handles personal information in accordance with its Privacy Policy and applicable privacy laws. Use of the Platform necessarily involves the collection and processing of certain information required to provide it.",
        ],
      },
      {
        heading: "10. Third-party services",
        body: [
          "APEX may integrate with or rely upon third-party services (payment processors, cloud hosting, email, analytics, authentication, and similar providers). APEX is not responsible for the independent acts or omissions of third-party providers outside its reasonable control.",
        ],
      },
      {
        heading: "11. Intellectual property",
        body: [
          "The Platform — its software, interface, design, branding and underlying technology — is owned by or licensed to APEX. You are granted a limited, non-exclusive, revocable right to access and use it for its intended purpose.",
        ],
      },
      {
        heading: "12. Your content",
        body: [
          "You retain ownership of content you lawfully submit to APEX, subject to the licence needed for APEX to host, transmit and process it to provide the Platform. APEX will not sell Client Data or use it for unrelated purposes.",
        ],
      },
      {
        heading: "13. Intellectual property of coaches",
        body: [
          "Coaches retain ownership of their original coaching materials, programs, documents, videos and templates, subject to the rights necessary to operate the Platform.",
        ],
      },
      {
        heading: "14. Feedback",
        body: [
          "If you provide suggestions or feedback, you grant APEX a perpetual, royalty-free right to use it to improve the Platform, without publicly identifying you as the source without permission.",
        ],
      },
      {
        heading: "15. Data security and breaches",
        body: [
          "APEX will take reasonable technical and organisational measures to protect information it holds. If APEX becomes aware of a suspected data breach, it will respond in accordance with its incident response procedures and applicable law.",
        ],
      },
      {
        heading: "16. Availability",
        body: [
          "APEX aims to provide a reliable service but does not guarantee the Platform will always be available, uninterrupted or error-free.",
        ],
      },
      {
        heading: "17. Payments and subscriptions",
        body: [
          "Where paid services are offered, applicable pricing, billing cycles and cancellation terms will be disclosed at the point of purchase. Unless required by law, fees are non-refundable once the relevant service period has commenced.",
        ],
      },
      {
        heading: "18. Suspension",
        body: [
          "APEX may suspend or restrict access where reasonably necessary to protect security, investigate misuse, comply with law, or enforce these Terms.",
        ],
      },
      {
        heading: "19. Termination",
        body: [
          "You may stop using the Platform at any time. APEX may terminate or suspend your account for material breach of these Terms, unlawful conduct, repeated misuse, or non-payment.",
        ],
      },
      {
        heading: "20. Disclaimers",
        body: [
          "APEX provides the Platform on an \"as available\" basis and does not guarantee any particular coaching, fitness or health outcome. APEX is not a healthcare provider and does not provide fitness, medical or nutrition coaching.",
        ],
      },
      {
        heading: "21. Liability",
        body: [
          "Nothing in these Terms excludes rights that cannot lawfully be excluded, including under the Australian Consumer Law. To the maximum extent permitted by law, APEX's aggregate liability arising from the Platform is limited to the greater of the amount you paid APEX in the preceding 12 months or AUD $100.",
        ],
      },
      {
        heading: "22. Indemnity",
        body: [
          "To the extent permitted by law, you indemnify APEX against losses arising from your unlawful use of the Platform, breach of these Terms, or infringement of another person's rights, except to the extent caused by APEX's own negligence or breach of law.",
        ],
      },
      {
        heading: "23. Changes to these Terms",
        body: [
          "APEX may update these Terms from time to time. Continued use of the Platform after an update constitutes acceptance of the revised Terms.",
        ],
      },
      {
        heading: "24. Australian law",
        body: [
          "These Terms are governed by the laws of the Commonwealth of Australia and the relevant state or territory.",
        ],
      },
      {
        heading: "25. Severability",
        body: [
          "If any provision is invalid or unenforceable, it will be read down or severed to the minimum extent necessary, and the rest will continue in effect.",
        ],
      },
      {
        heading: "26. Contact",
        body: ["contact"],
      },
    ],
  },

  "data-processing-terms": {
    title: "Data Processing & Privacy Terms",
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        heading: "1. Purpose",
        body: [
          'These Data Processing & Privacy Terms ("DPT") govern the processing of Client Data by APEX where a coach or organisation uses APEX to collect, store, manage or otherwise process information relating to clients. These DPT form part of the agreement between APEX and the relevant coach and should be read with the APEX Terms of Service, Privacy Policy and Coach Responsibility and Client Data Agreement.',
        ],
      },
      {
        heading: "2. Definitions",
        body: [
          '"Client Data": any information about a Client uploaded, entered or otherwise processed through APEX on behalf of a Coach — may include personal, sensitive or health information.',
          '"Coach"/"Organisation": the person or entity using APEX to provide coaching services and controlling Client Data.',
        ],
      },
      {
        heading: "3. Roles of the parties",
        body: [
          "The Coach or Organisation is primarily responsible for determining the purposes for which Client Data is collected and used; APEX processes Client Data to provide, maintain, secure and support the Platform.",
        ],
      },
      {
        heading: "4. Instructions",
        body: [
          "APEX will process Client Data in accordance with the Coach's lawful instructions and these DPT, and may process information without separate instructions where reasonably necessary to provide the Platform, maintain security, prevent fraud, or comply with law.",
        ],
      },
      {
        heading: "5. Coach responsibilities",
        body: [
          "The Coach must ensure Client Data is collected and used lawfully — identifying the purpose of collection, providing privacy notices, obtaining required consent, avoiding unnecessary collection, maintaining data quality, and establishing appropriate retention periods.",
        ],
      },
      {
        heading: "6. Sensitive and health information",
        body: [
          "A Coach must not collect health information merely because it may be useful, and should only collect what is reasonably necessary for the service, obtaining any consent required by law.",
        ],
      },
      {
        heading: "7. Security obligations",
        body: [
          "APEX will maintain reasonable technical and organisational measures to protect Client Data — authentication, access controls, encryption where appropriate, logging and monitoring, backup controls, and incident response.",
        ],
      },
      {
        heading: "8. Coach security obligations",
        body: [
          "The Coach must protect account credentials, use strong passwords, enable multi-factor authentication where available, restrict and promptly remove staff access, and promptly report suspected breaches.",
        ],
      },
      {
        heading: "9. Subprocessors and third-party providers",
        body: [
          "APEX may engage third-party providers of cloud infrastructure, storage, communications, authentication, payments, analytics and support, and remains responsible for managing them as required by law.",
        ],
      },
      {
        heading: "10. Overseas processing",
        body: [
          "Client Data may be stored or processed outside Australia. APEX will take reasonable steps to comply with applicable overseas-disclosure requirements, including APP 8 where applicable.",
        ],
      },
      {
        heading: "11. Disclosure required by law",
        body: [
          "APEX may disclose Client Data where reasonably necessary to comply with law, respond to lawful regulatory requests, or investigate suspected fraud or serious security incidents.",
        ],
      },
      {
        heading: "12. Data breaches",
        body: [
          "Where APEX becomes aware of a suspected breach affecting Client Data, it will contain the incident, investigate its scope, assess potential harm, determine notification obligations, and remediate — complying with the Notifiable Data Breaches scheme where it applies.",
        ],
      },
      {
        heading: "13. Coach notification obligations",
        body: [
          "The Coach must promptly notify APEX of unauthorised access to their account, accidental disclosure of Client Data, lost devices, or suspicious account activity.",
        ],
      },
      {
        heading: "14. Assistance",
        body: [
          "Where reasonably necessary, APEX may assist a Coach with access, correction and deletion requests, data exports, security incidents, and regulatory enquiries.",
        ],
      },
      {
        heading: "15. Data access",
        body: [
          "APEX personnel will only access Client Data where reasonably necessary for legitimate business purposes such as technical support, security, or legal compliance.",
        ],
      },
      {
        heading: "16. Data retention",
        body: [
          "APEX will retain Client Data for as long as reasonably necessary to provide the Platform or satisfy legal, security or contractual requirements. The Coach is responsible for determining the appropriate retention period for data it controls.",
        ],
      },
      {
        heading: "17. Data export",
        body: [
          "Where technically available, APEX may allow export of Client Data. Once exported, the Coach is responsible for protecting that copy.",
        ],
      },
      {
        heading: "18. Data minimisation",
        body: [
          "Coaches should only collect Client Data reasonably necessary for the services being provided.",
        ],
      },
      {
        heading: "19. Data quality",
        body: [
          "The Coach is responsible for ensuring information they enter is accurate and appropriately maintained.",
        ],
      },
      {
        heading: "20. Use of aggregated and de-identified data",
        body: [
          "APEX may create aggregated or de-identified information for analytics, security, product development or business reporting, taking reasonable steps to prevent re-identification.",
        ],
      },
      {
        heading: "21. Confidentiality",
        body: [
          "Each party must protect confidential information received from the other, and APEX personnel with Client Data access are bound by confidentiality obligations.",
        ],
      },
      {
        heading: "22. Privacy requests from Clients",
        body: [
          "Where a Client asks APEX for access to information controlled by a Coach, APEX may direct the Client to that Coach and provide reasonable assistance.",
        ],
      },
      {
        heading: "23. Regulatory cooperation",
        body: [
          "The parties will reasonably cooperate in responding to lawful privacy regulator enquiries relating to the Platform.",
        ],
      },
      {
        heading: "24. Audit and compliance information",
        body: [
          "APEX may provide reasonable information about its security and privacy practices where commercially appropriate; such documentation is confidential.",
        ],
      },
      {
        heading: "25. International requirements",
        body: [
          "Where compliance with privacy legislation outside Australia is required, the parties should agree additional terms before processing begins.",
        ],
      },
      {
        heading: "26. Conflict",
        body: [
          "If these DPT conflict with the APEX Terms of Service regarding the processing of Client Data, these DPT prevail to the extent of the conflict.",
        ],
      },
      {
        heading: "27. Survival",
        body: [
          "Privacy, confidentiality, intellectual property, security and liability obligations intended to survive termination continue after termination.",
        ],
      },
      {
        heading: "28. Contact",
        body: ["contact"],
      },
    ],
  },

  "coach-responsibility-agreement": {
    title: "Coach Responsibility & Client Data Agreement",
    effectiveDate: EFFECTIVE_DATE,
    sections: [
      {
        heading: "1. Purpose",
        body: [
          "This Agreement establishes the responsibilities of coaches using APEX in relation to their clients, professional services, client information, privacy and use of the Platform, and operates alongside the APEX Terms of Service, Privacy Policy and Data Processing & Privacy Terms.",
        ],
      },
      {
        heading: "2. Independent coach responsibility",
        body: [
          "The Coach acknowledges APEX is a technology platform, not the provider of the Coach's professional services, and is solely responsible for their relationship with each Client, the advice and programs they provide, and compliance with applicable professional and legal standards.",
        ],
      },
      {
        heading: "3. APEX does not provide coaching",
        body: [
          "APEX itself does not provide fitness coaching, personal training, medical advice, healthcare, physiotherapy, psychological or dietetic services. Any such service is provided by the Coach or relevant independent professional.",
        ],
      },
      {
        heading: "4. Professional qualifications",
        body: [
          "The Coach must only represent qualifications they genuinely hold, and must not provide a regulated professional service unless legally authorised and appropriately qualified.",
        ],
      },
      {
        heading: "5. Medical boundaries",
        body: [
          "A Coach must not represent themselves as a medical practitioner unless appropriately qualified, and should recommend a Client seek professional advice where symptoms or circumstances fall outside the Coach's competence.",
        ],
      },
      {
        heading: "6. Fitness and physical activity",
        body: [
          "A Coach providing fitness services is responsible for assessing whether they are appropriate within their professional scope — APEX does not assess exercise suitability, physical capacity or injury risk.",
        ],
      },
      {
        heading: "7. Nutrition",
        body: [
          "The Coach must not represent general nutritional information as medical or dietetic advice unless appropriately qualified and authorised.",
        ],
      },
      {
        heading: "8. Client consent",
        body: [
          "The Coach must obtain any consent required by law before collecting, using or disclosing Client Data — appropriately informed, voluntary, specific, and capable of being withdrawn where applicable.",
        ],
      },
      {
        heading: "9. Privacy notice",
        body: [
          "The Coach must provide Clients with appropriate information about what data is collected, why, how it's used, who it may be disclosed to, and how Clients can access, correct or complain about it.",
        ],
      },
      {
        heading: "10. Collection of Client Data",
        body: [
          "The Coach must only collect Client Data reasonably necessary for their services, considering necessity, relevance, proportionality and lawfulness for each category collected.",
        ],
      },
      {
        heading: "11. Health and sensitive information",
        body: [
          "Health information may be sensitive information under Australian privacy law — the Coach must comply with applicable requirements and avoid entering unnecessary medical information into free-text fields.",
        ],
      },
      {
        heading: "12. Client photographs and videos",
        body: [
          "If a Coach uploads photos or videos of a Client, the Coach is responsible for ensuring they have the necessary authority and consent, and for considering purpose, necessity and retention.",
        ],
      },
      {
        heading: "13. Client communications",
        body: [
          "Coaches must use professional communication practices and must not use APEX to harass, threaten, discriminate against, deceive or exploit a Client.",
        ],
      },
      {
        heading: "14. Client confidentiality",
        body: [
          "The Coach must protect Client information — it must not be sold, publicly disclosed, posted to social media, or shared with unrelated businesses without authorisation.",
        ],
      },
      {
        heading: "15. Third-party services",
        body: [
          "The Coach must not upload Client Data to an external service through an APEX integration without considering whether the disclosure is lawful and appropriate.",
        ],
      },
      {
        heading: "16. Overseas disclosures",
        body: [
          "The Coach acknowledges Client Data may be handled by infrastructure outside Australia and remains responsible for complying with applicable overseas-disclosure requirements.",
        ],
      },
      {
        heading: "17. Client access and correction",
        body: [
          "The Coach must maintain a reasonable process for responding to Client access and correction requests, and must not unreasonably obstruct a lawful request.",
        ],
      },
      {
        heading: "18. Client deletion requests",
        body: [
          "Where a Client requests deletion, the Coach must consider the request under applicable law — some information may need to be retained where legally required.",
        ],
      },
      {
        heading: "19. Data retention",
        body: [
          "The Coach is responsible for establishing an appropriate retention period and should not retain personal information indefinitely merely because storage is available.",
        ],
      },
      {
        heading: "20. Account security",
        body: [
          "The Coach must maintain strong credentials, enable multi-factor authentication where available, restrict and remove staff access, and promptly report suspected compromise.",
        ],
      },
      {
        heading: "21. Staff and contractors",
        body: [
          "Employees or contractors given access to Client Data must have a legitimate need for it, understand confidentiality obligations, and have access removed when no longer required.",
        ],
      },
      {
        heading: "22. Data breach responsibility",
        body: [
          "The Coach must promptly notify APEX of any suspected incident involving unauthorised access, disclosure, stolen credentials or lost devices, and cooperate with reasonable incident-response requests.",
        ],
      },
      {
        heading: "23. Client data accuracy",
        body: [
          "The Coach is responsible for the accuracy of Client Data they enter and should correct inaccurate or outdated information when identified.",
        ],
      },
      {
        heading: "24. Intellectual property",
        body: [
          "The Coach retains ownership of original materials they lawfully create and upload, granting APEX the limited rights necessary to host and process them for the Platform.",
        ],
      },
      {
        heading: "25. Client intellectual property",
        body: [
          "The Coach must respect intellectual property rights belonging to Clients or third parties and must not upload unauthorised proprietary material.",
        ],
      },
      {
        heading: "26. Acceptable use",
        body: [
          "The Coach must not use APEX to conduct unlawful activity, distribute malware, provide services outside their professional scope, misuse or sell Client Data, or otherwise materially breach the APEX Terms of Service.",
        ],
      },
      {
        heading: "27. Records",
        body: [
          "The Coach should maintain appropriate records of client consent, privacy notices, qualifications, insurance, incidents and complaints.",
        ],
      },
      {
        heading: "28. Client safety",
        body: [
          "The Coach remains responsible for appropriate professional risk management, including escalation to emergency or medical services where appropriate. APEX must not be represented as an emergency service.",
        ],
      },
      {
        heading: "29. No guarantee of professional outcomes",
        body: [
          "The Coach must not represent that APEX guarantees fitness, weight loss, medical, nutritional or performance outcomes.",
        ],
      },
      {
        heading: "30. Indemnity by Coach",
        body: [
          "To the extent permitted by law, the Coach indemnifies APEX against claims arising from the Coach's professional services, breach of privacy obligations, or unlawful use of APEX, except to the extent caused by APEX's own negligence or breach of law.",
        ],
      },
      {
        heading: "31. APEX's role and limitations",
        body: [
          "APEX provides technology rather than professional coaching, does not independently verify Client Data or professional advice, and does not guarantee coaching outcomes.",
        ],
      },
      {
        heading: "32. Suspension of Coach access",
        body: [
          "APEX may suspend or restrict a Coach's access where reasonably necessary to protect Client Data, respond to a security incident, or address a serious breach of these terms.",
        ],
      },
      {
        heading: "33. Termination",
        body: [
          "APEX may terminate a Coach's access for material breach, repeated privacy breaches, misuse of Client Data, or unlawful conduct. Obligations concerning confidentiality, privacy and liability survive termination.",
        ],
      },
      {
        heading: "34. Australian Privacy Act",
        body: [
          "Where applicable, the Coach acknowledges their obligations under the Privacy Act 1988 (Cth) and the Australian Privacy Principles, which may apply differently depending on the Coach's business structure.",
        ],
      },
      {
        heading: "35. Changes to law",
        body: [
          "APEX may update this Agreement or Platform functionality where reasonably necessary to respond to changes in Australian privacy law.",
        ],
      },
      {
        heading: "36. Acknowledgement",
        body: [
          "By using APEX to store or process Client Data, the Coach confirms they have read this Agreement, will only upload Client Data they are authorised to provide, and understand APEX is a technology platform rather than a provider of fitness, medical or nutrition coaching.",
        ],
      },
      {
        heading: "37. Contact",
        body: ["contact"],
      },
    ],
  },
};
