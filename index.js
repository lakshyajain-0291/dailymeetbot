require("dotenv").config();

// Disable SSL verification for institutional networks with SSL inspection
// WARNING: Only use in development, not in production
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  PermissionFlagsBits
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Per-guild configuration storage
const guildConfigs = new Map();
const configPath = path.join(__dirname, "guilds");

// Ensure guilds directory exists
if (!fs.existsSync(configPath)) {
  fs.mkdirSync(configPath);
}

// Load guild config from file
function loadGuildConfig(guildId) {
  const filePath = path.join(configPath, `${guildId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  
  // Default config for new guilds
  return {
    timeslots: [
      "11:00–11:30",
      "15:00–15:30",
      "17:00–17:30",
      "18:00–18:30",
      "20:00–20:30",
      "23:00–23:30"
    ],
    adminRoleId: "",
    autoSchedule: {
      enabled: false,
      channelId: "",
      time: "09:00",
      timezone: "Asia/Kolkata",
      tagRole: ""
    }
  };
}

// Save guild config to file
function saveGuildConfig(guildId, config) {
  const filePath = path.join(configPath, `${guildId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  guildConfigs.set(guildId, config);
}

// Get guild config (from cache or load)
function getGuildConfig(guildId) {
  if (!guildConfigs.has(guildId)) {
    const config = loadGuildConfig(guildId);
    guildConfigs.set(guildId, config);
  }
  return guildConfigs.get(guildId);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// Per-guild daily state
const guildStates = new Map();

function getGuildState(guildId) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {});
  }
  return guildStates.get(guildId);
}

function resetDay(guildId) {
  const config = getGuildConfig(guildId);
  const dayState = {};
  
  config.timeslots.forEach(t => {
    dayState[t] = { unavailable: new Set(), preferred: new Set() };
  });
  dayState._otherSuggestions = new Map();
  
  guildStates.set(guildId, dayState);
  return dayState;
}

// Parse time string (HH:MM) to minutes since midnight
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.trim().split(':').map(Number);
  return hours * 60 + minutes;
}

// Format minutes since midnight to HH:MM
function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// Break time range into 30-minute slots
function parseTimeRange(rangeStr) {
  const slots = [];
  // Match patterns like "09:00-09:30", "14:00-15:00", "9:00 - 10:30"
  const match = rangeStr.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  
  if (!match) return slots;
  
  const startMin = parseTime(match[1]);
  const endMin = parseTime(match[2]);
  
  // Create 30-minute slots
  for (let min = startMin; min < endMin; min += 30) {
    const slotEnd = Math.min(min + 30, endMin);
    const slotStr = `${formatTime(min)}–${formatTime(slotEnd)}`;
    slots.push(slotStr);
  }
  
  return slots;
}

// Parse all suggested times from text
function parseSuggestedTimes(text) {
  const lines = text.split('\n');
  const allSlots = [];
  
  for (const line of lines) {
    const slots = parseTimeRange(line.trim());
    allSlots.push(...slots);
  }
  
  return allSlots;
}

// Check if user is admin
function isAdmin(interaction, config) {
  if (!config.adminRoleId) return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  return interaction.member.roles.cache.has(config.adminRoleId);
}

// Per-guild scheduled tasks
const scheduledTasks = new Map();

function scheduleDailyPoll(guildId) {
  const config = getGuildConfig(guildId);
  
  // Clear existing task for this guild
  if (scheduledTasks.has(guildId)) {
    clearInterval(scheduledTasks.get(guildId));
    scheduledTasks.delete(guildId);
  }

  if (!config.autoSchedule.enabled || !config.autoSchedule.channelId) {
    return;
  }

  const checkAndPost = async () => {
    const now = new Date();
    const [targetHour, targetMin] = config.autoSchedule.time.split(':').map(Number);
    
    // Check if current time matches scheduled time (within 1 minute)
    if (now.getHours() === targetHour && now.getMinutes() === targetMin) {
      const channel = await client.channels.fetch(config.autoSchedule.channelId);
      if (channel) {
        await postDailyPoll(channel, guildId, true);
      }
    }
  };

  // Check every minute
  const taskId = setInterval(checkAndPost, 60000);
  scheduledTasks.set(guildId, taskId);
  console.log(`📅 Auto-schedule enabled for guild ${guildId}: ${config.autoSchedule.time} in channel ${config.autoSchedule.channelId}`);
}

