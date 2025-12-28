require("dotenv").config();
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

let config = require("./config.json");
const configPath = path.join(__dirname, "config.json");

// Save config to file
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Reload config from file
function reloadConfig() {
  delete require.cache[require.resolve("./config.json")];
  config = require("./config.json");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// In-memory daily state
let dayState = {};

function resetDay() {
  dayState = {};
  config.timeslots.forEach(t => {
    dayState[t] = { unavailable: new Set(), preferred: new Set() };
  });
  dayState._otherSuggestions = new Map();
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

resetDay();

// Check if user is admin
function isAdmin(interaction) {
  if (!config.adminRoleId) return interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  return interaction.member.roles.cache.has(config.adminRoleId);
}

// Schedule daily poll
let scheduledTask = null;

function scheduleDailyPoll() {
  if (scheduledTask) {
    clearInterval(scheduledTask);
    scheduledTask = null;
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
        await postDailyPoll(channel, true);
      }
    }
  };

  // Check every minute
  scheduledTask = setInterval(checkAndPost, 60000);
  console.log(`📅 Auto-schedule enabled: ${config.autoSchedule.time} in channel ${config.autoSchedule.channelId}`);
}

// Post daily poll function
async function postDailyPoll(channel, mentionRole = false) {
  resetDay();

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

  const unavailableMenu = new StringSelectMenuBuilder()
    .setCustomId("unavailable_select")
    .setPlaceholder("❌ Select times you're UNAVAILABLE")
    .addOptions(unavailableOptions)
    .setMinValues(0)
    .setMaxValues(config.timeslots.length);

  const preferredMenu = new StringSelectMenuBuilder()
    .setCustomId("preferred_select")
    .setPlaceholder("⭐ Select times you PREFER")
    .addOptions(preferredOptions)
    .setMinValues(0)
    .setMaxValues(config.timeslots.length);

  const submitButton = new ButtonBuilder()
    .setCustomId("submit_availability")
    .setLabel("📤 Submit")
    .setStyle(ButtonStyle.Primary);

  const otherTimesButton = new ButtonBuilder()
    .setCustomId("other_times")
    .setLabel("➕ Suggest Other Times")
    .setStyle(ButtonStyle.Secondary);

  const rows = [
    new ActionRowBuilder().addComponents(unavailableMenu),
    new ActionRowBuilder().addComponents(preferredMenu),
    new ActionRowBuilder().addComponents(submitButton, otherTimesButton)
  ];

  let content = "🕒 **Mark your availability for today**\n\n" +
               "• **Unavailable**: Times you absolutely cannot meet\n" +
               "• **Preferred**: Times you'd like to meet\n" +
               "• Leave both empty if you're available for all times";

  if (mentionRole && config.autoSchedule.tagRole) {
    content = `<@&${config.autoSchedule.tagRole}>\n\n` + content;
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

  // Start scheduled task if enabled
  scheduleDailyPoll();
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "startday") {
      await postDailyPoll(interaction.channel);
      await interaction.reply({ content: "✅ Poll posted!", ephemeral: true });
    }

    if (interaction.commandName === "addslot") {
      console.log("[addslot] Command received");
      
      if (!isAdmin(interaction)) {
        console.log("[addslot] Not admin, rejecting");
        await interaction.reply({ content: "❌ Admin only", ephemeral: true });
        return;
      }

      console.log("[addslot] Admin check passed, deferring reply");
      await interaction.deferReply({ ephemeral: true });
      console.log("[addslot] Reply deferred");

      try {
        const slot = interaction.options.getString("slot");
        console.log("[addslot] Slot requested:", slot);
        
        if (config.timeslots.includes(slot)) {
          console.log("[addslot] Slot already exists");
          await interaction.editReply({ content: `❌ Slot "${slot}" already exists` });
          return;
        }

        console.log("[addslot] Adding slot to config");
        config.timeslots.push(slot);
        console.log("[addslot] Saving config");
        saveConfig();
        console.log("[addslot] Config saved, sending success message");

        await interaction.editReply({ content: `✅ Added slot: ${slot}` });
        console.log("[addslot] Success message sent");
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
      if (!isAdmin(interaction)) {
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
        saveConfig();

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

      if (!isAdmin(interaction)) {
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
        saveConfig();

        scheduleDailyPoll();

        await interaction.editReply({ 
          content: `✅ Auto-schedule enabled!\n` +
                   `⏰ Time: ${time}\n` +
                   `📢 Channel: ${channel}\n` +
                   `${role ? `🏷️ Tag Role: ${role}` : "No role tagging"}` 
        });
      } catch (error) {
        console.error("Error in schedule:", error);
        await interaction.editReply({ content: "❌ Error setting up schedule" });
      }
    }

    if (interaction.commandName === "unschedule") {
      console.log("[unschedule] Command received");
      // Defer IMMEDIATELY to avoid timeout
      await interaction.deferReply({ ephemeral: true });
      console.log("[unschedule] Reply deferred");

      if (!isAdmin(interaction)) {
        console.log("[unschedule] Not admin");
        await interaction.editReply({ content: "❌ Admin only" });
        return;
      }

      console.log("[unschedule] Admin check passed");
      try {
        console.log("[unschedule] Disabling schedule");
        config.autoSchedule.enabled = false;
        console.log("[unschedule] Saving config");
        saveConfig();
        console.log("[unschedule] Config saved");

        console.log("[unschedule] Calling scheduleDailyPoll");
        scheduleDailyPoll();
        console.log("[unschedule] scheduleDailyPoll completed");

        console.log("[unschedule] Sending success message");
        await interaction.editReply({ content: "✅ Auto-schedule disabled" });
        console.log("[unschedule] Success message sent");
      } catch (error) {
        console.error("[unschedule] Error:", error);
        try {
          await interaction.editReply({ content: "❌ Error disabling schedule" });
        } catch (e) {
          console.error("[unschedule] Failed to send error message:", e);
        }
      }
    }

    if (interaction.commandName === "enableschedule") {
      // Defer IMMEDIATELY to avoid timeout
      await interaction.deferReply({ ephemeral: true });

      if (!isAdmin(interaction)) {
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
        saveConfig();
        scheduleDailyPoll();

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

      let message = "📊 **Availability Analysis**\n\n";
      breakdown.forEach(item => {
        const emoji = item.slot === bestSlot ? "🏆" : "  ";
        const parts = [];
        if (item.preferred > 0) parts.push(`${item.preferred} prefer`);
        if (item.suggested > 0) parts.push(`${item.suggested} suggest`);
        if (item.unavailable > 0) parts.push(`${item.unavailable} unavailable`);
        
        const details = parts.length > 0 ? parts.join(", ") : "no votes";
        message += `${emoji} **${item.slot}**: ${details} (score: ${item.score})\n`;
      });

      message += bestSlot
        ? `\n✅ **Recommended meet time:** ${bestSlot}`
        : "\n❌ No suitable time found";

      await interaction.editReply(message);
    }
  }

  // Handle "Suggest Other Times" button
  if (interaction.isButton() && interaction.customId === "other_times") {
    const modal = new ModalBuilder()
      .setCustomId("other_times_modal")
      .setTitle("Suggest Other Times");

    const timesInput = new TextInputBuilder()
      .setCustomId("other_times_input")
      .setLabel("Your available times")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Example:\n09:00-09:30\n14:00-15:00\n21:30-22:00")
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(timesInput));

    await interaction.showModal(modal);
  }

  // Handle modal submission
  if (interaction.isModalSubmit() && interaction.customId === "other_times_modal") {
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
    
    await interaction.reply({
      content: `✅ Your suggested times have been recorded:\n\`\`\`\n${otherTimes}\n\`\`\`\n}`,
      ephemeral: true
    });
  }

  // Handle submit button
  if (interaction.isButton() && interaction.customId === "submit_availability") {
    await interaction.reply({
      content: "✅ Your availability has been submitted!",
      ephemeral: true
    });
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
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

      await interaction.reply({
        content: `❌ Marked unavailable: ${selectedSlots.join(", ") || "None"}`,
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

      await interaction.reply({
        content: `⭐ Marked preferred: ${selectedSlots.join(", ") || "None"}`,
        ephemeral: true
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
