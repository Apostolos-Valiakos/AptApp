const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.POSTGRES_URI,
  max: 20, // cap concurrent connections so one slow query can't starve the rest
  idleTimeoutMillis: 30000, // release idle clients back after 30s
  connectionTimeoutMillis: 5000, // fail fast instead of hanging if the pool is exhausted
});

module.exports = pool;
