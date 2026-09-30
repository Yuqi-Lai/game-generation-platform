import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

/* The real action always resolves to a GenerateContentState object, so the
   mock has to as well — returning undefined would feed `undefined` into
   useActionState and crash the render on `state.error`. */
const actions = vi.hoisted(() => ({
  generateContentAction: vi.fn(async () => ({}) as { error?: string }),
}));
vi.mock("@/app/(app)/projects/[id]/generations/actions", () => actions);

import { GenerateContentForm } from "./generate-content-form";
const BRIEF = "A rainy cyberpunk city avenue at midnight with glowing billboards.";

afterEach(() => {
  cleanup();
  navigation.push.mockClear();
});

describe("GenerateContentForm in showcase mode with a replay", () => {
  /*
    The bug this covers: the brief was `required`, satisfied only by a prefill.
    Clearing the field made native validation block submit before `onSubmit`
    could run, so the replay CTA died with a validation bubble instead.
  */
  it("does not make the brief required, so the replay CTA cannot be blocked", () => {
    render(<GenerateContentForm projectId="p" showcase brief={BRIEF} replayHref="/projects/p/generations/j" />);

    const brief = screen.getByLabelText(/generation brief/i);
    expect(brief).not.toBeRequired();
    // Even emptied, the form still reports itself as submittable.
    fireEvent.change(brief, { target: { value: "" } });
    expect((brief as HTMLTextAreaElement).form?.checkValidity()).toBe(true);
  });

  it("shows the replayed brief and keeps it read-only, since typing is ignored", () => {
    render(<GenerateContentForm projectId="p" showcase brief={BRIEF} replayHref="/projects/p/generations/j" />);

    const brief = screen.getByLabelText(/generation brief/i);
    expect(brief).toHaveValue(BRIEF);
    expect(brief).toHaveAttribute("readonly");
  });

  it("routes to the replay instead of invoking the server action", () => {
    render(<GenerateContentForm projectId="p" showcase brief={BRIEF} replayHref="/projects/p/generations/j" />);

    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(navigation.push).toHaveBeenCalledWith("/projects/p/generations/j");
    expect(actions.generateContentAction).not.toHaveBeenCalled();
  });
});

describe("GenerateContentForm in live mode", () => {
  it("keeps the brief required, so an empty generation is never submitted", () => {
    render(<GenerateContentForm projectId="p" />);

    const brief = screen.getByLabelText(/generation brief/i);
    expect(brief).toBeRequired();
    expect(brief).not.toHaveAttribute("readonly");
    expect(brief).toHaveValue("");
    expect((brief as HTMLTextAreaElement).form?.checkValidity()).toBe(false);
  });

  it("does not navigate on submit", () => {
    render(<GenerateContentForm projectId="p" />);
    fireEvent.submit(screen.getByRole("button", { name: /generate draft/i }).closest("form")!);
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

describe("GenerateContentForm for an archived showcase project", () => {
  /*
    The bug this covers: every showcase surface read one module-level constant
    for the brief, so opening the cyberpunk project showed Molly's story. The
    prefill has to come from the project.
  */
  it("prefills this project's own brief, not another project's", () => {
    const ownBrief = "On a stormy night, a one-armed veteran hunter pushes open the door.";
    render(<GenerateContentForm projectId="crossing-inn" showcase brief={ownBrief} />);

    expect(screen.getByLabelText(/generation brief/i)).toHaveValue(ownBrief);
    expect(screen.queryByText(/Molly/i)).not.toBeInTheDocument();
  });

  /*
    The dangerous half. Every condition in this form used to hang off the
    replay link, so a project without one fell straight back to the live server
    action — a network call the public build has no backend for.
  */
  it("never reaches the server action, and never navigates", () => {
    render(<GenerateContentForm projectId="crossing-inn" showcase brief="B" />);

    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(actions.generateContentAction).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("explains that the project is read-only instead of doing nothing", () => {
    render(<GenerateContentForm projectId="crossing-inn" showcase brief="B" />);

    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Archived showcase project is in read-only mode.",
    );
  });

  it("offers no replay promise it cannot keep", () => {
    render(<GenerateContentForm projectId="crossing-inn" showcase brief="B" />);
    expect(screen.queryByText(/replays this project/i)).not.toBeInTheDocument();
    expect(screen.getByText(/generation is read-only/i)).toBeInTheDocument();
  });
});
