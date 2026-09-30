"use client";

import { useActionState, useState } from "react";
import { decideReviewAction, submitForReviewAction } from "@/app/(app)/projects/[id]/content-actions";
import type { ContentVersion } from "@/lib/types";

export function ContentVersionReview({ projectId, version, playHref }: {
  projectId: string;
  version: ContentVersion;
  playHref?: string;
}) {
  const [submitState, submitAction, submitPending] = useActionState(submitForReviewAction, {});
  const [decisionState, decisionAction, decisionPending] = useActionState(decideReviewAction, {});
  const [submitRequestId] = useState(() => crypto.randomUUID());
  const [decisionRequestId] = useState(() => crypto.randomUUID());
  const review = version.reviewRequest;

  return (
    <article className="version-card">
      <div className="project-card__meta">
        <span className={`status status--${version.status.toLowerCase().replaceAll("_", "-")}`}>{version.status}</span>
        <span>Version {version.versionNumber}</span>
      </div>
      <h3>{version.title}</h3>
      {typeof version.content.synopsis === "string" ? <p>{version.content.synopsis}</p> : null}

      {/*
        The only durable way back into a generated world. A generation job id
        lives solely in the URL the generate flow redirects to, and the platform
        API cannot list a project's jobs — so once that tab is gone the job page
        is unreachable. Versions are listed here permanently, so the manifest is
        addressed by version instead.
      */}
      {version.content.version === "playable-game-content/v1" ? (
        <a
          className="button"
          href={playHref ?? `/playable?manifest=${encodeURIComponent(
            `/api/projects/${encodeURIComponent(projectId)}` +
              `/content-versions/${encodeURIComponent(version.id)}/manifest`,
          )}`}
          rel="noreferrer"
          target="_blank"
        >
          Play World
        </a>
      ) : null}

      {version.canSubmitForReview ? (
        <form action={submitAction} className="review-form">
          <input name="projectId" type="hidden" value={projectId} />
          <input name="versionId" type="hidden" value={version.id} />
          <input name="requestId" type="hidden" value={submitRequestId} />
          <button className="button" disabled={submitPending} type="submit">
            {submitPending ? "Submitting…" : "Submit for review"}
          </button>
          {submitState.error ? <p className="form-error" role="alert">{submitState.error}</p> : null}
          {submitState.success ? <p className="form-success">{submitState.success}</p> : null}
        </form>
      ) : null}

      {review ? (
        <section className="review-summary">
          <p className="eyebrow">Review round {review.requestNumber} · {review.status}</p>
          <ul className="reviewer-list">
            {review.reviewers.map((assignment) => (
              <li key={assignment.reviewerId}>
                <div>
                  <strong>{assignment.reviewerName || assignment.reviewerEmail || "Reviewer"}</strong>
                  <span>{assignment.decision?.decision || "PENDING"}</span>
                </div>
                {assignment.decision?.comment ? <p>“{assignment.decision.comment}”</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {version.canDecide && review ? (
        <form action={decisionAction} className="review-form">
          <input name="projectId" type="hidden" value={projectId} />
          <input name="versionId" type="hidden" value={version.id} />
          <input name="reviewRequestId" type="hidden" value={review.id} />
          <input name="requestId" type="hidden" value={decisionRequestId} />
          <label htmlFor={`comment-${version.id}`}>Reviewer comment</label>
          <textarea id={`comment-${version.id}`} maxLength={5_000} name="comment" rows={3} />
          <div className="review-actions">
            <button className="button" disabled={decisionPending} name="decision" type="submit" value="APPROVE">
              Approve
            </button>
            <button className="button button--secondary" disabled={decisionPending} name="decision" type="submit" value="REQUEST_CHANGES">
              Request changes
            </button>
          </div>
          {decisionState.error ? <p className="form-error" role="alert">{decisionState.error}</p> : null}
          {decisionState.success ? <p className="form-success">{decisionState.success}</p> : null}
        </form>
      ) : null}
    </article>
  );
}
