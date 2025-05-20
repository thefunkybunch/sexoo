const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;

// Bot configuration
const config = {
  host: 'localhost', // Change to your server
  port: 25565,       // Default Minecraft port
  username: 'sexoov4',
  version: '1.19.4'  // Change to your Minecraft version
};

// Create the bot
const bot = mineflayer.createBot(config);

// Global variables
let whitelistedPlayers = []; // Add player names you want to whitelist
let isAntiAFK = false;
let antiAFKInterval = null;
let isFollowing = false;
let followingPlayer = null;
let followingInterval = null;
let isFarming = false;
let farmingInterval = null;

// Load plugins
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(collectBlock);

// When bot spawns
bot.once('spawn', () => {
  console.log('Bot spawned! Type commands in chat.');
  
  // Initialize pathfinder
  const mcData = require('minecraft-data')(bot.version);
  const movements = new Movements(bot, mcData);
  movements.allowSprinting = true;
  bot.pathfinder.setMovements(movements);
  
  // Set up chat listeners
  setupChatCommands();
});

// Set up command handling
function setupChatCommands() {
  bot.on('chat', (username, message) => {
    // Ignore messages from the bot itself
    if (username === bot.username) return;
    
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
  bot.chat('stop - Stop all activities');
  bot.chat('help - Show this help message');
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
    bot.chat(`Found hostile mob: ${entity.name}. Attacking!`);
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
      bot.chat(`${attackingPlayer.username} is attacking! Defending...`);
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
      bot.chat(`Found ripe ${cropName} to harvest.`);
      
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
            bot.chat(`Replanted ${cropName}.`);
          } else {
            bot.chat(`No ${seedName} found in inventory for replanting.`);
          }
        } catch (err) {
          bot.chat(`Error while farming: ${err.message}`);
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
    bot.chat(`Cannot see ${followingPlayer}. Stopping follow.`);
    clearInterval(followingInterval);
    isFollowing = false;
    return;
  }
  
  const goal = new goals.GoalFollow(player.entity, 2); // Follow at 2 block distance
  bot.pathfinder.setGoal(goal, true);
}

// Error handling
bot.on('error', (err) => {
  console.error('Bot error:', err);
});

bot.on('kicked', (reason) => {
  console.log('Bot was kicked from the server. Reason:', reason);
});

bot.on('end', () => {
  console.log('Bot disconnected from the server.');
  // You could implement reconnection logic here
});

// Define Vec3 for block placement
class Vec3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}