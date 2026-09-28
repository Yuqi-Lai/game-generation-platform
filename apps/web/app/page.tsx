import Link from "next/link";
import { auth0 } from "@/lib/auth0";

export default async function Home() {
  const session = await auth0.getSession();

  return (
    <main className="landing">
      <div className="landing__content">
        <p className="eyebrow">Game content production</p>
        <h1>Build a durable pipeline from first idea to approved content.</h1>
        <p className="lede">
          Forge gives invited teams a project workspace today, with generation,
          versioning, review, and export arriving as deliberate vertical slices.
        </p>
        {session ? (
          <Link className="button" href="/projects">Open workspace</Link>
        ) : (
          <a className="button" href="/auth/login?returnTo=/projects">Sign in with GitHub</a>
        )}
        <p className="fine-print">Access is currently invite-only.</p>
      </div>
      <div className="landing__mark" aria-hidden="true">F</div>
    </main>
  );
}
