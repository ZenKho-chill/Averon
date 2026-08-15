export async function handler(interaction: Record<string, unknown> & { reply: (msg: string) => Promise<void> }) {
  await interaction.reply('Pong!');
  return 'Pong!';
}