// Post daily poll function
async function postDailyPoll(channel, guildId, mentionRole = false) {
  const config = getGuildConfig(guildId);
  resetDay(guildId);

  const unavailableOptions = config.timeslots.map(slot =>
    new StringSelectMenuOptionBuilder()
      .setLabel(slot)
      .setValue(slot)
  );

  const preferredOptions = config.timeslots.map(slot =>
    new StringSelectMenuOptionBuilder()
      .setLabel(slot)
      .setValue(slot)
  );

  const preferredMenu = new StringSelectMenuBuilder()
    .setCustomId("preferred_select")
    .setPlaceholder("✅ Select your BEST times (when you prefer to meet)")
    .addOptions(preferredOptions)
    .setMinValues(0)
    .setMaxValues(config.timeslots.length);

  const unavailableMenu = new StringSelectMenuBuilder()
    .setCustomId("unavailable_select")
    .setPlaceholder("❌ Select times when you're BUSY (cannot meet)")
    .addOptions(unavailableOptions)
    .setMinValues(0)
    .setMaxValues(config.timeslots.length);

  const submitButton = new ButtonBuilder()
    .setCustomId("submit_availability")
    .setLabel("✅ Done")
    .setStyle(ButtonStyle.Success);

  const otherTimesButton = new ButtonBuilder()
    .setCustomId("other_times")
    .setLabel("💡 Suggest Different Times")
    .setStyle(ButtonStyle.Secondary);

  const rows = [
    new ActionRowBuilder().addComponents(preferredMenu),
    new ActionRowBuilder().addComponents(unavailableMenu),
    new ActionRowBuilder().addComponents(submitButton, otherTimesButton)
  ];

  let content = "📅 **When can you meet today?**\n\n" +
               "**How to respond:**\n" +
               "✅ Select your **preferred times** (when you'd like to meet)\n" +
               "❌ Select times you're **busy** (cannot meet)\n" +
               "💡 Or suggest **different times** if none work for you\n\n" +
               "_Leave both empty if all times work equally for you_";

  if (mentionRole && config.autoSchedule.tagRole) {
    // Check if role ID matches guild ID (means @everyone was selected)
    if (config.autoSchedule.tagRole === guildId) {
      content = `@everyone\n\n` + content;
    } else {
      content = `<@&${config.autoSchedule.tagRole}>\n\n` + content;
    }
  }

  await channel.send({
    content,
    components: rows
  });
}

// Slash command definition
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await client.application.commands.set([
    new SlashCommandBuilder()
      .setName("startday")
      .setDescription("Post today's availability poll"),
    new SlashCommandBuilder()
      .setName("decide")
      .setDescription("Decide today's meet time"),
    new SlashCommandBuilder()
      .setName("addslot")
      .setDescription("[Admin] Add a time slot to the poll")
      .addStringOption(option =>
        option.setName("slot")
          .setDescription("Time slot (e.g., 09:00–09:30)")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("removeslot")
      .setDescription("[Admin] Remove a time slot from the poll")
      .addStringOption(option =>
        option.setName("slot")
          .setDescription("Time slot to remove")
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("listslots")
      .setDescription("List all configured time slots"),
    new SlashCommandBuilder()
      .setName("schedule")
      .setDescription("[Admin] Setup automatic daily poll")
      .addStringOption(option =>
        option.setName("time")
          .setDescription("Time to post (HH:MM, 24-hour format)")
          .setRequired(true)
      )
      .addChannelOption(option =>
        option.setName("channel")
          .setDescription("Channel to post in")
          .setRequired(true)
      )
      .addRoleOption(option =>
        option.setName("role")
          .setDescription("Role to tag (optional)")
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("unschedule")
      .setDescription("[Admin] Disable automatic daily poll"),
    new SlashCommandBuilder()
      .setName("enableschedule")
      .setDescription("[Admin] Enable automatic daily poll with existing settings"),
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Show bot configuration status"),
    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show all available commands and usage guide")
  ]);

  // Load all guild configs and start schedules on startup
  console.log(`Logged in as ${client.user.tag}`);
  console.log("Loading guild configurations...");
  
  // Initialize schedules for all existing guild configs
  if (fs.existsSync(configPath)) {
    const files = fs.readdirSync(configPath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const guildId = file.replace('.json', '');
        const config = getGuildConfig(guildId);
        if (config.autoSchedule.enabled) {
          scheduleDailyPoll(guildId);
        }
      }
    }
  }
  
  console.log(`Loaded ${guildConfigs.size} guild configurations`);
});

