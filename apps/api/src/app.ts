import { createAuthMiddleware, getAuth, requireAuthenticated } from "@batuto/auth";
import { OpenAPIHandler } from "@orpc/openapi/node";
import cors from "cors";
import express from "express";
import { appEnv } from "./env.js";
import { router } from "./router.js";

export function createApp() {
  const app = express();
  const handler = new OpenAPIHandler(router);

  app.use(cors({ origin: appEnv.WEB_URL }));
  app.use(createAuthMiddleware(appEnv));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/private/ping", requireAuthenticated, (req, res) => {
    const { userId } = getAuth(req);
    res.json({ userId });
  });

  app.use(async (req, res, next) => {
    const { matched } = await handler.handle(req, res, { context: {} });
    if (!matched) {
      next();
    }
  });

  return app;
}
