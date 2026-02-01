import { CONFIG } from '../config.js';

// Math utilities
export function isPrime(n) {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

export function getFactors(n) {
  const factors = [];
  let temp = n;
  
  while (temp % 2 === 0) {
    factors.push(2);
    temp /= 2;
  }
  
  for (let i = 3; i * i <= temp; i += 2) {
    while (temp % i === 0) {
      factors.push(i);
      temp /= i;
    }
  }
  
  if (temp > 2) factors.push(temp);
  
  return factors;
}

// Asteroid class
export class Asteroid {
  constructor(x, y, number = null) {
    this.x = x;
    this.y = y;
    
    // Generate a number if not provided
    if (number === null) {
      // Keep generating until we get the right type (prime or composite)
      const wantPrime = Math.random() < CONFIG.ASTEROID.PRIME_CHANCE;
      let attempts = 0;
      do {
        this.number = Math.floor(Math.random() * (CONFIG.ASTEROID.MAX_NUMBER - CONFIG.ASTEROID.MIN_NUMBER + 1)) + CONFIG.ASTEROID.MIN_NUMBER;
        attempts++;
        if (attempts > 100) { // Fallback to prevent infinite loop
          this.number = wantPrime ? 7 : 6;
          break;
        }
      } while (isPrime(this.number) !== wantPrime);
    } else {
      this.number = number;
    }
    
    this.isPrime = isPrime(this.number);
    this.radius = CONFIG.ASTEROID.BASE_RADIUS + 
                  Math.log(this.number) * CONFIG.ASTEROID.RADIUS_LOG_MULTIPLIER;
    
    // Hit counter for composites (need 2 hits without firepower upgrade)
    this.hits = 0;
    this.flashTimer = 0;
    this.flashStart = 0;
    
    // Random velocity (in pixels per second)
    const angle = Math.random() * Math.PI * 2;
    const speed = CONFIG.ASTEROID.MIN_SPEED + 
                  Math.random() * (CONFIG.ASTEROID.MAX_SPEED - CONFIG.ASTEROID.MIN_SPEED);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotation = 0;
    
    // Generate random shape
    this.points = [];
    const numPoints = CONFIG.ASTEROID.MIN_POINTS + 
                     Math.floor(Math.random() * CONFIG.ASTEROID.MAX_EXTRA_POINTS);
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const radiusVariation = CONFIG.ASTEROID.RADIUS_VARIATION_MIN + 
        Math.random() * (CONFIG.ASTEROID.RADIUS_VARIATION_MAX - CONFIG.ASTEROID.RADIUS_VARIATION_MIN);
      this.points.push({
        x: Math.cos(angle) * this.radius * radiusVariation,
        y: Math.sin(angle) * this.radius * radiusVariation
      });
    }
  }
  
  update(canvas, dt) {
    // dt is in seconds, velocities are in pixels/second
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Update flash timer
    if (this.flashTimer > 0) {
      this.flashTimer -= dt * 1000; // Convert dt to milliseconds
    }
    
    // Wrap around screen
    if (this.x < -this.radius) this.x = canvas.width + this.radius;
    if (this.x > canvas.width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = canvas.height + this.radius;
    if (this.y > canvas.height + this.radius) this.y = -this.radius;
  }
  
  draw(ctx, scannerActive) {
    ctx.save();
    ctx.translate(this.x, this.y);
    
    // Flash white if hit but not destroyed
    if (this.flashTimer > 0) {
      ctx.fillStyle = CONFIG.VISUAL.HIT_FLASH_COLOR;
      ctx.strokeStyle = CONFIG.VISUAL.HIT_FLASH_COLOR;
    } else {
      // Color based on scanner subscription
      if (scannerActive) {
        ctx.fillStyle = this.isPrime ? CONFIG.VISUAL.PRIME_COLOR : CONFIG.VISUAL.COMPOSITE_COLOR;
        ctx.strokeStyle = this.isPrime ? CONFIG.VISUAL.PRIME_STROKE : CONFIG.VISUAL.COMPOSITE_STROKE;
      } else {
        ctx.fillStyle = CONFIG.VISUAL.NEUTRAL_COLOR;
        ctx.strokeStyle = CONFIG.VISUAL.NEUTRAL_STROKE;
      }
    }
    ctx.lineWidth = 2;
    
    // Draw shape
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (let i = 1; i < this.points.length; i++) {
      ctx.lineTo(this.points[i].x, this.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw number (always upright)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + Math.max(16, this.radius * 0.6) + 'px Orbitron';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.number, 0, 0);
    
    ctx.restore();
  }
  
  hit(firepowerActive) {
    // Primes always destroyed in one hit
    if (this.isPrime) {
      return { destroyed: true, factored: false };
    }
    
    // Composites
    this.hits++;
    
    // With firepower: instant break
    if (firepowerActive) {
      return { destroyed: true, factored: true };
    }
    
    // Without firepower: need 2 hits
    if (this.hits >= CONFIG.ASTEROID.HITS_TO_BREAK) {
      // 80% chance to factor
      if (Math.random() < CONFIG.ASTEROID.FACTORIZATION_RELIABILITY) {
        return { destroyed: true, factored: true };
      } else {
        // Shot bounced off even after 2 hits
        return { destroyed: true, factored: false };
      }
    }
    
    // First hit - flash white but don't destroy
    this.flashTimer = CONFIG.VISUAL.HIT_FLASH_DURATION;
    return { destroyed: false, factored: false };
  }
  
  factor() {
    const factors = getFactors(this.number);
    const newAsteroids = [];
    
    for (let factor of factors) {
      const angle = Math.random() * Math.PI * 2;
      const asteroid = new Asteroid(this.x, this.y, factor);
      // Add some velocity variation (in pixels/second)
      asteroid.vx += Math.cos(angle) * 30;
      asteroid.vy += Math.sin(angle) * 30;
      newAsteroids.push(asteroid);
    }
    
    return newAsteroids;
  }
}

// Collision detection
export function checkCollision(obj1, obj2, radius1, radius2) {
  const dx = obj1.x - obj2.x;
  const dy = obj1.y - obj2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < radius1 + radius2;
}