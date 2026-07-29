import "./appsignal.js";
import { Appsignal } from "@appsignal/nodejs";
import { createApp } from "./app.js";
import { appEnv } from "./env.js";

const app = createApp();

app.listen(appEnv.PORT, () => {
  const message = `api listening on http://localhost:${appEnv.PORT}`;
  console.log(message);
  Appsignal.logger("nodejs").info(message);
});
