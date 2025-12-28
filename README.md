# 🤖 DailyMeetBot

<div align="center">

[![Discord.js](https://img.shields.io/badge/Discord.js-v14.25-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org/)
[![Node.js](https://img.shields.io/badge/Node.js-v20-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)](LICENSE)

**An intelligent Discord bot that helps teams coordinate daily meetings through interactive polls and smart scheduling.**

[Features](#-features) • [Quick Start](#-quick-start) • [Commands](#-commands) • [Configuration](#%EF%B8%8F-configuration) • [Contributing](#-contributing)

</div>

---

## ✨ Features

### 📊 **Interactive Availability Polling**
- Multi-select dropdown menus for marking unavailable/preferred times
- Custom time slot suggestions with automatic 30-minute chunking
- Real-time vote tracking across all team members

### 🧠 **Smart Decision Engine**
- Advanced scoring algorithm: `-100` for unavailable, `+2` for preferred, `+1` for suggested
- Comprehensive analysis breakdown showing all time slots with vote counts
- Automatic recommendation of the best meeting time

### ⏰ **Automated Scheduling**
- Set up daily polls to post automatically at your chosen time
- Configurable channel and role tagging
- Easy enable/disable without losing configuration

### 🔧 **Flexible Time Management**
- Add/remove time slots on the fly
- Support for custom time ranges (e.g., "09:00-11:00" splits into 30-min slots)
- Persistent configuration across bot restarts

### 🛡️ **Admin Controls**
- Role-based or permission-based admin access
- Comprehensive help system with contextual documentation
- Real-time status monitoring

---

## 🚀 Quick Start

### Prerequisites

- Node.js v20 or higher
- A Discord Bot Token ([Create one here](https://discord.com/developers/applications))
- Discord server with admin permissions

### Installation

```bash
# Clone the repository
git clone https://github.com/lakshyajain-0291/dailymeetbot.git
cd dailymeetbot

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Configuration

1. **Set up your Discord Bot:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Add a bot and copy the token
   - Enable "Message Content Intent" and "Server Members Intent"

2. **Add token to `.env`:**
   ```env
   DISCORD_TOKEN=your_bot_token_here
   ```

3. **Invite bot to your server:**
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147863616&scope=bot%20applications.commands
   ```

4. **Start the bot:**
   ```bash
   # Development mode (auto-restart on changes)
   npm run dev

   # Production mode
   node index.js
   ```

---

## 📖 Commands

### 👥 User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/startday` | Post today's availability poll | Simply run the command |
| `/decide` | Analyze votes and recommend best meeting time | Run after team has voted |
| `/listslots` | View all configured time slots | Check available times |
| `/status` | Show bot configuration and schedule status | See current setup |
| `/help` | Display comprehensive help guide | Get detailed usage info |

### 🔐 Admin Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/addslot <slot>` | Add a new time slot to polls | `/addslot slot:09:00–09:30` |
| `/removeslot <slot>` | Remove an existing time slot | `/removeslot slot:23:00–23:30` |
| `/schedule` | Set up automatic daily poll posting | `/schedule time:09:00 channel:#daily role:@Team` |
| `/enableschedule` | Enable auto-posting with saved settings | Run to turn on schedule |
| `/unschedule` | Disable automatic posting | Run to turn off schedule |

---

## 🎯 Usage Examples

### Setting Up Daily Polls

```
1. Configure time slots (if needed):
   /addslot slot:09:00–09:30
   /addslot slot:14:00–14:30

2. Set up automatic posting:
   /schedule time:09:00 channel:#daily-meets role:@Team

3. The bot will now post polls daily at 9:00 AM!
```

### Marking Availability

<div align="center">

```mermaid
graph LR
    A[/startday command] --> B[Interactive Poll]
    B --> C[Select Unavailable Times]
    B --> D[Select Preferred Times]
    B --> E[Suggest Other Times]
    C --> F[Submit]
    D --> F
    E --> F
    F --> G[Votes Recorded]
```

</div>

**Custom Time Format:**
```
09:00-09:30     → Single 30-min slot
14:00-16:00     → Four 30-min slots (14:00-14:30, 14:30-15:00, etc.)
21:30-22:00     → Single 30-min slot
```

### Getting Results

```
/decide
```

**Sample Output:**
```
📊 Availability Analysis

🏆 15:00–15:30: 4 prefer, 0 unavailable (score: 8)
   11:00–11:30: 2 prefer (score: 4)
   17:00–17:30: 1 prefer, 1 unavailable (score: -98)
   09:00–09:30: 1 suggest (score: 1)
   
✅ Recommended meet time: 15:00–15:30
```

---

## ⚙️ Configuration

### `config.json` Structure

```json
{
  "timeslots": [
    "11:00–11:30",
    "15:00–15:30",
    "17:00–17:30"
  ],
  "adminRoleId": "123456789",
  "autoSchedule": {
    "enabled": true,
    "channelId": "987654321",
    "time": "09:00",
    "timezone": "Asia/Kolkata",
    "tagRole": "111222333"
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Your Discord bot token | Yes |

---

## 🏗️ Architecture

```
dailymeetbot/
├── index.js              # Main bot logic
├── config.json          # Time slots & schedule config
├── .env                 # Environment variables
├── package.json         # Dependencies
└── README.md           # Documentation
```

### Key Components

- **Interactive Polls**: Discord.js Select Menus + Buttons
- **State Management**: In-memory dayState with Set collections
- **Scheduling**: Interval-based time checking (1-minute precision)
- **Persistence**: JSON file-based configuration

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style
- Test all changes thoroughly
- Update README for new features
- Add console logs for debugging

---

## 🐛 Troubleshooting

<details>
<summary><b>Bot doesn't respond to commands</b></summary>

- Verify bot token in `.env`
- Check bot has proper permissions in Discord
- Ensure bot is online in your server
- Wait 1-2 minutes for slash commands to register
</details>

<details>
<summary><b>"Application did not respond" error</b></summary>

- Check your internet connection
- Restart the bot with `npm run dev`
- Ensure config.json is not corrupted
</details>

<details>
<summary><b>Schedule not working</b></summary>

- Verify channel ID is correct in config.json
- Check bot has permission to post in the channel
- Ensure system time is accurate
- Use `/status` to verify schedule is enabled
</details>

---

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Inspired by the need for better team coordination
- Thanks to all contributors!

---

<div align="center">

**Made by [Lakshya Jain](https://github.com/lakshyajain-0291)**

⭐ Star this repo if you find it helpful!

</div>
