import { Link } from "react-router-dom";
import { Button, Card } from "../components/ui";

export default function Terms() {
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
            <div className="text-2xl font-semibold tracking-tight">Terms of Service</div>
            <div className="mt-1 text-sm text-white/60">Last updated: {lastUpdated}</div>
          </div>
          <Link to="/login">
            <Button variant="ghost" className="px-3 py-2">Back</Button>
          </Link>
        </div>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Overview</div>
          <div className="text-sm text-white/60">
            Cards is a personal finance tracking tool for credit card statement planning. By using the app, you agree to these terms.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Not financial advice</div>
          <div className="text-sm text-white/60">
            The app provides calculations based on data you enter. It is not financial, legal, or tax advice.
            You are responsible for verifying accuracy and making decisions.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Your account</div>
          <ul className="text-sm text-white/60 list-disc pl-5 space-y-1">
            <li>You must use the app only for lawful purposes.</li>
            <li>You are responsible for activity under your account.</li>
            <li>Keep your sign-in methods secure.</li>
          </ul>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Your data</div>
          <div className="text-sm text-white/60">
            You own the data you enter. You grant us permission to store and process it solely to provide the service.
          </div>
          <div className="mt-3">
            <Link to="/privacy">
              <Button variant="secondary" size="sm">Read Privacy Policy</Button>
            </Link>
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Availability and changes</div>
          <div className="text-sm text-white/60">
            The service may change over time. We may add, remove, or modify features, and may suspend access for maintenance or security reasons.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Disclaimers</div>
          <div className="text-sm text-white/60">
            The service is provided “as is” without warranties of any kind. We do not guarantee uninterrupted or error-free operation.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Limitation of liability</div>
          <div className="text-sm text-white/60">
            To the maximum extent permitted by law, we are not liable for indirect, incidental, special, consequential, or punitive damages,
            or any loss of data, profits, or financial outcomes resulting from your use of the app.
          </div>
        </Card>

        <Card className="p-5 space-y-2">
          <div className="text-sm text-white/70">Contact</div>
          <div className="text-sm text-white/60">
            Email: support@pocketprojects.in
          </div>
        </Card>
      </div>
    </div>
  );
}