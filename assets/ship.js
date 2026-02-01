import { CONFIG } from '../config.js';

// Ship class - The Bunny
export class Ship {
  constructor(x, y, hullUpgrade = false) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.health = hullUpgrade ? 
      CONFIG.SHIP.BASE_HEALTH * CONFIG.SHIP.HULL_UPGRADE_MULTIPLIER : 
      CONFIG.SHIP.BASE_HEALTH;
    this.maxHealth = this.health;
    this.combatMode = false;
    this.canFire = true;
    this.fireDelay = CONFIG.SHIP.FIRE_DELAY;
    
    // Cost tracking (accumulates costs in cents)
    this.actionCosts = {
      thrust: 0,
      turn: 0,
      bullets: 0,
    };
    
    this.hitboxCollection = CONFIG.SHIP.HITBOX_COLLECTION;
    this.hitboxCombat = CONFIG.SHIP.HITBOX_COMBAT;
  }
  
  getHitbox() {
    return this.combatMode ? this.hitboxCombat : this.hitboxCollection;
  }
  
  update(controls, dt, particles) {
    // dt is in seconds
    
    // Rotation (costs per second, scaled by dt)
    if (controls.turnLeft) {
      this.rotation -= CONFIG.SHIP.TURN_SPEED * dt;
      this.actionCosts.turn += CONFIG.ECONOMY.TURN_COST_PER_SECOND * dt;
    }
    if (controls.turnRight) {
      this.rotation += CONFIG.SHIP.TURN_SPEED * dt;
      this.actionCosts.turn += CONFIG.ECONOMY.TURN_COST_PER_SECOND * dt;
    }
    
    // Thrust (costs per second, scaled by dt)
    if (controls.thrust) {
      const angle = this.rotation;
      this.vx += Math.cos(angle) * CONFIG.SHIP.ACCELERATION * dt;
      this.vy += Math.sin(angle) * CONFIG.SHIP.ACCELERATION * dt;
      this.actionCosts.thrust += CONFIG.ECONOMY.THRUST_COST_PER_SECOND * dt;
      
      // Thrust particles (chance is per frame, keep as-is)
      if (Math.random() < CONFIG.PARTICLES.THRUST_CHANCE) {
        particles.push({
          x: this.x - Math.cos(angle) * 20,
          y: this.y - Math.sin(angle) * 20,
          vx: -Math.cos(angle) * CONFIG.PARTICLES.THRUST_SPEED + 
              (Math.random() - 0.5) * CONFIG.PARTICLES.THRUST_SPREAD,
          vy: -Math.sin(angle) * CONFIG.PARTICLES.THRUST_SPEED + 
              (Math.random() - 0.5) * CONFIG.PARTICLES.THRUST_SPREAD,
          life: CONFIG.PARTICLES.THRUST_LIFE,
          maxLife: CONFIG.PARTICLES.THRUST_LIFE,
          color: '#22d3ee'
        });
      }
    }
    
    // Apply friction (exponential damping)
    // friction = 0.985 means 1.5% velocity lost per frame at 60fps
    // Convert to continuous damping: damping = -ln(friction) * 60
    const dampingRate = -Math.log(CONFIG.SHIP.FRICTION) * 60;
    const frictionFactor = Math.exp(-dampingRate * dt);
    this.vx *= frictionFactor;
    this.vy *= frictionFactor;
    
    // Limit speed
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > CONFIG.SHIP.MAX_SPEED) {
      this.vx = (this.vx / speed) * CONFIG.SHIP.MAX_SPEED;
      this.vy = (this.vy / speed) * CONFIG.SHIP.MAX_SPEED;
    }
    
    // Update position (velocities are in pixels/second)
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Wrap around screen
    const canvas = { width: window.innerWidth, height: window.innerHeight };
    if (this.x < -50) this.x = canvas.width + 50;
    if (this.x > canvas.width + 50) this.x = -50;
    if (this.y < -50) this.y = canvas.height + 50;
    if (this.y > canvas.height + 50) this.y = -50;
  }
  
  fire(projectiles, firepowerActive) {
    if (!this.combatMode || !this.canFire) return false;
    
    // Calculate bullet cost
    const bulletCost = CONFIG.ECONOMY.BULLET_COST_BASE + 
      (firepowerActive ? CONFIG.ECONOMY.BULLET_COST_FIREPOWER : 0);
    
    this.actionCosts.bullets += bulletCost;
    
    const angle = this.rotation;
    projectiles.push({
      x: this.x + Math.cos(angle) * 30,
      y: this.y + Math.sin(angle) * 30,
      vx: Math.cos(angle) * CONFIG.PROJECTILE.SPEED + this.vx,
      vy: Math.sin(angle) * CONFIG.PROJECTILE.SPEED + this.vy,
      life: CONFIG.PROJECTILE.LIFE,
      maxLife: CONFIG.PROJECTILE.LIFE
    });
    
    this.canFire = false;
    setTimeout(() => this.canFire = true, this.fireDelay);
    
    return true;
  }
  
  takeDamage(amount) {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
    return this.health <= 0;
  }
  
  getTotalActionCosts() {
    return this.actionCosts.thrust + this.actionCosts.turn + this.actionCosts.bullets;
  }
  
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.scale(CONFIG.SHIP.SCALE, CONFIG.SHIP.SCALE);
    
    // Engine glow
    ctx.globalAlpha = this.combatMode ? 
      CONFIG.SHIP.ENGINE_GLOW_COMBAT : 
      CONFIG.SHIP.ENGINE_GLOW_COLLECTION;
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.ellipse(-120, -70, 60, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-120, 70, 60, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    
    // Wings
    this.drawWings(ctx);
    
    // Hull
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(20, 0, 135, 72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Cockpit
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(70, 0, 35, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Energy spine
    ctx.fillStyle = this.combatMode ? '#f59e0b' : '#22d3ee';
    ctx.fillRect(-40, -5, 110, 10);
    
    ctx.restore();
  }
  
  drawWings(ctx) {
    ctx.fillStyle = '#e5e7eb';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2;
    
    if (this.combatMode) {
      // Deployed wings
      ctx.save();
      ctx.translate(-10, -40);
      ctx.rotate(-0.61);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(90, -70, 200, -60, 270, -5);
      ctx.bezierCurveTo(220, 20, 120, 25, 0, 25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      
      ctx.save();
      ctx.translate(-10, 40);
      ctx.rotate(0.61);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(90, 70, 200, 60, 270, 5);
      ctx.bezierCurveTo(220, -20, 120, -25, 0, -25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else {
      // Retracted wings
      ctx.save();
      ctx.translate(-10, -40);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(90, -70, 200, -60, 270, -5);
      ctx.bezierCurveTo(220, 20, 120, 25, 0, 25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      
      ctx.save();
      ctx.translate(-10, 40);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(90, 70, 200, 60, 270, 5);
      ctx.bezierCurveTo(220, -20, 120, -25, 0, -25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

// Collision detection helper
export function checkEllipseCircleCollision(ship, circle, circleRadius) {
  const hitbox = ship.getHitbox();
  const a = hitbox.width / 2;
  const b = hitbox.height / 2;
  
  const dx = circle.x - ship.x;
  const dy = circle.y - ship.y;
  const cos = Math.cos(-ship.rotation);
  const sin = Math.sin(-ship.rotation);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  
  const ellipseValue = (localX * localX) / (a * a) + (localY * localY) / (b * b);
  const circleContribution = circleRadius / Math.max(a, b);
  
  return ellipseValue <= (1 + circleContribution) * (1 + circleContribution);
}