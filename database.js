const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./xp.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS xp (
      userId TEXT NOT NULL,
      guildId TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (userId, guildId)
    )
  `);
});

module.exports = db;
