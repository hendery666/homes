<script setup>
import { RouterLink, RouterView, useRoute } from "vue-router";
import { ref, onMounted, computed } from "vue";
import NavBar from "./components/NavBar.vue";
import Footer from "./components/Footer.vue";
import Categories from "./components/Categories.vue";
import Login from './components/Login.vue';
import Toast from './components/Toast.vue';
import { setToastInstance } from './composables/useToast';

const toastRef = ref(null);
const route = useRoute();

// Pages that should NOT show the navbar/footer
const noNavbarPages = ['login', 'signup', 'about', 'forgotpassword'];
const shouldShowNavbar = computed(() => !noNavbarPages.includes(route.name));
const shouldShowFooter = computed(() => !noNavbarPages.includes(route.name));

onMounted(() => {
  if (toastRef.value) {
    setToastInstance(toastRef.value);
  }
});
</script>

<template>
  <div class="app-wrapper">
    <NavBar v-if="shouldShowNavbar" />
    <main class="main-content">
      <RouterView />
    </main>
    <Footer v-if="shouldShowFooter" />
    <Toast ref="toastRef" />
  </div>
</template>

<style>
.app-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  flex: 1;
}
</style>

