const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) throw new Error("❌ DISCORD_TOKEN is missing (env var).");
if (!clientId) throw new Error("❌ CLIENT_ID is missing (env var).");
if (!guildId) throw new Error("❌ GUILD_ID is missing (env var).");

const commands = [
  new SlashCommandBuilder()
    .setName("lvl")
    .setDescription("Shows your level and XP")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Same as /lvl (alias)")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top 10 users by XP in this server")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("🔄 Registering guild slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log("✅ Done! Commands registered: /lvl /rank /leaderboard");
  } catch (err) {
    console.error("❌ Failed:", err);
  }
})();
