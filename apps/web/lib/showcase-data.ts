import "server-only";

import demoManifest from "@/public/demo/manifest.json";
import workspace from "@/data/showcase/workspace.json";
import type {
  ContentAsset,
  ContentPack,
  ContentVersion,
  GenerationJob,
  GenerationJobSummary,
  Project,
  ProjectCreditBalance,
  ProjectMember,
} from "@/lib/types";
import { SHOWCASE_JOB_HREF, SHOWCASE_JOB_ID, SHOWCASE_PROJECT_ID } from "@/lib/showcase-routes";

interface ShowcaseProjectBundle {
  project: Project;
  /**
   * The prompt this project was generated from, per project.
   *
   * Every showcase surface used to read one module-level constant for this,
   * which meant all three projects showed the first project's story — the
   * brief on the cyberpunk detail page was Molly's. It belongs to the data.
   */
  brief: string;
  members: ProjectMember[];
  versions: ContentVersion[];
  packs: ContentPack[];
  credits: ProjectCreditBalance;
  generations: GenerationJobSummary[];
}

type DemoAsset = (typeof demoManifest.assets)[number];

function asContentAsset(asset: DemoAsset): ContentAsset {
  return {
    assetType: asset.role,
    bucket: "public-demo",
    key: asset.objectKey,
    contentType: asset.contentType,
    sizeBytes: 0,
    sha256: asset.sha256,
    metadata: { id: asset.id, width: asset.width, height: asset.height },
  };
}

const demoAssets = demoManifest.assets.map(asContentAsset);

function hydrateVersion(version: ContentVersion & { demoBundle?: boolean }): ContentVersion {
  if (!version.demoBundle) return version;
  return {
    ...version,
    assets: demoAssets,
    content: {
      ...demoManifest,
      synopsis: version.content.synopsis ?? demoManifest.openingRemarks,
    },
  };
}

export { SHOWCASE_JOB_HREF, SHOWCASE_JOB_ID, SHOWCASE_PROJECT_ID };

export function listShowcaseProjects(): Project[] {
  return workspace.projects as Project[];
}

export function getShowcaseProject(projectId: string): ShowcaseProjectBundle | null {
  const project = listShowcaseProjects().find((candidate) => candidate.id === projectId);
  const raw = workspace.details[projectId as keyof typeof workspace.details];
  if (!project || !raw) return null;

  return {
    project,
    brief: raw.generationBrief,
    members: raw.members as ProjectMember[],
    versions: raw.versions.map((version) => hydrateVersion(version as ContentVersion & { demoBundle?: boolean })),
    packs: raw.packs as ContentPack[],
    credits: raw.credits as ProjectCreditBalance,
    generations: raw.generations as GenerationJobSummary[],
  };
}

export function getShowcaseGeneration(projectId: string, jobId: string): GenerationJob | null {
  const bundle = getShowcaseProject(projectId);
  const summary = bundle?.generations.find((candidate) => candidate.id === jobId);
  if (!bundle || !summary) return null;

  const contentVersion = summary.contentVersionId
    ? bundle.versions.find((version) => version.id === summary.contentVersionId) ?? null
    : null;

  return {
    id: summary.id,
    projectId,
    /* The project's own brief, not a special case for the first one. */
    prompt: bundle.brief,
    status: summary.status,
    failureCode: summary.failureCode,
    failureMessage: null,
    createdAt: summary.createdAt,
    updatedAt: summary.completedAt ?? summary.createdAt,
    completedAt: summary.completedAt,
    attemptNumber: summary.attemptNumber,
    canCancel: false,
    canRetry: false,
    contentVersion,
  };
}

export function isPlayableShowcaseGeneration(projectId: string, jobId: string) {
  return projectId === SHOWCASE_PROJECT_ID && jobId === SHOWCASE_JOB_ID;
}
