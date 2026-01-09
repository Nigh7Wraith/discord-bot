// index.js
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);





const { Client, GatewayIntentBits } = require("discord.js");
const db = require("./database.js");
const config = require("./config.json");

const token = config.token;

// настройки (с дефолти)
const xpCooldown = Number(config.xpCooldown ?? 60);
const xpMin = Number(config.xpMin ?? 5);
const xpMax = Number(config.xpMax ?? 7);
const levelsForRole = Number(config.levelsForRole ?? 5);
const roleToGive = config.roleToGive; // string id или undefined

console.log("🚀 index.js is online");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages, // достатъчно за messageCreate
  ],
});

// cooldown per user per guild
const cooldowns = new Set();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/**
 * /lvl - shows XP + level
 * Никога не трябва да дава "did not respond"
 */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "lvl") return;

  // Лог за дебъг
  console.log("INTERACTION:", interaction.commandName, "from", interaction.user.tag);

  try {
    await interaction.deferReply({ ephemeral: false });

    const guildId = interaction.guild?.id;
    if (!guildId) {
      return interaction.editReply("This command works only in a server.");
    }

    const userId = interaction.user.id;

    // fallback ако DB забие (примерно locked)
    const fallbackTimer = setTimeout(() => {
      if (interaction.deferred && !interaction.replied) {
        interaction.editReply("⏳ Still loading... (DB is slow/locked)").catch(() => {});
      }
    }, 2000);

    db.get(
      "SELECT xp, level FROM xp WHERE userId = ? AND guildId = ?",
      [userId, guildId],
      (err, row) => {
        clearTimeout(fallbackTimer);

        if (err) {
          console.error("DB error in /lvl:", err);
          return interaction.editReply("❌ Database error (check console).");
        }

        if (!row) {
          return interaction.editReply("You don't have any XP yet 😅");
        }

        return interaction.editReply(
          `📊 **Level:** ${row.level}\n⭐ **XP:** ${row.xp}`
        );
      }
    );
  } catch (err) {
    console.error("Interaction error:", err);

    // ако вече е deferred/replied -> editReply
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply("❌ Something went wrong.").catch(() => {});
    }

    // иначе normal reply
    return interaction.reply({
      content: "❌ Something went wrong.",
      ephemeral: true,
    }).catch(() => {});
  }
});

/**
 * XP gain on message
 */
client.on("messageCreate", (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const userId = message.author.id;
    const guildId = message.guild.id;

    const key = `${userId}-${guildId}`;
    if (cooldowns.has(key)) return;

    cooldowns.add(key);
    setTimeout(() => cooldowns.delete(key), xpCooldown * 1000);

    // random XP between xpMin and xpMax (inclusive)
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
            message.member.roles.add(role).catch((e) => {
              console.error("Role add error:", e);
            });
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