// Handle guild removal - cleanup
client.on("guildDelete", (guild) => {
  console.log(`Left guild: ${guild.name} (${guild.id})`);
  
  // Remove scheduled task
  if (scheduledTasks.has(guild.id)) {
    clearInterval(scheduledTasks.get(guild.id));
    scheduledTasks.delete(guild.id);
  }
  
  // Remove from memory
  guildConfigs.delete(guild.id);
  guildStates.delete(guild.id);
  
  // Delete config file
  const filePath = path.join(configPath, `${guild.id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`Deleted config for guild ${guild.id}`);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.guild) return; // Ignore DMs
  
  const guildId = interaction.guild.id;
  const config = getGuildConfig(guildId);
  
  if (interaction.isChatInputCommand()) {
    console.log(`[Command] ${interaction.commandName} from ${interaction.user.tag} in guild ${guildId}`);
    
    if (interaction.commandName === "startday") {
      await postDailyPoll(interaction.channel, guildId);
      await interaction.reply({ content: "✅ Poll posted!", ephemeral: true });
      console.log(`[startday] Success`);
    }

    if (interaction.commandName === "addslot") {
      if (!isAdmin(interaction, config)) {
        await interaction.reply({ content: "❌ Admin only", ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const slot = interaction.options.getString("slot");
        
        if (config.timeslots.includes(slot)) {
          await interaction.editReply({ content: `❌ Slot "${slot}" already exists` });
          return;
        }

        config.timeslots.push(slot);
        saveGuildConfig(guildId, config);

        await interaction.editReply({ content: `✅ Added slot: ${slot}` });
      } catch (error) {
        console.error("[addslot] Error:", error);
        try {
          await interaction.editReply({ content: "❌ Error adding slot" });
        } catch (e) {
          console.error("[addslot] Failed to send error message:", e);
        }
      }
    }

    if (interaction.commandName === "removeslot") {
      if (!isAdmin(interaction, config)) {
        await interaction.reply({ content: "❌ Admin only", ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const slot = interaction.options.getString("slot");
        const index = config.timeslots.indexOf(slot);
        
        if (index === -1) {
          await interaction.editReply({ content: `❌ Slot "${slot}" not found` });
          return;
        }

        config.timeslots.splice(index, 1);
        saveGuildConfig(guildId, config);

        await interaction.editReply({ content: `✅ Removed slot: ${slot}` });
      } catch (error) {
        console.error("Error in removeslot:", error);
        await interaction.editReply({ content: "❌ Error removing slot" });
      }
    }

    if (interaction.commandName === "listslots") {
      const slots = config.timeslots.join("\n• ");
      await interaction.reply({ 
        content: `📋 **Current time slots:**\n• ${slots}`, 
        ephemeral: true 
      });
    }

    if (interaction.commandName === "schedule") {
      // Defer IMMEDIATELY to avoid timeout
      await interaction.deferReply({ ephemeral: true });

      if (!isAdmin(interaction, config)) {
        await interaction.editReply({ content: "❌ Admin only" });
        return;
      }

      try {
        const time = interaction.options.getString("time");
        const channel = interaction.options.getChannel("channel");
        const role = interaction.options.getRole("role");

        // Validate time format
        if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) {
          await interaction.editReply({ content: "❌ Invalid time format. Use HH:MM (24-hour)" });
          return;
        }

        config.autoSchedule.enabled = true;
        config.autoSchedule.time = time;
        config.autoSchedule.channelId = channel.id;
        config.autoSchedule.tagRole = role ? role.id : "";
        saveGuildConfig(guildId, config);

        scheduleDailyPoll(guildId);

        const response = `✅ Auto-schedule enabled!\n` +
                        `⏰ Time: ${time}\n` +
                        `📢 Channel: <#${channel.id}>\n` +
                        `${role ? `🏷️ Tag Role: <@&${role.id}>` : "No role tagging"}`;
        
        await interaction.editReply({ content: response });
        console.log(`[schedule] Successfully configured for guild ${guildId}`);
      } catch (error) {
        console.error("[schedule] Error:", error);
        try {
          await interaction.editReply({ content: "❌ Error setting up schedule" });
        } catch (e) {
          console.error("[schedule] Failed to send error message:", e);
        }
      }
    }

    if (interaction.commandName === "unschedule") {
      // Defer IMMEDIATELY to avoid timeout
      await interaction.deferReply({ ephemeral: true });

      if (!isAdmin(interaction, config)) {
        await interaction.editReply({ content: "❌ Admin only" });
        return;
      }

      try {
        config.autoSchedule.enabled = false;
        saveGuildConfig(guildId, config);

        scheduleDailyPoll(guildId);

        await interaction.editReply({ content: "✅ Auto-schedule disabled" });
      } catch (error) {
        console.error("Error in unschedule:", error);
        await interaction.editReply({ content: "❌ Error disabling schedule" });
      }
    }

    if (interaction.commandName === "enableschedule") {
      // Defer IMMEDIATELY to avoid timeout
      await interaction.deferReply({ ephemeral: true });

      if (!isAdmin(interaction, config)) {
        await interaction.editReply({ content: "❌ Admin only" });
        return;
      }

      try {
        // Check if schedule configuration exists
        if (!config.autoSchedule.time || !config.autoSchedule.channelId) {
          await interaction.editReply({ 
            content: "❌ No schedule configured. Use `/schedule` to set up automatic daily poll first.\n" +
                     "Example: `/schedule time:09:00 channel:#daily-meets`" 
          });
          return;
        }

        // Check if already enabled
        if (config.autoSchedule.enabled) {
          await interaction.editReply({ 
            content: `ℹ️ Auto-schedule is already enabled!\n` +
                     `⏰ Time: ${config.autoSchedule.time}\n` +
                     `📢 Channel: <#${config.autoSchedule.channelId}>` +
                     `${config.autoSchedule.tagRole ? `\n🏷️ Tag Role: <@&${config.autoSchedule.tagRole}>` : ""}` 
          });
          return;
        }

        // Enable the schedule
        config.autoSchedule.enabled = true;
        saveGuildConfig(guildId, config);
        scheduleDailyPoll(guildId);

        await interaction.editReply({ 
          content: `✅ Auto-schedule enabled!\n` +
                   `⏰ Time: ${config.autoSchedule.time}\n` +
                   `📢 Channel: <#${config.autoSchedule.channelId}>` +
                   `${config.autoSchedule.tagRole ? `\n🏷️ Tag Role: <@&${config.autoSchedule.tagRole}>` : ""}` 
        });
      } catch (error) {
        console.error("Error in enableschedule:", error);
        await interaction.editReply({ content: "❌ Error enabling schedule" });
      }
    }

    if (interaction.commandName === "status") {
      let msg = `📊 **Bot Status**\n\n`;
      msg += `📋 **Time slots**: ${config.timeslots.length} configured\n`;
      msg += `⏰ **Auto-schedule**: ${config.autoSchedule.enabled ? `Enabled (${config.autoSchedule.time})` : "Disabled"}\n`;
      
      if (config.autoSchedule.enabled) {
        msg += `📢 **Channel**: <#${config.autoSchedule.channelId}>\n`;
        if (config.autoSchedule.tagRole) {
          msg += `🏷️ **Tag Role**: <@&${config.autoSchedule.tagRole}>\n`;
        }
      }

      await interaction.reply({ content: msg, ephemeral: true });
    }

    if (interaction.commandName === "help") {
      const guildId = interaction.guild.id;
      const config = getGuildConfig(guildId);
      const isAdminUser = isAdmin(interaction, config);

    if (interaction.commandName === "status") {
      let msg = `📊 **Bot Status**\n\n`;
      msg += `📋 **Time slots**: ${config.timeslots.length} configured\n`;
      msg += `⏰ **Auto-schedule**: ${config.autoSchedule.enabled ? `Enabled (${config.autoSchedule.time})` : "Disabled"}\n`;
      
      if (config.autoSchedule.enabled) {
        msg += `📢 **Channel**: <#${config.autoSchedule.channelId}>\n`;
        if (config.autoSchedule.tagRole) {
          msg += `🏷️ **Tag Role**: <@&${config.autoSchedule.tagRole}>\n`;
        }
      }

      await interaction.reply({ content: msg, ephemeral: true });
    }

    if (interaction.commandName === "help") {
      const isAdminUser = isAdmin(interaction);
      
      let help = `# 📖 DailyMeetBot Help\n\n`;
      help += `## 👥 **User Commands**\n\n`;
      help += `### /startday\n`;
      help += `Post today's availability poll. Use the dropdowns to mark:\n`;
      help += `• ❌ **Unavailable** - Times you cannot meet\n`;
      help += `• ⭐ **Preferred** - Times you'd like to meet\n`;
      help += `• ➕ **Suggest Other Times** - Enter custom time ranges\n\n`;
      
      help += `**Custom Time Format:**\n`;
      help += `\`\`\`\n09:00-09:30\n14:00-15:00\n21:30-22:00\n\`\`\`\n`;
      help += `Times longer than 30 mins are automatically split into 30-min slots.\n\n`;
      
      help += `### /decide\n`;
      help += `Analyze all responses and recommend the best meeting time.\n`;
      help += `Shows votes for each slot with scoring:\n`;
      help += `• Unavailable: -100 points\n`;
      help += `• Preferred: +2 points\n`;
      help += `• Suggested: +1 point\n\n`;
      
      help += `### /listslots\n`;
      help += `View all configured time slots.\n\n`;
      
      help += `### /status\n`;
      help += `Show current bot configuration.\n\n`;

      if (isAdminUser) {
        help += `## 🔧 **Admin Commands**\n\n`;
        help += `### /addslot <slot>\n`;
        help += `Add a new time slot to the poll.\n`;
        help += `**Example:** \`/addslot slot:09:00–09:30\`\n\n`;
        
        help += `### /removeslot <slot>\n`;
        help += `Remove an existing time slot.\n`;
        help += `**Example:** \`/removeslot slot:23:00–23:30\`\n\n`;
        
        help += `### /schedule <time> <channel> [role]\n`;
        help += `Enable automatic daily poll posting.\n`;
        help += `**Parameters:**\n`;
        help += `• \`time\` - When to post (HH:MM, 24-hour format)\n`;
        help += `• \`channel\` - Which channel to post in\n`;
        help += `• \`role\` - Optional role to mention\n`;
        help += `**Example:** \`/schedule time:09:00 channel:#daily-meets role:@Team\`\n\n`;
        
        help += `### /unschedule\n`;
        help += `Disable automatic daily poll posting.\n\n`;
      } else {
        help += `\n*Admin commands are hidden. Contact an admin for configuration changes.*\n`;
      }

      help += `\n---\n💡 **Tip:** The bot checks for the best time based on everyone's preferences and availability!`;

      await interaction.reply({ content: help, ephemeral: true });
    }

    if (interaction.commandName === "decide") {
      // Defer reply to avoid timeout
      await interaction.deferReply();

      const guildId = interaction.guild.id;
      const config = getGuildConfig(guildId);
      const dayState = getGuildState(guildId);

      // Collect all unique time slots (config + suggested)
      const allSlots = new Set(config.timeslots);
      const slotVotes = new Map();

      // Initialize with config timeslots
      config.timeslots.forEach(slot => {
        slotVotes.set(slot, {
          unavailable: new Set(dayState[slot].unavailable),
          preferred: new Set(dayState[slot].preferred),
          suggested: new Set()
        });
      });

      // Process suggested times
      if (dayState._otherSuggestions) {
        dayState._otherSuggestions.forEach((timeText, userId) => {
          const suggestedSlots = parseSuggestedTimes(timeText);
          
          suggestedSlots.forEach(slot => {
            allSlots.add(slot);
            
            if (!slotVotes.has(slot)) {
              slotVotes.set(slot, {
                unavailable: new Set(),
                preferred: new Set(),
                suggested: new Set()
              });
            }
            
            // Add suggestion as a vote
            slotVotes.get(slot).suggested.add(userId);
          });
        });
      }

      // Calculate scores for all slots
      let bestSlot = null;
      let bestScore = -Infinity;
      const breakdown = [];

      slotVotes.forEach((votes, slot) => {
        const u = votes.unavailable.size;
        const p = votes.preferred.size;
        const s = votes.suggested.size;
        // Score: -100 per unavailable, +2 per preferred, +1 per suggested
        const score = -100 * u + 2 * p + s;

        breakdown.push({
          slot,
          unavailable: u,
          preferred: p,
          suggested: s,
          score
        });

        if (score > bestScore) {
          bestScore = score;
          bestSlot = slot;
        }
      });

      // Sort by score descending
      breakdown.sort((a, b) => b.score - a.score);

      let message = "📊 **Meeting Time Analysis**\n\n";
      
      // Show top 5 times
      const topSlots = breakdown.slice(0, Math.min(5, breakdown.length));
      topSlots.forEach((item, index) => {
        const emoji = index === 0 ? "🏆" : `${index + 1}️⃣`;
        const parts = [];
        if (item.preferred > 0) parts.push(`✅ ${item.preferred} prefer`);
        if (item.suggested > 0) parts.push(`💡 ${item.suggested} suggest`);
        if (item.unavailable > 0) parts.push(`❌ ${item.unavailable} busy`);
        
        const details = parts.length > 0 ? parts.join(" • ") : "No responses yet";
        message += `${emoji} **${item.slot}**\n   ${details}\n   _Score: ${item.score}_\n\n`;
      });

      if (breakdown.length > 5) {
        message += `_...and ${breakdown.length - 5} more time slots_\n\n`;
      }

      message += bestSlot
        ? `\n🎯 **Best time to meet:** ${bestSlot}\n\n_This time has the highest preference score!_`
        : "\n⚠️ **No clear winner yet** - waiting for more responses";

      await interaction.editReply(message);
      console.log(`[decide] Success`);
    }
  } // End of isChatInputCommand block

  // Handle "Suggest Other Times" button
  if (interaction.isButton() && interaction.customId === "other_times") {
    const modal = new ModalBuilder()
      .setCustomId("other_times_modal")
      .setTitle("Suggest Different Times");

    const timesInput = new TextInputBuilder()
      .setCustomId("other_times_input")
      .setLabel("When can you meet? (one time range per line)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Examples:\n09:00-09:30\n14:00-15:00 (auto-splits to 30min slots)\n21:30-22:00")
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(timesInput));

    await interaction.showModal(modal);
  }

  // Handle modal submission
  if (interaction.isModalSubmit() && interaction.customId === "other_times_modal") {
    const guildId = interaction.guild.id;
    const dayState = getGuildState(guildId);
    
    const otherTimes = interaction.fields.getTextInputValue("other_times_input");
    const user = interaction.user.id;

    if (!otherTimes.trim()) {
      await interaction.reply({
        content: "❌ No times provided",
        ephemeral: true
      });
      return;
    }

    // Store other times suggestions
    if (!dayState._otherSuggestions) {
      dayState._otherSuggestions = new Map();
    }
    dayState._otherSuggestions.set(user, otherTimes);

    // Parse and show what slots were created
    const parsedSlots = parseSuggestedTimes(otherTimes);
    
    const slotCount = parsedSlots.length;
    await interaction.reply({
      content: `✅ **Thanks!** Your suggested times have been recorded.\n\n📋 Created **${slotCount} time slot${slotCount !== 1 ? 's' : ''}**:\n${parsedSlots.map(s => `• ${s}`).join('\n')}\n\n💡 These will be included when analyzing the best meeting time.`,
      ephemeral: true
    });
  }

  // Handle submit button
  if (interaction.isButton() && interaction.customId === "submit_availability") {
    await interaction.reply({
      content: "✅ **Thanks!** Your availability has been recorded.\n\n💡 You can update your choices anytime before the decision is made.",
      ephemeral: true
    });
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    const guildId = interaction.guild.id;
    const config = getGuildConfig(guildId);
    const dayState = getGuildState(guildId);
    const user = interaction.user.id;

    if (interaction.customId === "unavailable_select") {
      const selectedSlots = interaction.values;

      // Clear previous unavailable selections for this user
      config.timeslots.forEach(slot => {
        dayState[slot].unavailable.delete(user);
      });

      // Add new unavailable selections
      selectedSlots.forEach(slot => {
        dayState[slot].unavailable.add(user);
        // Remove from preferred if marked unavailable
        dayState[slot].preferred.delete(user);
      });

      const response = selectedSlots.length > 0 
        ? `❌ Got it! You're busy during: ${selectedSlots.join(", ")}`
        : `✅ Cleared your busy times - you're available for all slots!`;
      
      await interaction.reply({
        content: response,
        ephemeral: true
      });
    }

    if (interaction.customId === "preferred_select") {
      const selectedSlots = interaction.values;

      // Clear previous preferred selections for this user
      config.timeslots.forEach(slot => {
        dayState[slot].preferred.delete(user);
      });

      // Add new preferred selections (only if not unavailable)
      selectedSlots.forEach(slot => {
        if (!dayState[slot].unavailable.has(user)) {
          dayState[slot].preferred.add(user);
        }
      });

      const response = selectedSlots.length > 0
        ? `✅ Perfect! You prefer: ${selectedSlots.join(", ")}`
        : `✅ Cleared your preferences - any time works for you!`;
      
      await interaction.reply({
        content: response,
        ephemeral: true
      });
    }
  }
}});

client.login(process.env.DISCORD_TOKEN);
