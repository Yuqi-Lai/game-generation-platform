import type { Metadata } from "next";
import DemoExperience from "@/components/demo/demo-experience";

export const metadata: Metadata = {
  title: "Playable demo — Game Production Platform",
  description:
    "Play a generated 2D world in the browser: a seaside pixel farm built from the platform's playable content manifest.",
};

/**
 * The public demo. Owns the URL visitors see; the Phaser runtime is embedded by
 * the shell so the raw `/playable?manifest=` URL is never exposed.
 */
export default function DemoPage() {
  return <DemoExperience />;
}
