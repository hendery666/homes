<template>
  <AuthLayout :isSignup="false">
    <div class="login-wrapper">
      <!-- Notification Toast -->
      <div v-if="notification.show" :class="['notification-toast', notification.type]">
        <div class="notification-content">
          <span class="notification-icon">{{ notification.type === 'danger' ? '⚠️' : '✓' }}</span>
          <span class="notification-message">{{ notification.message }}</span>
          <button class="notification-close" @click="closeNotification">✕</button>
        </div>
      </div>

      <div class="login-card">
        <img src="@/assets/homes_logo.png" alt="Homes Logo" class="logo" />
        <h2>Log in</h2>

        <!-- Google Sign-In Button -->
        <button type="button" @click="handleGoogleSignup" class="google-btn">
          <img src="@/assets/google-logo.png" alt="Google Logo" class="google-icon" />
          <span>Sign in with Google</span>
        </button>

        <div class="divider">
          <span>or</span>
        </div>
        
        <!-- Email / Username Login -->
        <form @submit.prevent="handleLogin">
          <input
            type="text"
            placeholder="Email or Username"
            v-model="login.email"
            required
          />

          <!-- Password input with eye toggle -->
          <div class="password-container">
            <input
              :type="showPassword ? 'text' : 'password'"
              placeholder="Password"
              v-model="login.password"
              required
            />
            <span class="toggle-password" @click="togglePassword">
              <i :class="showPassword ? 'fa fa-eye-slash' : 'fa fa-eye'"></i>
            </span>
          </div>

          <button type="submit">Log in</button>
          <span class="toggle-link" @click="$router.push('/forgotpassword')">
            Forgot password?
          </span>
          <span class="toggle-link" @click="goToSignup">
            Create an account
          </span>
        </form>
      </div>
    </div>
  </AuthLayout>
</template>

<script>
import AuthLayout from "./AuthLayout.vue";
import { auth, db } from "../firebase";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  collection,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { useDarkMode } from "@/composables/useDarkMode";

export default {
  name: "Login",
  components: { AuthLayout },
  setup() {
    // Initialize dark mode
    useDarkMode();
    return {};
  },
  data() {
    return {
      login: {
        email: "",
        password: "",
      },
      showPassword: false,
      googleLoading: false,
      notification: {
        show: false,
        message: '',
        type: 'danger'
      }
    };
  },

  methods: {
    showNotification(message, type = "danger") {
      this.notification = { show: true, message: message, type: type };
      setTimeout(() => {
        this.notification.show = false;
      }, 5000);
    },

    closeNotification() {
      this.notification.show = false;
    },

    togglePassword() {
      this.showPassword = !this.showPassword;
    },

    async handleLogin() {
      try {
        let identifier = this.login.email.trim();
        let foundEmail = null;

        // check if it's username or email
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", identifier));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          foundEmail = userData.email;
        }

        if (!foundEmail) {
          const emailRegex = /^[\w.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          if (!emailRegex.test(identifier)) {
            this.showNotification("No user found with that username or invalid email.", "danger");
            return;
          }
          foundEmail = identifier;
        }

        const userCredential = await signInWithEmailAndPassword(auth, foundEmail, this.login.password);
        const user = userCredential.user;

        // Check if user has completed their profile
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists() || !userDoc.data().profileComplete) {
          this.showNotification("Your profile setup is incomplete. Redirecting to complete your profile...", "warning");
          // Don't sign out - let them complete their profile
          setTimeout(() => {
            this.$router.replace("/signup");
          }, 2000);
          return;
        }

        // Show success message
        this.showNotification("Login successful!", "success");
        setTimeout(() => {
          this.$router.replace("/");
        }, 1000);
      } catch (err) {
        // Simplify error message
        if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
          this.showNotification("Username/Password is incorrect", "danger");
        } else if (err.code === 'auth/too-many-requests') {
          this.showNotification("Too many failed attempts. Please try again later.", "danger");
        } else if (err.code === 'auth/network-request-failed') {
          this.showNotification("Network error. Please check your connection.", "danger");
        } else {
          this.showNotification("Login failed. Please try again.", "danger");
        }
      }
    },

    async handleGoogleSignup() {
      if (this.googleLoading) return;
      this.googleLoading = true;

      const provider = new GoogleAuthProvider();
      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user profile exists and is complete
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          // Account doesn't exist - sign them out and show error
          await auth.signOut();
          this.showNotification("Account not found. Please sign up first.", "danger");
          setTimeout(() => {
            this.$router.replace("/signup");
          }, 2000);
          this.googleLoading = false;
          return;
        }

        if (!userDoc.data().profileComplete) {
          this.showNotification("Your profile setup is incomplete. Redirecting to complete your profile...", "warning");
          // Don't sign out - let them complete their profile
          setTimeout(() => {
            this.$router.replace("/signup");
          }, 2000);
          return;
        }

        // Profile is complete, allow login
        this.showNotification("Login successful!", "success");
        setTimeout(() => {
          this.$router.replace("/");
        }, 1000);
      } catch (err) {
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
          this.googleLoading = false;
          return;
        }
        this.showNotification("Google sign-in failed. Please try again.", "danger");
        this.googleLoading = false;
      } finally {
        this.googleLoading = false;
      }
    },

    goToSignup() {
      this.$router.push("/signup");
    },
  },
};
</script>

