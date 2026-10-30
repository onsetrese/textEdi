import { createDb } from './schema.js';
import { seedDb } from './seed.js';

const DB_PATH = process.env.DB_PATH || 'data.db';

const db = createDb(DB_PATH);
seedDb(db);

export default db;
