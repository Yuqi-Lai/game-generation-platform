import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { GenerateContentForm } from "@/components/generate-content-form";
import { ContentVersionReview } from "@/components/content-version-review";
import { ContentPackManager } from "@/components/content-pack-manager";
import type { ContentPack, ContentVersion, Project, ProjectCreditBalance, ProjectMember } from "@/lib/types";

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
  const versions = await apiFetch<ContentVersion[]>(`/api/v1/projects/${encodeURIComponent(id)}/content-versions`);
  const packs = await apiFetch<ContentPack[]>(`/api/v1/projects/${encodeURIComponent(id)}/content-packs`);
  const credits = await apiFetch<ProjectCreditBalance>(`/api/v1/projects/${encodeURIComponent(id)}/credits`);

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
        <div className="phase-note"><strong>Review ready</strong><span>Generated drafts can move through project review.</span></div>
      </section>
      <section className="detail-grid">
        <article className="panel">
          <p className="eyebrow">Generate content</p>
          <h2>Start a draft</h2>
          <div className="credit-balance" aria-label="Project credit balance">
            <span><strong>{credits.available}</strong> available</span>
            <span><strong>{credits.reserved}</strong> reserved</span>
            <span><strong>{credits.consumed}</strong> consumed</span>
          </div>
          <p className="credit-cost">Each generation reserves {credits.generationCost} credits.</p>
          {project.currentUserRole === "OWNER" || project.currentUserRole === "EDITOR" ? (
            <GenerateContentForm projectId={project.id} />
          ) : (
            <p>Owner or editor access is required to generate content.</p>
          )}
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
      <section className="version-history">
        <div className="version-history__heading">
          <div><p className="eyebrow">Content workflow</p><h2>Version history</h2></div>
          <span>{versions.length} version{versions.length === 1 ? "" : "s"}</span>
        </div>
        {versions.length === 0 ? (
          <div className="empty-state"><h2>No content versions yet</h2><p>Generate a draft to begin the review workflow.</p></div>
        ) : (
          <div className="version-list">
            {versions.map((version) => <ContentVersionReview key={version.id} projectId={project.id} version={version} />)}
          </div>
        )}
      </section>
      <ContentPackManager
        approvedVersions={versions.filter((version) => version.status === "APPROVED")}
        canManage={project.currentUserRole === "OWNER" || project.currentUserRole === "EDITOR"}
        packs={packs}
        projectId={project.id}
      />
    </>
  );
}