<style scoped>
.login-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--color-bg-main);
  padding: 20px;
  overflow-y: auto;
}

.login-card {
  background: var(--color-bg-white);
  border-radius: 20px;
  padding: 40px;
  box-shadow: var(--shadow-lg);
  width: 500px;
  text-align: center;
}

.logo {
  width: 80px;
  margin-bottom: 20px;
}

h2 {
  margin-bottom: 25px;
  color: var(--color-text-primary);
}

form {
  display: flex;
  flex-direction: column;
  gap: 20px;
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

button {
  background-color: var(--color-bg-main);
  border: none;
  padding: 10px 0px;
  border-radius: 20px;
  color: var(--color-text-primary);
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  width: 100%;
  align-self: center;
  margin-top: 5px;
}

button:hover {
  transform: scale(1.05);
}

.toggle-link {
  cursor: pointer;
  text-decoration: underline;
  color: var(--color-text-primary);
}

.password-container {
  position: relative;
  width: 100%;
}

.password-container input {
  width: 100%;
  padding-right: 40px;
}

.toggle-password {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  cursor: pointer;
  color: var(--color-text-primary);
  font-size: 1.1rem;
}

.toggle-password:hover {
  opacity: 0.8;
}

.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background-color: var(--color-bg-white);
  border: 1px solid var(--color-border);
  padding: 10px;
  border-radius: 20px;
  cursor: pointer;
  width: 100%;
  font-weight: 600;
  margin-bottom: 15px;
  color: var(--color-text-primary);
  /* transition: background 0.2s; */
}

.google-btn:hover {
  background-color: var(--color-bg-purple-tint);
}

.google-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-light);
  font-size: 14px;
  margin: 20px 0;
}

.divider::before,
.divider::after {
  content: "";
  flex: 1;
  border-bottom: 1px solid var(--color-border);
  margin: 0 10px;
}

/* Mobile responsive styles */
@media (max-width: 767.98px) {
  .login-card {
    width: 90%;
    max-width: 400px;
    padding: 30px 25px;
  }

  .logo {
    width: 60px;
    margin-bottom: 15px;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 20px;
  }

  input {
    font-size: 0.875rem;
  }

  button {
    font-size: 0.875rem;
    padding: 8px 0;
  }

  .google-btn {
    font-size: 0.875rem;
  }
}

@media (max-width: 575.98px) {
  .login-card {
    width: 95%;
    padding: 25px 20px;
  }

  .logo {
    width: 50px;
  }

  h2 {
    font-size: 1.25rem;
  }

  form {
    gap: 15px;
  }

  .divider {
    font-size: 12px;
    margin: 15px 0;
  }
}

/* Notification Toast Styles */
.notification-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  min-width: 300px;
  max-width: 500px;
  padding: 16px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.3s ease-out;
}

.notification-toast.danger {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
  color: white;
}

.notification-toast.success {
  background: linear-gradient(135deg, #51cf66 0%, #37b24d 100%);
  color: white;
}

.notification-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.notification-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.notification-message {
  flex: 1;
  font-weight: 500;
  line-height: 1.4;
}

.notification-close {
  background: none;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
  flex-shrink: 0;
}

.notification-close:hover {
  background: rgba(255, 255, 255, 0.2);
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

@media (max-width: 575.98px) {
  .notification-toast {
    right: 10px;
    left: 10px;
    min-width: unset;
    max-width: unset;
  }
}

</style>
