// Pre-built check-in form templates a coach can import as a starting point,
// then edit further in the form builder (mirrors the starterPrograms.js pattern).

function q(id, type, label, opts) {
  return { id, type, label, required: true, ...opts };
}

export const WEEKLY_CHECKIN_TEMPLATE = {
  name: "Weekly Check-In",
  description: "A quick weekly reflection on training, nutrition, recovery and mindset — takes about 5 minutes.",
  questions: [
    q("wc-mental", "rating", "How did you feel mentally going into this week's sessions?"),
    q(
      "wc-stress",
      "rating",
      "How have your stress levels been outside the gym? (Stress directly affects physique goals from elevated cortisol — a catabolic hormone.)"
    ),
    q("wc-stress-affect", "choice", "Did this affect your training or nutrition?", {
      options: ["No", "Yes — training", "Yes — nutrition", "Yes — both"],
    }),
    q(
      "wc-recovery",
      "text",
      "Did you take time to intentionally recover this week? (Mobility work, active walking, dynamic stretching.)"
    ),
    q("wc-sessions", "choice", "How many sessions did you complete this past week?", {
      options: ["All of them", "5", "4", "3", "2", "1", "0"],
    }),
    q("wc-sessions-reason", "text", "If you missed a session, what was the reason?", { required: false }),
    q("wc-macros", "choice", "Did you hit your macronutrient targets and calories each day?", {
      options: ["Yes, every day", "Mostly — a couple of slips", "No, it was a tough week"],
    }),
    q("wc-macros-reason", "text", "If not, what was the reason?", { required: false }),
    q("wc-win-training", "text", "One win from training this week! (Can be physical, mental, or just showing up.)"),
    q("wc-win-nutrition", "text", "One win from nutrition this past week? (New meal, new high-protein snack, hitting your macros, etc.)"),
    q("wc-improve-nutrition", "text", "One thing you'd like to improve next week with nutrition? (Be realistic — small wins.)", {
      required: false,
    }),
    q("wc-improve-steps", "text", "What steps have you put in place to do this?", { required: false }),
    q("wc-injuries", "text", "Any injuries, pain, or niggles I should know about?"),
    q("wc-bodystats", "choice", "Have you uploaded your body stats & progress photos recently? (Crucial for programming and macro adjustments.)", {
      options: ["Yes", "No"],
    }),
    q(
      "wc-adjust",
      "text",
      "Is there anything at all you want me to improve or adjust for you? (If not, we expect everything to be meticulous with training and nutrition.)",
      { required: false }
    ),
    q("wc-focus", "text", "What's your main focus for next week?"),
    q("wc-overall", "rating", "Overall, how would you rate this week out of 5?"),
  ],
};

export const CHECKIN_TEMPLATES = [WEEKLY_CHECKIN_TEMPLATE];
