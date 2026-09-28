import Link from "next/link";
import { CreateProjectForm } from "@/components/create-project-form";

export default function NewProjectPage() {
  return (
    <div className="narrow-page">
      <Link className="back-link" href="/projects">← Projects</Link>
      <p className="eyebrow">New workspace</p>
      <h1>Create a project</h1>
      <p className="lede lede--small">Give the team a clear home for the content you will generate and produce.</p>
      <CreateProjectForm />
    </div>
  );
}
