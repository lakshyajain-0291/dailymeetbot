# DailyMeetBot Architecture

## Multi-Server Support

### Overview
DailyMeetBot supports **multiple Discord servers simultaneously** with complete data isolation. Each server (guild) has its own:
- Configuration file
- Time slots
- Admin settings
- Scheduled tasks
- Vote tracking state

### Data Storage

#### Per-Guild Configs
- **Location**: `guilds/{guildId}.json`
- **Caching**: In-memory Map (`guildConfigs`)
- **Auto-creation**: Default config generated on first interaction
- **Persistence**: Saved to disk on every config change

#### Per-Guild State
- **Location**: In-memory only (`guildStates` Map)
- **Contents**: Daily vote tracking (unavailable, preferred, suggestions)
- **Lifecycle**: Reset daily when `/startday` is called
- **Isolation**: Completely separate per guild

### Key Functions

#### Configuration Management
\`\`\`javascript
loadGuildConfig(guildId)    // Load from disk
saveGuildConfig(guildId, config)  // Save to disk & cache
getGuildConfig(guildId)     // Get from cache (load if needed)
\`\`\`

#### State Management
\`\`\`javascript
getGuildState(guildId)      // Get daily vote state
resetDay(guildId)           // Clear votes for new day
\`\`\`

#### Scheduling
\`\`\`javascript
scheduleDailyPoll(guildId)  // Start/restart per-guild schedule
scheduledTasks              // Map of guild -> intervalId
\`\`\`

### Event Handlers

#### Bot Ready
- Loads all existing guild configs from `guilds/` directory
- Starts scheduled tasks for guilds with auto-schedule enabled
- Registers global slash commands

#### Guild Delete
- Clears scheduled interval for that guild
- Removes guild from memory caches
- Deletes guild config file from disk

#### Interaction Create
- Extracts `guildId` from interaction
- Loads guild-specific config
- All commands operate on guild-specific data
- Passes `guildId` to all functions

### Data Flow Example

\`\`\`
User runs /startday in Server A
    ↓
Extract guildId from interaction
    ↓
Load Server A's config: getGuildConfig(guildId)
    ↓
Reset Server A's state: resetDay(guildId)
    ↓
Post poll in Server A's channel
    ↓
Users vote → updates Server A's state only
    ↓
Admin runs /decide → analyzes Server A's votes only
\`\`\`

### Isolation Guarantees

✅ **Config Isolation**: Each guild's settings stored in separate files  
✅ **State Isolation**: Vote tracking completely separate per guild  
✅ **Schedule Isolation**: Each guild has independent scheduled task  
✅ **No Cross-Contamination**: Guild data never mixed or shared  
✅ **Automatic Cleanup**: All guild data removed when bot leaves

### Benefits

1. **Scalability**: Bot can serve unlimited servers
2. **Independence**: Server issues don't affect others
3. **Customization**: Each server configures time slots independently
4. **Privacy**: No server can see another's data
5. **Resource Efficiency**: Configs cached, states in-memory

