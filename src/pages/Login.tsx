import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const missingEnv =
    !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      alert(error.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl bg-white/5 p-5">
        <div className="text-lg font-semibold">PocketCards</div>
        <div className="mt-1 text-sm text-white/70">Sign in to continue</div>

        {missingEnv ? (
          <div className="mt-4 rounded-2xl bg-white/5 p-3 text-sm text-red-300">
            Missing env vars on this deployment: VITE_SUPABASE_URL and/or VITE_SUPABASE_PUBLISHABLE_KEY
          </div>
        ) : null}

        <button
          onClick={signIn}
          disabled={busy || missingEnv}
          className="mt-4 w-full rounded-2xl bg-white/10 px-4 py-3 text-sm"
        >
          {busy ? "Starting Google sign-in…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}