# telegram - Telegram CLI

Fast Telegram CLI for reading, searching, and sending messages. Designed for both interactive use and AI agent integration.

## Installation

### As a Claude Code Skill (recommended)

```bash
npx skills add https://github.com/skillhq/telegram --skill telegram
```

### Global npm install

```bash
npm install -g @skillhq/telegram
```

### From source

```bash
git clone https://github.com/skillhq/telegram.git
cd telegram
npm install
npm run build
npm link
```

## Authentication

First, get your API credentials:
1. Go to https://my.telegram.org/apps
2. Log in with your phone number
3. Create a new application
4. Copy the `api_id` and `api_hash`

Then authenticate:

```bash
telegram auth
```

## Commands

### Auth & Status

```bash
telegram whoami                              # Show logged-in account
telegram check                               # Verify session/credentials
```

### Reading

```bash
telegram chats                               # List all chats
telegram chats --type group                  # Filter by type (user, group, supergroup, channel)
telegram read "MetaDAO Community" -n 50      # Read last 50 messages
telegram read "MetaDAO" --since "1h"         # Messages from last hour
telegram read @username -n 20                # Read DM with user
telegram search "futarchy" --chat "MetaDAO"  # Search within chat
telegram search "futarchy" --all             # Search all chats
telegram inbox                               # Unread messages summary
```

### Writing

```bash
telegram send @username "Hello"              # Send DM
telegram send "GroupName" "Hello everyone"   # Send to group
telegram reply "ChatName" 12345 "Response"   # Reply to message ID
```

### Contacts & Groups

```bash
telegram contact @username                   # Get contact info
telegram members "GroupName"                 # List group members
telegram admins "GroupName"                  # List admins only
telegram groups                              # List all groups
telegram groups --admin                      # Groups where you're admin
```

### Muting

```bash
telegram mute "ChatName"                     # Mute forever
telegram mute "ChatName" -d 1h              # Mute for 1 hour
telegram mute @username -d 8h               # Mute DM for 8 hours
telegram unmute "ChatName"                   # Unmute
```

### Folders

```bash
telegram folders                             # List all folders
telegram folder "Work"                       # Show chats in folder
telegram folder-add "Work" "ProjectChat"     # Add chat to folder
telegram folder-remove "Work" "ProjectChat"  # Remove chat from folder
```

### Utilities

```bash
telegram sync --days 7                       # Sync last 7 days to markdown
telegram sync --chat "MetaDAO" --days 30     # Sync specific chat
```

## Output Formats

All read commands support multiple output formats:

```bash
telegram chats --json                        # JSON (for scripts/AI)
telegram read "Chat" --markdown              # Markdown format
telegram inbox --plain                       # Plain text (no colors)
```

## Configuration

Configuration is stored in `~/.config/tg/`:
- `config.json` - API credentials and session
- Session data is encrypted and stored securely

## Development

```bash
npm install
npm run build
npm run dev                            # Watch mode
```

## License

MIT
