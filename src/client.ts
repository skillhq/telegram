import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import { getCredentials, getSessionString, setSessionString, isConfigured } from './config.js';
import bigInt from 'big-integer';

let clientInstance: TelegramClient | null = null;

export async function getClient(): Promise<TelegramClient> {
  if (clientInstance?.connected) {
    return clientInstance;
  }

  if (!isConfigured()) {
    throw new Error('Not configured. Run "tg auth" first to set up your API credentials.');
  }

  const { apiId, apiHash } = getCredentials();
  const sessionString = getSessionString() || '';
  const session = new StringSession(sessionString);

  clientInstance = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await clientInstance.connect();

  if (!await clientInstance.isUserAuthorized()) {
    throw new Error('Not authenticated. Run "tg auth" to log in.');
  }

  return clientInstance;
}

export async function createClient(apiId: number, apiHash: string): Promise<TelegramClient> {
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  return client;
}

export async function saveSession(client: TelegramClient): Promise<void> {
  const sessionString = (client.session as StringSession).save();
  setSessionString(sessionString);
}

export async function disconnectClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}

export async function getMe(client: TelegramClient): Promise<Api.User> {
  const me = await client.getMe();
  if (!me || !(me instanceof Api.User)) {
    throw new Error('Failed to get user info');
  }
  return me;
}

export interface ChatInfo {
  id: string;
  title: string;
  type: 'user' | 'group' | 'supergroup' | 'channel';
  username?: string;
  unreadCount: number;
  lastMessage?: string;
  lastMessageDate?: Date;
}

export async function getDialogs(client: TelegramClient, limit = 100): Promise<ChatInfo[]> {
  const dialogs = await client.getDialogs({ limit });
  const chats: ChatInfo[] = [];

  for (const dialog of dialogs) {
    let type: ChatInfo['type'] = 'user';
    let title = dialog.title || 'Unknown';
    let username: string | undefined;

    if (dialog.isUser) {
      type = 'user';
      const entity = dialog.entity as Api.User;
      username = entity.username ?? undefined;
    } else if (dialog.isGroup) {
      type = 'group';
    } else if (dialog.isChannel) {
      const entity = dialog.entity as Api.Channel;
      type = entity.megagroup ? 'supergroup' : 'channel';
      username = entity.username ?? undefined;
    }

    chats.push({
      id: dialog.id?.toString() || '',
      title,
      type,
      username,
      unreadCount: dialog.unreadCount,
      lastMessage: dialog.message?.message,
      lastMessageDate: dialog.message?.date ? new Date(dialog.message.date * 1000) : undefined,
    });
  }

  return chats;
}

export interface MessageInfo {
  id: number;
  date: Date;
  sender: string;
  senderId?: string;
  text: string;
  replyToMsgId?: number;
  isOutgoing: boolean;
  mediaType?: string;
  fileName?: string;
  fileSize?: number;
}

export function parseTimeOffset(offset: string): Date {
  const now = new Date();
  const match = offset.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(`Invalid time offset: ${offset}. Use format like "1h", "30m", "7d"`);
  }
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 'm': return new Date(now.getTime() - value * 60 * 1000);
    case 'h': return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'd': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}

function getSenderCacheKey(fromId: Api.TypePeer): string {
  if (fromId instanceof Api.PeerUser) return `user:${fromId.userId}`;
  if (fromId instanceof Api.PeerChat) return `chat:${fromId.chatId}`;
  if (fromId instanceof Api.PeerChannel) return `channel:${fromId.channelId}`;
  return String(fromId);
}

function extractMediaInfo(media: Api.TypeMessageMedia | undefined): { mediaType?: string; fileName?: string; fileSize?: number } {
  if (!media) return {};

  if (media instanceof Api.MessageMediaPhoto) {
    return { mediaType: 'photo' };
  }

  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    let mediaType = 'document';
    let fileName: string | undefined;

    for (const attr of doc.attributes) {
      if (attr instanceof Api.DocumentAttributeFilename) {
        fileName = attr.fileName;
      }
      if (attr instanceof Api.DocumentAttributeSticker) {
        mediaType = 'sticker';
      }
      if (attr instanceof Api.DocumentAttributeVideo) {
        mediaType = attr.roundMessage ? 'video_note' : 'video';
      }
      if (attr instanceof Api.DocumentAttributeAudio) {
        mediaType = attr.voice ? 'voice' : 'audio';
      }
      if (attr instanceof Api.DocumentAttributeAnimated) {
        mediaType = 'gif';
      }
    }

    return { mediaType, fileName, fileSize: doc.size ? Number(doc.size) : undefined };
  }

  if (media instanceof Api.MessageMediaContact) {
    return { mediaType: 'contact' };
  }

  if (media instanceof Api.MessageMediaGeo || media instanceof Api.MessageMediaGeoLive) {
    return { mediaType: 'location' };
  }

  if (media instanceof Api.MessageMediaPoll) {
    return { mediaType: 'poll' };
  }

  if (media instanceof Api.MessageMediaWebPage) {
    return { mediaType: 'webpage' };
  }

  if (media instanceof Api.MessageMediaVenue) {
    return { mediaType: 'venue' };
  }

  if (media instanceof Api.MessageMediaDice) {
    return { mediaType: 'dice' };
  }

  return {};
}

