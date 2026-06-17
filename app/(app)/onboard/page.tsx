import { OnboardForm } from "@/components/OnboardForm";

export default function OnboardPage() {
  return (
    <div className="space-y-8">
      <div className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Onboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Add an artist
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Register an artist and their catalog by ISRC. Once added, run a signal
          poll and momentum opportunities surface on the Radar.
        </p>
      </div>

      <OnboardForm />
    </div>
  );
}
