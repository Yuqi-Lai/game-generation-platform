import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationStatus } from "./generation-status";

describe("GenerationStatus", () => {
  it("renders the completed DRAFT version and stored assets", () => {
    render(<GenerationStatus initialJob={{
      id: "job-1",
      projectId: "project-1",
      prompt: "Create a synthetic quest.",
      status: "SUCCEEDED",
      failureCode: null,
      failureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:01:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      contentVersion: {
        id: "version-1",
        versionNumber: 1,
        status: "DRAFT",
        title: "Synthetic Quest",
        content: { synopsis: "An original safe fixture.", scenes: [{ title: "Workshop" }] },
        createdAt: "2026-01-01T00:01:00Z",
        assets: [{
          assetType: "CONTENT_JSON",
          bucket: "test-bucket",
          key: "synthetic/content.json",
          contentType: "application/json",
          sizeBytes: 42,
          sha256: "a".repeat(64),
          metadata: {},
        }],
      },
    }} />);

    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Synthetic Quest" })).toBeInTheDocument();
    expect(screen.getByText("s3://test-bucket/synthetic/content.json")).toBeInTheDocument();
  });
});
