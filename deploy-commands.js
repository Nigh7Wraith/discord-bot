const { REST, Routes, SlashCommandBuilder } = require("discord.js");
const { token, clientId } = require("./config.json");

// ако нямаш clientId ще гръмне по-късно, така че проверяваме:
if (!token) throw new Error("❌ token is missing config.json");
if (!clientId) throw new Error("❌ clientId is missing config.json (Application ID)");

const commands = [
  new SlashCommandBuilder()
    .setName("lvl")
    .setDescription("Showing your lvl and XP")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("🔄 Registering / commands...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Done! /lvl is registered.");
  } catch (err) {
    console.error("❌ Failed:", err);
  }
})();
