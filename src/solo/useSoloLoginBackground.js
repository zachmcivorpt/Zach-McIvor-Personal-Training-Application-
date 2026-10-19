import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { soloDb } from "../lib/firebase";

// StartScreen.jsx is the one Train Solo screen mounted OUTSIDE
// SoloAppProvider (see App.jsx's top-level routes) — it's reachable by a
// signed-out visitor before any Train Solo session exists at all, so it
// can't use useSoloApp()'s soloAppDesign. This is the same public
// settings/appDesign read (public read, see firestore.rules), just as its
// own tiny standalone listener rather than pulling in the whole provider
// for one field.
export function useSoloLoginBackground() {
  const [appDesign, setAppDesign] = useState({});
  useEffect(() => {
    return onSnapshot(doc(soloDb, "settings", "appDesign"), (snap) => {
      setAppDesign(snap.exists() ? snap.data() : {});
    });
  }, []);
  return appDesign;
}
