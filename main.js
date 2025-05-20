const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');

// Bot configuration
const config = {
  minecraft: {
    host: process.env.MC_HOST || 'localhost',
    port: parseInt(process.env.MC_PORT || '25565'),
    username: process.env.MC_USERNAME || 'sexoov4',
    version: process.env.MC_VERSION || '1.19.4'
  },
  discord: {
    token: process.env.DISCORD_TOKEN,
    channelId: process.env.DISCORD_CHANNEL_ID,
    prefix: process.env.DISCORD_PREFIX || '!'
  }
};

// Create Minecraft bot
const bot = mineflayer.createBot(config.minecraft);

// Create Discord client
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Global variables
let whitelistedPlayers = []; // Add player names you want to whitelist
let isAntiAFK = false;
let antiAFKInterval = null;
let isFollowing = false;
let followingPlayer = null;
let followingInterval = null;
let isFarming = false;
let farmingInterval = null;
let discordChannel = null;

// Load Minecraft plugins
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(collectBlock);

// When Minecraft bot spawns
bot.once('spawn', () => {
  console.log('Minecraft bot spawned! Type commands in chat.');
  
  // Initialize pathfinder
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  movements.allowSprinting = true;
  bot.pathfinder.setMovements(movements);
  
  // Set up chat listeners
  setupChatCommands();
  
  // Notify Discord that the bot is online
  if (discordChannel) {
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Minecraft Bot Connected')
      .setDescription(`${config.minecraft.username} is now online on ${config.minecraft.host}`)
      .setTimestamp();
    
    discordChannel.send({ embeds: [embed] });
  }
});

// Discord bot ready event
discord.once('ready', () => {
  console.log(`Discord bot logged in as ${discord.user.tag}`);
  
  // Get the bridge channel
  discordChannel = discord.channels.cache.get(config.discord.channelId);
  
  if (!discordChannel) {
    console.error('Could not find the specified Discord channel!');
  } else {
    console.log(`Discord bridge connected to channel: ${discordChannel.name}`);
  }
});

// Discord message handler
discord.on('messageCreate', async (message) => {
  // Ignore messages from bots or messages not in the bridge channel
  if (message.author.bot || message.channel.id !== config.discord.channelId) return;
  
  const content = message.content.trim();
  
  // Check if it's a command
  if (content.startsWith(config.discord.prefix)) {
    handleDiscordCommand(message);
  } else {
    // Regular message - send to Minecraft
    const discordUsername = message.author.username;
    bot.chat(`[Discord] ${discordUsername}: ${content}`);
  }
});

