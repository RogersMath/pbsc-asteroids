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
  isTutorial: false,
  
  // Mission timing
  missionTimer: 0,
  missionDuration: CONFIG.MISSION.DURATION,
  asteroidsRemaining: CONFIG.MISSION.INITIAL_ASTEROIDS,
  
  // Streak tracking
  currentStreak: 0,
  streakActive: true,
  
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
function initTutorial() {
  game.player = new Ship(
    canvas.width / 2, 
    canvas.height / 2, 
    false // No hull upgrade in tutorial
  );
  game.asteroids = [];
  game.projectiles = [];
  game.particles = [];
  game.score = 0;
  game.gameOver = false;
  game.started = true;
  game.missionActive = true;
  game.isTutorial = true;
  game.missionTimer = 0;
  game.asteroidsRemaining = 0; // No pool in tutorial
  game.currentStreak = 0;
  game.streakActive = true;
  game.damageTaken = 0;
  
  // Spawn exactly 2 asteroids for tutorial
  spawnTutorialAsteroids();
  
  updateHUD();
  
  // Hide timer in tutorial
  document.getElementById('timer').parentElement.style.display = 'none';
  
  // Show tutorial message
  showTutorialMessage();
}

function spawnTutorialAsteroids() {
  // Spawn one prime and one composite in safe positions
  const prime = new Asteroid(canvas.width * 0.3, canvas.height * 0.3);
  while (!prime.isPrime) {
    const newNum = CONFIG.ASTEROID.PRIMES[Math.floor(Math.random() * CONFIG.ASTEROID.PRIMES.length)];
    prime.number = newNum;
    prime.isPrime = true;
  }
  
  const composite = new Asteroid(canvas.width * 0.7, canvas.height * 0.7);
  while (composite.isPrime) {
    const newNum = CONFIG.ASTEROID.COMPOSITES[Math.floor(Math.random() * CONFIG.ASTEROID.COMPOSITES.length)];
    composite.number = newNum;
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
    </div>
  `;
  document.body.appendChild(tutorialDiv);
  
  // Auto-remove after first action
  setTimeout(() => {
    const msg = document.getElementById('tutorialMessage');
    if (msg) {
      msg.style.opacity = '0';
      setTimeout(() => msg.remove(), 500);
    }
  }, 8000);
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
  if (game.gameOver || !game.started || !game.missionActive) return;
  
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
  const subscriptionCosts = totalCosts - Math.ceil(actionCosts) - maintenanceCost - towFee;
  document.getElementById('subscriptionCosts').textContent = '-' + subscriptionCosts + '¢';
  document.getElementById('actionCosts').textContent = '-' + Math.ceil(actionCosts) + '¢';
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
  
  // Update wallet display
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
    if (!game.missionActive) return;
    
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
}

// Initialize
setupControls();
setupGameOverToggles();

// Start with tutorial
lastTime = performance.now();
requestAnimationFrame(gameLoop);
initTutorial();
