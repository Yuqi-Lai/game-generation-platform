import "server-only";

import { auth0 } from "@/lib/auth0";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const audience = process.env.AUTH0_AUDIENCE;
  const accessToken = await auth0.getAccessToken(audience ? { audience } : undefined);
  const baseUrl = process.env.API_BASE_URL;

  if (!baseUrl) throw new Error("API_BASE_URL is not configured");

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken.token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string; message?: string } | null;
    throw new ApiError(body?.detail ?? body?.message ?? "The platform API rejected the request", response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
