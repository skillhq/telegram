---
name: telegram
description: Telegram CLI for reading, searching, sending messages, streaming (firehose), managing groups, and syncing chat history. Use when the user asks about Telegram messages, wants to check inbox, search chats, send messages, stream real-time messages, mute/unmute chats, kick users, export history, or look up contacts and groups.
---

# 📬 Telegram CLI

Fast Telegram CLI for reading, searching, and sending messages.

## 🎯 When to Use

Use this skill when the user:
- Asks to check Telegram messages or inbox
- Wants to search Telegram for a topic/keyword
- Wants to send a Telegram message or reply to one
- Asks about a Telegram group, contact, or chat
- Wants to see unread messages
- Needs to look up group members or admins
- Wants to mute/unmute a noisy chat or group
- Needs to kick/remove a user from a group
- Wants to stream real-time messages (firehose)
- Wants to export or sync chat history to files
- Asks to organize chats into folders
- Wants to check their logged-in account or session status

## 📦 Install

```bash
npm install -g @skillhq/telegram
```

## 🔐 Authentication

First-time setup requires API credentials from https://my.telegram.org/apps

```bash
telegram auth                                # First-time login
telegram logout                              # Clear saved session
telegram check                               # Verify session is valid
telegram whoami                              # Show logged-in account
telegram whoami --json                       # Account info as JSON
```

## 📖 Commands

### Reading Messages
```bash
telegram inbox                               # Unread messages summary
telegram chats                               # List all chats
telegram chats --type group                  # Filter: user, group, supergroup, channel
telegram chats -n 200                        # List up to 200 chats
telegram read "ChatName" -n 50               # Read last 50 messages
telegram read "ChatName" --since "1h"        # Messages from last hour
telegram read "ChatName" --until "2h"        # Messages up to 2 hours ago
telegram read @username -n 20                # Read DM with user
telegram read 123456789 -n 10               # Read by chat ID
```

### Searching
```bash
telegram search "query" --chat "ChatName"    # Search within chat
telegram search "query" --all                # Search all chats (global)
telegram search "query" -n 20               # Limit results
```

### Sending Messages
```bash
telegram send @username "message"            # Send DM
telegram send "GroupName" "message"          # Send to group
telegram reply "ChatName" 12345 "response"   # Reply to message ID
```

### Contacts & Groups
```bash
telegram contact @username                   # Get contact info
telegram members "GroupName"                 # List group members
telegram members "GroupName" -n 500          # Fetch up to 500 members
telegram admins "GroupName"                  # List admins only
telegram groups                              # List all groups
telegram groups --admin                      # Groups where you're admin
telegram kick "GroupName" @username           # Remove user from group
```

### Muting
```bash
telegram mute "ChatName"                     # Mute forever
telegram mute "ChatName" -d 1h               # Mute for 1 hour
telegram mute @username -d 8h                # Mute DM for 8 hours
telegram mute "GroupName" -d 1d              # Mute for 1 day
telegram unmute "ChatName"                   # Unmute
```

### Folders
```bash
telegram folders                             # List all folders
telegram folder "Work"                       # Show chats in folder
telegram folder-add "Work" "ProjectChat"     # Add chat to folder
telegram folder-remove "Work" "ProjectChat"  # Remove chat from folder
```

### Streaming (Firehose)
```bash
telegram firehose                            # Stream all incoming messages as NDJSON
telegram firehose --chat "ChatName"          # Stream only one chat
telegram firehose --include-outgoing         # Include your own outgoing messages
```

### Sync / Export
```bash
telegram sync                                # Sync last 7 days to ./telegram-sync
telegram sync --days 30                      # Sync last 30 days
telegram sync --chat "ChatName"              # Sync specific chat only
telegram sync --output ~/exports             # Custom output directory
```

## 📤 Output Formats

Most commands support multiple output formats:

| Flag         | Use Case                                    |
|--------------|---------------------------------------------|
| *(default)*  | Human-readable terminal output              |
| `--json`     | Structured JSON for programmatic processing |
| `--markdown` | Markdown-formatted for display or export    |

```bash
telegram inbox --json                        # JSON format
telegram inbox --markdown                    # Markdown format
telegram read "Chat" --json                  # JSON with messages array
telegram read "Chat" --markdown              # Markdown with messages
telegram chats --json                        # JSON with chat list
telegram members "Group" --markdown          # Markdown member list
```

**Supported on:** `inbox`, `read`, `search`, `chats`, `members`, `groups`, `contact`, `whoami`

## 🤖 AI Agent Guidance

When using this CLI as an AI agent:

- **For processing data** (counting, filtering, extracting): use `--json`
- **For displaying to the user**: use default or `--markdown`
- **Chat identification**: names are partial-matched (e.g., "MetaDAO" matches "MetaDAO Community"), usernames must start with `@`, numeric IDs also work
- **Read operations are safe** to run without confirmation
- **Write operations** (`send`, `reply`, `kick`) should be confirmed with the user before executing
- **Rate limiting**: avoid rapid successive calls; the Telegram API has rate limits
- **Large groups**: use `-n` to limit `members` output on very large groups

## 💡 Examples

Check inbox for unread messages:
```bash
telegram inbox
```

Read recent messages from a group:
```bash
telegram read "MetaDAO Community" -n 20
```

Get messages from the last 2 hours:
```bash
telegram read "Project Chat" --since "2h"
```

Search for a topic across all chats:
```bash
telegram search "futarchy" --all
```

Search within a specific chat:
```bash
telegram search "deadline" --chat "Work Team"
```

Send a message:
```bash
telegram send @username "Hello, checking in!"
```

Export a chat's history:
```bash
telegram sync --chat "Project Chat" --days 14 --output ~/exports
```

Filter chats by type:
```bash
telegram chats --type channel --json
```

Kick a user from a group:
```bash
telegram kick "My Group" @spammer
```

Stream real-time messages from a group:
```bash
telegram firehose --chat "Project Chat"
```

## 📝 Notes

- Chat names can be partial matches (e.g., "MetaDAO" matches "MetaDAO Community")
- Usernames must start with `@` (e.g., `@username`)
- Chat IDs (numeric) can be used anywhere a chat name is accepted
- Messages are returned in reverse chronological order (newest first)
- Time flags (`--since`, `--until`) accept formats like `"1h"`, `"30m"`, `"7d"`
- The `sync` command creates one markdown file per chat in the output directory
