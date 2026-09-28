import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import type { Project, ProjectMember } from "@/lib/types";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let project: Project;
  try {
    project = await apiFetch<Project>(`/api/v1/projects/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const members = await apiFetch<ProjectMember[]>(`/api/v1/projects/${encodeURIComponent(id)}/members`);

  return (
    <>
      <Link className="back-link" href="/projects">← Projects</Link>
      <section className="project-hero">
        <div>
          <div className="project-card__meta">
            <span className={`status status--${project.status.toLowerCase()}`}>{project.status}</span>
            <span>{project.currentUserRole}</span>
          </div>
          <h1>{project.name}</h1>
          <p>{project.description || "No description yet."}</p>
        </div>
        <div className="phase-note"><strong>Foundation ready</strong><span>Generation arrives in Phase 2.</span></div>
      </section>
      <section className="detail-grid">
        <article className="panel">
          <p className="eyebrow">Project activity</p>
          <h2>Content workspace</h2>
          <p>The project boundary, ownership, and permissions are active. Content generation is intentionally not enabled in this phase.</p>
        </article>
        <article className="panel">
          <p className="eyebrow">Team · {members.length}</p>
          <h2>Members</h2>
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.userId}>
                <span>{member.displayName || member.email || "Member"}<small>{member.email}</small></span>
                <strong>{member.role}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}
