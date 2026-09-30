"use client";

import { useActionState, useState } from "react";
import { createProjectAction } from "@/app/(app)/projects/actions";

export function CreateProjectForm({ showcase = false }: { showcase?: boolean }) {
  const [state, action, pending] = useActionState(createProjectAction, {});
  const [notice, setNotice] = useState(false);

  const submitShowcase = (event: React.FormEvent<HTMLFormElement>) => {
    if (!showcase) return;
    event.preventDefault();
    setNotice(true);
  };

  return (
    <form className="form-card" action={showcase ? undefined : action} noValidate={showcase} onSubmit={submitShowcase}>
      <label htmlFor="name">Project name</label>
      <input id="name" name="name" maxLength={160} required autoFocus />
      <label htmlFor="description">Description <span>Optional</span></label>
      <textarea id="description" name="description" maxLength={10000} rows={6} />
      {!showcase && state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {notice ? <p className="form-success" role="status">This public workspace is a read-only showcase. No project was created.</p> : null}
      <button className="button" type="submit" disabled={!showcase && pending}>
        {!showcase && pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
