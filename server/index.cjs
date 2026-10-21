const { createPool } = require("./db.cjs");
const { createApp } = require("./app.cjs");
const pool = createPool();
const server = createApp(pool).listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log("SIGCP–MANACO iniciado. Puerto " + (process.env.PORT || 3000)),
);
async function close() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
