import Link from "next/link";
import type { Project } from "@/lib/types";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="project-card">
      <div className="project-card__meta">
        <span className={`status status--${project.status.toLowerCase()}`}>{project.status}</span>
        <span>{project.currentUserRole}</span>
      </div>
      <h2><Link href={`/projects/${project.id}`}>{project.name}</Link></h2>
      <p>{project.description || "No description yet."}</p>
      <footer>Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(project.updatedAt))}</footer>
    </article>
  );
}
