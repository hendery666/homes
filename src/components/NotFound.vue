<template>
  <div class="not-found-page">
    <div class="container">
      <div class="error-content text-center">
        <div class="error-icon mb-4">
          <Icon icon="mdi:alert-circle-outline" style="font-size: 120px; color: var(--color-primary);" />
        </div>
        <h1 class="error-code mb-3">404</h1>
        <h2 class="error-title mb-3">Page Not Found</h2>
        <p class="error-message mb-4">
          Oops! The page you're looking for doesn't exist or has been moved.
        </p>
        <div class="error-actions d-flex gap-3 justify-content-center flex-wrap">
          <button class="btn btn-primary" @click="goHome">
            <Icon icon="mdi:home" class="me-2" />
            Go to Home
          </button>
          <button class="btn btn-secondary" @click="goBack">
            <Icon icon="mdi:arrow-left" class="me-2" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'

const router = useRouter()

function goHome() {
  router.push('/')
}

function goBack() {
  router.back()
}
</script>

<style scoped>
.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-main);
  padding: 40px 20px;
  width: 100%;
}

.container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

.error-content {
  max-width: 600px;
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-icon {
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-20px);
  }
}

.error-code {
  font-size: 96px;
  font-weight: 800;
  color: var(--color-text-primary);
  line-height: 1;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.error-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.error-message {
  font-size: 18px;
  color: var(--color-text-secondary);
  max-width: 500px;
  margin: 0 auto;
}

.btn-primary {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  color: white !important;
  padding: 12px 30px;
  font-weight: 600;
  transition: all 0.2s ease;
  border: none;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
}

.btn-primary:hover {
  background-color: var(--color-primary-hover) !important;
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.btn-secondary {
  background-color: #6c757d !important;
  border-color: #6c757d !important;
  color: white !important;
  padding: 12px 30px;
  font-weight: 600;
  transition: all 0.2s ease;
  border: none;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
}

.btn-secondary:hover {
  background-color: #5a6268 !important;
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

/* Dark mode styles */
:root.dark-mode .not-found-page {
  background: var(--color-bg-secondary);
}

:root.dark-mode .error-code,
:root.dark-mode .error-title {
  color: var(--color-text-primary);
}

:root.dark-mode .error-message {
  color: var(--color-text-secondary);
}

/* Mobile responsive */
@media (max-width: 575.98px) {
  .error-code {
    font-size: 72px;
  }

  .error-title {
    font-size: 24px;
  }

  .error-message {
    font-size: 16px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 10px 20px;
    font-size: 14px;
  }

  .error-actions {
    flex-direction: column;
    width: 100%;
  }

  .error-actions .btn-primary,
  .error-actions .btn-secondary {
    width: 100%;
    justify-content: center;
  }
}
</style>
