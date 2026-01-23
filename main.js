import { Ship, checkEllipseCircleCollision } from './assets/ship.js';
import { Asteroid, checkCollision } from './assets/asteroid.js';
import { playSFX } from './assets/audio.js';
import { CONFIG } from './config.js';

// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Economy system
const economy = {
  wallet: CONFIG.ECONOMY.STARTING_WALLET,
  subscriptions: {
    scanner: { active: true, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.scanner.cost },
    yield: { active: false, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.yield.cost },
    firepower: { active: false, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.firepower.cost },
    hull: { active: false, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.hull.cost }
  },
};

// Game state
const game = {
  player: null,
  asteroids: [],
  projectiles: [],
  particles: [],
  score: 0,
  gameOver: false,
  started: false,
  missionActive: false,
  
  // Mission timing
  missionTimer: 0,
  missionDuration: CONFIG.MISSION.DURATION,
  asteroidsRemaining: CONFIG.MISSION.INITIAL_ASTEROIDS,
  
  // Streak tracking
  currentStreak: 0,
  streakActive: true, // False if player made a mistake
  
  // Damage tracking
  damageTaken: 0,
};

// Control state
const controls = {
  turnLeft: false,
  turnRight: false,
  thrust: false
};

// Game initialization
function init() {
  game.player = new Ship(
    canvas.width / 2, 
    canvas.height / 2, 
    economy.subscriptions.hull.active
  );
  game.asteroids = [];
  game.projectiles = [];
  game.particles = [];
  game.score = 0;
  game.gameOver = false;
  game.started = true;
  game.missionActive = true;
  game.missionTimer = 0;
  game.asteroidsRemaining = CONFIG.MISSION.INITIAL_ASTEROIDS;
  game.currentStreak = 0;
  game.streakActive = true;
  game.damageTaken = 0;
  
  // Spawn initial asteroids (6 on screen, more in reserve)
  for (let i = 0; i < Math.min(6, game.asteroidsRemaining); i++) {
    spawnAsteroid();
  }
  
  updateHUD();
  updateSubscriptionIndicators();
  updateTimer();
}

function spawnAsteroid() {
  if (game.asteroidsRemaining <= 0) return;
  
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  
  const margin = CONFIG.ASTEROID.SPAWN_MARGIN;
  switch(edge) {
    case 0: x = Math.random() * canvas.width; y = -margin; break;
    case 1: x = canvas.width + margin; y = Math.random() * canvas.height; break;
    case 2: x = Math.random() * canvas.width; y = canvas.height + margin; break;
    case 3: x = -margin; y = Math.random() * canvas.height; break;
  }
  
  game.asteroids.push(new Asteroid(x, y));
  game.asteroidsRemaining--;
}

function createExplosion(x, y, color, isCollection = false) {
  const count = isCollection ? CONFIG.PARTICLES.COLLECTION_COUNT : CONFIG.PARTICLES.EXPLOSION_COUNT;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const speed = CONFIG.PARTICLES.EXPLOSION_MIN_SPEED + 
                  Math.random() * (CONFIG.PARTICLES.EXPLOSION_MAX_SPEED - CONFIG.PARTICLES.EXPLOSION_MIN_SPEED);
    game.particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: CONFIG.PARTICLES.EXPLOSION_LIFE,
      color: color
    });
  }
}

