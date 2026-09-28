"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { contentPackAction } from "@/app/(app)/projects/[id]/pack-actions";
import type { ContentPack, ContentVersion } from "@/lib/types";

export function ContentPackManager({ projectId, packs, approvedVersions, canManage }: {
  projectId: string;
  packs: ContentPack[];
  approvedVersions: ContentVersion[];
  canManage: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!packs.some((pack) => pack.status === "EXPORTING")) return;
    const timer = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [packs, router]);

  return (
    <section className="pack-workspace">
      <div className="version-history__heading">
        <div><p className="eyebrow">Immutable delivery</p><h2>Content packs</h2></div>
        <span>{packs.length} pack{packs.length === 1 ? "" : "s"}</span>
      </div>
      {canManage ? <CreatePackForm projectId={projectId} /> : null}
      {packs.length === 0 ? (
        <div className="empty-state"><h2>No content packs yet</h2><p>Approve content versions, then assemble an immutable export pack.</p></div>
      ) : (
        <div className="pack-list">
          {packs.map((pack) => (
            <PackCard key={pack.id} projectId={projectId} pack={pack} approvedVersions={approvedVersions} />
          ))}
        </div>
      )}
    </section>
  );
}

function CreatePackForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(contentPackAction, {});
  return (
    <form action={action} className="pack-create-form">
      <input name="projectId" type="hidden" value={projectId} />
      <input name="operation" type="hidden" value="create" />
      <label htmlFor="pack-name">Pack name</label>
      <input id="pack-name" maxLength={200} name="name" placeholder="Launch content pack" required />
      <button className="button" disabled={pending} type="submit">Create pack</button>
      <ActionMessage state={state} />
    </form>
  );
}

function PackCard({ projectId, pack, approvedVersions }: {
  projectId: string;
  pack: ContentPack;
  approvedVersions: ContentVersion[];
}) {
  const [state, action, pending] = useActionState(contentPackAction, {});
  const [requestId] = useState(() => crypto.randomUUID());
  const selected = new Set(pack.items.map((item) => item.contentVersionId));
  const available = approvedVersions.filter((version) => !selected.has(version.id));
  return (
    <article className="pack-card">
      <div className="project-card__meta">
        <span className={`status status--${pack.status.toLowerCase()}`}>{pack.status}</span>
        <span>{pack.items.length} exact version{pack.items.length === 1 ? "" : "s"}</span>
      </div>
      <h3>{pack.name}</h3>
      <ul className="pack-item-list">
        {pack.items.map((item) => (
          <li key={item.id}>
            <div><strong>{item.title}</strong><span>Version {item.versionNumber} · {item.contentVersionId}</span></div>
            {pack.canEdit ? (
              <form action={action}>
                <input name="projectId" type="hidden" value={projectId} />
                <input name="packId" type="hidden" value={pack.id} />
                <input name="versionId" type="hidden" value={item.contentVersionId} />
                <button className="text-button" disabled={pending} name="operation" type="submit" value="remove">Remove</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {pack.canEdit ? (
        <form action={action} className="pack-controls">
          <input name="projectId" type="hidden" value={projectId} />
          <input name="packId" type="hidden" value={pack.id} />
          <select aria-label="Approved version" name="versionId" defaultValue="">
            <option disabled value="">Add approved version…</option>
            {available.map((version) => <option key={version.id} value={version.id}>Version {version.versionNumber}: {version.title}</option>)}
          </select>
          <button className="button button--secondary" disabled={pending || available.length === 0} name="operation" type="submit" value="add">Add</button>
          <button className="button" disabled={pending || pack.items.length === 0} name="operation" type="submit" value="ready">Mark READY</button>
        </form>
      ) : null}
      {pack.canExport ? (
        <form action={action} className="pack-controls">
          <input name="projectId" type="hidden" value={projectId} />
          <input name="packId" type="hidden" value={pack.id} />
          <input name="requestId" type="hidden" value={requestId} />
          <button className="button" disabled={pending} name="operation" type="submit" value="export">Export ZIP</button>
        </form>
      ) : null}
      {pack.exportJob ? <ExportStatus pack={pack} /> : null}
      <ActionMessage state={state} />
    </article>
  );
}

function ExportStatus({ pack }: { pack: ContentPack }) {
  const job = pack.exportJob!;
  return (
    <div className="export-status" aria-live="polite">
      <strong>Export {job.status}</strong>
      {job.artifactUri ? <a href={job.artifactUri}>{job.artifactUri}</a> : null}
      {job.sha256 ? <code>SHA-256 {job.sha256}</code> : null}
      {job.sizeBytes !== null ? <span>{job.sizeBytes.toLocaleString()} bytes · {job.contentType}</span> : null}
      {job.failureMessage ? <p className="form-error">{job.failureMessage}</p> : null}
    </div>
  );
}

function ActionMessage({ state }: { state: { error?: string; success?: string } }) {
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  if (state.success) return <p className="form-success">{state.success}</p>;
  return null;
}
