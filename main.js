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
  missionHistory: [], // Track net income of each mission
  totalPrimesCollected: 0,
  bestStreak: 0,
  inflationMultiplier: 1.0, // Increases by 5% each mission
  
  subscriptions: {
    scanner: { active: true, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.scanner.cost },
    yield: { active: false, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.yield.cost },
    firepower: { active: false, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.firepower.cost },
    hull: { active: false, cost: CONFIG.ECONOMY.SUBSCRIPTIONS.hull.cost }
  },
  
  getInflatedCost(baseCost) {
    return Math.ceil(baseCost * this.inflationMultiplier);
  },
  
  getAcquisitionValue() {
    if (this.missionHistory.length < CONFIG.ECONOMY.ACQUISITION_MIN_MISSIONS) {
      return 0;
    }
    // Average of last 4 missions * 5
    const last4 = this.missionHistory.slice(-4);
    const avg = last4.reduce((sum, val) => sum + val, 0) / last4.length;
    return Math.ceil(avg * CONFIG.ECONOMY.ACQUISITION_MULTIPLIER);
  },
  
  canSellCompany() {
    return this.missionHistory.length >= CONFIG.ECONOMY.ACQUISITION_MIN_MISSIONS;
  }
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
  isTutorial: false,
  isPaused: false,
  
  // Mission timing
  missionTimer: 0,
  missionDuration: CONFIG.MISSION.DURATION,
  asteroidsRemaining: CONFIG.MISSION.INITIAL_ASTEROIDS,
  
  // Streak tracking
  currentStreak: 0,
  streakActive: true,
  
  // Damage tracking
  damageTaken: 0,
  
  // Space background (generated once)
  spaceBackground: null,
};

// Generate space background
function generateSpaceBackground() {
  const bg = {
    galaxies: [],
    stars: [],
    planet: null
  };
  
  // Generate galaxies
  for (let i = 0; i < CONFIG.VISUAL.BACKGROUND_GALAXIES; i++) {
    bg.galaxies.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 80 + Math.random() * 120,
      rotation: Math.random() * Math.PI * 2,
      opacity: 0.15 + Math.random() * 0.15
    });
  }
  
  // Generate larger decorative stars
  for (let i = 0; i < CONFIG.VISUAL.BACKGROUND_STARS; i++) {
    bg.stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 3 + Math.random() * 8,
      opacity: 0.3 + Math.random() * 0.4,
      color: ['#67e8f9', '#fbbf24', '#f87171', '#a78bfa'][Math.floor(Math.random() * 4)]
    });
  }
  
  // Maybe generate a planet
  if (Math.random() < CONFIG.VISUAL.BACKGROUND_PLANET_CHANCE) {
    const side = Math.floor(Math.random() * 4); // 0=left, 1=top, 2=right, 3=bottom
    const size = 300 + Math.random() * 500;
    let x, y;
    
    switch(side) {
      case 0: x = -size * 0.6; y = Math.random() * canvas.height; break;
      case 1: x = Math.random() * canvas.width; y = -size * 0.6; break;
      case 2: x = canvas.width + size * 0.6; y = Math.random() * canvas.height; break;
      case 3: x = Math.random() * canvas.width; y = canvas.height + size * 0.6; break;
    }
    
    bg.planet = {
      x, y, size,
      color: ['#8b5cf6', '#ec4899', '#f97316', '#14b8a6'][Math.floor(Math.random() * 4)],
      rings: Math.random() > 0.5
    };
  }
  
  return bg;
}

// Control state
const controls = {
  turnLeft: false,
  turnRight: false,
  thrust: false
};

// Game initialization
function initTutorial() {
  game.player = null; // Don't spawn player yet
  game.asteroids = [];
  game.projectiles = [];
  game.particles = [];
  game.score = 0;
  game.gameOver = false;
  game.started = true;
  game.missionActive = false; // Not active until player dismisses tutorial
  game.isTutorial = true;
  game.missionTimer = 0;
  game.asteroidsRemaining = 0; // No pool in tutorial
  game.currentStreak = 0;
  game.streakActive = true;
  game.damageTaken = 0;
  
  // Set initial HUD values
  document.getElementById('health').textContent = '100';
  document.getElementById('score').textContent = '0';
  document.getElementById('streakDisplay').style.display = 'none';
  
  // Spawn exactly 2 asteroids for tutorial (they'll float around)
  spawnTutorialAsteroids();
  
  // Hide timer in tutorial
  document.getElementById('timer').parentElement.style.display = 'none';
  
  // Show tutorial message
  showTutorialMessage();
}

