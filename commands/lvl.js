const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lvl')
    .setDescription('Showing your lvl and XP'),

  async execute(interaction) {
    // примерни стойности
    const level = 5;
    const xp = 1234;

    await interaction.reply({
      content: `📊 **Level:** ${level}\n⭐ **XP:** ${xp}`,
      ephemeral: false
    });
  }
};
