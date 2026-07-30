import "source-map-support/register.js";
import { Appsignal } from "@appsignal/nodejs";

new Appsignal({
  active: true,
  name: "batuto",
  // DOPPLER_ENVIRONMENT is dev/stg/prd, matching this project's real
  // deploy tiers - see infra-and-envs.md's "Environment structure".
  // Left unset (falls back to NODE_ENV, then "development") outside a
  // Doppler-sourced env, which only happens outside this repo's own
  // tooling.
  environment: process.env.DOPPLER_ENVIRONMENT,
});