export function formatMediaLabel(mediaType?: string, fileName?: string, fileSize?: number): string {
  if (!mediaType) return '';
  const sizeStr = fileSize ? ` (${formatFileSize(fileSize)})` : '';
  switch (mediaType) {
    case 'photo': return '📷 Photo';
    case 'video': return `🎥 Video${sizeStr}`;
    case 'video_note': return '🎥 Video note';
    case 'voice': return '🎤 Voice message';
    case 'audio': return fileName ? `🎵 ${fileName}${sizeStr}` : `🎵 Audio${sizeStr}`;
    case 'document': return fileName ? `📎 ${fileName}${sizeStr}` : `📎 Document${sizeStr}`;
    case 'sticker': return '😀 Sticker';
    case 'gif': return '🎬 GIF';
    case 'contact': return '👤 Contact';
    case 'location': return '📍 Location';
    case 'venue': return '📍 Venue';
    case 'poll': return '📊 Poll';
    case 'webpage': return '🔗 Link preview';
    case 'dice': return '🎲 Dice';
    default: return '📦 Media';
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export async function getMessages(
  client: TelegramClient,
  chatIdentifier: string,
  options: { limit?: number; offsetId?: number; minDate?: Date; maxDate?: Date; minId?: number } = {}
): Promise<{ messages: MessageInfo[]; chatTitle: string }> {
  const { limit = 50, offsetId, minDate, maxDate, minId } = options;

  const entity = await resolveChat(client, chatIdentifier);
  const chatTitle = getChatTitle(entity);

  const messages: MessageInfo[] = [];
  const senderCache = new Map<string, { name: string; id: string }>();
  const BATCH_SIZE = 100;

  let currentOffsetId = offsetId;
  let firstBatch = true;

  while (messages.length < limit) {
    const batchLimit = Math.min(BATCH_SIZE, limit - messages.length + 50);

    const params: { limit: number; offsetId?: number; offsetDate?: number; minId?: number } = {
      limit: batchLimit,
    };

    if (currentOffsetId) {
      params.offsetId = currentOffsetId;
    } else if (firstBatch && maxDate) {
      // Server-side date filtering: start from maxDate on first batch
      params.offsetDate = Math.floor(maxDate.getTime() / 1000);
    }

    if (minId) {
      params.minId = minId;
    }

    const batch = await client.getMessages(entity, params);
    firstBatch = false;

    if (batch.length === 0) break;

    let reachedMinDate = false;

    for (const msg of batch) {
      if (!(msg instanceof Api.Message)) continue;

      const msgDate = new Date(msg.date * 1000);

      if (maxDate && msgDate > maxDate) continue;

      if (minDate && msgDate < minDate) {
        reachedMinDate = true;
        break;
      }

      if (messages.length >= limit) break;

      // Resolve sender with cache
      let sender = 'Unknown';
      let senderId: string | undefined;

      if (msg.fromId) {
        const cacheKey = getSenderCacheKey(msg.fromId);
        const cached = senderCache.get(cacheKey);

        if (cached) {
          sender = cached.name;
          senderId = cached.id;
        } else {
          try {
            const senderEntity = await client.getEntity(msg.fromId);
            if (senderEntity instanceof Api.User) {
              sender = senderEntity.firstName || senderEntity.username || 'Unknown';
              senderId = senderEntity.id.toString();
            } else if (senderEntity instanceof Api.Channel || senderEntity instanceof Api.Chat) {
              sender = (senderEntity as Api.Channel | Api.Chat).title || 'Unknown';
              senderId = senderEntity.id.toString();
            }
            senderCache.set(cacheKey, { name: sender, id: senderId || '' });
          } catch {
            // Ignore entity resolution errors
          }
        }
      }

      const mediaInfo = extractMediaInfo(msg.media);

      messages.push({
        id: msg.id,
        date: msgDate,
        sender,
        senderId,
        text: msg.message || '',
        replyToMsgId: msg.replyTo?.replyToMsgId,
        isOutgoing: msg.out ?? false,
        ...mediaInfo,
      });
    }

    if (reachedMinDate) break;
    if (messages.length >= limit) break;

    // Set offsetId for next batch. Telegram mixes MessageService / MessageEmpty
    // items into the raw batch (joins/leaves, pinned-msg markers, etc.). We
    // must page by the oldest Api.Message in the batch - using raw
    // batch[batch.length - 1] silently aborts pagination whenever the oldest
    // raw item happens to be a service message, which for active channels
    // usually kicks in within the first 5-10 iterations and caps deep
    // backfills at a few days of history.
    let oldestMessageInBatch: Api.Message | null = null;
    for (let i = batch.length - 1; i >= 0; i--) {
      const candidate = batch[i];
      if (candidate instanceof Api.Message) {
        oldestMessageInBatch = candidate;
        break;
      }
    }
    if (!oldestMessageInBatch) break; // batch was all service messages
    if (currentOffsetId === oldestMessageInBatch.id) break; // no progress
    currentOffsetId = oldestMessageInBatch.id;

    // If batch was smaller than requested, no more messages
    if (batch.length < batchLimit) break;
  }

  return { messages, chatTitle };
}

export async function searchMessages(
  client: TelegramClient,
  query: string,
  options: { chat?: string; limit?: number } = {}
): Promise<{ messages: MessageInfo[]; chatTitle?: string }[]> {
  const { chat, limit = 50 } = options;
  const results: { messages: MessageInfo[]; chatTitle?: string }[] = [];

  if (chat) {
    const entity = await resolveChat(client, chat);
    const chatTitle = getChatTitle(entity);

    const searchResult = await client.invoke(
      new Api.messages.Search({
        peer: entity,
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    const messages: MessageInfo[] = [];
    if ('messages' in searchResult) {
      for (const msg of searchResult.messages) {
        if (msg instanceof Api.Message) {
          let sender = 'Unknown';
          if ('users' in searchResult) {
            const user = searchResult.users.find(
              (u): u is Api.User => u instanceof Api.User && u.id.equals(msg.fromId instanceof Api.PeerUser ? msg.fromId.userId : bigInt(0))
            );
            if (user) {
              sender = user.firstName || user.username || 'Unknown';
            }
          }

          messages.push({
            id: msg.id,
            date: new Date(msg.date * 1000),
            sender,
            text: msg.message || '',
            replyToMsgId: msg.replyTo?.replyToMsgId,
            isOutgoing: msg.out ?? false,
          });
        }
      }
    }

    results.push({ messages, chatTitle });
  } else {
    // Global search
    const searchResult = await client.invoke(
      new Api.messages.SearchGlobal({
        q: query,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit,
      })
    );

    const messages: MessageInfo[] = [];
    if ('messages' in searchResult) {
      for (const msg of searchResult.messages) {
        if (msg instanceof Api.Message) {
          messages.push({
            id: msg.id,
            date: new Date(msg.date * 1000),
            sender: 'Unknown',
            text: msg.message || '',
            replyToMsgId: msg.replyTo?.replyToMsgId,
            isOutgoing: msg.out ?? false,
          });
        }
      }
    }

    results.push({ messages });
  }

  return results;
}

export async function sendMessage(
  client: TelegramClient,
  chatIdentifier: string,
  text: string,
  replyToMsgId?: number
): Promise<Api.Message> {
  const entity = await resolveChat(client, chatIdentifier);

  const result = await client.sendMessage(entity, {
    message: text,
    replyTo: replyToMsgId,
  });

  return result;
}

export async function getContactInfo(
  client: TelegramClient,
  identifier: string
): Promise<{
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  bio?: string;
  isBot: boolean;
  isMutualContact: boolean;
}> {
  const entity = await client.getEntity(identifier);

  if (!(entity instanceof Api.User)) {
    throw new Error('Not a user');
  }

  let bio: string | undefined;
  try {
    const fullUser = await client.invoke(
      new Api.users.GetFullUser({ id: entity })
    );
    bio = fullUser.fullUser.about ?? undefined;
  } catch {
    // Ignore
  }

  return {
    id: entity.id.toString(),
    firstName: entity.firstName ?? undefined,
    lastName: entity.lastName ?? undefined,
    username: entity.username ?? undefined,
    phone: entity.phone ?? undefined,
    bio,
    isBot: entity.bot ?? false,
    isMutualContact: entity.mutualContact ?? false,
  };
}

export async function getChatMembers(
  client: TelegramClient,
  chatIdentifier: string,
  options: { adminsOnly?: boolean; limit?: number } = {}
): Promise<{ id: string; name: string; username?: string; isAdmin: boolean }[]> {
  const { adminsOnly = false, limit = 200 } = options;
  const entity = await resolveChat(client, chatIdentifier);

  if (entity instanceof Api.Channel) {
    const filter = adminsOnly
      ? new Api.ChannelParticipantsAdmins()
      : new Api.ChannelParticipantsRecent();

    const result = await client.invoke(
      new Api.channels.GetParticipants({
        channel: entity,
        filter,
        offset: 0,
        limit,
        hash: bigInt(0),
      })
    );

    if (!(result instanceof Api.channels.ChannelParticipants)) {
      return [];
    }

    const members: { id: string; name: string; username?: string; isAdmin: boolean }[] = [];

    for (const participant of result.participants) {
      const userId = 'userId' in participant ? participant.userId : null;
      if (!userId) continue;

      const user = result.users.find(
        (u): u is Api.User => u instanceof Api.User && u.id.equals(userId)
      );

      if (user) {
        const isAdmin = participant instanceof Api.ChannelParticipantAdmin ||
                       participant instanceof Api.ChannelParticipantCreator;

        members.push({
          id: user.id.toString(),
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown',
          username: user.username ?? undefined,
          isAdmin,
        });
      }
    }

    return members;
  } else if (entity instanceof Api.Chat) {
    const fullChat = await client.invoke(
      new Api.messages.GetFullChat({ chatId: entity.id })
    );

    if (!('fullChat' in fullChat) || !(fullChat.fullChat instanceof Api.ChatFull)) {
      return [];
    }

    const members: { id: string; name: string; username?: string; isAdmin: boolean }[] = [];

    if (fullChat.fullChat.participants instanceof Api.ChatParticipants) {
      for (const participant of fullChat.fullChat.participants.participants) {
        const userId = participant.userId;
        const user = fullChat.users.find(
          (u): u is Api.User => u instanceof Api.User && u.id.equals(userId)
        );

        if (user) {
          const isAdmin = participant instanceof Api.ChatParticipantAdmin ||
                         participant instanceof Api.ChatParticipantCreator;

          if (!adminsOnly || isAdmin) {
            members.push({
              id: user.id.toString(),
              name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown',
              username: user.username ?? undefined,
              isAdmin,
            });
          }
        }
      }
    }

    return members;
  }

  throw new Error('Not a group chat');
}

export async function getAdminGroups(client: TelegramClient): Promise<ChatInfo[]> {
  const dialogs = await client.getDialogs({ limit: 500 });
  const adminGroups: ChatInfo[] = [];

  for (const dialog of dialogs) {
    if (dialog.isGroup || dialog.isChannel) {
      const entity = dialog.entity;

      if (entity instanceof Api.Channel) {
        if (entity.adminRights || entity.creator) {
          adminGroups.push({
            id: dialog.id?.toString() || '',
            title: dialog.title || 'Unknown',
            type: entity.megagroup ? 'supergroup' : 'channel',
            username: entity.username ?? undefined,
            unreadCount: dialog.unreadCount,
          });
        }
      } else if (entity instanceof Api.Chat) {
        // For regular groups, we need to check participants
        try {
          const fullChat = await client.invoke(
            new Api.messages.GetFullChat({ chatId: entity.id })
          );

          const me = await client.getMe() as Api.User;

          if ('fullChat' in fullChat && fullChat.fullChat instanceof Api.ChatFull) {
            if (fullChat.fullChat.participants instanceof Api.ChatParticipants) {
              const myParticipant = fullChat.fullChat.participants.participants.find(
                p => p.userId.equals(me.id)
              );

              if (myParticipant instanceof Api.ChatParticipantAdmin ||
                  myParticipant instanceof Api.ChatParticipantCreator) {
                adminGroups.push({
                  id: dialog.id?.toString() || '',
                  title: dialog.title || 'Unknown',
                  type: 'group',
                  unreadCount: dialog.unreadCount,
                });
              }
            }
          }
        } catch {
          // Skip if we can't get chat info
        }
      }
    }
  }

  return adminGroups;
}

type ResolvedEntity = Api.User | Api.Chat | Api.Channel;

async function resolveChat(client: TelegramClient, identifier: string): Promise<ResolvedEntity> {
  // Check if it's a username (starts with @)
  if (identifier.startsWith('@')) {
    const entity = await client.getEntity(identifier);
    if (entity instanceof Api.User || entity instanceof Api.Chat || entity instanceof Api.Channel) {
      return entity;
    }
    throw new Error(`Invalid entity type for: ${identifier}`);
  }

  // Try to find by exact name in dialogs
  const dialogs = await client.getDialogs({ limit: 500 });

  // First try exact match
  let dialog = dialogs.find(d => d.title?.toLowerCase() === identifier.toLowerCase());

  // Then try partial match
  if (!dialog) {
    dialog = dialogs.find(d => d.title?.toLowerCase().includes(identifier.toLowerCase()));
  }

  if (dialog && dialog.entity) {
    const entity = dialog.entity;
    if (entity instanceof Api.User || entity instanceof Api.Chat || entity instanceof Api.Channel) {
      return entity;
    }
  }

  // Try as a direct entity identifier
  try {
    const entity = await client.getEntity(identifier);
    if (entity instanceof Api.User || entity instanceof Api.Chat || entity instanceof Api.Channel) {
      return entity;
    }
    throw new Error(`Invalid entity type for: ${identifier}`);
  } catch {
    throw new Error(`Chat not found: ${identifier}`);
  }
}

function getChatTitle(entity: ResolvedEntity): string {
  if (entity instanceof Api.User) {
    return entity.firstName || entity.username || 'Unknown';
  }
  if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
    return entity.title;
  }
  return 'Unknown';
}

// --- Mute/Unmute Functions ---

const MAX_INT32 = 2147483647;

export function parseDuration(duration: string): { seconds: number; isForever: boolean } {
  if (duration === 'forever') {
    return { seconds: 0, isForever: true };
  }

  const match = duration.match(/^(\d+)(m|h|d|w)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use formats like 1h, 8h, 1d, 1w, or "forever"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let seconds: number;
  switch (unit) {
    case 'm': seconds = value * 60; break;
    case 'h': seconds = value * 3600; break;
    case 'd': seconds = value * 86400; break;
    case 'w': seconds = value * 604800; break;
    default: throw new Error(`Unknown duration unit: ${unit}`);
  }

  return { seconds, isForever: false };
}

// Keep for backward compatibility
export function parseDurationToSeconds(duration: string): number {
  if (duration === 'forever') {
    return MAX_INT32;
  }
  return parseDuration(duration).seconds;
}

export async function muteChat(
  client: TelegramClient,
  chatIdentifier: string,
  duration: string = 'forever'
): Promise<{ success: boolean; message: string }> {
  const chat = await resolveChat(client, chatIdentifier);
  const chatTitle = getChatTitle(chat);

  let inputPeer: Api.TypeInputNotifyPeer;
  if (chat instanceof Api.User) {
    inputPeer = new Api.InputNotifyPeer({
      peer: new Api.InputPeerUser({ userId: chat.id, accessHash: chat.accessHash || bigInt(0) })
    });
  } else if (chat instanceof Api.Chat) {
    inputPeer = new Api.InputNotifyPeer({
      peer: new Api.InputPeerChat({ chatId: chat.id })
    });
  } else if (chat instanceof Api.Channel) {
    inputPeer = new Api.InputNotifyPeer({
      peer: new Api.InputPeerChannel({ channelId: chat.id, accessHash: chat.accessHash || bigInt(0) })
    });
  } else {
    return { success: false, message: 'Unknown chat type' };
  }

  try {
    const parsed = parseDuration(duration);
    // For "forever", use MAX_INT32 directly; otherwise add seconds to current time
    const muteUntil = parsed.isForever
      ? MAX_INT32
      : Math.floor(Date.now() / 1000) + parsed.seconds;

    await client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: inputPeer,
        settings: new Api.InputPeerNotifySettings({
          muteUntil,
        }),
      })
    );

    const durationText = duration === 'forever' ? 'forever' : `for ${duration}`;
    return { success: true, message: `Muted "${chatTitle}" ${durationText}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}

export async function unmuteChat(
  client: TelegramClient,
  chatIdentifier: string
): Promise<{ success: boolean; message: string }> {
  const chat = await resolveChat(client, chatIdentifier);
  const chatTitle = getChatTitle(chat);

  let inputPeer: Api.TypeInputNotifyPeer;
  if (chat instanceof Api.User) {
    inputPeer = new Api.InputNotifyPeer({
      peer: new Api.InputPeerUser({ userId: chat.id, accessHash: chat.accessHash || bigInt(0) })
    });
  } else if (chat instanceof Api.Chat) {
    inputPeer = new Api.InputNotifyPeer({
      peer: new Api.InputPeerChat({ chatId: chat.id })
    });
  } else if (chat instanceof Api.Channel) {
    inputPeer = new Api.InputNotifyPeer({
      peer: new Api.InputPeerChannel({ channelId: chat.id, accessHash: chat.accessHash || bigInt(0) })
    });
  } else {
    return { success: false, message: 'Unknown chat type' };
  }

  try {
    await client.invoke(
      new Api.account.UpdateNotifySettings({
        peer: inputPeer,
        settings: new Api.InputPeerNotifySettings({
          muteUntil: 0,
        }),
      })
    );

    return { success: true, message: `Unmuted "${chatTitle}"` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}

// --- Folder Functions ---

export interface FolderInfo {
  id: number;
  title: string;
  includedChats: { id: string; title: string; type: string }[];
  excludedChats: { id: string; title: string; type: string }[];
  emoticon?: string;
}

export async function getFolders(client: TelegramClient): Promise<FolderInfo[]> {
  const result = await client.invoke(new Api.messages.GetDialogFilters());

  const folders: FolderInfo[] = [];

  for (const filter of result.filters) {
    if (filter instanceof Api.DialogFilter) {
      const includedChats: { id: string; title: string; type: string }[] = [];
      const excludedChats: { id: string; title: string; type: string }[] = [];

      // Resolve included peers
      for (const peer of filter.includePeers) {
        try {
          const entity = await client.getEntity(peer);
          if (entity instanceof Api.User || entity instanceof Api.Chat || entity instanceof Api.Channel) {
            includedChats.push({
              id: entity.id.toString(),
              title: getChatTitleFromEntity(entity),
              type: getEntityType(entity),
            });
          }
        } catch {
          // Skip unresolvable peers
        }
      }

      // Resolve excluded peers
      for (const peer of filter.excludePeers) {
        try {
          const entity = await client.getEntity(peer);
          if (entity instanceof Api.User || entity instanceof Api.Chat || entity instanceof Api.Channel) {
            excludedChats.push({
              id: entity.id.toString(),
              title: getChatTitleFromEntity(entity),
              type: getEntityType(entity),
            });
          }
        } catch {
          // Skip unresolvable peers
        }
      }

      // Handle title which can be string or TextWithEntities
      const titleStr = typeof filter.title === 'string' ? filter.title : (filter.title?.text ?? 'Untitled');

      folders.push({
        id: filter.id,
        title: titleStr,
        includedChats,
        excludedChats,
        emoticon: filter.emoticon ?? undefined,
      });
    }
  }

  return folders;
}

export async function getFolder(
  client: TelegramClient,
  folderName: string
): Promise<FolderInfo | null> {
  const folders = await getFolders(client);
  return folders.find(f => f.title.toLowerCase() === folderName.toLowerCase()) || null;
}

export async function addChatToFolder(
  client: TelegramClient,
  folderName: string,
  chatIdentifier: string
): Promise<{ success: boolean; message: string }> {
  const result = await client.invoke(new Api.messages.GetDialogFilters());

  let targetFilter: Api.DialogFilter | null = null;
  for (const filter of result.filters) {
    if (filter instanceof Api.DialogFilter) {
      const filterTitle = typeof filter.title === 'string' ? filter.title : (filter.title?.text ?? '');
      if (filterTitle.toLowerCase() === folderName.toLowerCase()) {
        targetFilter = filter;
        break;
      }
    }
  }

  if (!targetFilter) {
    return { success: false, message: `Folder not found: ${folderName}` };
  }

  const chat = await resolveChat(client, chatIdentifier);
  const chatTitle = getChatTitle(chat);
  const folderTitle = typeof targetFilter.title === 'string' ? targetFilter.title : (targetFilter.title?.text ?? 'Untitled');

  // Create the input peer for the chat
  let inputPeer: Api.TypeInputPeer;
  if (chat instanceof Api.User) {
    inputPeer = new Api.InputPeerUser({ userId: chat.id, accessHash: chat.accessHash || bigInt(0) });
  } else if (chat instanceof Api.Chat) {
    inputPeer = new Api.InputPeerChat({ chatId: chat.id });
  } else if (chat instanceof Api.Channel) {
    inputPeer = new Api.InputPeerChannel({ channelId: chat.id, accessHash: chat.accessHash || bigInt(0) });
  } else {
    return { success: false, message: 'Unknown chat type' };
  }

  // Check if already included
  for (const peer of targetFilter.includePeers) {
    try {
      const entity = await client.getEntity(peer);
      if (entity.id.equals(chat.id)) {
        return { success: false, message: `"${chatTitle}" is already in folder "${folderTitle}"` };
      }
    } catch {
      // Skip
    }
  }

  // Add to includePeers
  const newIncludePeers = [...targetFilter.includePeers, inputPeer];

  try {
    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: targetFilter.id,
        filter: new Api.DialogFilter({
          id: targetFilter.id,
          title: targetFilter.title,
          pinnedPeers: targetFilter.pinnedPeers,
          includePeers: newIncludePeers,
          excludePeers: targetFilter.excludePeers,
          contacts: targetFilter.contacts,
          nonContacts: targetFilter.nonContacts,
          groups: targetFilter.groups,
          broadcasts: targetFilter.broadcasts,
          bots: targetFilter.bots,
          excludeMuted: targetFilter.excludeMuted,
          excludeRead: targetFilter.excludeRead,
          excludeArchived: targetFilter.excludeArchived,
          emoticon: targetFilter.emoticon,
        }),
      })
    );

    return { success: true, message: `Added "${chatTitle}" to folder "${folderTitle}"` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}

export async function removeChatFromFolder(
  client: TelegramClient,
  folderName: string,
  chatIdentifier: string
): Promise<{ success: boolean; message: string }> {
  const result = await client.invoke(new Api.messages.GetDialogFilters());

  let targetFilter: Api.DialogFilter | null = null;
  for (const filter of result.filters) {
    if (filter instanceof Api.DialogFilter) {
      const filterTitle = typeof filter.title === 'string' ? filter.title : (filter.title?.text ?? '');
      if (filterTitle.toLowerCase() === folderName.toLowerCase()) {
        targetFilter = filter;
        break;
      }
    }
  }

  if (!targetFilter) {
    return { success: false, message: `Folder not found: ${folderName}` };
  }

  const chat = await resolveChat(client, chatIdentifier);
  const chatTitle = getChatTitle(chat);
  const folderTitle = typeof targetFilter.title === 'string' ? targetFilter.title : (targetFilter.title?.text ?? 'Untitled');

  // Find and remove from includePeers
  let found = false;
  const newIncludePeers: Api.TypeInputPeer[] = [];

  for (const peer of targetFilter.includePeers) {
    try {
      const entity = await client.getEntity(peer);
      if (entity.id.equals(chat.id)) {
        found = true;
        continue; // Skip this peer (remove it)
      }
    } catch {
      // Keep unresolvable peers
    }
    newIncludePeers.push(peer);
  }

  if (!found) {
    return { success: false, message: `"${chatTitle}" is not in folder "${folderTitle}"` };
  }

  try {
    await client.invoke(
      new Api.messages.UpdateDialogFilter({
        id: targetFilter.id,
        filter: new Api.DialogFilter({
          id: targetFilter.id,
          title: targetFilter.title,
          pinnedPeers: targetFilter.pinnedPeers,
          includePeers: newIncludePeers,
          excludePeers: targetFilter.excludePeers,
          contacts: targetFilter.contacts,
          nonContacts: targetFilter.nonContacts,
          groups: targetFilter.groups,
          broadcasts: targetFilter.broadcasts,
          bots: targetFilter.bots,
          excludeMuted: targetFilter.excludeMuted,
          excludeRead: targetFilter.excludeRead,
          excludeArchived: targetFilter.excludeArchived,
          emoticon: targetFilter.emoticon,
        }),
      })
    );

    return { success: true, message: `Removed "${chatTitle}" from folder "${folderTitle}"` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg };
  }
}

function getChatTitleFromEntity(entity: Api.User | Api.Chat | Api.Channel | Api.ChatForbidden | Api.ChannelForbidden): string {
  if (entity instanceof Api.User) {
    return entity.firstName || entity.username || 'Unknown User';
  }
  if (entity instanceof Api.Chat || entity instanceof Api.Channel) {
    return entity.title;
  }
  if (entity instanceof Api.ChatForbidden || entity instanceof Api.ChannelForbidden) {
    return entity.title;
  }
  return 'Unknown';
}

function getEntityType(entity: Api.User | Api.Chat | Api.Channel | Api.ChatForbidden | Api.ChannelForbidden): string {
  if (entity instanceof Api.User) return 'user';
  if (entity instanceof Api.Chat) return 'group';
  if (entity instanceof Api.Channel) return entity.megagroup ? 'supergroup' : 'channel';
  return 'unknown';
}

// --- Kick Function ---

export async function kickUser(
  client: TelegramClient,
  chatIdentifier: string,
  userIdentifier: string
): Promise<{ success: boolean; message: string }> {
  const chat = await resolveChat(client, chatIdentifier);

  // Get the user to kick
  let user: Api.User;
  try {
    const entity = await client.getEntity(userIdentifier);
    if (!(entity instanceof Api.User)) {
      return { success: false, message: 'Target is not a user' };
    }
    user = entity;
  } catch (e) {
    return { success: false, message: `User not found: ${userIdentifier}` };
  }

  if (chat instanceof Api.Channel) {
    // For channels/supergroups, use EditBanned
    try {
      await client.invoke(
        new Api.channels.EditBanned({
          channel: chat,
          participant: user,
          bannedRights: new Api.ChatBannedRights({
            untilDate: 0, // Permanent
            viewMessages: true,
            sendMessages: true,
            sendMedia: true,
            sendStickers: true,
            sendGifs: true,
            sendGames: true,
            sendInline: true,
            embedLinks: true,
          }),
        })
      );
      return { success: true, message: `Kicked ${user.username || user.firstName} from ${chat.title}` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ADMIN') || msg.includes('RIGHT')) {
        return { success: false, message: 'Not admin or insufficient rights' };
      }
      if (msg.includes('USER_NOT_PARTICIPANT')) {
        return { success: false, message: 'User is not a member' };
      }
      return { success: false, message: msg };
    }
  } else if (chat instanceof Api.Chat) {
    // For regular groups, use DeleteChatUser
    try {
      await client.invoke(
        new Api.messages.DeleteChatUser({
          chatId: chat.id,
          userId: user,
          revokeHistory: false,
        })
      );
      return { success: true, message: `Kicked ${user.username || user.firstName} from ${chat.title}` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ADMIN') || msg.includes('RIGHT')) {
        return { success: false, message: 'Not admin or insufficient rights' };
      }
      if (msg.includes('USER_NOT_PARTICIPANT')) {
        return { success: false, message: 'User is not a member' };
      }
      return { success: false, message: msg };
    }
  }

  return { success: false, message: 'Not a group chat' };
}

// --- Admin Management Functions ---

async function resolveUser(client: TelegramClient, userIdentifier: string): Promise<Api.User> {
  const entity = await client.getEntity(userIdentifier);
  if (!(entity instanceof Api.User)) {
    throw new Error('Target is not a user');
  }
  return entity;
}

function userLabel(user: Api.User): string {
  return user.username ? `@${user.username}` : (user.firstName || user.id.toString());
}

function friendlyAdminError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('USER_NOT_PARTICIPANT') || msg.includes('USER_NOT_MUTUAL_CONTACT')) {
    return 'The target must be a member of the group first.';
  }
  if (msg.includes('CHAT_ADMIN_REQUIRED') || msg.includes('ADMIN_RIGHT')) {
    return 'You lack the rights to add admins in this group.';
  }
  if (msg.includes('USER_PRIVACY_RESTRICTED')) {
    return "The target's privacy settings prevent this action.";
  }
  if (msg.includes('USER_CREATOR')) {
    return 'That user is the group creator and cannot be changed this way.';
  }
  if (msg.includes('USER_ADMIN_INVALID')) {
    return "You can't edit this user's admin status (they may have been promoted by someone else).";
  }
  if (msg.includes('RIGHT_FORBIDDEN')) {
    return 'One of the requested admin rights is not allowed in this group.';
  }
  if (msg.includes('ADMINS_TOO_MUCH')) {
    return 'This group already has the maximum number of admins.';
  }
  return msg;
}

function friendlyTransferError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('PASSWORD_HASH_INVALID')) {
    return 'Incorrect 2FA password.';
  }
  if (msg.includes('PASSWORD_MISSING')) {
    return 'No 2FA password is set on your account. Enable two-step verification first.';
  }
  if (msg.includes('SRP_PASSWORD_CHANGED') || msg.includes('SRP_ID_INVALID')) {
    return 'Your 2FA password state changed mid-request. Please try again.';
  }
  if (msg.includes('PASSWORD_TOO_FRESH')) {
    return 'Your 2FA password was set too recently. Telegram blocks ownership transfer for ~7 days after enabling or changing it.';
  }
  if (msg.includes('SESSION_TOO_FRESH') || msg.includes('FRESH_CHANGE_ADMINS_FORBIDDEN')) {
    return 'This login session is too new. Telegram blocks ownership transfer for ~24h after a new login.';
  }
  if (msg.includes('CHAT_ADMIN_REQUIRED') || msg.includes('CHANNEL_PRIVATE')) {
    return 'You must be the creator of this group to transfer ownership.';
  }
  if (msg.includes('USER_NOT_PARTICIPANT') || msg.includes('USER_NOT_MUTUAL_CONTACT')) {
    return 'The target must be a member of the group first.';
  }
  if (msg.includes('USER_PRIVACY_RESTRICTED')) {
    return "The target's privacy settings prevent the transfer. Ask them to adjust their privacy settings or add you as a contact.";
  }
  if (msg.includes('USER_CHANNELS_TOO_MUCH')) {
    return 'The target is in too many groups/channels and cannot receive ownership right now.';
  }
  if (msg.includes('CHANNELS_ADMIN_PUBLIC_TOO_MUCH')) {
    return 'The target already owns too many public groups/channels.';
  }
  return msg;
}

export async function promoteAdmin(
  client: TelegramClient,
  chatIdentifier: string,
  userIdentifier: string,
  options: { rank?: string; canAddAdmins?: boolean } = {}
): Promise<{ success: boolean; message: string }> {
  const chat = await resolveChat(client, chatIdentifier);

  let user: Api.User;
  try {
    user = await resolveUser(client, userIdentifier);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Target is not a user') {
      return { success: false, message: msg };
    }
    return { success: false, message: `User not found: ${userIdentifier}` };
  }

  if (chat instanceof Api.Channel) {
    try {
      await client.invoke(
        new Api.channels.EditAdmin({
          channel: chat,
          userId: user,
          adminRights: new Api.ChatAdminRights({
            changeInfo: true,
            postMessages: true,
            editMessages: true,
            deleteMessages: true,
            banUsers: true,
            inviteUsers: true,
            pinMessages: true,
            manageCall: true,
            other: true,
            addAdmins: options.canAddAdmins ?? false,
          }),
          rank: options.rank ?? '',
        })
      );
      return { success: true, message: `Promoted ${userLabel(user)} to admin in "${chat.title}"` };
    } catch (e: unknown) {
      return { success: false, message: friendlyAdminError(e) };
    }
  } else if (chat instanceof Api.Chat) {
    // Basic groups only support a single all-or-nothing admin toggle.
    try {
      await client.invoke(
        new Api.messages.EditChatAdmin({
          chatId: chat.id,
          userId: user,
          isAdmin: true,
        })
      );
      const ignoredNote = (options.rank || options.canAddAdmins)
        ? ' (basic groups grant full admin rights; --rank/--add-admins ignored)'
        : '';
      return { success: true, message: `Promoted ${userLabel(user)} to admin in "${chat.title}"${ignoredNote}` };
    } catch (e: unknown) {
      return { success: false, message: friendlyAdminError(e) };
    }
  }

  return { success: false, message: 'Not a group chat' };
}

export async function transferOwnership(
  client: TelegramClient,
  chatIdentifier: string,
  userIdentifier: string,
  password: string
): Promise<{ success: boolean; message: string }> {
  const chat = await resolveChat(client, chatIdentifier);

  if (!(chat instanceof Api.Channel)) {
    return {
      success: false,
      message: 'Ownership transfer is only supported for supergroups and channels. Convert a basic group to a supergroup first.',
    };
  }

  let user: Api.User;
  try {
    user = await resolveUser(client, userIdentifier);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Target is not a user') {
      return { success: false, message: msg };
    }
    return { success: false, message: `User not found: ${userIdentifier}` };
  }

  let passwordInfo: Api.account.Password;
  try {
    passwordInfo = await client.invoke(new Api.account.GetPassword());
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : String(e) };
  }

  if (!passwordInfo.hasPassword) {
    return {
      success: false,
      message: 'Ownership transfer requires two-step verification (a cloud password) on your account. Enable it in Telegram > Settings > Privacy and Security first.',
    };
  }

  try {
    const srpCheck = await computeCheck(passwordInfo, password);
    await client.invoke(
      new Api.channels.EditCreator({
        channel: chat,
        userId: user,
        password: srpCheck,
      })
    );
    return { success: true, message: `Transferred ownership of "${chat.title}" to ${userLabel(user)}` };
  } catch (e: unknown) {
    return { success: false, message: friendlyTransferError(e) };
  }
}
