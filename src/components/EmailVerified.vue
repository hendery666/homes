<template>
  <div class="email-verified-wrapper">
    <div class="verified-card">
      <div class="success-icon">✓</div>
      <h1>Email Verified Successfully!</h1>
      <p class="message">Your email has been verified. Click continue to return to the signup page and complete your registration.</p>
      <button class="continue-btn" @click="closeTab">Continue</button>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useDarkMode } from '@/composables/useDarkMode'
import { auth } from '@/firebase'
import { applyActionCode, isSignInWithEmailLink } from 'firebase/auth'

export default {
  name: 'EmailVerified',
  setup() {
    useDarkMode()

    const verified = ref(false)
    const error = ref(null)

    onMounted(async () => {
      // Check if this is an email verification link
      const urlParams = new URLSearchParams(window.location.search)
      const mode = urlParams.get('mode')
      const oobCode = urlParams.get('oobCode')

      if (mode === 'verifyEmail' && oobCode) {
        try {
          // Apply the verification code
          await applyActionCode(auth, oobCode)
          verified.value = true

          // Auto-close after 1 second
          setTimeout(() => {
            window.close()
          }, 1000)
        } catch (err) {
          console.error('Error verifying email:', err)
          error.value = 'Failed to verify email. Please try again.'
        }
      } else {
        // Already verified, just show success
        verified.value = true
      }
    })

    const closeTab = () => {
      window.close()

      // Fallback if window.close() doesn't work
      setTimeout(() => {
        alert('Please close this tab manually to return to the signup page.')
      }, 500)
    }

    return {
      closeTab,
      verified,
      error
    }
  }
}
</script>

<style scoped>
.email-verified-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--color-bg-main);
  padding: 20px;
}

.verified-card {
  background: var(--color-bg-white);
  border-radius: 20px;
  padding: 60px 40px;
  max-width: 600px;
  width: 100%;
  text-align: center;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
}

.success-icon {
  width: 100px;
  height: 100px;
  background: var(--color-success);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 30px;
  font-size: 60px;
  color: white;
  font-weight: bold;
  animation: scaleIn 0.5s ease;
}

@keyframes scaleIn {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

h1 {
  color: var(--color-text-primary);
  font-size: 2rem;
  margin-bottom: 20px;
  font-weight: 700;
}

.message {
  color: var(--color-text-primary);
  font-size: 1.125rem;
  line-height: 1.6;
  margin-bottom: 30px;
}

.continue-btn {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 15px 50px;
  font-size: 1.125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(126, 34, 206, 0.3);
}

.continue-btn:hover {
  background: var(--color-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(126, 34, 206, 0.4);
}

.continue-btn:active {
  transform: translateY(0);
}

.instructions {
  background: var(--color-bg-purple-tint);
  border-radius: 12px;
  padding: 25px;
  border: 1px solid var(--color-border);
}

.instructions ol {
  text-align: left;
  margin: 0;
  padding-left: 20px;
}

.instructions li {
  color: var(--color-text-primary);
  font-size: 1rem;
  margin-bottom: 10px;
  line-height: 1.5;
}

.instructions li:last-child {
  margin-bottom: 0;
}

/* Mobile responsive */
@media (max-width: 767.98px) {
  .verified-card {
    padding: 40px 30px;
  }

  h1 {
    font-size: 1.5rem;
  }

  .message {
    font-size: 1rem;
  }

  .success-icon {
    width: 80px;
    height: 80px;
    font-size: 48px;
  }
}

@media (max-width: 575.98px) {
  .email-verified-wrapper {
    padding: 15px;
  }

  .verified-card {
    padding: 30px 20px;
  }

  h1 {
    font-size: 1.25rem;
  }

  .instructions {
    padding: 20px;
  }

  .instructions li {
    font-size: 0.938rem;
  }
}
</style>
