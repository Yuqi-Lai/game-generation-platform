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
      attemptNumber: 1,
      canCancel: false,
      canRetry: false,
      contentVersion: {
        id: "version-1",
        versionNumber: 1,
        status: "DRAFT",
        title: "Synthetic Quest",
        content: {
          version: "playable-game-content/v1",
          synopsis: "An original safe fixture.",
          scenes: [{ title: "Workshop" }],
        },
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
    expect(screen.getByRole("link", { name: "Play game" })).toHaveAttribute(
      "href",
      "/playable?manifest=%2Fapi%2Fprojects%2Fproject-1%2Fgenerations%2Fjob-1%2Fmanifest",
    );
  });

  it("offers cancellation while a job is running", () => {
    render(<GenerationStatus initialJob={{
      id: "job-2",
      projectId: "project-1",
      prompt: "Create a synthetic quest.",
      status: "RUNNING",
      failureCode: null,
      failureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:01:00Z",
      completedAt: null,
      attemptNumber: 1,
      canCancel: true,
      canRetry: false,
      contentVersion: null,
    }} />);

    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel generation" })).toBeInTheDocument();
  });

  it("shows a readable failure and a retry action", () => {
    render(<GenerationStatus initialJob={{
      id: "job-3",
      projectId: "project-1",
      prompt: "Create a synthetic quest.",
      status: "FAILED",
      failureCode: "PROVIDER_INVALID_REQUEST",
      failureMessage: "The provider rejected the request.",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:01:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      attemptNumber: 1,
      canCancel: false,
      canRetry: true,
      contentVersion: null,
    }} />);

    expect(screen.getByText("The provider rejected the request.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry generation" })).toBeInTheDocument();
  });
});
