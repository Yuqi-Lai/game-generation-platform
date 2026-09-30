"use client";

import { useEffect, useMemo, useState } from "react";
import { GenerationStatus } from "@/components/generation-status";
import type { ContentAsset, GenerationJob } from "@/lib/types";

interface DemoManifestAsset {
  id: string;
  role: string;
  width: number;
  height: number;
  sha256: string;
  objectKey: string;
  contentType: string;
}

interface DemoManifest {
  title: string;
  version: string;
  openingRemarks?: string;
  scenes: unknown[];
  assets: DemoManifestAsset[];
  [key: string]: unknown;
}

function asContentAsset(asset: DemoManifestAsset): ContentAsset {
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

function baseJob(completedJob: GenerationJob): GenerationJob {
  return {
    ...completedJob,
    status: "QUEUED",
    failureCode: null,
    failureMessage: null,
    completedAt: null,
    attemptNumber: 1,
    canCancel: false,
    canRetry: false,
    contentVersion: null,
  };
}

export default function PublicGenerationReplay({
  completedJob,
}: {
  completedJob: GenerationJob;
}) {
  const initialJob = useMemo(() => baseJob(completedJob), [completedJob]);
  const [job, setJob] = useState(initialJob);
  const [assets, setAssets] = useState<ContentAsset[]>([]);

  useEffect(() => {
    let active = true;
    const timers: number[] = [];

    async function replay() {
      try {
        const response = await fetch("/demo/manifest.json", { cache: "force-cache" });
        if (!response.ok) throw new Error("The showcase bundle could not be loaded.");
        const manifest = await response.json() as DemoManifest;
        const bundleAssets = manifest.assets.map(asContentAsset);

        timers.push(window.setTimeout(() => {
          if (active) setJob((current) => ({ ...current, status: "RUNNING" }));
        }, 500));

        bundleAssets.forEach((asset, index) => {
          timers.push(window.setTimeout(() => {
            if (active) setAssets((current) => [...current, asset]);
          }, 850 + index * 575));
        });

        timers.push(window.setTimeout(() => {
          if (!active) return;
          const completedAt = new Date().toISOString();
          setAssets(bundleAssets);
          setJob({
            ...completedJob,
            status: "SUCCEEDED",
            updatedAt: completedAt,
            completedAt,
            contentVersion: completedJob.contentVersion ? {
              ...completedJob.contentVersion,
              title: manifest.title,
              content: { ...manifest, synopsis: manifest.openingRemarks },
              assets: bundleAssets,
              updatedAt: completedAt,
            } : null,
          });
        }, 8_000));
      } catch (error) {
        if (!active) return;
        const completedAt = new Date().toISOString();
        setJob((current) => ({
          ...current,
          status: "FAILED",
          failureCode: "SHOWCASE_BUNDLE_UNAVAILABLE",
          failureMessage: error instanceof Error ? error.message : "The showcase replay failed.",
          updatedAt: completedAt,
          completedAt,
        }));
      }
    }

    void replay();
    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [completedJob]);

  return <GenerationStatus initialJob={initialJob} replayAssets={assets} replayJob={job} />;
}
