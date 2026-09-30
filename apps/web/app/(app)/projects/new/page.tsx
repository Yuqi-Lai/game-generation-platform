import Link from "next/link";
import { CreateProjectForm } from "@/components/create-project-form";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";

export default function NewProjectPage() {
  const showcase = isPublicPortfolioMode();
  return (
    <div className="narrow-page">
      <Link className="back-link" href="/projects">← Projects</Link>
      <p className="eyebrow">New workspace</p>
      <h1>Create a project</h1>
      <p className="lede lede--small">Give the team a clear home for the content you will generate and produce.</p>
      <CreateProjectForm showcase={showcase} />
    </div>
  );
}
