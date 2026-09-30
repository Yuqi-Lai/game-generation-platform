export type ProjectRole = "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";
export type ProjectStatus = "ACTIVE" | "ARCHIVED";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  currentUserRole: ProjectRole;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  version: number;
}

export interface ProjectMember {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: ProjectRole;
  joinedAt: string;
}

export interface ProjectCreditBalance {
  projectId: string;
  totalGranted: number;
  reserved: number;
  consumed: number;
  available: number;
  generationCost: number;
  updatedAt: string;
}

export type GenerationJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface ContentAsset {
  assetType: string;
  bucket: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  metadata: Record<string, unknown>;
}

export type ContentVersionStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "SUPERSEDED";

export interface ReviewDecision {
  id: string;
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  decision: "APPROVE" | "REQUEST_CHANGES";
  comment: string | null;
  createdAt: string;
  decidedAt: string;
}

export interface ReviewAssignment {
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  decision: ReviewDecision | null;
}

export interface ReviewRequest {
  id: string;
  contentVersionId: string;
  requestNumber: number;
  status: "OPEN" | "APPROVED" | "CHANGES_REQUESTED" | "SUPERSEDED";
  requestedById: string;
  createdAt: string;
  decidedAt: string | null;
  reviewers: ReviewAssignment[];
}

/**
 * One job in a project's generation history.
 *
 * Lighter than `GenerationJob` on purpose: the list endpoint omits the content
 * version and its assets so that listing a project does not query the asset
 * table once per job.
 */
export interface GenerationJobSummary {
  id: string;
  status: GenerationJobStatus;
  failureCode: string | null;
  createdAt: string;
  completedAt: string | null;
  attemptNumber: number;
  contentVersionId: string | null;
  contentVersionTitle: string | null;
}

export interface ContentVersion {
  id: string;
  projectId?: string;
  versionNumber: number;
  status: ContentVersionStatus;
  title: string;
  content: Record<string, unknown>;
  assets: ContentAsset[];
  createdAt: string;
  updatedAt?: string;
  reviewRequest?: ReviewRequest | null;
  canSubmitForReview?: boolean;
  canDecide?: boolean;
}

export interface GenerationJob {
  id: string;
  projectId: string;
  prompt: string;
  status: GenerationJobStatus;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  attemptNumber: number;
  canCancel: boolean;
  canRetry: boolean;
  contentVersion: ContentVersion | null;
}

export type ContentPackStatus = "DRAFT" | "READY" | "EXPORTING" | "EXPORTED" | "FAILED";

export interface ContentPackItem {
  id: string;
  contentVersionId: string;
  versionNumber: number;
  title: string;
  contentType: string;
  content: Record<string, unknown>;
  assets: ContentAsset[];
  addedAt: string;
}

export interface ExportJob {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  artifactBucket: string | null;
  artifactKey: string;
  artifactUri: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ContentPack {
  id: string;
  projectId: string;
  name: string;
  status: ContentPackStatus;
  items: ContentPackItem[];
  exportJob: ExportJob | null;
  canEdit: boolean;
  canExport: boolean;
  createdAt: string;
  updatedAt: string;
}
