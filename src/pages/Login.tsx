import { supabase } from "../lib/supabase";

export default function Login() {
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">Cards</h1>
        <p className="text-sm text-white/70 mt-2">
          Track spends, billing cycles, EMIs, and due dates.
        </p>
        <button
          onClick={signInWithGoogle}
          className="mt-6 w-full rounded-2xl bg-white text-black px-4 py-3 font-medium active:scale-[0.99]"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
}