function spawnTutorialAsteroids() {
  // Spawn one prime and one composite in safe positions
  const prime = new Asteroid(canvas.width * 0.3, canvas.height * 0.3);
  // Already generated as prime or composite, just ensure it's prime
  if (!prime.isPrime) {
    // Force it to be a small prime for tutorial
    prime.number = [2, 3, 5, 7, 11][Math.floor(Math.random() * 5)];
    prime.isPrime = true;
  }
  
  const composite = new Asteroid(canvas.width * 0.7, canvas.height * 0.7);
  // Ensure it's composite
  if (composite.isPrime) {
    // Force it to be a small composite for tutorial
    composite.number = [4, 6, 8, 9, 10][Math.floor(Math.random() * 5)];
    composite.isPrime = false;
  }
  
  // Slow them down for tutorial
  prime.vx *= 0.5;
  prime.vy *= 0.5;
  composite.vx *= 0.5;
  composite.vy *= 0.5;
  
  game.asteroids.push(prime, composite);
}

function showTutorialMessage() {
  const tutorialDiv = document.createElement('div');
  tutorialDiv.id = 'tutorialMessage';
  tutorialDiv.innerHTML = `
    <div class="tutorial-box">
      <div class="tutorial-title">TRAINING MISSION</div>
      <div class="tutorial-text">
        <p><strong>BLUE asteroids</strong> are PRIME numbers - collect them in COLLECT mode</p>
        <p><strong>RED asteroids</strong> are COMPOSITE numbers - destroy them in COMBAT mode</p>
        <p>Toggle modes with SPACEBAR or the mode button</p>
        <p><strong>No time limit. Clear both asteroids to begin!</strong></p>
      </div>
      <button class="tutorial-btn" id="tutorialOkBtn">OKAY, GOT IT</button>
    </div>
  `;
  document.body.appendChild(tutorialDiv);
  
  // When player clicks OK, spawn ship and start mission
  document.getElementById('tutorialOkBtn').addEventListener('click', () => {
    const msg = document.getElementById('tutorialMessage');
    msg.style.opacity = '0';
    setTimeout(() => msg.remove(), 300);
    
    // NOW spawn the ship and activate mission
    game.player = new Ship(canvas.width / 2, canvas.height / 2, false);
    game.missionActive = true;
    updateHUD();
  });
}

function initMission() {
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
  game.isTutorial = false;
  game.missionTimer = 0;
  game.asteroidsRemaining = CONFIG.MISSION.INITIAL_ASTEROIDS;
  game.currentStreak = 0;
  game.streakActive = true;
  game.damageTaken = 0;
  
  // Generate new space background for this mission
  game.spaceBackground = generateSpaceBackground();
  
  // Spawn initial asteroids
  for (let i = 0; i < Math.min(6, game.asteroidsRemaining); i++) {
    spawnAsteroid();
  }
  
  updateHUD();
  
  // Show timer for real mission
  document.getElementById('timer').parentElement.style.display = 'flex';
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
      maxLife: CONFIG.PARTICLES.EXPLOSION_LIFE,
      color: color
    });
  }
}

