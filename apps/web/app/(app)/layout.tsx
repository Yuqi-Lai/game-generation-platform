import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";

// Authentication and project data are request-scoped. This also prevents the
// public portfolio build from trying to prerender private workspace pages that
// its middleware deliberately makes unreachable.
export const dynamic = "force-dynamic";

export default async function ApplicationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const showcase = isPublicPortfolioMode();
  const session = showcase ? null : await auth0.getSession();
  if (!showcase && !session) redirect("/auth/login?returnTo=/projects");

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__left">
          {/* The way out of the workspace. Same pill as the /demo shell uses. */}
          <Link className="back-pill" href="/">
            <span aria-hidden="true">←</span> Site
          </Link>
          <Link className="brand" href="/projects">
            <span>G</span> Game Production Platform
          </Link>
        </div>
        <nav aria-label="Primary navigation"><Link href="/projects">Projects</Link></nav>
        <div className="account">
          <span>{showcase ? "Portfolio Showcase" : session?.user.name ?? session?.user.email ?? "Signed in"}</span>
          {showcase ? <Link href="/demo">Play demo</Link> : <a href="/auth/logout">Sign out</a>}
        </div>
      </header>
      <main className="workspace">{children}</main>
    </div>
  );
}
