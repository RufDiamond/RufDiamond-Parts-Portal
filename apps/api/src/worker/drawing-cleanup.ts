import { loadConfig } from "../config.js";
import { createDatabase } from "../db/client.js";
import { cleanupDrawingQuarantine } from "../modules/drawings/cleanup.js";
import { createS3DrawingStorage } from "../modules/drawings/s3-storage.js";

const config = loadConfig(process.env);
const database = createDatabase(config.databaseUrl), storage = createS3DrawingStorage(config.s3);
try { console.info(await cleanupDrawingQuarantine(database.db, storage)); }
finally { storage.close(); await database.close(); }