// Update loop - NOW WITH PROPER DELTA TIME
function update(dt) {
  if (game.gameOver || !game.started || !game.missionActive || game.isPaused) return;
  
  // dt is in milliseconds, convert to seconds for physics
  const dtSeconds = dt / 1000;
  
  // Update mission timer (skip in tutorial)
  if (!game.isTutorial) {
    game.missionTimer += dtSeconds;
    if (game.missionTimer >= game.missionDuration) {
      endMission();
      return;
    }
    updateTimer();
  }
  
  // Update player
  game.player.update(controls, dtSeconds, game.particles);
  
  // Auto-fire in combat mode
  if (game.player.combatMode) {
    if (game.player.fire(game.projectiles, economy.subscriptions.firepower.active)) {
      playSFX('shoot');
    }
  }
  
  // Update asteroids
  game.asteroids.forEach(asteroid => asteroid.update(canvas, dtSeconds));
  
  // Update projectiles (life is in milliseconds)
  game.projectiles = game.projectiles.filter(proj => {
    proj.x += proj.vx * dtSeconds;
    proj.y += proj.vy * dtSeconds;
    proj.life -= dt; // Subtract milliseconds
    return proj.life > 0 && 
           proj.x > -50 && proj.x < canvas.width + 50 && 
           proj.y > -50 && proj.y < canvas.height + 50;
  });
  
  // Update particles (life is in milliseconds)
  game.particles = game.particles.filter(p => {
    p.x += p.vx * dtSeconds;
    p.y += p.vy * dtSeconds;
    p.life -= dt; // Subtract milliseconds
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
  
  // Spawn new asteroids if needed (skip in tutorial)
  if (!game.isTutorial && game.asteroids.length < 5 && game.asteroidsRemaining > 0) {
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
  
  // Draw space background if not generated yet
  if (!game.spaceBackground) {
    game.spaceBackground = generateSpaceBackground();
  }
  
  // Draw planet (behind everything)
  if (game.spaceBackground.planet) {
    const p = game.spaceBackground.planet;
    ctx.save();
    ctx.globalAlpha = 0.3;
    
    // Planet body
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    gradient.addColorStop(0, p.color);
    gradient.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Rings if applicable
    if (p.rings) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.size * 0.15;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size * 1.4, p.size * 0.3, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  
  // Draw galaxies
  game.spaceBackground.galaxies.forEach(g => {
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rotation);
    ctx.globalAlpha = g.opacity;
    
    // Spiral galaxy effect
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, g.size);
    gradient.addColorStop(0, '#a78bfa');
    gradient.addColorStop(0.5, '#6366f1');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = gradient;
    
    ctx.beginPath();
    ctx.ellipse(0, 0, g.size, g.size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.ellipse(0, 0, g.size * 0.3, g.size, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    ctx.restore();
  });
  
  // Draw decorative stars
  game.spaceBackground.stars.forEach(s => {
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.fillStyle = s.color;
    
    // 4-pointed star
    ctx.translate(s.x, s.y);
    ctx.beginPath();
    ctx.moveTo(0, -s.size);
    ctx.lineTo(s.size * 0.2, -s.size * 0.2);
    ctx.lineTo(s.size, 0);
    ctx.lineTo(s.size * 0.2, s.size * 0.2);
    ctx.lineTo(0, s.size);
    ctx.lineTo(-s.size * 0.2, s.size * 0.2);
    ctx.lineTo(-s.size, 0);
    ctx.lineTo(-s.size * 0.2, -s.size * 0.2);
    ctx.closePath();
    ctx.fill();
    
    ctx.globalAlpha = 1;
    ctx.restore();
  });
  
  // Draw starfield (small dots)
  ctx.fillStyle = `rgba(255, 255, 255, ${CONFIG.VISUAL.STARFIELD_OPACITY})`;
  for (let i = 0; i < CONFIG.VISUAL.STARFIELD_COUNT; i++) {
    const x = (i * 137.5) % canvas.width;
    const y = (i * 237.5) % canvas.height;
    ctx.fillRect(x, y, 1, 1);
  }
  
  // Draw particles
  game.particles.forEach(p => {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / p.maxLife;
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
  if (!game.gameOver && game.missionActive && game.player) {
    game.player.draw(ctx);
  }
}

// UI updates
function updateTimer() {
  const timeLeft = Math.max(0, game.missionDuration - game.missionTimer);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = Math.floor(timeLeft % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.textContent = timeString;
  }
}

function updateHUD() {
  if (!game.player) return; // Skip if player hasn't spawned yet
  
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
  
  // Update streak display
  const streakDisplay = document.getElementById('streakDisplay');
  const streakEl = document.getElementById('streak');
  if (game.currentStreak >= CONFIG.STREAKS.SMALL_THRESHOLD) {
    streakDisplay.style.display = 'flex';
    streakEl.textContent = `${game.currentStreak}x`;
  } else {
    streakDisplay.style.display = 'none';
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
  
  if (game.isTutorial) {
    // Tutorial complete - show simple message and start real game
    showTutorialComplete();
  } else {
    // Real mission - show full results
    showMissionResults();
  }
}

function showTutorialComplete() {
  const tutorialComplete = document.createElement('div');
  tutorialComplete.id = 'tutorialComplete';
  tutorialComplete.innerHTML = `
    <div class="tutorial-complete-box">
      <div class="tutorial-complete-title">TRAINING COMPLETE!</div>
      <div class="tutorial-complete-text">
        <p>You collected ${game.score} prime${game.score !== 1 ? 's' : ''}!</p>
        <p>Now you're ready for real mining operations.</p>
        <p><strong>Real missions have:</strong></p>
        <ul>
          <li>2-minute time limit</li>
          <li>30 asteroids to process</li>
          <li>Operating costs to manage</li>
          <li>Upgrades you can enable/disable</li>
        </ul>
      </div>
      <button class="start-mission-btn" id="startRealMission">BEGIN FIRST MISSION</button>
    </div>
  `;
  document.body.appendChild(tutorialComplete);
  
  document.getElementById('startRealMission').addEventListener('click', () => {
    tutorialComplete.remove();
    initMission();
  });
}

function showMissionResults() {
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
  
  // Calculate costs WITH INFLATION
  let totalCosts = economy.getInflatedCost(CONFIG.ECONOMY.SPACE_TAX);
  
  // Subscription costs (inflated)
  const subscriptionCosts = 
    (economy.subscriptions.scanner.active ? economy.getInflatedCost(economy.subscriptions.scanner.cost) : 0) +
    (economy.subscriptions.yield.active ? economy.getInflatedCost(economy.subscriptions.yield.cost) : 0) +
    (economy.subscriptions.firepower.active ? economy.getInflatedCost(economy.subscriptions.firepower.cost) : 0) +
    (economy.subscriptions.hull.active ? economy.getInflatedCost(economy.subscriptions.hull.cost) : 0);
  
  totalCosts += subscriptionCosts;
  
  // Action costs (inflated)
  const actionCosts = economy.getInflatedCost(game.player.getTotalActionCosts());
  totalCosts += actionCosts;
  
  // Maintenance costs (inflated, based on damage taken)
  const baseMaintenance = CONFIG.ECONOMY.BASE_MAINTENANCE + 
                         Math.ceil(game.damageTaken * CONFIG.ECONOMY.MAINTENANCE_PER_DAMAGE);
  const maintenanceCost = economy.getInflatedCost(baseMaintenance);
  totalCosts += maintenanceCost;
  
  // Tow fee if hull destroyed (inflated)
  const towFee = (game.player.health <= 0) ? economy.getInflatedCost(CONFIG.ECONOMY.TOW_FEE) : 0;
  totalCosts += towFee;
  
  const netProfit = totalEarnings - totalCosts;
  economy.wallet += netProfit;
  
  // Track mission history and stats
  economy.missionHistory.push(netProfit);
  economy.totalPrimesCollected += game.score;
  if (game.currentStreak > economy.bestStreak) {
    economy.bestStreak = game.currentStreak;
  }
  
  // Apply inflation for next mission
  economy.inflationMultiplier *= CONFIG.ECONOMY.INFLATION_RATE;
  
  // Check for bankruptcy
  if (economy.wallet < 0) {
    showBankruptcyScreen();
    return;
  }
  
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
  
  // Show cost breakdown (including tax in subscriptions)
  document.getElementById('subscriptionCosts').textContent = '-' + (subscriptionCosts + economy.getInflatedCost(CONFIG.ECONOMY.SPACE_TAX)) + '¢';
  document.getElementById('actionCosts').textContent = '-' + actionCosts + '¢';
  document.getElementById('maintenanceCost').textContent = '-' + maintenanceCost + '¢';
  
  const towFeeEl = document.getElementById('towFeeLine');
  if (towFee > 0) {
    towFeeEl.style.display = 'flex';
    document.getElementById('towFee').textContent = '-' + towFee + '¢';
  } else {
    towFeeEl.style.display = 'none';
  }
  
  const netProfitEl = document.getElementById('netProfit');
  netProfitEl.textContent = netProfit + '¢';
  netProfitEl.style.color = netProfit >= 0 ? '#22d3ee' : '#ef4444';
  
  // Update acquisition tracker
  const acquisitionValue = economy.getAcquisitionValue();
  const acquisitionTracker = document.getElementById('acquisitionTracker');
  const sellBtn = document.getElementById('sellCompanyBtn');
  
  if (economy.canSellCompany()) {
    acquisitionTracker.style.display = 'block';
    sellBtn.style.display = 'block';
    document.getElementById('acquisitionValue').textContent = acquisitionValue + '¢';
  } else {
    acquisitionTracker.style.display = 'none';
    sellBtn.style.display = 'none';
  }
  
  // Update wallet and cost displays for next mission
  updateLoadoutToggles();
  
  document.getElementById('gameOver').style.display = 'block';
}

// Game loop with proper delta time
let lastTime = 0;
function gameLoop(timestamp) {
  const dt = Math.min(timestamp - lastTime, 100); // Cap dt at 100ms to prevent huge jumps
  lastTime = timestamp;
  
  if (game.missionActive) {
    update(dt);
  }
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
    if (e.key === 'Escape') {
      e.preventDefault();
      if (game.missionActive && !game.gameOver) {
        togglePause();
      }
      return;
    }
    
    if (!game.missionActive || game.isPaused) return;
    
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      controls.turnLeft = true;
      turnLeftBtn.classList.add('active');
    }
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      controls.turnRight = true;
      turnRightBtn.classList.add('active');
    }
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      controls.thrust = true;
      thrustBtn.classList.add('active');
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (game.player) {
        game.player.combatMode = !game.player.combatMode;
        updateModeButton();
      }
    }
  });
  
  window.addEventListener('keyup', (e) => {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      controls.turnLeft = false;
      turnLeftBtn.classList.remove('active');
    }
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      controls.turnRight = false;
      turnRightBtn.classList.remove('active');
    }
    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      controls.thrust = false;
      thrustBtn.classList.remove('active');
    }
  });
  
  // Touch controls
  const setupButton = (btn, control) => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!game.missionActive) return;
      controls[control] = true;
      btn.classList.add('active');
    });
    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      controls[control] = false;
      btn.classList.remove('active');
    });
    btn.addEventListener('mousedown', () => {
      if (!game.missionActive) return;
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

// Loadout toggles on game over screen
function updateLoadoutToggles() {
  document.getElementById('walletAmount').textContent = economy.wallet + '¢';
  
  // Update costs to show inflated values for NEXT mission
  document.getElementById('scannerCost').textContent = economy.getInflatedCost(CONFIG.ECONOMY.SUBSCRIPTIONS.scanner.cost) + '¢';
  document.getElementById('yieldCost').textContent = economy.getInflatedCost(CONFIG.ECONOMY.SUBSCRIPTIONS.yield.cost) + '¢';
  document.getElementById('firepowerCost').textContent = economy.getInflatedCost(CONFIG.ECONOMY.SUBSCRIPTIONS.firepower.cost) + '¢';
  document.getElementById('hullCost').textContent = economy.getInflatedCost(CONFIG.ECONOMY.SUBSCRIPTIONS.hull.cost) + '¢';
  
  // Update toggle states
  document.getElementById('scannerToggle').checked = economy.subscriptions.scanner.active;
  document.getElementById('yieldToggle').checked = economy.subscriptions.yield.active;
  document.getElementById('firepowerToggle').checked = economy.subscriptions.firepower.active;
  document.getElementById('hullToggle').checked = economy.subscriptions.hull.active;
}

function setupGameOverToggles() {
  document.getElementById('scannerToggle').addEventListener('change', (e) => {
    economy.subscriptions.scanner.active = e.target.checked;
  });
  
  document.getElementById('yieldToggle').addEventListener('change', (e) => {
    economy.subscriptions.yield.active = e.target.checked;
  });
  
  document.getElementById('firepowerToggle').addEventListener('change', (e) => {
    economy.subscriptions.firepower.active = e.target.checked;
  });
  
  document.getElementById('hullToggle').addEventListener('change', (e) => {
    economy.subscriptions.hull.active = e.target.checked;
  });
  
  // Next mission button
  document.getElementById('nextMissionBtn').addEventListener('click', () => {
    document.getElementById('gameOver').style.display = 'none';
    lastTime = performance.now();
    initMission();
  });
  
  // Sell company button
  document.getElementById('sellCompanyBtn').addEventListener('click', () => {
    showVictoryScreen();
  });
}

// Pause menu functions
function togglePause() {
  if (game.isTutorial) return; // Can't pause tutorial
  
  game.isPaused = !game.isPaused;
  
  if (game.isPaused) {
    document.getElementById('pauseMenu').style.display = 'flex';
    document.getElementById('pauseMissions').textContent = economy.missionHistory.length;
    document.getElementById('pauseWallet').textContent = economy.wallet + '¢';
    document.getElementById('pauseAcquisition').textContent = economy.getAcquisitionValue() + '¢';
  } else {
    document.getElementById('pauseMenu').style.display = 'none';
  }
}

function setupPauseMenu() {
  // Menu button
  document.getElementById('menuBtn').addEventListener('click', () => {
    if (game.missionActive && !game.gameOver) {
      togglePause();
    }
  });
  
  // Resume button
  document.getElementById('resumeBtn').addEventListener('click', () => {
    togglePause();
  });
  
  // Quit button
  document.getElementById('quitBtn').addEventListener('click', () => {
    game.isPaused = false;
    game.missionActive = false;
    game.gameOver = true;
    document.getElementById('pauseMenu').style.display = 'none';
    endMission();
  });
}

// Victory screen
function showVictoryScreen() {
  const salePrice = economy.getAcquisitionValue();
  const avgIncome = economy.missionHistory.length > 0 ?
    Math.ceil(economy.missionHistory.reduce((a, b) => a + b, 0) / economy.missionHistory.length) : 0;
  
  document.getElementById('gameOver').style.display = 'none';
  document.getElementById('finalSalePrice').textContent = salePrice + '¢';
  document.getElementById('finalMissions').textContent = economy.missionHistory.length;
  document.getElementById('finalPrimes').textContent = economy.totalPrimesCollected;
  document.getElementById('finalAvgIncome').textContent = avgIncome + '¢';
  document.getElementById('finalBestStreak').textContent = economy.bestStreak + 'x';
  
  document.getElementById('victoryScreen').style.display = 'flex';
}

// Bankruptcy screen
function showBankruptcyScreen() {
  const acquisitionValue = economy.getAcquisitionValue();
  const finalScore = economy.wallet + acquisitionValue;
  const avgIncome = economy.missionHistory.length > 0 ?
    Math.ceil(economy.missionHistory.reduce((a, b) => a + b, 0) / economy.missionHistory.length) : 0;
  
  // Update victory screen to show bankruptcy version
  document.getElementById('gameOver').style.display = 'none';
  
  // Add bankruptcy styling
  document.querySelector('.victory-container').classList.add('bankruptcy');
  
  // Change title and subtitle for bankruptcy
  document.getElementById('victoryTitle').textContent = 'BANKRUPTCY!';
  document.getElementById('victorySubtitle').textContent = 'Your mining operation has run out of funds';
  
  document.getElementById('finalSalePrice').textContent = finalScore + '¢';
  document.getElementById('finalMissions').textContent = economy.missionHistory.length;
  document.getElementById('finalPrimes').textContent = economy.totalPrimesCollected;
  document.getElementById('finalAvgIncome').textContent = avgIncome + '¢';
  document.getElementById('finalBestStreak').textContent = economy.bestStreak + 'x';
  
  // Change label for bankruptcy
  const salePriceLabel = document.querySelector('.final-label');
  if (salePriceLabel) {
    salePriceLabel.textContent = 'FINAL SCORE';
  }
  
  document.getElementById('victoryScreen').style.display = 'flex';
}

function setupVictoryScreen() {
  document.getElementById('playAgainBtn').addEventListener('click', () => {
    // Reset everything
    economy.wallet = CONFIG.ECONOMY.STARTING_WALLET;
    economy.missionHistory = [];
    economy.totalPrimesCollected = 0;
    economy.bestStreak = 0;
    economy.inflationMultiplier = 1.0;
    economy.subscriptions.scanner.active = true;
    economy.subscriptions.yield.active = false;
    economy.subscriptions.firepower.active = false;
    economy.subscriptions.hull.active = false;
    
    // Reset victory screen text and styling for next time
    document.querySelector('.victory-container').classList.remove('bankruptcy');
    document.getElementById('victoryTitle').textContent = 'ACQUISITION COMPLETE!';
    document.getElementById('victorySubtitle').textContent = "Standard Asteroid, Inc. has purchased your operation";
    const salePriceLabel = document.querySelector('.final-label');
    if (salePriceLabel) {
      salePriceLabel.textContent = 'SALE PRICE';
    }
    
    document.getElementById('victoryScreen').style.display = 'none';
    lastTime = performance.now();
    initTutorial();
  });
}

// Initialize
setupControls();
setupGameOverToggles();
setupPauseMenu();
setupVictoryScreen();

// Start with tutorial
lastTime = performance.now();
requestAnimationFrame(gameLoop);
initTutorial();