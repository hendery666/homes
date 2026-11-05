<template>
  <div class="containers" :class="{ 'sign-up-mode': isSignup }">
    <div class="forms-wrapper">
      <!-- slot for login or signup form -->
      <slot></slot>
    </div>
    <!-- <div class="image-box">
      <img src="@/assets/homes_logo.png" alt="Homes Logo" />
    </div> -->
  </div>
</template>

<script>
export default {
  name: "AuthLayout",
  props: {
    isSignup: { type: Boolean, default: false },
  },
};
</script>

<style scoped>
.containers {
  margin: 0;
  inset: 0;
  padding: 0;
  height: 100vh;
  background-color: black;
  overflow: hidden;
  display: flex;
  transition: transform 1s ease-in-out;
}

.forms-wrapper { position: relative; width: 100%; height: 100%; overflow: hidden; }

.form-container {
  position: absolute;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(15px);
  padding: 60px 40px;
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition: all 0.8s ease-in-out;
}

.form-container h2 { text-align: center; margin-bottom: 30px; }

form { display: flex; flex-direction: column; gap: 20px; }

input {
  padding: 10px;
  border: none;
  outline: none;
  border-bottom: 2px solid #fff;
  background: transparent;
  color: #fff;
}
input::placeholder { color: rgba(255,255,255,0.7); opacity: 1; }

button {
  background: linear-gradient(0deg, #aa67d1, #442569);
  border: none;
  padding: 10px;
  border-radius: 20px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
}
button:hover { transform: scale(1.05); }

p { font-size: 0.9rem; text-align: center; }
a { color: #fff; text-decoration: underline; }
.toggle-link { cursor: pointer; text-decoration: underline; color: #fff; }

/* Image box */
.image-box {
  width: 50%;
  background: linear-gradient(0deg, #55296e, #1a0d2a);
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 1s ease-in-out;
}
.image-box img { width: 70%; animation: float 4s ease-in-out infinite; }

@keyframes float {
  0%,100%{transform:translateY(0px);} 
  50%{transform:translateY(-10px);}
}

/* Toggle animations */
.signup-form { transform: translateX(100%); opacity: 0; }
.containers.sign-up-mode .signup-form { left: 0; transform: translateX(0%); opacity: 1; }
.containers.sign-up-mode .login-form { left: 0; transform: translateX(-100%); opacity: 0; }
.containers.sign-up-mode .image-box { order: 1; }

/* Mobile responsive styles */
@media (max-width: 767.98px) {
  .containers {
    padding: 1rem;
  }

  .form-container {
    padding: 40px 20px;
  }

  h2 {
    font-size: 1.5rem;
  }

  input {
    font-size: 0.875rem;
  }

  button {
    font-size: 0.875rem;
    padding: 8px;
  }

  .image-box {
    display: none;
  }
}

@media (max-width: 575.98px) {
  .form-container {
    padding: 30px 15px;
  }

  h2 {
    font-size: 1.25rem;
    margin-bottom: 20px;
  }

  form {
    gap: 15px;
  }
}
</style>