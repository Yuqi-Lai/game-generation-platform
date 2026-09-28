"use client";

import { useActionState } from "react";
import { generateContentAction } from "@/app/(app)/projects/[id]/generations/actions";

export function GenerateContentForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(generateContentAction, {});

  return (
    <form className="generation-form" action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor="prompt">Generation brief</label>
      <textarea
        id="prompt"
        name="prompt"
        maxLength={20_000}
        rows={7}
        required
        placeholder="Create an original forest puzzle adventure with a resourceful guide and three playable scenes."
      />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Generate draft"}
      </button>
    </form>
  );
}
