import Link from "next/link";
import { ProjectCard } from "@/components/project-card";
import { apiFetch } from "@/lib/api";
import type { Project } from "@/lib/types";

export default async function ProjectsPage() {
  const projects = await apiFetch<Project[]>("/api/v1/projects");

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">Workspace</p><h1>Projects</h1></div>
        <Link className="button" href="/projects/new">New project</Link>
      </section>
      {projects.length === 0 ? (
        <section className="empty-state">
          <p className="eyebrow">Nothing here yet</p>
          <h2>Create your first game project.</h2>
          <p>Phase 1 establishes the secure workspace that future generation and review flows will build on.</p>
          <Link className="button" href="/projects/new">Create a project</Link>
        </section>
      ) : (
        <section className="project-grid" aria-label="Projects">
          {projects.map((project) => <ProjectCard key={project.id} project={project} />)}
        </section>
      )}
    </>
  );
}
