// ================================================================
//  SMC Resampling — config.js
//  Shared constants imported by all other modules.
// ================================================================

export const N = 8;
export const MIN_W = 0.01;

// Uniform cool gray for all particles — deliberately understated
// so method colors (orange/blue/green/purple/brown) carry the visual signal.
// Particle identity is encoded by y-position, not color.
export const PARTICLE_COLOR = 'rgb(176,182,190)';
export const PALETTE = Array.from({ length: N }, () => PARTICLE_COLOR);

export const METHOD_COLORS = {
    multinomial: '#e67e22',
    stratified:  '#2980b9',
    systematic:  '#27ae60',
    residual:    '#8e44ad',
    branchkill:  '#795548',
};
