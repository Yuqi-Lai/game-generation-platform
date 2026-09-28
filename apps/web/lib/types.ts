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
