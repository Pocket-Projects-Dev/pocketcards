import { Link } from "react-router-dom";
import { Button, Card } from "../components/ui";

export default function Privacy() {
  const lastUpdated = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen text-white">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.14)_1px,transparent_0)] [background-size:26px_26px]" />
        <div className="absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet-500/14 blur-3xl" />
        <div className="absolute -top-10 right-[-120px] h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-semibold tracking-tight">Privacy Policy</div>
            <div className="mt-1 text-sm text-white/60">Last updated: {lastUpdated}</div>
          </div>
          <Link to="/login">
            <Button variant="ghost" className="px-3 py-2">Back</Button>
          </Link>
        </div>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Summary</div>
          <div className="text-sm text-white/60">
            Cards helps you track card spends, statement dues, EMI schedules, payments, income events, and a set-aside fund.
            We collect the minimum data needed to run the app. We do not sell your data.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Information we collect</div>
          <ul className="text-sm text-white/60 list-disc pl-5 space-y-1">
            <li>Account info: your email address and basic profile details from Google Sign-In.</li>
            <li>App data you enter: cards, spends, payments, income events, EMI plans/installments, fund events, notes.</li>
            <li>Technical data: basic logs and metadata (e.g., IP address, device/browser info) for security and troubleshooting.</li>
            <li>Local storage: small settings may be stored on your device.</li>
          </ul>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">How we use information</div>
          <ul className="text-sm text-white/60 list-disc pl-5 space-y-1">
            <li>Provide core functionality: sync your data across devices and compute statements and plans.</li>
            <li>Security and abuse prevention.</li>
            <li>Support and troubleshooting when you report an issue.</li>
          </ul>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">How we share information</div>
          <div className="text-sm text-white/60">We share data only with service providers needed to run the app:</div>
          <ul className="text-sm text-white/60 list-disc pl-5 space-y-1">
            <li>Supabase (database + authentication)</li>
            <li>Vercel (hosting)</li>
            <li>Google (for Sign-In)</li>
          </ul>
          <div className="text-sm text-white/60">We do not sell personal data.</div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Data retention</div>
          <div className="text-sm text-white/60">
            We retain your data for as long as your account is active so the app works across devices.
            You can delete cards (and linked records) inside the app. For full account deletion, contact us.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Security</div>
          <div className="text-sm text-white/60">
            We use standard security practices like encryption in transit and access controls. No system is 100% secure.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Contact</div>
          <div className="text-sm text-white/60">
            Email: replace-this-with-your-support-email
          </div>
        </Card>

        <div className="text-xs text-white/50">
          Review and adjust this policy to match your exact business and compliance needs.
        </div>
      </div>
    </div>
  );
}