// Railway settings for the game server (socket.io), applied with
// `npx railway config plan` then `npx railway config apply`.
// Replaces railway.json (Railway stops reading Config as Code on 2026-12-01).
// Deploys still go out with `npm run deploy:server`. Secrets stay in Railway:
// variables are not managed here.
import { defineRailway, github, project, service } from "railway/iac";

// This repository manages only its own resources in the environment.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "ma-soi-night";

export default defineRailway(() => {
  const maSoiNight = service("ma-soi-night", {
    source: github("thanhryan119-cloud/ma-soi-night", { branch: "main" }),
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    start: "npm run server",
    healthcheck: "/health",
    replicas: { sfo: 1 },
    deploy: { sleepApplication: true, restartPolicyType: "ON_FAILURE" },
  });

  return project("beautiful-cooperation", {
    variables: { managed: false },
    resources: [maSoiNight],
  });
});
