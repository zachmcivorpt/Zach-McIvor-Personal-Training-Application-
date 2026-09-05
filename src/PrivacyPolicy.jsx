import React from "react";
import { Logo } from "./components/ui";

// Public, unauthenticated page — required by Google Play Console (and Apple,
// later) as a hosted privacy policy URL before an app handling health data
// can be submitted. Deliberately outside AppProvider's auth-gated routes so
// it's reachable by anyone, logged in or not.
const LAST_UPDATED = "September 2026";

export default function PrivacyPolicy() {
  return (
    <div className="w-full min-h-screen bg-white font-sans flex justify-center">
      <div className="w-full max-w-2xl px-6 py-10 md:py-16">
        <Logo variant="mark" tone="black" className="w-8 h-8 mb-6" />
        <h1 className="text-black text-2xl font-bold mb-1">Privacy Policy</h1>
        <p className="text-black/40 text-sm mb-8">Zach McIvor Personal Training — last updated {LAST_UPDATED}</p>

        <div className="space-y-6 text-black/80 text-sm leading-relaxed">
          <p>
            This app is a private coaching tool used between Zach McIvor Personal Training ("we", "us", "your coach")
            and its clients. It is not a public social network — only you and your coach can see your information.
          </p>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">Information we collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Account details</strong> you or your coach provide: name, email address, age, sex, height, training history, and injury/medical notes relevant to your program.</li>
              <li><strong>Health and fitness data</strong> you log in the app: workouts completed, weights and reps lifted, body measurements, weigh-ins, progress photos, nutrition and food diary entries, and cardio sessions.</li>
              <li><strong>Messages</strong> between you and your coach, including any photos, videos, or PDF files you choose to send.</li>
              <li><strong>Device information</strong> used only to deliver push notifications (e.g. workout reminders, new messages) to your device.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">How we use it</h2>
            <p>
              Your information is used solely to run your training program: building and adjusting your workouts and
              nutrition targets, tracking your progress over time, communicating with your coach, and sending you
              reminders. We do not sell your data, and we do not use it for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">Where your data is stored</h2>
            <p>
              Your data is stored securely using Google Firebase (Firestore, Cloud Storage, and Cloud Messaging).
              Access is restricted so that you can only see your own data, and your coach can only see their own
              clients' data. If you look up a food item by barcode, that lookup is sent to the free Open Food Facts
              database to retrieve nutrition information — no personal or account information is included in that
              request.
            </p>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">How long we keep it</h2>
            <p>
              Your data is kept for as long as you remain an active client, so your coach can track your progress
              over time. If you'd like your account and data deleted, contact your coach directly and they can
              remove it.
            </p>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">Your choices</h2>
            <p>
              You can review or correct your personal details at any time from within the app, or by asking your
              coach. You can also ask your coach to export or delete your data.
            </p>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">Children's privacy</h2>
            <p>
              This app is intended for use by adults working with a personal trainer. It is not directed at children,
              and we do not knowingly collect information from anyone under 16.
            </p>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">Changes to this policy</h2>
            <p>
              If this policy changes, the updated version will be posted at this same page with a new "last updated"
              date.
            </p>
          </section>

          <section>
            <h2 className="text-black font-semibold text-base mb-2">Contact</h2>
            <p>
              Questions about your data or this policy can be sent directly to your coach, Zach McIvor, at{" "}
              <span className="font-semibold">[ADD CONTACT EMAIL HERE]</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
