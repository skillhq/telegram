import { Command } from 'commander';
import { Api } from 'telegram';
import { NewMessage, type NewMessageEvent } from 'telegram/events/NewMessage.js';
import { getClient, resolveChat, getChatTitle, disconnectClient } from '../client.js';

export const firehoseCommand = new Command('firehose')
  .description('Stream incoming messages as NDJSON until interrupted')
  .option('--chat <identifier>', 'Filter to a specific chat (name, @username, or ID)')
  .option('--include-outgoing', 'Include your own outgoing messages')
  .action(async (options) => {
    const client = await getClient();

    let chatId: number | undefined;
    let chatLabel: string | undefined;

    if (options.chat) {
      const entity = await resolveChat(client, options.chat);
      chatId = entity.id.toJSNumber();
      chatLabel = getChatTitle(entity);
      process.stderr.write(`Streaming messages from "${chatLabel}"…\n`);
    } else {
      process.stderr.write('Streaming all incoming messages…\n');
    }

    const handler = async (event: NewMessageEvent) => {
      const msg = event.message;
      if (!msg || !(msg instanceof Api.Message)) return;
      if (!options.includeOutgoing && msg.out) return;

      let sender = 'Unknown';
      let senderId: string | undefined;
      try {
        if (msg.fromId) {
          const entity = await client.getEntity(msg.fromId);
          if (entity instanceof Api.User) {
            sender = entity.firstName || entity.username || 'Unknown';
            senderId = entity.id.toString();
          } else if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
            sender = (entity as Api.Channel | Api.Chat).title || 'Unknown';
            senderId = entity.id.toString();
          }
        }
      } catch { /* ignore resolution errors */ }

      let chatId: string | undefined;
      let chatTitle: string | undefined;
      try {
        if (msg.peerId) {
          const peer = await client.getEntity(msg.peerId);
          chatId = peer.id.toString();
          if (peer instanceof Api.User) {
            chatTitle = peer.firstName || peer.username || undefined;
          } else if (peer instanceof Api.Chat || peer instanceof Api.Channel) {
            chatTitle = (peer as Api.Chat | Api.Channel).title || undefined;
          }
        }
      } catch { /* ignore */ }

      const line = JSON.stringify({
        id: msg.id,
        date: new Date(msg.date * 1000).toISOString(),
        chatId,
        chatTitle,
        sender,
        senderId,
        text: msg.message || '',
        replyToMsgId: msg.replyTo?.replyToMsgId ?? null,
        isOutgoing: msg.out ?? false,
      });

      process.stdout.write(line + '\n');
    };

    const eventParams: ConstructorParameters<typeof NewMessage>[0] = {};
    if (chatId) eventParams.chats = [chatId];
    if (!options.includeOutgoing) eventParams.outgoing = false;

    client.addEventHandler(handler, new NewMessage(eventParams));

    const shutdown = async () => {
      process.stderr.write('\nStopping firehose…\n');
      client.removeEventHandler(handler, new NewMessage(eventParams));
      await disconnectClient();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
