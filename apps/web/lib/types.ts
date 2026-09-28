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

export interface ContentVersion {
  id: string;
  versionNumber: number;
  status: "DRAFT";
  title: string;
  content: Record<string, unknown>;
  assets: ContentAsset[];
  createdAt: string;
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