// Update loop
function update(dt) {
  if (game.gameOver || !game.started || !game.missionActive) return;
  
  // Update mission timer
  game.missionTimer += dt / 1000; // Convert to seconds
  if (game.missionTimer >= game.missionDuration) {
    endMission();
    return;
  }
  updateTimer();
  
  // Update player
  game.player.update(controls, dt, game.particles);
  
  // Auto-fire in combat mode
  if (game.player.combatMode) {
    if (game.player.fire(game.projectiles, economy.subscriptions.firepower.active)) {
      playSFX('shoot');
    }
  }
  
  // Update asteroids
  game.asteroids.forEach(asteroid => asteroid.update(canvas));
  
  // Update projectiles
  game.projectiles = game.projectiles.filter(proj => {
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.life--;
    return proj.life > 0 && 
           proj.x > 0 && proj.x < canvas.width && 
           proj.y > 0 && proj.y < canvas.height;
  });
  
  // Update particles
  game.particles = game.particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.life--;
    return p.life > 0;
  });
  
  // Check projectile-asteroid collisions
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const proj = game.projectiles[i];
    for (let j = game.asteroids.length - 1; j >= 0; j--) {
      const asteroid = game.asteroids[j];
      if (checkCollision(proj, asteroid, CONFIG.PROJECTILE.RADIUS, asteroid.radius)) {
        game.projectiles.splice(i, 1);
        
        const result = asteroid.hit(economy.subscriptions.firepower.active);
        
        if (result.destroyed) {
          game.asteroids.splice(j, 1);
          
          if (asteroid.isPrime) {
            // Shot a prime - breaks streak
            game.streakActive = false;
            createExplosion(asteroid.x, asteroid.y, CONFIG.VISUAL.PRIME_COLOR);
          } else if (result.factored) {
            // Successfully factored composite
            const newAsteroids = asteroid.factor();
            playSFX('factorize');
            game.asteroids.push(...newAsteroids);
            createExplosion(asteroid.x, asteroid.y, CONFIG.VISUAL.COMPOSITE_COLOR);
          } else {
            // Shot bounced off
            createExplosion(asteroid.x, asteroid.y, CONFIG.VISUAL.COMPOSITE_COLOR);
          }
        } else {
          // Hit but not destroyed (first hit on composite without firepower)
          playSFX('shoot');
        }
        
        updateHUD();
        break;
      }
    }
  }
  
  // Check player-asteroid collisions
  for (let j = game.asteroids.length - 1; j >= 0; j--) {
    const asteroid = game.asteroids[j];
    if (checkEllipseCircleCollision(game.player, asteroid, asteroid.radius)) {
      if (game.player.combatMode) {
        // In combat mode - any collision damages and breaks streak
        const damage = asteroid.isPrime ? CONFIG.COLLISION.PRIME_COMBAT : CONFIG.COLLISION.COMPOSITE_COMBAT;
        const destroyed = game.player.takeDamage(damage);
        game.damageTaken += damage;
        game.streakActive = false;
        
        playSFX('damage');
        game.asteroids.splice(j, 1);
        createExplosion(asteroid.x, asteroid.y, asteroid.isPrime ? CONFIG.VISUAL.PRIME_COLOR : CONFIG.VISUAL.COMPOSITE_COLOR);
        
        if (destroyed) {
          endMission();
        }
      } else {
        // In collection mode
        if (asteroid.isPrime) {
          // Collect prime - good! Builds streak
          playSFX('collect');
          game.score += asteroid.number;
          game.currentStreak = game.streakActive ? game.currentStreak + 1 : 1;
          game.streakActive = true;
          game.asteroids.splice(j, 1);
          createExplosion(asteroid.x, asteroid.y, CONFIG.VISUAL.COLLECTION_COLOR, true);
        } else {
          // Hit composite - damage and breaks streak
          const destroyed = game.player.takeDamage(asteroid.number);
          game.damageTaken += asteroid.number;
          game.streakActive = false;
          game.currentStreak = 0;
          
          playSFX('damage');
          game.asteroids.splice(j, 1);
          createExplosion(asteroid.x, asteroid.y, CONFIG.VISUAL.COMPOSITE_COLOR);
          
          if (destroyed) {
            endMission();
          }
        }
      }
      updateHUD();
    }
  }
  
  // Spawn new asteroids if needed and available
  if (game.asteroids.length < 5 && game.asteroidsRemaining > 0) {
    spawnAsteroid();
  }
  
  // Check if mission complete (all asteroids collected/destroyed)
  if (game.asteroidsRemaining === 0 && game.asteroids.length === 0) {
    endMission();
  }
}

