// config.js - All tunable game parameters

export const CONFIG = {
  // Mission parameters
  MISSION: {
    DURATION: 120, // seconds (2 minutes)
    INITIAL_ASTEROIDS: 30, // Total asteroid pool for the mission
  },
  
  // Ship parameters
  SHIP: {
    TURN_SPEED: 0.08,
    ACCELERATION: 0.25,
    MAX_SPEED: 4,
    FRICTION: 0.98,
    BASE_HEALTH: 100,
    HULL_UPGRADE_MULTIPLIER: 1.5, // 150 health with upgrade
    FIRE_DELAY: 400, // milliseconds
    
    // Hitboxes (elliptical)
    HITBOX_COLLECTION: { width: 35, height: 20 },
    HITBOX_COMBAT: { width: 45, height: 35 },
    
    // Rendering
    SCALE: 0.25,
    ENGINE_GLOW_COLLECTION: 0.55,
    ENGINE_GLOW_COMBAT: 0.75,
  },
  
  // Asteroid parameters
  ASTEROID: {
    BASE_RADIUS: 20,
    RADIUS_LOG_MULTIPLIER: 8,
    MIN_SPEED: 0.8,
    MAX_SPEED: 2.0,
    MIN_POINTS: 8,
    MAX_EXTRA_POINTS: 5,
    RADIUS_VARIATION_MIN: 0.7,
    RADIUS_VARIATION_MAX: 1.3,
    SPAWN_MARGIN: 100,
    
    // Number generation
    PRIME_CHANCE: 0.4,
    PRIMES: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47],
    COMPOSITES: [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28, 30],
    
    // Without firepower upgrade
    HITS_TO_BREAK: 2,
    FACTORIZATION_RELIABILITY: 0.8, // 80% chance without firepower
  },
  
  // Projectile parameters
  PROJECTILE: {
    SPEED: 8,
    LIFE: 80, // frames
    RADIUS: 3,
    COLOR: '#f59e0b',
  },
  
  // Particle effects
  PARTICLES: {
    THRUST_CHANCE: 0.3, // 30% chance per frame
    THRUST_LIFE: 20,
    THRUST_SPEED: 2,
    THRUST_SPREAD: 0.5,
    EXPLOSION_COUNT: 10,
    COLLECTION_COUNT: 15,
    EXPLOSION_LIFE: 30,
    EXPLOSION_MIN_SPEED: 1,
    EXPLOSION_MAX_SPEED: 3,
  },
  
  // Economy
  ECONOMY: {
    STARTING_WALLET: 1000,
    
    // Mandatory costs
    SPACE_TAX: 50,
    BASE_MAINTENANCE: 10, // Minimum maintenance per mission
    MAINTENANCE_PER_DAMAGE: 0.5, // Cost per point of damage taken
    TOW_FEE: 200, // If hull reaches 0
    
    // Per-action costs
    THRUST_COST: 0.01, // Per frame of thrust
    TURN_COST: 0.005, // Per frame of turning
    BULLET_COST_BASE: 0.5, // Base cost per shot
    BULLET_COST_FIREPOWER: 2.0, // Additional cost with firepower (total 2.5)
    
    // Subscriptions
    SUBSCRIPTIONS: {
      scanner: { cost: 30, name: 'Auto-Scanner Premium' },
      yield: { cost: 20, name: 'Yield Booster', bonus: 0.5 },
      firepower: { cost: 25, name: 'Firepower Enhancement' },
      hull: { cost: 35, name: 'Hull Reinforcement' },
    },
  },
  
  // Streak bonuses
  STREAKS: {
    SMALL_THRESHOLD: 3, // 3 successful collections
    SMALL_BONUS: 0.10, // +10%
    LARGE_THRESHOLD: 7, // 7 successful collections
    LARGE_BONUS: 0.30, // +30%
  },
  
  // Collision damage
  COLLISION: {
    PRIME_COMBAT: 10,
    COMPOSITE_COMBAT: 15,
    // In collection mode: composite number value as damage
  },
  
  // Visual settings
  VISUAL: {
    STARFIELD_COUNT: 80,
    STARFIELD_OPACITY: 0.6,
    
    // Colors
    PRIME_COLOR: '#3b82f6',
    PRIME_STROKE: '#60a5fa',
    COMPOSITE_COLOR: '#ef4444',
    COMPOSITE_STROKE: '#f87171',
    NEUTRAL_COLOR: '#6b7280',
    NEUTRAL_STROKE: '#9ca3af',
    COLLECTION_COLOR: '#22d3ee',
    
    // Hit flash
    HIT_FLASH_COLOR: '#ffffff',
    HIT_FLASH_DURATION: 10, // frames
  },
  
  // UI settings
  UI: {
    HEALTH_WARNING_THRESHOLD: 60,
    HEALTH_DANGER_THRESHOLD: 30,
  },
};