// Handle Discord commands
function handleDiscordCommand(message) {
  const content = message.content.trim();
  const args = content.slice(config.discord.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Convert Discord command to Minecraft command format
  switch (command) {
    case 'kill':
      handleKillCommand('Discord');
      message.reply('Activating kill mode.');
      break;
    case 'farm':
      handleFarmCommand('Discord');
      message.reply('Starting farm mode.');
      break;
    case 'follow':
      const playerToFollow = args[0];
      handleFollowCommand('Discord', playerToFollow);
      message.reply(`Attempting to follow ${playerToFollow || 'no player specified'}.`);
      break;
    case 'antiafk':
      handleAntiAFKCommand('Discord');
      message.reply(`Anti-AFK mode ${isAntiAFK ? 'enabled' : 'disabled'}.`);
      break;
    case 'mine':
      const blockType = args.join(' ');
      handleMineCommand('Discord', blockType);
      message.reply(`Attempting to mine ${blockType || 'no block specified'}.`);
      break;
    case 'whitelist':
      const playerToWhitelist = args[0];
      handleWhitelistCommand('Discord', playerToWhitelist);
      message.reply(`Whitelist updated for ${playerToWhitelist || 'no player specified'}.`);
      break;
    case 'stop':
      handleStopCommand('Discord');
      message.reply('Stopping all activities.');
      break;
    case 'help':
      sendDiscordHelp(message);
      break;
    case 'players':
      sendPlayerList(message);
      break;
    case 'status':
      sendBotStatus(message);
      break;
    default:
      // Execute the command directly in Minecraft if not recognized
      bot.chat(`/${command} ${args.join(' ')}`);
      message.reply(`Executed command: /${command} ${args.join(' ')}`);
  }
}

// Set up Minecraft chat command handling
function setupChatCommands() {
  bot.on('chat', (username, message) => {
    // Ignore messages from the bot itself
    if (username === bot.username) return;
    
    // Forward the message to Discord
    if (discordChannel) {
      discordChannel.send(`**${username}**: ${message}`);
    }
    
    // Check if it's a command
    const args = message.split(' ');
    const command = args[0].toLowerCase();
    
    switch (command) {
      case 'kill':
        handleKillCommand(username);
        break;
      case 'farm':
        handleFarmCommand(username);
        break;
      case 'follow':
        handleFollowCommand(username, args[1]);
        break;
      case 'antiafk':
        handleAntiAFKCommand(username);
        break;
      case 'mine':
        handleMineCommand(username, args.slice(1).join(' '));
        break;
      case 'whitelist':
        handleWhitelistCommand(username, args[1]);
        break;
      case 'stop':
        handleStopCommand(username);
        break;
      case 'help':
        handleHelpCommand(username);
        break;
      case 'discord':
        // Send a message to Discord from Minecraft
        if (args.length > 1) {
          const discordMessage = args.slice(1).join(' ');
          if (discordChannel) {
            discordChannel.send(`**[${username} → Discord]**: ${discordMessage}`);
            bot.chat(`Message sent to Discord.`);
          } else {
            bot.chat(`Discord bridge not connected.`);
          }
        } else {
          bot.chat(`Usage: discord <message>`);
        }
        break;
    }
  });
  
  // Forward game events to Discord
  bot.on('playerJoined', (player) => {
    if (discordChannel) {
      discordChannel.send(`**${player.username}** joined the game`);
    }
  });
  
  bot.on('playerLeft', (player) => {
    if (discordChannel) {
      discordChannel.send(`**${player.username}** left the game`);
    }
  });
  
  bot.on('death', () => {
    if (discordChannel) {
      discordChannel.send(`**${bot.username}** died! Respawning...`);
    }
  });
  
  // Listen for server messages (like /say or server announcements)
  bot.on('message', (jsonMsg) => {
    // Convert the message to a readable string
    const message = jsonMsg.toString().trim();
    
    // Don't forward chat messages (they're already handled)
    if (jsonMsg.translate === 'chat.type.text') return;
    
    // Forward system messages to Discord
    if (discordChannel && message) {
      discordChannel.send(`**[Server]**: ${message}`);
    }
  });
}

// Command handlers
function handleKillCommand(username) {
  bot.chat(`Starting combat mode. I'll protect you and whitelisted players!`);
  
  // Find the nearest hostile mob and attack it
  attackNearestHostile();

  // Set up interval to keep checking for hostiles
  const killInterval = setInterval(() => {
    attackNearestHostile();
  }, 2000);
  
  // Store the interval for later cleanup
  bot.killInterval = killInterval;
}

function handleFarmCommand(username) {
  if (isFarming) {
    bot.chat('Already farming. Use "stop" to cancel.');
    return;
  }

  bot.chat('Starting farming mode. I will harvest and replant crops.');
  isFarming = true;
  
  farmingInterval = setInterval(() => {
    farmNearby();
  }, 3000);
}

function handleFollowCommand(username, targetPlayer) {
  if (!targetPlayer) {
    bot.chat('Please specify a player to follow.');
    return;
  }
  
  if (isFollowing) {
    clearInterval(followingInterval);
  }
  
  const player = bot.players[targetPlayer];
  
  if (!player) {
    bot.chat(`Cannot find player: ${targetPlayer}`);
    return;
  }
  
  followingPlayer = targetPlayer;
  isFollowing = true;
  bot.chat(`Following ${targetPlayer}`);
  
  // Follow the player with pathfinder
  followPlayer();
  
  // Update position periodically to keep following
  followingInterval = setInterval(() => {
    followPlayer();
  }, 1000);
}

function handleAntiAFKCommand(username) {
  if (isAntiAFK) {
    clearInterval(antiAFKInterval);
    isAntiAFK = false;
    bot.chat('Anti-AFK mode disabled.');
    return;
  }
  
  isAntiAFK = true;
  bot.chat('Anti-AFK mode enabled. I will move occasionally to prevent being kicked.');
  
  antiAFKInterval = setInterval(() => {
    // Randomly choose between sneaking and jumping
    const action = Math.random() > 0.5 ? 'sneak' : 'jump';
    
    if (action === 'sneak') {
      bot.setControlState('sneak', true);
      setTimeout(() => {
        bot.setControlState('sneak', false);
      }, 1000);
    } else {
      bot.setControlState('jump', true);
      setTimeout(() => {
        bot.setControlState('jump', false);
      }, 200);
    }
  }, 30000); // Perform an action every 30 seconds
}

function handleMineCommand(username, blockType) {
  if (!blockType) {
    bot.chat('Please specify a block type to mine.');
    return;
  }
  
  const mcData = require('minecraft-data')(bot.version);
  const blockTypeId = mcData.blocksByName[blockType];
  
  if (!blockTypeId) {
    bot.chat(`Unknown block type: ${blockType}`);
    return;
  }
  
  bot.chat(`Searching for ${blockType} to mine...`);
  
  // Find nearest block of the requested type
  const block = bot.findBlock({
    matching: blockTypeId.id,
    maxDistance: 64
  });
  
  if (!block) {
    bot.chat(`No ${blockType} found within range.`);
    return;
  }
  
  bot.chat(`Found ${blockType} at ${block.position.x}, ${block.position.y}, ${block.position.z}. Mining...`);
  
  // Use collectBlock plugin to mine the block
  bot.collectBlock.collect(block, err => {
    if (err) {
      bot.chat(`Error mining ${blockType}: ${err.message}`);
    } else {
      bot.chat(`Successfully mined ${blockType}.`);
    }
  });
}

function handleWhitelistCommand(username, playerToWhitelist) {
  if (!playerToWhitelist) {
    bot.chat('Current whitelisted players: ' + (whitelistedPlayers.length > 0 ? whitelistedPlayers.join(', ') : 'None'));
    return;
  }
  
  if (whitelistedPlayers.includes(playerToWhitelist)) {
    // Remove from whitelist
    whitelistedPlayers = whitelistedPlayers.filter(name => name !== playerToWhitelist);
    bot.chat(`Removed ${playerToWhitelist} from the whitelist.`);
  } else {
    // Add to whitelist
    whitelistedPlayers.push(playerToWhitelist);
    bot.chat(`Added ${playerToWhitelist} to the whitelist.`);
  }
}

function handleStopCommand(username) {
  // Clear all intervals and stop all activities
  if (bot.killInterval) clearInterval(bot.killInterval);
  if (antiAFKInterval) clearInterval(antiAFKInterval);
  if (followingInterval) clearInterval(followingInterval);
  if (farmingInterval) clearInterval(farmingInterval);
  
  // Reset control states
  bot.clearControlStates();
  
  // Reset flags
  isAntiAFK = false;
  isFollowing = false;
  isFarming = false;
  
  bot.pvp.stop();
  bot.pathfinder.setGoal(null);
  
  bot.chat('All activities stopped.');
}

function handleHelpCommand(username) {
  bot.chat('Available commands:');
  bot.chat('kill - Attack hostile mobs');
  bot.chat('farm - Harvest and replant crops');
  bot.chat('follow <player> - Follow a player');
  bot.chat('antiafk - Toggle anti-AFK mode');
  bot.chat('mine <block> - Mine specified block type');
  bot.chat('whitelist <player> - Add/remove player from whitelist');
  bot.chat('discord <message> - Send a message to Discord');
  bot.chat('stop - Stop all activities');
  bot.chat('help - Show this help message');
}

// Discord-specific command handlers
function sendDiscordHelp(message) {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('sexoov4 Bot Commands')
    .setDescription('Available commands for controlling the Minecraft bot:')
    .addFields(
      { name: `${config.discord.prefix}kill`, value: 'Attack hostile mobs' },
      { name: `${config.discord.prefix}farm`, value: 'Harvest and replant crops' },
      { name: `${config.discord.prefix}follow <player>`, value: 'Follow a player' },
      { name: `${config.discord.prefix}antiafk`, value: 'Toggle anti-AFK mode' },
      { name: `${config.discord.prefix}mine <block>`, value: 'Mine specified block type' },
      { name: `${config.discord.prefix}whitelist <player>`, value: 'Add/remove player from whitelist' },
      { name: `${config.discord.prefix}stop`, value: 'Stop all activities' },
      { name: `${config.discord.prefix}players`, value: 'List online players' },
      { name: `${config.discord.prefix}status`, value: 'Show bot status' },
      { name: 'Send message to MC', value: 'Just type normally without prefix' }
    )
    .setFooter({ text: `Bot: ${config.minecraft.username} | Server: ${config.minecraft.host}` });
  
  message.channel.send({ embeds: [embed] });
}

function sendPlayerList(message) {
  const playerNames = Object.keys(bot.players);
  
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('Online Players')
    .setDescription(playerNames.length > 0 ? playerNames.join(', ') : 'No players online')
    .setTimestamp();
  
  message.channel.send({ embeds: [embed] });
}

function sendBotStatus(message) {
  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('Bot Status')
    .addFields(
      { name: 'Bot Name', value: bot.username },
      { name: 'Server', value: `${config.minecraft.host}:${config.minecraft.port}` },
      { name: 'Health', value: `${bot.health.toFixed(1)}/20` },
      { name: 'Food', value: `${bot.food.toFixed(1)}/20` },
      { name: 'Position', value: `X: ${bot.entity.position.x.toFixed(1)}, Y: ${bot.entity.position.y.toFixed(1)}, Z: ${bot.entity.position.z.toFixed(1)}` },
      { name: 'Active Modes', value: `Kill: ${bot.killInterval ? 'Yes' : 'No'}\nFarming: ${isFarming ? 'Yes' : 'No'}\nFollowing: ${isFollowing ? followingPlayer : 'No'}\nAnti-AFK: ${isAntiAFK ? 'Yes' : 'No'}` }
    )
    .setTimestamp();
  
  message.channel.send({ embeds: [embed] });
}

// Helper functions
function attackNearestHostile() {
  const hostileMobs = [
    'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
    'witch', 'slime', 'magma_cube', 'blaze', 'ghast',
    'zombified_piglin', 'piglin', 'hoglin', 'zoglin', 'drowned',
    'phantom', 'pillager', 'ravager', 'vindicator', 'evoker'
  ];
  
  const entity = bot.nearestEntity(entity => {
    return (
      entity.type === 'mob' && 
      hostileMobs.includes(entity.name) &&
      entity.position.distanceTo(bot.entity.position) < 16
    );
  });
  
  if (entity) {
    const message = `Found hostile mob: ${entity.name}. Attacking!`;
    bot.chat(message);
    
    // Also notify Discord
    if (discordChannel) {
      discordChannel.send(`**[Combat]**: ${message}`);
    }
    
    bot.pvp.attack(entity);
  } else {
    // Check for player attacks (except whitelisted players)
    const attackingPlayer = bot.nearestEntity(entity => {
      return (
        entity.type === 'player' && 
        !whitelistedPlayers.includes(entity.username) &&
        entity.position.distanceTo(bot.entity.position) < 5 &&
        entity.hurtTime > 0 // The player is attacking
      );
    });
    
    if (attackingPlayer) {
      const message = `${attackingPlayer.username} is attacking! Defending...`;
      bot.chat(message);
      
      // Also notify Discord
      if (discordChannel) {
        discordChannel.send(`**[Combat]**: ${message}`);
      }
      
      bot.pvp.attack(attackingPlayer);
    }
  }
}

function farmNearby() {
  const mcData = require('minecraft-data')(bot.version);
  
  // List of crop block names and their "ripe" state
  const crops = {
    'wheat': 7,
    'carrots': 7,
    'potatoes': 7,
    'beetroots': 3,
    'nether_wart': 3
  };
  
  // Find ripe crops nearby
  for (const [cropName, ripeMeta] of Object.entries(crops)) {
    const cropBlock = bot.findBlock({
      matching: block => {
        return block.name === cropName && block.metadata >= ripeMeta;
      },
      maxDistance: 16
    });
    
    if (cropBlock) {
      const message = `Found ripe ${cropName} to harvest.`;
      bot.chat(message);
      
      // Also notify Discord
      if (discordChannel) {
        discordChannel.send(`**[Farming]**: ${message}`);
      }
      
      // Path to the crop
      bot.pathfinder.setGoal(new goals.GoalBlock(
        cropBlock.position.x,
        cropBlock.position.y,
        cropBlock.position.z
      ));
      
      // Once we reach the crop, harvest and replant it
      bot.once('goal_reached', async () => {
        try {
          // Harvest the crop
          await bot.dig(cropBlock);
          
          // Get the corresponding seed item name
          let seedName;
          if (cropName === 'wheat') seedName = 'wheat_seeds';
          else if (cropName === 'beetroots') seedName = 'beetroot_seeds';
          else seedName = cropName; // carrots and potatoes use themselves as seeds
          
          // Find seeds in inventory
          const seedId = mcData.itemsByName[seedName].id;
          const seed = bot.inventory.findInventoryItem(seedId);
          
          if (seed) {
            // Replant
            await bot.equip(seed, 'hand');
            await bot.placeBlock(bot.blockAt(cropBlock.position.offset(0, -1, 0)), new Vec3(0, 1, 0));
            const replantMsg = `Replanted ${cropName}.`;
            bot.chat(replantMsg);
            
            if (discordChannel) {
              discordChannel.send(`**[Farming]**: ${replantMsg}`);
            }
          } else {
            const noSeedMsg = `No ${seedName} found in inventory for replanting.`;
            bot.chat(noSeedMsg);
            
            if (discordChannel) {
              discordChannel.send(`**[Farming]**: ${noSeedMsg}`);
            }
          }
        } catch (err) {
          const errorMsg = `Error while farming: ${err.message}`;
          bot.chat(errorMsg);
          
          if (discordChannel) {
            discordChannel.send(`**[Error]**: ${errorMsg}`);
          }
        }
      });
      
      return; // Process one crop at a time
    }
  }
  
  bot.chat('No ripe crops found nearby.');
}

function followPlayer() {
  const player = bot.players[followingPlayer];
  
  if (!player || !player.entity) {
    const message = `Cannot see ${followingPlayer}. Stopping follow.`;
    bot.chat(message);
    
    if (discordChannel) {
      discordChannel.send(`**[Follow]**: ${message}`);
    }
    
    clearInterval(followingInterval);
    isFollowing = false;
    return;
  }
  
  const goal = new goals.GoalFollow(player.entity, 2); // Follow at 2 block distance
  bot.pathfinder.setGoal(goal, true);
}

// Error handling
bot.on('error', (err) => {
  console.error('Minecraft bot error:', err);
  
  if (discordChannel) {
    discordChannel.send(`**[Error]**: Minecraft bot encountered an error: ${err.message}`);
  }
});

bot.on('kicked', (reason) => {
  console.log('Minecraft bot was kicked from the server. Reason:', reason);
  
  if (discordChannel) {
    discordChannel.send(`**[Disconnected]**: Bot was kicked from the server. Reason: ${reason}`);
  }
});

bot.on('end', () => {
  console.log('Minecraft bot disconnected from the server.');
  
  if (discordChannel) {
    discordChannel.send('**[Disconnected]**: Bot has disconnected from the Minecraft server.');
  }
  
  // You could implement reconnection logic here
  setTimeout(() => {
    console.log('Attempting to reconnect...');
    
    if (discordChannel) {
      discordChannel.send('**[Reconnecting]**: Attempting to reconnect to the Minecraft server...');
    }
    
    // Reset the bot with the same config
    bot = mineflayer.createBot(config.minecraft);
    
    // Re-load plugins and set up listeners
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectBlock);
    
    bot.once('spawn', () => {
      console.log('Bot reconnected!');
      
      if (discordChannel) {
        discordChannel.send('**[Connected]**: Bot has successfully reconnected to the Minecraft server!');
      }
      
      // Re-initialize pathfinder
      const mcData = require('minecraft-data')(bot.version);
      const movements = new Movements(bot, mcData);
      movements.allowSprinting = true;
      bot.pathfinder.setMovements(movements);
      
      // Re-setup chat listeners
      setupChatCommands();
    });
  }, 5000);
});

discord.on('error', (err) => {
  console.error('Discord bot error:', err);
});

// Define Vec3 for block placement
class Vec3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

// Start the Discord bot
discord.login(config.discord.token);