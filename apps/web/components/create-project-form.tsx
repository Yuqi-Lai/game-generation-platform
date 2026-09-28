"use client";

import { useActionState } from "react";
import { createProjectAction } from "@/app/(app)/projects/actions";

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, {});

  return (
    <form className="form-card" action={action}>
      <label htmlFor="name">Project name</label>
      <input id="name" name="name" maxLength={160} required autoFocus />
      <label htmlFor="description">Description <span>Optional</span></label>
      <textarea id="description" name="description" maxLength={10000} rows={6} />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
