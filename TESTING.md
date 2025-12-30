# Testing Guide for Multi-Server Support

## Testing Checklist

### 1. Basic Functionality (Single Server)
- [ ] Start bot: `npm run dev`
- [ ] Run `/startday` in a channel
- [ ] Verify poll appears with dropdowns
- [ ] Select unavailable times
- [ ] Select preferred times
- [ ] Click "Suggest Other Times" and enter custom times
- [ ] Run `/decide` to see results
- [ ] Run `/help` to see commands

### 2. Admin Commands (Single Server)
- [ ] Run `/addslot slot:08:00–08:30`
- [ ] Run `/listslots` to verify it was added
- [ ] Run `/removeslot slot:08:00–08:30`
- [ ] Run `/schedule time:10:00 channel:#test-channel`
- [ ] Run `/status` to verify schedule is active
- [ ] Run `/unschedule` to disable
- [ ] Run `/enableschedule` to re-enable
- [ ] Wait for scheduled time and verify poll posts

### 3. Multi-Server Testing
#### Setup
1. Invite bot to Server A and Server B
2. Each server should auto-create its own config file in `guilds/`

#### Test Isolation
- [ ] In Server A: Run `/addslot slot:08:00–08:30`
- [ ] In Server B: Run `/listslots`
  - Should NOT show the 08:00-08:30 slot
- [ ] In Server A: Run `/schedule time:09:00 channel:#channel-a`
- [ ] In Server B: Run `/schedule time:10:00 channel:#channel-b`
- [ ] Verify both servers have different schedules in `/status`

#### Test Vote Isolation
- [ ] In Server A: Run `/startday`
- [ ] In Server A: Vote for some times
- [ ] In Server B: Run `/startday`
- [ ] In Server B: Vote for different times
- [ ] In Server A: Run `/decide`
  - Should only show Server A's votes
- [ ] In Server B: Run `/decide`
  - Should only show Server B's votes

### 4. Config Persistence
- [ ] In Server A: Run `/addslot slot:07:00–07:30`
- [ ] Stop the bot (Ctrl+C)
- [ ] Check `guilds/` directory - verify JSON file exists
- [ ] Restart the bot: `npm run dev`
- [ ] In Server A: Run `/listslots`
  - Should still show 07:00-07:30 slot

### 5. Guild Removal Cleanup
- [ ] Note the guild ID of a test server
- [ ] Check `guilds/{guildId}.json` exists
- [ ] Remove bot from that server
- [ ] Check bot logs - should see "Left guild" message
- [ ] Verify `guilds/{guildId}.json` was deleted
- [ ] Verify no scheduled task remains for that guild

### 6. Scheduled Posting
- [ ] In Server A: Run `/schedule time:HH:MM channel:#test` (set to 2 mins from now)
- [ ] Wait for scheduled time
- [ ] Verify poll appears automatically in #test
- [ ] Verify poll has role mention if tagRole was set

## Expected File Structure After Testing

```
dailymeetbot/
├── guilds/
│   ├── 123456789012345678.json  (Server A config)
│   ├── 987654321098765432.json  (Server B config)
│   └── ...
├── index.js
├── config.template.json
├── package.json
├── .env
├── README.md
├── ARCHITECTURE.md
└── TESTING.md
```

## Verification Commands

### Check guild configs
```bash
ls -la guilds/
cat guilds/*.json
```

### Monitor bot logs
```bash
npm run dev
# Watch for:
# - "Loaded X guild configurations"
# - "Auto-schedule enabled for guild..."
# - "Left guild: ..."
```

### Verify isolation
```bash
# Compare configs from two servers
cat guilds/GUILD_ID_1.json
cat guilds/GUILD_ID_2.json
# They should have different timeslots, channelIds, etc.
```

## Common Issues

### Issue: Config not persisting
**Solution**: Check file permissions on `guilds/` directory

### Issue: Schedule not working
**Solution**: 
1. Check `/status` shows enabled: true
2. Verify time format is HH:MM
3. Check bot has permission to post in channel

### Issue: Commands not appearing
**Solution**: 
1. Slash commands are global (take ~1 hour to sync)
2. Or restart bot and they sync immediately
3. Check bot has applications.commands scope

### Issue: Votes from Server A appearing in Server B
**Solution**: This should never happen! Report as critical bug.
Check `guildId` is being passed correctly to all functions.

## Success Criteria

✅ Each server has independent configuration  
✅ Vote tracking is completely isolated  
✅ Schedules work independently per server  
✅ Config persists across bot restarts  
✅ Guild data is cleaned up on bot removal  
✅ No cross-contamination between servers  
✅ Bot can handle 2+ servers simultaneously
