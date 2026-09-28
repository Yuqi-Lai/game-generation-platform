import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";

export default async function ApplicationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/projects");

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/projects"><span>F</span> Forge</Link>
        <nav aria-label="Primary navigation"><Link href="/projects">Projects</Link></nav>
        <div className="account">
          <span>{session.user.name ?? session.user.email ?? "Signed in"}</span>
          <a href="/auth/logout">Sign out</a>
        </div>
      </header>
      <main className="workspace">{children}</main>
    </div>
  );
}
