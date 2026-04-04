import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
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
}

export async function getMessages(
  client: TelegramClient,
  chatIdentifier: string,
  options: { limit?: number; offsetId?: number; minDate?: Date; maxDate?: Date } = {}
): Promise<{ messages: MessageInfo[]; chatTitle: string }> {
  const { limit = 50, offsetId, minDate, maxDate } = options;

  // Find the chat by name or username
  const entity = await resolveChat(client, chatIdentifier);
  const chatTitle = getChatTitle(entity);

  const messages: MessageInfo[] = [];

  // Use iterMessages for better control over parameters
  const iterParams: { limit: number; offsetId?: number; reverse?: boolean } = {
    limit: limit * 2, // Get more to filter by date
  };

  if (offsetId) {
    iterParams.offsetId = offsetId;
  }

  const result = await client.getMessages(entity, iterParams);

  for (const msg of result) {
    if (msg instanceof Api.Message) {
      const msgDate = new Date(msg.date * 1000);

      // Filter by date if specified
      if (minDate && msgDate < minDate) continue;
      if (maxDate && msgDate > maxDate) continue;
      if (messages.length >= limit) break;

      let sender = 'Unknown';
      let senderId: string | undefined;

      if (msg.fromId) {
        try {
          const senderEntity = await client.getEntity(msg.fromId);
          if (senderEntity instanceof Api.User) {
            sender = senderEntity.firstName || senderEntity.username || 'Unknown';
            senderId = senderEntity.id.toString();
          } else if (senderEntity instanceof Api.Channel || senderEntity instanceof Api.Chat) {
            sender = (senderEntity as Api.Channel | Api.Chat).title || 'Unknown';
            senderId = senderEntity.id.toString();
          }
        } catch {
          // Ignore entity resolution errors
        }
      }

      messages.push({
        id: msg.id,
        date: msgDate,
        sender,
        senderId,
        text: msg.message || '',
        replyToMsgId: msg.replyTo?.replyToMsgId,
        isOutgoing: msg.out ?? false,
      });
    }
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

export type ResolvedEntity = Api.User | Api.Chat | Api.Channel;

export async function resolveChat(client: TelegramClient, identifier: string): Promise<ResolvedEntity> {
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

export function getChatTitle(entity: ResolvedEntity): string {
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
