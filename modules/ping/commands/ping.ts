// Handler cho lệnh /ping

interface InteractionLike {
  reply(message: string): Promise<unknown>;
}

export async function handler(interaction: InteractionLike) {
  await interaction.reply('Pong!');
  return 'Pong!';
}
