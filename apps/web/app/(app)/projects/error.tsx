"use client";

export default function ProjectsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="empty-state">
      <p className="eyebrow">Workspace unavailable</p>
      <h1>We could not open your projects.</h1>
      <p>Your account may still need an invitation, or the API may be temporarily unavailable.</p>
      <button className="button" onClick={reset}>Try again</button>
    </section>
  );
}
