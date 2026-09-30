import LandingExperience from "@/components/landing/landing-experience";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";

/**
 * Public landing page. Stays a server component so the session is read on the
 * server and the CTAs render with the right destination on first paint — the
 * interactive experience below is client-side.
 */
export default async function Home() {
  const publicPortfolioMode = isPublicPortfolioMode();
  const session = publicPortfolioMode ? null : await (await import("@/lib/auth0")).auth0.getSession();
  return <LandingExperience publicPortfolioMode={publicPortfolioMode} signedIn={Boolean(session)} />;
}
