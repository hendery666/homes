// Seller level & progress logic for gamification
// Usage: import { getSellerLevel, getSellerLevelProgress, getSellerProgressText, LEVELS } from '@/composables/useSellerLevel'

import bronzeBadge from '@/assets/badges/bronze.png'
import silverBadge from '@/assets/badges/silver.png'
import goldBadge from '@/assets/badges/gold.png'
import platinumBadge from '@/assets/badges/platinum.png'
import diamondBadge from '@/assets/badges/diamond.png'

export const LEVELS = [
  { key: "bronze", min: 0, max: 49, display: "Bronze", color: "#cd7f32", pointsToNext: 50, badge: bronzeBadge },
  { key: "silver", min: 50, max: 149, display: "Silver", color: "#c0c0c0", pointsToNext: 100, badge: silverBadge },
  { key: "gold", min: 150, max: 299, display: "Gold", color: "#ffd700", pointsToNext: 150, badge: goldBadge },
  { key: "platinum", min: 300, max: 499, display: "Platinum", color: "#e5e4e2", pointsToNext: 200, badge: platinumBadge },
  { key: "diamond", min: 500, max: Infinity, display: "Diamond", color: "#00e3ff", pointsToNext: null, badge: diamondBadge },
]

export function getSellerLevel(points) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const lvl = LEVELS[i];
    if (points >= lvl.min) return lvl;
  }
  return LEVELS[0];
}

export function getSellerLevelProgress(points) {
  const level = getSellerLevel(points);
  if (level.key === "diamond") return 1;
  const current = points - level.min;
  return Math.min(current / (level.pointsToNext || 1), 1);
}

export function getSellerProgressText(points) {
  const level = getSellerLevel(points);
  if (level.key === "diamond") return `Max Level`;
  return `${Math.max(points - level.min, 0)}/${level.pointsToNext} to ${level.display === "Diamond" ? "Max" : LEVELS[LEVELS.findIndex(l=>l.key===level.key)+1].display}`;
}
