<template>
  <Teleport to="body">
    <div class="toast-container">
      <transition-group name="toast" tag="div">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast-item', toast.type]"
        >
          <div class="toast-icon">
            <Icon v-if="toast.type === 'success'" icon="mdi:check-circle" />
            <Icon v-else-if="toast.type === 'error'" icon="mdi:alert-circle" />
            <Icon v-else-if="toast.type === 'warning'" icon="mdi:alert" />
            <Icon v-else icon="mdi:information" />
          </div>
          <div class="toast-content">
            <div v-if="toast.title" class="toast-title">{{ toast.title }}</div>
            <div class="toast-message">{{ toast.message }}</div>
          </div>
          <button class="toast-close" @click="removeToast(toast.id)">×</button>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

const toasts = ref([])
let idCounter = 0

function addToast({ message, title = '', type = 'info', duration = 4000 }) {
  const id = ++idCounter
  toasts.value.push({ id, message, title, type })

  if (duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  return id
}

function removeToast(id) {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index > -1) {
    toasts.value.splice(index, 1)
  }
}

// Expose methods for external use
defineExpose({ addToast, removeToast })
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast-item {
  pointer-events: all;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  border-radius: 12px;
  background: var(--color-bg-white);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border-left: 4px solid;
  min-width: 320px;
  max-width: 450px;
  animation: slideIn 0.3s ease-out;
}

.toast-item.success {
  border-left-color: #28a745;
}

.toast-item.error {
  border-left-color: #dc3545;
}

.toast-item.warning {
  border-left-color: #ffc107;
}

.toast-item.info {
  border-left-color: #17a2b8;
}

.toast-icon {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-item.success .toast-icon {
  color: #28a745;
}

.toast-item.error .toast-icon {
  color: #dc3545;
}

.toast-item.warning .toast-icon {
  color: #ffc107;
}

.toast-item.info .toast-icon {
  color: #17a2b8;
}

.toast-content {
  flex: 1;
  color: var(--color-text-primary);
}

.toast-title {
  font-weight: 600;
  margin-bottom: 4px;
  font-size: 15px;
}

.toast-message {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  margin-left: 8px;
  flex-shrink: 0;
  transition: color 0.2s;
}

.toast-close:hover {
  color: var(--color-text-primary);
}

/* Animations */
.toast-enter-active {
  animation: slideIn 0.3s ease-out;
}

.toast-leave-active {
  animation: slideOut 0.3s ease-in;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(400px);
    opacity: 0;
  }
}

/* Mobile responsive */
@media (max-width: 575.98px) {
  .toast-container {
    top: 10px;
    right: 10px;
    left: 10px;
  }

  .toast-item {
    min-width: unset;
    max-width: unset;
    width: 100%;
  }
}
</style>
