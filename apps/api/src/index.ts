import { createApp } from "./app.js";
import { appEnv } from "./env.js";

const app = createApp();

app.listen(appEnv.PORT, () => {
  console.log(`api listening on http://localhost:${appEnv.PORT}`);
});
