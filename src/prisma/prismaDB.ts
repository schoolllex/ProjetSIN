import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client.js";


const dbClient = new PrismaMariaDb({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: Number(process.env.DB_PORT),
  password: process.env.DB_PSWD,
  database: process.env.DB_NAME,
  connectionLimit: 5
});

const db = new PrismaClient({adapter: dbClient});

export default db;