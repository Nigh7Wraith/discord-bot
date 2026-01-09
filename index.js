// index.js
process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

const { Client, GatewayIntentBits, Events } = require("discord.js");
const db = require("./database.js");

// Settings from config.json (NO token inside)
let config = {};
try {
  config = require("./config.json");
} catch (e) {
  console.warn("⚠️ config.json not found or invalid. Using defaults.");
  config = {};
}

// Token from Railway / Environment (NOT in config.json)
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("❌ DISCORD_TOKEN is missing! Add it in Railway Variables.");
  process.exit(1);
}

// settings (with defaults)
const xpCooldown = Number(config.xpCooldown ?? 60);
const xpMin = Number(config.xpMin ?? 5);
const xpMax = Number(config.xpMax ?? 7);
const levelsForRole = Number(config.levelsForRole ?? 5);
const roleToGive = config.roleToGive || null; // role ID or null

console.log("🚀 index.js is online");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // enough for messageCreate event
  ],
});

// cooldown per user per guild
const cooldowns = new Set();

// Discord.js v14+ "ready" is Events.ClientReady
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
});

/**
 * Helper: safe reply/edit that won't crash
 */
async function safeRespond(interaction, content, ephemeral = false) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(content);
    }
    return await interaction.reply({ content, ephemeral });
  } catch (e) {
    // ignore
  }
}

/**
 * /lvl + /rank - shows XP + level
 * /leaderboard - shows top 10 by XP in the server
 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = interaction.commandName;
  if (cmd !== "lvl" && cmd !== "rank" && cmd !== "leaderboard") return;

  console.log("INTERACTION:", cmd, "from", interaction.user?.tag);

  try {
    // prevents 3s timeout
    await interaction.deferReply({ ephemeral: false });

    const guildId = interaction.guild?.id;
    if (!guildId) return safeRespond(interaction, "This command works only in a server.", true);

    const userId = interaction.user.id;

    // fallback if DB is slow/locked
    const fallbackTimer = setTimeout(() => {
      if (interaction.deferred && !interaction.replied) {
        interaction.editReply("⏳ Still loading... (DB is slow/locked)").catch(() => {});
      }
    }, 2000);

    // /lvl or /rank
    if (cmd === "lvl" || cmd === "rank") {
      db.get(
        "SELECT xp, level FROM xp WHERE userId = ? AND guildId = ?",
        [userId, guildId],
        (err, row) => {
          clearTimeout(fallbackTimer);

          if (err) {
            console.error("DB error in /lvl:", err);
            return interaction.editReply("❌ Database error (check logs).");
          }

          if (!row) return interaction.editReply("You don't have any XP yet 😅");

          return interaction.editReply(`📊 **Level:** ${row.level}\n⭐ **XP:** ${row.xp}`);
        }
      );
      return;
    }

    // /leaderboard
    db.all(
      "SELECT userId, xp, level FROM xp WHERE guildId = ? ORDER BY xp DESC LIMIT 10",
      [guildId],
      (err, rows) => {
        clearTimeout(fallbackTimer);

        if (err) {
          console.error("DB error in /leaderboard:", err);
          return interaction.editReply("❌ Database error (check logs).");
        }

        if (!rows || rows.length === 0) {
          return interaction.editReply("No data yet. Send some messages in chat to earn XP 🙂");

        }

        const lines = rows.map((r, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "▫️";
          return `${medal} **${i + 1}.** <@${r.userId}> — **Lvl ${r.level}** — **${r.xp} XP**`;
        });

        return interaction.editReply(`🏆 **Leaderboard (Top 10)**\n\n${lines.join("\n")}`);
      }
    );
  } catch (err) {
    console.error("Interaction error:", err);
    return safeRespond(interaction, "❌ Something went wrong.", true);
  }
});

/**
 * XP gain on message
 */
client.on(Events.MessageCreate, (message) => {
  try {
    if (!message.guild) return;
    if (message.author?.bot) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    const key = `${userId}-${guildId}`;
    if (cooldowns.has(key)) return;

    cooldowns.add(key);
    setTimeout(() => cooldowns.delete(key), xpCooldown * 1000);

    const earned = Math.floor(Math.random() * (xpMax - xpMin + 1)) + xpMin;

    db.get(
      "SELECT xp, level FROM xp WHERE userId = ? AND guildId = ?",
      [userId, guildId],
      (err, row) => {
        if (err) return console.error("DB error in messageCreate:", err);

        // first time user
        if (!row) {
          return db.run(
            "INSERT INTO xp (userId, guildId, xp, level) VALUES (?, ?, ?, 1)",
            [userId, guildId, earned],
            (insertErr) => {
              if (insertErr) console.error("DB insert error:", insertErr);
            }
          );
        }

        const newXp = row.xp + earned;
        const newLevel = Math.floor(0.1 * Math.sqrt(newXp));

        // level up message
        if (newLevel > row.level) {
          message.channel
            .send(`🎉 <@${userId}> reached level **${newLevel}**!`)
            .catch(() => {});
        }

        // give role on specific level (optional)
        if (roleToGive && newLevel === levelsForRole) {
          const role = message.guild.roles.cache.get(roleToGive);
          if (role && message.member) {
            message.member.roles.add(role).catch((e) => console.error("Role add error:", e));
          }
        }

        db.run(
          "UPDATE xp SET xp = ?, level = ? WHERE userId = ? AND guildId = ?",
          [newXp, newLevel, userId, guildId],
          (updateErr) => {
            if (updateErr) console.error("DB update error:", updateErr);
          }
        );
      }
    );
  } catch (e) {
    console.error("messageCreate error:", e);
  }
});

client.login(token);
