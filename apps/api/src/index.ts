import { config } from "dotenv";
import { createApp } from "./app.js";

// .env.local (gitignored, per-worktree Neon branch DATABASE_URL from
// `yarn workspace @batuto/db db:branch`) takes priority over .env (from
// `env:pull`) — first value wins, per dotenv's multi-path semantics.
config({ path: [".env.local", ".env"] });

const app = createApp();
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
