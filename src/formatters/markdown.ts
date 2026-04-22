import type { ChatInfo, MessageInfo } from '../client.js';
import { formatMediaLabel } from '../client.js';

export function formatChatsMarkdown(chats: ChatInfo[]): string {
  const lines: string[] = ['# Telegram Chats\n'];

  for (const chat of chats) {
    const type = chat.type.charAt(0).toUpperCase() + chat.type.slice(1);
    const unread = chat.unreadCount > 0 ? ` **(${chat.unreadCount} unread)**` : '';
    const username = chat.username ? ` (@${chat.username})` : '';

    lines.push(`## ${chat.title}${username}${unread}`);
    lines.push(`- Type: ${type}`);
    lines.push(`- ID: ${chat.id}`);

    if (chat.lastMessage) {
      const preview = chat.lastMessage.substring(0, 100).replace(/\n/g, ' ');
      lines.push(`- Last message: ${preview}${chat.lastMessage.length > 100 ? '...' : ''}`);
    }

    if (chat.lastMessageDate) {
      lines.push(`- Last activity: ${chat.lastMessageDate.toISOString()}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

export function formatMessagesMarkdown(messages: MessageInfo[], chatTitle?: string): string {
  const lines: string[] = [];

  if (chatTitle) {
    lines.push(`# Messages from ${chatTitle}\n`);
  }

  for (const msg of messages) {
    const time = msg.date.toISOString();
    const sender = msg.isOutgoing ? 'You' : msg.sender;
    const reply = msg.replyToMsgId ? ` (reply to #${msg.replyToMsgId})` : '';

    const media = formatMediaLabel(msg.mediaType, msg.fileName, msg.fileSize);
    const text = msg.text || (media ? '' : '*(no text)*');
    const display = media ? (text ? `[${media}] ${text}` : `[${media}]`) : text;

    lines.push(`### ${sender} - ${time}${reply}`);
    lines.push(`*Message ID: ${msg.id}*\n`);
    lines.push(display);
    lines.push('\n---\n');
  }

  return lines.join('\n');
}

export function formatContactMarkdown(contact: {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  bio?: string;
  isBot: boolean;
  isMutualContact: boolean;
}): string {
  const lines: string[] = [];

  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
  lines.push(`# ${name}\n`);

  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| ID | ${contact.id} |`);

  if (contact.username) {
    lines.push(`| Username | @${contact.username} |`);
  }

  if (contact.phone) {
    lines.push(`| Phone | ${contact.phone} |`);
  }

  lines.push(`| Bot | ${contact.isBot ? 'Yes' : 'No'} |`);
  lines.push(`| Mutual Contact | ${contact.isMutualContact ? 'Yes' : 'No'} |`);

  if (contact.bio) {
    lines.push(`\n## Bio\n${contact.bio}`);
  }

  return lines.join('\n');
}

export function formatMembersMarkdown(
  members: { id: string; name: string; username?: string; isAdmin: boolean }[]
): string {
  const lines: string[] = ['# Group Members\n'];

  lines.push('| Name | Username | Role |');
  lines.push('|------|----------|------|');

  for (const member of members) {
    const username = member.username ? `@${member.username}` : '-';
    const role = member.isAdmin ? 'Admin' : 'Member';
    lines.push(`| ${member.name} | ${username} | ${role} |`);
  }

  return lines.join('\n');
}

export function formatInboxMarkdown(chats: ChatInfo[]): string {
  const unreadChats = chats.filter(c => c.unreadCount > 0);

  if (unreadChats.length === 0) {
    return '# Inbox\n\nNo unread messages!';
  }

  const lines: string[] = ['# Inbox\n'];
  lines.push(`**${unreadChats.length} chats with unread messages**\n`);

  // Sort by unread count descending
  unreadChats.sort((a, b) => b.unreadCount - a.unreadCount);

  lines.push('| Chat | Type | Unread | Last Message |');
  lines.push('|------|------|--------|--------------|');

  for (const chat of unreadChats) {
    const preview = chat.lastMessage
      ? chat.lastMessage.substring(0, 30).replace(/\n/g, ' ') + (chat.lastMessage.length > 30 ? '...' : '')
      : '-';
    lines.push(`| ${chat.title} | ${chat.type} | ${chat.unreadCount} | ${preview} |`);
  }

  return lines.join('\n');
}
