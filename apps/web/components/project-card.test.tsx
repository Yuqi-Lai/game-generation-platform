import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectCard } from "./project-card";

describe("ProjectCard", () => {
  it("links a project and shows its backend-authorized role", () => {
    render(<ProjectCard project={{
      id: "8fc6f33e-0528-4de7-a5e8-4929e27664dd",
      name: "Synthetic Adventure",
      description: "A sanitized test project.",
      status: "ACTIVE",
      currentUserRole: "EDITOR",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      archivedAt: null,
      version: 0,
    }} />);

    expect(screen.getByRole("link", { name: "Synthetic Adventure" }))
      .toHaveAttribute("href", "/projects/8fc6f33e-0528-4de7-a5e8-4929e27664dd");
    expect(screen.getByText("EDITOR")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });
});
