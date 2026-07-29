import { expressErrorHandler } from "@appsignal/nodejs";
import { OpenAPIHandler } from "@orpc/openapi/node";
import cors from "cors";
import express from "express";
import { createContext } from "./context.js";
import { appEnv } from "./env.js";
import { router } from "./router.js";

export function createApp() {
  const app = express();
  const handler = new OpenAPIHandler(router);

  app.use(cors({ origin: appEnv.WEB_URL }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(async (req, res, next) => {
    const context = await createContext(req);
    const { matched } = await handler.handle(req, res, { context });
    if (!matched) {
      next();
    }
  });

  // Must come after all routes, before any other error handlers.
  app.use(expressErrorHandler());

  return app;
}
