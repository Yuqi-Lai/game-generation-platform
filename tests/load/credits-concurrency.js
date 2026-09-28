import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

const submissions = new Counter("credit_submission_requests");
const accepted = new Counter("credit_submission_accepted");
const insufficient = new Counter("credit_submission_insufficient");
const unexpected = new Counter("credit_submission_unexpected");
const submissionLatency = new Trend("credit_submission_latency", true);

const requestCount = Number.parseInt(__ENV.REQUEST_COUNT || "25", 10);
const expectedAccepted = Number.parseInt(__ENV.EXPECTED_ACCEPTED || "10", 10);
const expectedInsufficient = requestCount - expectedAccepted;
const baseUrl = __ENV.BASE_URL || "http://localhost:8080";
const projectId = __ENV.PROJECT_ID;
const accessToken = __ENV.ACCESS_TOKEN;

if (!projectId || !accessToken) {
  throw new Error("PROJECT_ID and ACCESS_TOKEN are required");
}

http.setResponseCallback(http.expectedStatuses(200, 201, 409));

export const options = {
  scenarios: {
    concurrent_credit_reservations: {
      executor: "per-vu-iterations",
      vus: requestCount,
      iterations: 1,
      maxDuration: "30s",
    },
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: {
    checks: ["rate==1"],
    credit_submission_requests: [`count==${requestCount}`],
    credit_submission_accepted: [`count==${expectedAccepted}`],
    credit_submission_insufficient: [`count==${expectedInsufficient}`],
    credit_submission_unexpected: ["count==0"],
    credit_submission_latency: ["p(95)<2000", "p(99)<3000"],
  },
};

const headers = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
};

export default function () {
  const requestId = `${__VU.toString().padStart(8, "0")}-0000-4000-8000-000000000001`;
  const response = http.post(
    `${baseUrl}/api/v1/projects/${projectId}/generations`,
    JSON.stringify({ requestId, prompt: `Synthetic credit load request ${__VU}` }),
    { headers, tags: { operation: "reserve_generation_credits" } },
  );

  submissions.add(1);
  submissionLatency.add(response.timings.duration);

  if (response.status === 201) {
    accepted.add(1);
  } else if (response.status === 409 && response.body.includes("Insufficient project credits")) {
    insufficient.add(1);
  } else {
    unexpected.add(1);
  }

  check(response, {
    "submission is accepted or insufficient": (result) =>
      result.status === 201 ||
      (result.status === 409 && result.body.includes("Insufficient project credits")),
  });
}

export function teardown() {
  const balance = http.get(`${baseUrl}/api/v1/projects/${projectId}/credits`, { headers });
  const ledger = http.get(`${baseUrl}/api/v1/projects/${projectId}/credits/ledger`, { headers });

  check(balance, {
    "final balance endpoint succeeds": (result) => result.status === 200,
    "final balance matches reservation invariant": (result) => {
      if (result.status !== 200) return false;
      const value = result.json();
      return value.totalGranted === 100 && value.reserved === 100 && value.consumed === 0 &&
        value.available === 0 && value.reserved + value.consumed + value.available === value.totalGranted;
    },
  });
  check(ledger, {
    "ledger has one grant and ten unique reserves": (result) => {
      if (result.status !== 200) return false;
      const entries = result.json().entries;
      const reserves = entries.filter((entry) => entry.type === "RESERVE");
      return reserves.length === 10 && new Set(reserves.map((entry) => entry.generationJobId)).size === 10;
    },
  });
}
