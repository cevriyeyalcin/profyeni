export const mapBounds = { x: 1150, y: 610 };
export const goals = { y: 124 };
export const box = { x: 840, y: 320 };
export const penaltyPoint = { x: 935, y: 0 };
export const defaults = {
  invMass: 0.4,
  ballInvMass: 1.235,
  ballRadius: 7.6,
  playerRadius: 14,
  kickingDamping: 0.9649,
};
export const colors = {
  white: 0xffffff,
  red: 0xe07d6e,
  blue: 0x6e9ee0,
  powerball: 0xf5c28c,
};
export const secondBallId = 24;
export const thirdBallId = 25;
export const offsideDiscs = { red: [26, 27], blue: [28, 29] };

// Offside system toggle
export let isOffsideEnabled = true;

export const setOffsideEnabled = (enabled: boolean) => {
  isOffsideEnabled = enabled;
};

export const getOffsideEnabled = () => {
  return isOffsideEnabled;
};
export const teamSize = 6;

// Dil ayarı
export let currentLanguage: 'tr' | 'en' = 'tr';

export const setLanguage = (lang: 'tr' | 'en') => {
  currentLanguage = lang;
};

export const getLanguage = () => {
  return currentLanguage;
};

// Chat slow mode settings
export let isSlowModeEnabled = true;
export const slowModeSettings = {
  normalUsers: 3000,    // 3 seconds for normal users
  vipUsers: 1000,       // 1 second for VIP users
  admins: 0             // No cooldown for admins
};

export const setSlowModeEnabled = (enabled: boolean) => {
  isSlowModeEnabled = enabled;
};

export const getSlowModeEnabled = () => {
  return isSlowModeEnabled;
};

// Duplicate connection blocking system
export let isDuplicateBlockingEnabled = true;

export const setDuplicateBlockingEnabled = (enabled: boolean) => {
  isDuplicateBlockingEnabled = enabled;
};

export const getDuplicateBlockingEnabled = () => {
  return isDuplicateBlockingEnabled;
};
