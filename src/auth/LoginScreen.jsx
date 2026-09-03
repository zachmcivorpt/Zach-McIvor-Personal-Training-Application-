import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Logo } from "../components/ui";
import { PrimaryButton, TextInput, Field } from "../components/ui";
import { ChevronRight } from "lucide-react";

export default function LoginScreen() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState("client");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = login(username, password);
      navigate(u.role === "coach" ? "/coach" : "/app", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0A0A0B] px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <Logo variant="wordmark" tone="white" className="h-16 w-auto mb-2" />
        </div>

        <div className="flex bg-white/5 rounded-2xl p-1 mb-6">
          {[
            { id: "client", label: "Client" },
            { id: "coach", label: "Coach" },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRole(r.id);
                setError("");
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                role === r.id ? "bg-white text-black" : "text-white/50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="USERNAME">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={role === "coach" ? "coach" : "your username"}
              autoCapitalize="none"
              autoComplete="username"
            />
          </Field>
          <Field label="PASSWORD">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </Field>

          {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

          <PrimaryButton type="submit" disabled={busy || !username || !password} className="w-full">
            SIGN IN <ChevronRight size={18} />
          </PrimaryButton>
        </form>

        {role === "client" && (
          <p className="text-center text-white/40 text-sm mt-8">
            Invited by your coach?{" "}
            <Link to="/activate" className="text-white font-semibold underline underline-offset-2">
              Activate your account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
