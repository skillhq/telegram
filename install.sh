#!/bin/sh
# Telegram CLI installer & onboarding
# Usage: curl -sSfL https://github.com/skillhq/telegram/raw/main/install.sh | bash
#
# Installs @skillhq/telegram globally, offers to install companion skills,
# and optionally runs a test query to verify setup.

set -e

PACKAGE="@skillhq/telegram"
BINARY="telegram"

main() {
    need_cmd node
    need_cmd npm

    # --- Install CLI ---
    if has "$BINARY"; then
        current_version=$("$BINARY" --version 2>/dev/null || echo "unknown")
        log "Telegram CLI already installed (v${current_version})."
        printf "  Reinstall / upgrade? [y/N] " >&2
        if has_tty; then
            read -r answer < /dev/tty || answer=""
        else
            answer=""
        fi
        case "$answer" in
            [yY]*)
                log "Upgrading ${PACKAGE}..."
                npm install -g --no-fund --no-audit "$PACKAGE" || err "npm install failed. Try: sudo npm install -g $PACKAGE"
                ;;
            *)
                log "Skipping install."
                ;;
        esac
    else
        log "Installing ${PACKAGE}..."
        npm install -g --no-fund --no-audit "$PACKAGE" || err "npm install failed. Try: sudo npm install -g $PACKAGE"
    fi

    # Post-install interactive setup only when we have a usable terminal.
    if has_tty; then
        post_install
    else
        echo "" >&2
        log "Telegram CLI installed successfully!"
        echo "" >&2
        log "Tip: Run 'npx skills add https://github.com/skillhq/telegram' to install the Telegram skill."
        log "Tip: Run 'telegram auth' to authenticate with your Telegram account."
    fi
}

post_install() {
    echo "" >&2

    # --- Skill install ---
    if has npx; then
        if npx --yes skills list 2>/dev/null | grep -q "skillhq/telegram"; then
            log "Telegram skill already installed."
        else
            log "The Telegram skill lets AI agents (Cursor, Claude Code, etc.) read,"
            log "search, and send Telegram messages on your behalf."
            printf "  Install Telegram skill for your AI agent? [Y/n] " >&2
            read -r answer < /dev/tty || answer=""
            case "$answer" in
                [nN]*)
                    log "Skipped. You can install it later with: npx skills add https://github.com/skillhq/telegram"
                    ;;
                *)
                    log "Installing Telegram skill..."
                    npx --yes skills add https://github.com/skillhq/telegram < /dev/tty || log "Skill installation failed. You can retry with: npx skills add https://github.com/skillhq/telegram"
                    ;;
            esac
        fi
    else
        log "Tip: Run 'npx skills add https://github.com/skillhq/telegram' to install the Telegram skill."
        log "(requires Node.js / npx)"
    fi

    echo "" >&2

    # --- Authentication ---
    if "$BINARY" check > /dev/null 2>&1; then
        log "Already authenticated with Telegram."
    else
        log "Authenticate to start reading and sending messages."
        printf "  Authenticate with Telegram now? [Y/n] " >&2
        read -r answer < /dev/tty || answer=""
        case "$answer" in
            [nN]*)
                log "Skipped. You can authenticate later with: telegram auth"
                ;;
            *)
                echo "" >&2
                log "You'll need Telegram API credentials."
                log "Go to https://my.telegram.org/apps to get your API ID and Hash."
                echo "" >&2
                "$BINARY" auth < /dev/tty || log "Authentication failed. You can retry with: telegram auth"
                ;;
        esac
    fi

    echo "" >&2

    # --- Test query ---
    if "$BINARY" check > /dev/null 2>&1; then
        printf "  Run a test query to verify your setup? [Y/n] " >&2
        read -r answer < /dev/tty || answer=""
        case "$answer" in
            [nN]*)
                log "Skipped."
                ;;
            *)
                log "Fetching your account info..."
                echo "" >&2
                "$BINARY" whoami || log "Test query failed. Check your session with: telegram check"
                echo "" >&2
                log "Fetching unread inbox..."
                echo "" >&2
                "$BINARY" inbox -n 5 || log "Inbox query failed."
                ;;
        esac
    fi

    echo "" >&2
    log "Telegram CLI setup complete! 🎉"
    echo "" >&2
    log "Quick start:"
    log "  telegram inbox          — Check unread messages"
    log "  telegram read \"Chat\" — Read messages from a chat"
    log "  telegram search \"q\"  — Search across chats"
    log "  telegram --help         — See all commands"
}

has_tty() {
    [ -t 0 ] || [ -t 1 ] || [ -t 2 ]
}

has() {
    command -v "$1" > /dev/null 2>&1
}

need_cmd() {
    if ! has "$1"; then
        err "required command not found: $1"
    fi
}

log() {
    echo "  $*" >&2
}

err() {
    log "error: $*"
    exit 1
}

main "$@"
