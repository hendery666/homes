<template>
  <AuthLayout :isSignup="false">
    <div class="signup-wrapper">
      <div class="signup-card">
        <img src="@/assets/homes_logo.png" alt="Homes Logo" class="logo" />
        <h2>Forgot Password</h2>

        <!-- STEP 1: Enter Email -->
        <form v-if="!emailSent" @submit.prevent="sendPasswordResetEmail">
          <input
            type="email"
            class="email-input"
            placeholder="Enter your email address"
            v-model="email"
            required
          />
          <button type="submit" class="signup-btn" :disabled="loading">
            {{ loading ? 'Sending...' : 'Send Reset Link' }}
          </button>
          <p class="info-text">
            Enter your registered email address. We will send you a password reset link.
          </p>
          <p>
            <span class="toggle-link" @click="$router.push('/login')">Back to Login</span>
          </p>
        </form>

        <!-- STEP 2: Success Message -->
        <div v-else class="success-message">
          <div class="success-icon">✉️</div>
          <h3>Check Your Email</h3>
          <p class="mb-3">
            We've sent a password reset link to <strong>{{ email }}</strong>
          </p>
          <p class="info-text mb-4">
            Click the link in the email to reset your password. The link will expire in 1 hour.
          </p>
          <button class="signup-btn mb-3" @click="$router.push('/login')">
            Back to Login
          </button>
          <p>
            <span class="toggle-link" @click="resetForm">Send another email</span>
          </p>
        </div>

        <!-- Toast Notification -->
        <div class="position-fixed top-0 end-0 p-3" style="z-index: 9999">
          <div
            v-if="notification.show"
            class="toast show"
            :class="`bg-${notification.type} text-white`"
            role="alert"
          >
            <div class="toast-body d-flex align-items-center justify-content-between">
              <span>{{ notification.message }}</span>
              <button
                type="button"
                class="btn-close btn-close-white ms-3"
                @click="notification.show = false"
              ></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AuthLayout>
</template>

<script>
import AuthLayout from "./AuthLayout.vue";
import { auth } from "../firebase";
import { sendPasswordResetEmail as firebaseSendPasswordResetEmail } from "firebase/auth";
import { useDarkMode } from "@/composables/useDarkMode";

export default {
  name: "ForgotPassword",
  components: { AuthLayout },
  setup() {
    // Initialize dark mode
    useDarkMode();
    return {};
  },
  data() {
    return {
      email: "",
      emailSent: false,
      loading: false,
      notification: { show: false, message: "", type: "" },
    };
  },
  methods: {
    showNotification(message, type = "danger") {
      this.notification = { show: true, message, type };
      setTimeout(() => (this.notification.show = false), 5000);
    },

    async sendPasswordResetEmail() {
      if (!this.email.trim()) {
        this.showNotification("Please enter your email address.", "danger");
        return;
      }

      // Basic email validation
      const emailRegex = /^[\w.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(this.email)) {
        this.showNotification("Please enter a valid email address.", "danger");
        return;
      }

      this.loading = true;
      try {
        // Send password reset email using Firebase Auth
        await firebaseSendPasswordResetEmail(auth, this.email.trim());

        this.emailSent = true;
        this.showNotification("Password reset email sent successfully!", "success");
      } catch (error) {
        console.error("Password reset error:", error);

        // Handle specific error cases
        if (error.code === "auth/user-not-found") {
          this.showNotification("No account found with this email address.", "danger");
        } else if (error.code === "auth/invalid-email") {
          this.showNotification("Invalid email address.", "danger");
        } else if (error.code === "auth/too-many-requests") {
          this.showNotification("Too many requests. Please try again later.", "danger");
        } else {
          this.showNotification("Failed to send reset email. Please try again.", "danger");
        }
      } finally {
        this.loading = false;
      }
    },

    resetForm() {
      this.email = "";
      this.emailSent = false;
      this.loading = false;
    },
  },
};
</script>

<style scoped>
.signup-wrapper {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  background: var(--color-bg-main);
  padding: 20px;
  overflow-y: auto;
}

.signup-card {
  background: var(--color-bg-white);
  border-radius: 20px;
  padding: 30px 40px;
  width: 500px;
  max-width: 500px;
  box-shadow: var(--shadow-lg);
  text-align: center;
  position: relative;
  margin-top: 37px;
  max-height: 90vh;
  overflow-y: auto;
  scrollbar-width: none;
}
.signup-card::-webkit-scrollbar { display: none; }

.logo {
  width: 80px;
  margin-bottom: 20px;
}

h2 {
  color: var(--color-text-primary);
  margin-bottom: 25px;
}

input {
  padding: 10px;
  border: none;
  outline: none;
  border-bottom: 2px solid var(--color-border-dark);
  background: transparent;
  color: var(--color-text-primary);
}

input::placeholder {
  color: var(--color-text-light);
  opacity: 1;
}

button.signup-btn {
  background: var(--color-bg-main);
  border: none;
  margin-top: 5px;
  padding: 10px 20px;
  border-radius: 20px;
  color: var(--color-text-primary);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  width: 100%;
}

button.signup-btn:hover {
  transform: scale(1.05);
}

button.signup-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.toggle-link {
  cursor: pointer;
  text-decoration: underline;
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.info-text {
  font-size: 0.85rem;
  text-align: center;
  color: var(--color-text-secondary);
  margin-top: 5px;
}

.success-message {
  text-align: center;
  padding: 20px 0;
}

.success-icon {
  font-size: 64px;
  margin-bottom: 20px;
  animation: bounce 1s ease;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.success-message h3 {
  color: #28a745;
  margin-bottom: 15px;
}

.success-message p {
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.success-message p strong {
  color: var(--color-text-primary);
}

.email-input {
  margin-top: 10px;
  width: 100%;
}

/* Toast styles */
.toast {
  min-width: 300px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.3s ease-out;
}

.toast-body {
  padding: 15px;
  font-weight: 500;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Mobile responsive styles */
@media (max-width: 767.98px) {
  .signup-card {
    width: 90%;
    max-width: 400px;
    padding: 25px 30px;
  }

  .logo {
    width: 60px;
    margin-bottom: 15px;
  }

  h2 {
    font-size: 1.5rem;
  }

  button {
    font-size: 0.875rem;
  }
}

@media (max-width: 575.98px) {
  .signup-wrapper {
    padding: 10px;
  }

  .signup-card {
    width: 95%;
    padding: 20px 25px;
  }

  .logo {
    width: 50px;
  }

  h2 {
    font-size: 1.25rem;
  }

  input {
    font-size: 0.875rem;
  }

  .info-text {
    font-size: 0.75rem;
  }
}
</style>
