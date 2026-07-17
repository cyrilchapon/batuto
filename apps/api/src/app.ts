import { OpenAPIHandler } from "@orpc/openapi/node";
import cors from "cors";
import express from "express";
import { router } from "./router.js";

export function createApp() {
  const app = express();
  const handler = new OpenAPIHandler(router);

  app.use(cors({ origin: process.env.WEB_URL ?? "http://localhost:5173" }));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(async (req, res, next) => {
    const { matched } = await handler.handle(req, res, { context: {} });
    if (!matched) {
      next();
    }
  });

  return app;
}
