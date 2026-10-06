// Replaces functions/index.js's onNewMessage/onNewGroupMessage/
// onMealPlanChanged/onClientPhaseChanged/onNewCheckIn Firestore triggers,
// without needing Firebase's paid Blaze plan to run them. Those were
// event-driven off a Firestore write; this is the same logic, called
// directly by the client (AppContext.jsx) right after the write it cares
// about succeeds — every call site re-reads the real doc with the Admin
// SDK rather than trusting anything in the request body, so a caller can
// at most point this at a real, already-written, already-rules-validated
// document and make it send the exact notification it would have sent
// anyway; there's nothing sensitive to leak back (the response is just
// {ok:true}) and nothing here can write data other than pruning a dead
// push token off the recipient's own doc.
import { getDb, getMessagingClient, requireUid } from "../api-lib/firebaseAdmin.js";
import { notifyUser, getCoachId } from "../api-lib/notify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    await requireUid(req);
  } catch (err) {
    res.status(err.statusCode || 401).json({ error: err.message });
    return;
  }

  const db = getDb();
  const messaging = getMessagingClient();
  const { kind, id, clientId } = req.body || {};

  try {
    switch (kind) {
      case "message": {
        const snap = await db.collection("messages").doc(id).get();
        if (!snap.exists) break;
        const m = snap.data();
        const preview = (m.text || "Sent an attachment").slice(0, 120);
        if (m.from === "client") {
          const coachId = await getCoachId(db);
          if (coachId) {
            // The message doc itself only ever carries clientId, not a
            // name — unlike group chat's m.fromName (stamped at send
            // time there, since a client can't read a fellow member's
            // users doc to look it up). A 1:1 thread has no such
            // restriction: the coach can read any client's profile, so
            // this looks the name up fresh rather than needing it
            // stamped on every message. Without it, every push just said
            // the generic "New message" — no way to tell which client
            // without opening the app.
            const clientSnap = await db.collection("users").doc(m.clientId).get();
            const clientName = clientSnap.data()?.name || "A client";
            await notifyUser(db, messaging, coachId, { title: clientName, body: preview }, "messages");
          }
        } else if (m.from === "coach" && m.clientId) {
          await notifyUser(db, messaging, m.clientId, { title: "Your coach sent a message", body: preview });
        }
        break;
      }

      // Same "notify whoever didn't send it" shape, for the coach-side
      // Groups tab's group chat. memberIds is already stamped onto the
      // message itself at send time (see sendGroupMessage in
      // AppContext.jsx) — the group's roster at that moment, read once
      // off the message doc rather than a second read of groups/{id}.
      case "groupMessage": {
        const snap = await db.collection("groupMessages").doc(id).get();
        if (!snap.exists) break;
        const m = snap.data();
        const preview = (m.text || "").slice(0, 120);
        const memberIds = m.memberIds || [];
        const groupSnap = await db.collection("groups").doc(m.groupId).get();
        const groupName = groupSnap.data()?.name || "your group";

        if (m.from === "coach") {
          await Promise.all(memberIds.map((uid) => notifyUser(db, messaging, uid, { title: groupName, body: preview }, "messages")));
        } else if (m.from === "client") {
          const title = `${m.fromName || "A member"} · ${groupName}`;
          const coachId = await getCoachId(db);
          const others = memberIds.filter((uid) => uid !== m.fromClientId);
          await Promise.all([
            coachId ? notifyUser(db, messaging, coachId, { title, body: preview }, "messages") : Promise.resolve(),
            ...others.map((uid) => notifyUser(db, messaging, uid, { title, body: preview }, "messages")),
          ]);
        }
        break;
      }

      // Called only from setMealPlan (MealPlanBuilder's publish()) — the
      // client's own "swap this meal" edit calls swapMealPlanMeal
      // instead, which never triggers this, so there's no before/after
      // diff to do here the way the original Cloud Function needed.
      case "mealPlan": {
        if (clientId) {
          await notifyUser(
            db,
            messaging,
            clientId,
            { title: "Meal plan updated", body: "Your coach just updated your meal plan — check the Nutrition tab." },
            "mealPlanUpdates"
          );
        }
        break;
      }

      // Called from addClientPhase/updateClientPhase/duplicateClientPhase
      // — clientPhases has no client write path at all, so any call here
      // is always the coach assigning or editing a training phase.
      case "clientPhase": {
        if (clientId) {
          await notifyUser(
            db,
            messaging,
            clientId,
            { title: "Training program updated", body: "Your coach just updated your training — check the Training tab." },
            "programUpdates"
          );
        }
        break;
      }

      case "checkin": {
        const coachId = await getCoachId(db);
        if (coachId) {
          await notifyUser(db, messaging, coachId, { title: "New check-in submitted", body: "A client just submitted a check-in — tap to review." }, "checkins");
        }
        break;
      }

      default:
        res.status(400).json({ error: `Unknown kind: ${kind}` });
        return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("notify failed:", err);
    res.status(500).json({ error: "Notify failed" });
  }
}
