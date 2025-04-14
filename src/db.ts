import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'allmed_manager',
    password: 'Regigigas9!',
    port: 5432,
  });

export default pool;
