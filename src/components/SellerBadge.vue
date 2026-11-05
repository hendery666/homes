<script setup>
import { computed } from 'vue'
import { getSellerLevel, getSellerLevelProgress, getSellerProgressText } from '@/composables/useSellerLevel'

const props = defineProps({ points: { type: Number, default: 0 }, progress: { type: Boolean, default: true } })
const level = computed(() => getSellerLevel(props.points))
const progress = computed(() => getSellerLevelProgress(props.points))
const progressText = computed(() => getSellerProgressText(props.points))
</script>

<template>
  <div class="seller-badge progress-badge d-flex align-items-center gap-0">
    <img :src="level.badge" :alt="level.display + ' badge'" class="badge-icon" :title="level.display" />
    <template v-if="props.progress">
      <div class="progress-container" style="flex:1; height: 18px; margin: 0 10px;">
        <div class="progress" style="height: 18px; border-radius: 10px; overflow: hidden; position: relative;">
          <div class="progress-bar" :style="{ width: (progress * 100) + '%', background: 'var(--color-primary)' }"></div>
          <div class="progress-text">{{ progressText }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.seller-badge {
  align-items: center;
  padding: 0;
  width: auto;
}
.badge-icon {
  width: 64px;
  height: 64px;
  object-fit: contain;
}

:root.dark-mode .badge-icon {
  filter: brightness(1.5) contrast(1.3) saturate(1.2);
}

.progress-container {
  min-width: 120px;
}
.progress {
  min-width: 120px;
  position: relative;
  background: var(--color-bg-purple-tint);
  border: 2px solid #000;
}

:root.dark-mode .progress {
  background: rgba(122, 90, 248, 0.2);
  border: none;
}

.progress-bar {
  height: 100%;
  transition: width 0.3s;
}
.progress-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  z-index: 1;
}
</style>
