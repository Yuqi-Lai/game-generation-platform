"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { generateContentAction } from "@/app/(app)/projects/[id]/generations/actions";

/**
 * The project's generation form.
 *
 * Three modes, and the distinction matters for more than looks:
 *
 *  - live: the real server action, an empty brief is refused.
 *  - showcase with a compiled replay: submitting routes to that project's own
 *    generation, which is a client-side navigation.
 *  - showcase, archived: submitting explains that the project is read-only.
 *
 * Both showcase modes detach the server action entirely, so no submit can
 * reach a backend the public build has no route to. That is gated on
 * `showcase` rather than on the presence of a replay link: gating on the link
 * would silently hand the archived projects back to the live action.
 */
export function GenerateContentForm({
  projectId,
  showcase = false,
  brief,
  replayHref,
}: {
  projectId: string;
  /** Read-only static data; detaches the server action. */
  showcase?: boolean;
  /** This project's own prompt. Prefilled, and never another project's. */
  brief?: string;
  /** Set only for a project whose generation has a compiled replay. */
  replayHref?: string;
}) {
  const [state, action, pending] = useActionState(generateContentAction, {});
  const [requestId] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const [replayPending, setReplayPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    if (!showcase) return; // Live path: let the action run.
    event.preventDefault();
    if (replayHref) {
      setReplayPending(true);
      router.push(replayHref);
      return;
    }
    setNotice("Archived showcase project is in read-only mode.");
  };

  const formPending = showcase ? replayPending : pending;

  return (
    <form
      className="generation-form"
      action={showcase ? undefined : action}
      onSubmit={submit}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor="prompt">Generation brief</label>
      <textarea
        id="prompt"
        name="prompt"
        maxLength={20_000}
        rows={7}
        /*
          Showcase mode drops the constraint rather than relying on the prefill
          to satisfy it. A visitor who cleared the field hit native validation,
          which blocks submit before `onSubmit` runs — so the CTA simply
          stopped working, with only a "please fill in this field" bubble.
        */
        required={!showcase}
        /*
          And read-only, because the text is not used: submitting either
          replays a fixed generation or explains that the project is archived.
        */
        readOnly={showcase}
        defaultValue={showcase ? brief : undefined}
        placeholder="Create an original forest puzzle adventure with a resourceful guide and three playable scenes."
      />
      {!showcase && state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      {showcase && replayHref ? (
        <p className="fine-print">Showcase mode replays this project&apos;s recorded generation.</p>
      ) : null}
      {showcase && !replayHref ? (
        <p className="fine-print">Archived showcase project — generation is read-only.</p>
      ) : null}
      {notice ? <p className="form-success" role="status">{notice}</p> : null}
      <button className="button" type="submit" disabled={formPending}>
        {formPending ? "Opening…" : "Generate draft"}
      </button>
    </form>
  );
}