// Render loop
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw starfield
  ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.VISUAL.STARFIELD_OPACITY})`;
  for (let i = 0; i < CONFIG.VISUAL.STARFIELD_COUNT; i++) {
    const x = (i * 137.5) % canvas.width;
    const y = (i * 237.5) % canvas.height;
    ctx.fillRect(x, y, 1, 1);
  }
  
  // Draw particles
  game.particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / CONFIG.PARTICLES.EXPLOSION_LIFE;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  
  // Draw asteroids
  game.asteroids.forEach(asteroid => {
    asteroid.draw(ctx, economy.subscriptions.scanner.active);
  });
  
  // Draw projectiles
  ctx.fillStyle = CONFIG.PROJECTILE.COLOR;
  game.projectiles.forEach(proj => {
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, CONFIG.PROJECTILE.RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Draw player
  if (!game.gameOver && game.missionActive) {
    game.player.draw(ctx);
  }
}

// UI updates
function updateTimer() {
  const timeLeft = Math.max(0, game.missionDuration - game.missionTimer);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = Math.floor(timeLeft % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Update timer display if it exists (we'll add this to HUD)
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.textContent = timeString;
  }
}

function updateHUD() {
  const healthEl = document.getElementById('health');
  const health = Math.max(0, Math.round(game.player.health));
  healthEl.textContent = health;
  
  if (health < CONFIG.UI.HEALTH_DANGER_THRESHOLD) {
    healthEl.classList.add('danger');
    healthEl.classList.remove('warning');
  } else if (health < CONFIG.UI.HEALTH_WARNING_THRESHOLD) {
    healthEl.classList.add('warning');
    healthEl.classList.remove('danger');
  } else {
    healthEl.classList.remove('warning', 'danger');
  }
  
  document.getElementById('score').textContent = game.score;
  
  // Update streak display if exists
  const streakEl = document.getElementById('streak');
  if (streakEl && game.currentStreak >= CONFIG.STREAKS.SMALL_THRESHOLD) {
    streakEl.textContent = `${game.currentStreak}x`;
    streakEl.style.display = 'block';
  } else if (streakEl) {
    streakEl.style.display = 'none';
  }
}

function updateSubscriptionIndicators() {
  const container = document.getElementById('subscriptions');
  container.innerHTML = '';
  
  if (economy.subscriptions.scanner.active) {
    container.innerHTML += '<div class="subscription-indicator">Scanner: 30¢</div>';
  }
  if (economy.subscriptions.yield.active) {
    container.innerHTML += '<div class="subscription-indicator">Yield: 20¢</div>';
  }
  if (economy.subscriptions.firepower.active) {
    container.innerHTML += '<div class="subscription-indicator">Firepower: 25¢</div>';
  }
  if (economy.subscriptions.hull.active) {
    container.innerHTML += '<div class="subscription-indicator">Hull: 35¢</div>';
  }
}

function updateModeButton() {
  const modeBtn = document.getElementById('modeBtn');
  if (game.player.combatMode) {
    modeBtn.textContent = 'COMBAT\nMODE';
    modeBtn.className = 'control-btn combat-mode';
  } else {
    modeBtn.textContent = 'COLLECT\nMODE';
    modeBtn.className = 'control-btn collection-mode';
  }
}

function endMission() {
  game.gameOver = true;
  game.missionActive = false;
  
  // Calculate earnings with streak bonuses
  let baseEarnings = game.score;
  let streakBonus = 0;
  
  if (game.currentStreak >= CONFIG.STREAKS.LARGE_THRESHOLD) {
    streakBonus = Math.floor(baseEarnings * CONFIG.STREAKS.LARGE_BONUS);
  } else if (game.currentStreak >= CONFIG.STREAKS.SMALL_THRESHOLD) {
    streakBonus = Math.floor(baseEarnings * CONFIG.STREAKS.SMALL_BONUS);
  }
  
  // Yield booster bonus
  const yieldBonus = economy.subscriptions.yield.active ? 
    Math.floor(baseEarnings * CONFIG.ECONOMY.SUBSCRIPTIONS.yield.bonus) : 0;
  
  const totalEarnings = baseEarnings + streakBonus + yieldBonus;
  
  // Calculate costs
  let totalCosts = CONFIG.ECONOMY.SPACE_TAX;
  
  // Subscription costs
  if (economy.subscriptions.scanner.active) totalCosts += economy.subscriptions.scanner.cost;
  if (economy.subscriptions.yield.active) totalCosts += economy.subscriptions.yield.cost;
  if (economy.subscriptions.firepower.active) totalCosts += economy.subscriptions.firepower.cost;
  if (economy.subscriptions.hull.active) totalCosts += economy.subscriptions.hull.cost;
  
  // Action costs
  const actionCosts = game.player.getTotalActionCosts();
  totalCosts += Math.ceil(actionCosts);
  
  // Maintenance costs (based on damage taken)
  const maintenanceCost = CONFIG.ECONOMY.BASE_MAINTENANCE + 
                         Math.ceil(game.damageTaken * CONFIG.ECONOMY.MAINTENANCE_PER_DAMAGE);
  totalCosts += maintenanceCost;
  
  // Tow fee if hull destroyed
  const towFee = (game.player.health <= 0) ? CONFIG.ECONOMY.TOW_FEE : 0;
  totalCosts += towFee;
  
  const netProfit = totalEarnings - totalCosts;
  economy.wallet += netProfit;
  
  // Update game over screen
  document.getElementById('primesCollected').textContent = game.score;
  document.getElementById('baseEarnings').textContent = baseEarnings + '¢';
  
  // Show streak bonus if applicable
  const streakBonusEl = document.getElementById('streakBonusLine');
  if (streakBonus > 0) {
    streakBonusEl.style.display = 'flex';
    document.getElementById('streakBonus').textContent = `+${streakBonus}¢ (${game.currentStreak}x)`;
  } else {
    streakBonusEl.style.display = 'none';
  }
  
  document.getElementById('yieldBonus').textContent = yieldBonus + '¢';
  
  // Show cost breakdown
  document.getElementById('subscriptionCosts').textContent = '-' + (totalCosts - Math.ceil(actionCosts) - maintenanceCost - towFee) + '¢';
  document.getElementById('actionCosts').textContent = '-' + Math.ceil(actionCosts) + '¢';
  document.getElementById('maintenanceCost').textContent = '-' + maintenanceCost + '¢';
  
  const towFeeEl = document.getElementById('towFeeLine');
  if (towFee > 0) {
    towFeeEl.style.display = 'flex';
    document.getElementById('towFee').textContent = '-' + towFee + '¢';
  } else {
    towFeeEl.style.display = 'none';
  }
  
  document.getElementById('netProfit').textContent = netProfit + '¢';
  
  document.getElementById('gameOver').style.display = 'block';
}

// Game loop
let lastTime = 0;
function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  
  update(dt);
  draw();
  
  requestAnimationFrame(gameLoop);
}

// Controls setup
function setupControls() {
  const turnLeftBtn = document.getElementById('turnLeftBtn');
  const turnRightBtn = document.getElementById('turnRightBtn');
  const thrustBtn = document.getElementById('thrustBtn');
  const modeBtn = document.getElementById('modeBtn');
  
  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (e.key === 'a' || e.key === 'A') {
      controls.turnLeft = true;
      turnLeftBtn.classList.add('active');
    }
    if (e.key === 'd' || e.key === 'D') {
      controls.turnRight = true;
      turnRightBtn.classList.add('active');
    }
    if (e.key === 'w' || e.key === 'W') {
      controls.thrust = true;
      thrustBtn.classList.add('active');
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (game.player && game.missionActive) {
        game.player.combatMode = !game.player.combatMode;
        updateModeButton();
      }
    }
  });
  
  window.addEventListener('keyup', (e) => {
    if (e.key === 'a' || e.key === 'A') {
      controls.turnLeft = false;
      turnLeftBtn.classList.remove('active');
    }
    if (e.key === 'd' || e.key === 'D') {
      controls.turnRight = false;
      turnRightBtn.classList.remove('active');
    }
    if (e.key === 'w' || e.key === 'W') {
      controls.thrust = false;
      thrustBtn.classList.remove('active');
    }
  });
  
  // Touch controls
  const setupButton = (btn, control) => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      controls[control] = true;
      btn.classList.add('active');
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      controls[control] = false;
      btn.classList.remove('active');
    });
    btn.addEventListener('mousedown', () => {
      controls[control] = true;
      btn.classList.add('active');
    });
    btn.addEventListener('mouseup', () => {
      controls[control] = false;
      btn.classList.remove('active');
    });
  };
  
  setupButton(turnLeftBtn, 'turnLeft');
  setupButton(turnRightBtn, 'turnRight');
  setupButton(thrustBtn, 'thrust');
  
  // Mode toggle
  modeBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (game.player && game.missionActive) {
      game.player.combatMode = !game.player.combatMode;
      updateModeButton();
    }
  });
  modeBtn.addEventListener('click', () => {
    if (game.player && game.missionActive) {
      game.player.combatMode = !game.player.combatMode;
      updateModeButton();
    }
  });
}

// Menu controls
function setupMenu() {
  document.getElementById('menuBtn').addEventListener('click', () => {
    if (game.missionActive) return;
    document.getElementById('loadoutMenu').style.display = 'block';
    updateLoadoutUI();
  });
  
  document.getElementById('closeMenuBtn').addEventListener('click', () => {
    document.getElementById('loadoutMenu').style.display = 'none';
  });
  
  // Subscription toggles
  document.getElementById('scannerToggle').addEventListener('click', () => {
    economy.subscriptions.scanner.active = !economy.subscriptions.scanner.active;
    updateLoadoutUI();
  });
  
  document.getElementById('yieldToggle').addEventListener('click', () => {
    economy.subscriptions.yield.active = !economy.subscriptions.yield.active;
    updateLoadoutUI();
  });
  
  document.getElementById('firepowerToggle').addEventListener('click', () => {
    economy.subscriptions.firepower.active = !economy.subscriptions.firepower.active;
    updateLoadoutUI();
  });
  
  document.getElementById('hullToggle').addEventListener('click', () => {
    economy.subscriptions.hull.active = !economy.subscriptions.hull.active;
    updateLoadoutUI();
  });
  
  // Start mission
  document.getElementById('startMissionBtn').addEventListener('click', () => {
    document.getElementById('loadoutMenu').style.display = 'none';
    init();
    requestAnimationFrame(gameLoop);
  });
  
  // Return to loadout after game over
  document.getElementById('returnToLoadout').addEventListener('click', () => {
    document.getElementById('gameOver').style.display = 'none';
    document.getElementById('loadoutMenu').style.display = 'block';
    updateLoadoutUI();
  });
}

function updateLoadoutUI() {
  document.getElementById('walletAmount').textContent = economy.wallet;
  
  const updateCard = (cardId, toggleId, subscription) => {
    const card = document.getElementById(cardId);
    const toggle = document.getElementById(toggleId);
    
    if (subscription.active) {
      card.classList.add('active');
      toggle.textContent = 'ENABLED';
      toggle.classList.add('active');
    } else {
      card.classList.remove('active');
      toggle.textContent = 'DISABLED';
      toggle.classList.remove('active');
    }
  };
  
  updateCard('scannerCard', 'scannerToggle', economy.subscriptions.scanner);
  updateCard('yieldCard', 'yieldToggle', economy.subscriptions.yield);
  updateCard('firepowerCard', 'firepowerToggle', economy.subscriptions.firepower);
  updateCard('hullCard', 'hullToggle', economy.subscriptions.hull);
}

// Initialize
setupControls();
setupMenu();
document.getElementById('loadoutMenu').style.display = 'block';
updateLoadoutUI();
