import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <section className="empty-state">
      <p className="eyebrow">Not found</p>
      <h1>That project is not available.</h1>
      <p>It may not exist, or you may not be a member.</p>
      <Link className="button" href="/projects">Back to projects</Link>
    </section>
  );
}
