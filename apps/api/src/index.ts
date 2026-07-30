import "./appsignal.js";
import { createApp } from "./app.js";
import { appEnv } from "./env.js";
import { logger } from "./logger.js";

const app = createApp();

app.listen(appEnv.PORT, () => {
  logger.info(`api listening on http://localhost:${appEnv.PORT}`);
});
