require("dotenv").config();
const { Client } = require("pg");
const util = require("util");

console.log("Connecting with:", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":****@"));

const client = new Client({ connectionString: process.env.DATABASE_URL });

client
  .connect()
  .then(() => client.query("SELECT 1 as ok"))
  .then((res) => {
    console.log("SUCCESS:", res.rows);
    return client.end();
  })
  .catch((err) => {
    console.error("FAILED:");
    console.error(util.inspect(err, { depth: null, colors: false }));
    process.exit(1);
  });
