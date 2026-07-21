import { createDb, type Db } from "@batuto/db";
import { appEnv } from "./env.js";

export const db: Db = createDb(appEnv);
