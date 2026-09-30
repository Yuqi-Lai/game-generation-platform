import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { GenerateContentForm } from "@/components/generate-content-form";
import { ContentVersionReview } from "@/components/content-version-review";
import { ContentPackManager } from "@/components/content-pack-manager";
import { ProjectRealtimeRefresh } from "@/components/project-realtime-refresh";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";
import { getShowcaseProject, SHOWCASE_JOB_HREF, SHOWCASE_PROJECT_ID } from "@/lib/showcase-data";
import type { ContentPack, ContentVersion, GenerationJobSummary, Project, ProjectCreditBalance, ProjectMember } from "@/lib/types";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showcase = isPublicPortfolioMode();
  let project: Project;
  let members: ProjectMember[];
  let versions: ContentVersion[];
  let packs: ContentPack[];
  let credits: ProjectCreditBalance;
  let generations: GenerationJobSummary[];
  /* The project's own prompt, for the showcase form's prefill. */
  let brief: string | undefined;

  if (showcase) {
    const bundle = getShowcaseProject(id);
    if (!bundle) notFound();
    ({ project, members, versions, packs, credits, generations } = bundle);
    brief = bundle.brief;
  } else {
    try {
      project = await apiFetch<Project>(`/api/v1/projects/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }
    [members, versions, packs, credits, generations] = await Promise.all([
      apiFetch<ProjectMember[]>(`/api/v1/projects/${encodeURIComponent(id)}/members`),
      apiFetch<ContentVersion[]>(`/api/v1/projects/${encodeURIComponent(id)}/content-versions`),
      apiFetch<ContentPack[]>(`/api/v1/projects/${encodeURIComponent(id)}/content-packs`),
      apiFetch<ProjectCreditBalance>(`/api/v1/projects/${encodeURIComponent(id)}/credits`),
      apiFetch<GenerationJobSummary[]>(`/api/v1/projects/${encodeURIComponent(id)}/generations`),
    ]);
  }

  return (
    <>
      {!showcase ? <ProjectRealtimeRefresh projectId={project.id} /> : null}
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
            <GenerateContentForm
              projectId={project.id}
              showcase={showcase}
              brief={brief}
              /*
                Only the project that has a compiled replay gets a destination.
                This used to be one shared constant, so submitting from any
                project landed in the first project's generation.
              */
              replayHref={
                showcase && project.id === SHOWCASE_PROJECT_ID ? SHOWCASE_JOB_HREF : undefined
              }
            />
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
      {/*
        The way back into a finished generation. A job id otherwise exists only
        in the URL the generate flow redirects to, so closing that page used to
        lose the result — including the asset grid on its detail page — even
        though the job itself was perfectly intact.
      */}
      <section className="version-history">
        <div className="version-history__heading">
          <div><p className="eyebrow">Generation history</p><h2>Recent generations</h2></div>
          <span>{generations.length} job{generations.length === 1 ? "" : "s"}</span>
        </div>
        {generations.length === 0 ? (
          <div className="empty-state"><h2>No generations yet</h2><p>Start a draft above and it will appear here.</p></div>
        ) : (
          <ul className="generation-list">
            {generations.map((job) => (
              <li key={job.id}>
                <Link href={`/projects/${encodeURIComponent(project.id)}/generations/${encodeURIComponent(job.id)}`}>
                  <span className={`status status--${job.status.toLowerCase().replaceAll("_", "-")}`}>
                    {job.status}
                  </span>
                  <strong>{job.contentVersionTitle ?? "Draft in progress"}</strong>
                  {/* A fixed format, not a locale one, so the server's output
                      is the same wherever it renders. */}
                  <small>{job.createdAt.slice(0, 16).replace("T", " ")}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
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
            {versions.map((version) => (
              <ContentVersionReview
                key={version.id}
                playHref={showcase && project.id === SHOWCASE_PROJECT_ID ? "/demo" : undefined}
                projectId={project.id}
                version={version}
              />
            ))}
          </div>
        )}
      </section>
      <ContentPackManager
        approvedVersions={versions.filter((version) => version.status === "APPROVED")}
        canManage={!showcase && (project.currentUserRole === "OWNER" || project.currentUserRole === "EDITOR")}
        packs={packs}
        projectId={project.id}
        realtimeEnabled={!showcase}
      />
    </>
  );
}
