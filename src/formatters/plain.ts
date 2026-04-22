import chalk from 'chalk';
import type { ChatInfo, MessageInfo, FolderInfo } from '../client.js';
import { formatMediaLabel } from '../client.js';

export function formatChats(chats: ChatInfo[]): string {
  const lines: string[] = [];

  for (const chat of chats) {
    const typeIcon = getTypeIcon(chat.type);
    const unread = chat.unreadCount > 0 ? chalk.red(` (${chat.unreadCount})`) : '';
    const username = chat.username ? chalk.gray(` @${chat.username}`) : '';

    lines.push(`${typeIcon} ${chalk.bold(chat.title)}${username}${unread}`);

    if (chat.lastMessage) {
      const preview = chat.lastMessage.substring(0, 60).replace(/\n/g, ' ');
      lines.push(chalk.gray(`   ${preview}${chat.lastMessage.length > 60 ? '...' : ''}`));
    }
  }

  return lines.join('\n');
}

export function formatMessages(messages: MessageInfo[], chatTitle?: string): string {
  const lines: string[] = [];

  if (chatTitle) {
    lines.push(chalk.bold.blue(`\n--- ${chatTitle} ---\n`));
  }

  for (const msg of messages) {
    const time = formatTime(msg.date);
    const sender = msg.isOutgoing ? chalk.green('You') : chalk.cyan(msg.sender);
    const reply = msg.replyToMsgId ? chalk.gray(` [reply to #${msg.replyToMsgId}]`) : '';

    const media = formatMediaLabel(msg.mediaType, msg.fileName, msg.fileSize);
    const text = msg.text || (media ? '' : chalk.gray('(no text)'));
    const display = media ? (text ? `[${media}] ${text}` : `[${media}]`) : text;

    lines.push(`${chalk.gray(time)} ${sender}${reply}:`);
    lines.push(`  ${display}`);
    lines.push(chalk.gray(`  #${msg.id}`));
    lines.push('');
  }

  return lines.join('\n');
}

export function formatContact(contact: {
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
  lines.push(chalk.bold(name));

  if (contact.username) {
    lines.push(chalk.cyan(`@${contact.username}`));
  }

  if (contact.phone) {
    lines.push(chalk.gray(`Phone: ${contact.phone}`));
  }

  if (contact.bio) {
    lines.push(chalk.gray(`Bio: ${contact.bio}`));
  }

  if (contact.isBot) {
    lines.push(chalk.yellow('Bot'));
  }

  if (contact.isMutualContact) {
    lines.push(chalk.green('Mutual contact'));
  }

  lines.push(chalk.gray(`ID: ${contact.id}`));

  return lines.join('\n');
}

export function formatMembers(
  members: { id: string; name: string; username?: string; isAdmin: boolean }[]
): string {
  const lines: string[] = [];

  for (const member of members) {
    const admin = member.isAdmin ? chalk.yellow(' [admin]') : '';
    const username = member.username ? chalk.gray(` @${member.username}`) : '';
    lines.push(`${chalk.bold(member.name)}${username}${admin}`);
  }

  return lines.join('\n');
}

export function formatInbox(chats: ChatInfo[]): string {
  const unreadChats = chats.filter(c => c.unreadCount > 0);

  if (unreadChats.length === 0) {
    return chalk.green('No unread messages!');
  }

  const lines: string[] = [];
  lines.push(chalk.bold(`\n${unreadChats.length} chats with unread messages:\n`));

  // Sort by unread count descending
  unreadChats.sort((a, b) => b.unreadCount - a.unreadCount);

  for (const chat of unreadChats) {
    const typeIcon = getTypeIcon(chat.type);
    lines.push(`${typeIcon} ${chalk.bold(chat.title)}: ${chalk.red(chat.unreadCount)} unread`);

    if (chat.lastMessage) {
      const preview = chat.lastMessage.substring(0, 50).replace(/\n/g, ' ');
      lines.push(chalk.gray(`   ${preview}${chat.lastMessage.length > 50 ? '...' : ''}`));
    }
  }

  return lines.join('\n');
}

export function formatUser(user: { firstName?: string; lastName?: string; username?: string; phone?: string }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const username = user.username ? chalk.cyan(`@${user.username}`) : '';
  const phone = user.phone ? chalk.gray(` (${user.phone})`) : '';

  return `${chalk.bold(name)} ${username}${phone}`;
}

function getTypeIcon(type: ChatInfo['type']): string {
  switch (type) {
    case 'user':
      return '👤';
    case 'group':
      return '👥';
    case 'supergroup':
      return '👥';
    case 'channel':
      return '📢';
    default:
      return '💬';
  }
}

function formatTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `Yesterday ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFolders(folders: FolderInfo[]): string {
  const lines: string[] = [];

  lines.push(chalk.bold(`\n${folders.length} folder${folders.length !== 1 ? 's' : ''}:\n`));

  for (const folder of folders) {
    const emoticon = folder.emoticon ? `${folder.emoticon} ` : '📁 ';
    const chatCount = folder.includedChats.length;
    lines.push(`${emoticon}${chalk.bold(folder.title)} ${chalk.gray(`(${chatCount} chat${chatCount !== 1 ? 's' : ''})`)}`);
  }

  return lines.join('\n');
}

export function formatFolder(folder: FolderInfo): string {
  const lines: string[] = [];

  const emoticon = folder.emoticon ? `${folder.emoticon} ` : '📁 ';
  lines.push(chalk.bold(`\n${emoticon}${folder.title}\n`));

  if (folder.includedChats.length === 0) {
    lines.push(chalk.gray('  No chats in this folder'));
  } else {
    lines.push(chalk.gray(`  ${folder.includedChats.length} chat${folder.includedChats.length !== 1 ? 's' : ''}:\n`));

    for (const chat of folder.includedChats) {
      const typeIcon = getFolderChatIcon(chat.type);
      lines.push(`  ${typeIcon} ${chat.title}`);
    }
  }

  return lines.join('\n');
}

function getFolderChatIcon(type: string): string {
  switch (type) {
    case 'user':
      return '👤';
    case 'group':
    case 'supergroup':
      return '👥';
    case 'channel':
      return '📢';
    default:
      return '💬';
  }
}
