import './assets/main.css'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { auth } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Icon } from '@iconify/vue';

const app = createApp(App)

app.use(router)

onAuthStateChanged(auth, (user) => {
  const to = router.currentRoute.value;
  // If user just became null while sitting on a protected page → redirect to landing page (about)
  if (!user && to.meta?.requiresAuth) {
    // Only redirect if we're not already on a guest-only page (like about/login/signup)
    if (to.name !== 'about' && to.name !== 'login' && to.name !== 'signup') {
      router.replace({ name: "about" });
    }
  }
  // If user logs in while on guest-only page, you can optionally bounce them:
  if (user && to.meta?.guestOnly && to.name !== 'login' && to.name !== 'signup') {
    router.replace({ name: "home" });
  }
});
app.component('Icon', Icon);
app.mount('#app')
