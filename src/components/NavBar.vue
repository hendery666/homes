<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'
import { getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore'
import userPng from '../assets/user.png'
import DarkModeToggle from './DarkModeToggle.vue'
import { Icon } from '@iconify/vue'
import { useMessageNotifications } from '@/composables/useMessageNotifications' 
import SellerBadge from './SellerBadge.vue'
import { LEVELS } from '@/composables/useSellerLevel'
import { clearCache } from '@/router/index.js'

const props = defineProps({
  // for about page - show login/signup instead of profile stuff
  authCtasOnly: { type: Boolean, default: false },
  createPath: { type: String, default: '/service/new' }
})

const router = useRouter()
const auth = getAuth()
const db = getFirestore()

const user = ref(null)
const avatarUrl = ref(userPng)
const avatarLoaded = ref(false)
const loggingOut = ref(false)
const isAdmin = ref(false)
let unsubAuth = null
let unsubUserStats = null

// Message notifications
const { unreadCount, startListening, stopListening } = useMessageNotifications()

const badgeModalOpen = ref(false)
function openBadgeInfoModal() { badgeModalOpen.value = true }
function closeBadgeInfoModal() { badgeModalOpen.value = false }

// Check if menu is open
const isMenuOpen = ref(false)

onMounted(() => {
  // Start listening to message notifications
  startListening()

  // Set up menu state observer
  const navbarCollapse = document.getElementById('mainNav')
  if (navbarCollapse) {
    // Use MutationObserver to detect when 'show' class is added/removed
    const observer = new MutationObserver(() => {
      isMenuOpen.value = navbarCollapse.classList.contains('show')
    })
    observer.observe(navbarCollapse, { attributes: true, attributeFilter: ['class'] })
  }

  unsubAuth = onAuthStateChanged(auth, async (u) => {
    user.value = u
    if (!u) {
      avatarUrl.value = userPng
      avatarLoaded.value = true
      // Clean up user stats listener
      if (unsubUserStats) { unsubUserStats(); unsubUserStats = null }
      return
    }

    // Start with default avatar and show loading state
    avatarUrl.value = userPng
    avatarLoaded.value = false

    // Set up real-time listener for user stats (including badge progress)
    if (unsubUserStats) { unsubUserStats(); unsubUserStats = null }
    unsubUserStats = onSnapshot(doc(db, 'users', u.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        // Update user data with stats
        user.value = { ...user.value, stats: data.stats || { reviews: 0, boosts: 0 } }
        // Only use Firestore photoURL/profilePicture if it exists
        // Don't use Google profile picture (u.photoURL)
        const url = data.photoURL || data.profilePicture || userPng
        avatarUrl.value = url
        // Delay to show loading animation
        setTimeout(() => {
          avatarLoaded.value = true
        }, 100)
        // Check if user is admin
        isAdmin.value = data.isAdmin || false
      }
    }, (err) => {
      // Silently handle errors - console filter will suppress them
      // Keep default avatar on error
      avatarUrl.value = userPng
      avatarLoaded.value = true
    })
  })
})
onBeforeUnmount(() => { 
  unsubAuth && unsubAuth()
  if (unsubUserStats) { unsubUserStats(); unsubUserStats = null }
  stopListening()
})

const isLoggedIn = computed(() => !!user.value || loggingOut.value) // Keep visible during logout
const showAuthCtas = computed(() => props.authCtasOnly)

async function logout() {
  if (loggingOut.value) return // Prevent double-click
  
  try {
    loggingOut.value = true
    
    // Stop listening to messages before signing out
    stopListening()
    
    // Clean up user stats listener
    if (unsubUserStats) { unsubUserStats(); unsubUserStats = null }
    
    // Clear cache first
    clearCache()
    
    // Sign out first (this will trigger auth state change)
    await signOut(auth)
    
    // Wait a moment for auth state to update
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Navigate to landing page (about page)
    await router.push('/about')
  } catch (err) {
    // Silently handle errors - console filter will suppress them
    // Still try to navigate to landing page
    router.push('/about').catch(() => {})
  } finally {
    // Reset flag after a delay
    setTimeout(() => {
      loggingOut.value = false
    }, 300)
  }
}

// Close mobile menu when navigation link is clicked
function closeNavbar() {
  const navbarCollapse = document.getElementById('mainNav')
  if (!navbarCollapse) return

  // Only close if it's currently open
  if (navbarCollapse.classList.contains('show')) {
    // Remove both show and collapsing classes for instant close
    navbarCollapse.classList.remove('show', 'collapsing')

    // Force immediate transition by setting a temporary no-transition class
    navbarCollapse.style.transition = 'none'

    // Reset transition after a frame
    requestAnimationFrame(() => {
      navbarCollapse.style.transition = ''
    })

    // Update the toggler button's state
    const navbarToggler = document.querySelector('.navbar-toggler')
    if (navbarToggler) {
      navbarToggler.classList.add('collapsed')
      navbarToggler.setAttribute('aria-expanded', 'false')
    }
  }
}

// Close menu when backdrop is clicked
function closeMenuFromBackdrop() {
  closeNavbar()
}
// Handle home link click - close any open modals/overlays
function handleHomeClick(event) {
  event.preventDefault() // Prevent default RouterLink navigation
  closeNavbar()

  // Close MapExplorer if it's open by dispatching a custom event
  // MapExplorer will listen for this event
  window.dispatchEvent(new CustomEvent('close-map-explorer'))

  // If already on home page, force a full reload to reset filters
  if (router.currentRoute.value.path === '/') {
    window.location.href = '/'
  } else {
    // Otherwise just navigate normally
    router.push('/')
  }
}
</script>

<template>
  <header class="sticky-top elevate">
    <nav class="navbar navbar-expand-lg navbar-light bg-page shadow-sm border-bottom">
      <div class="navbar-container">

        <!-- Hamburger on left for mobile -->
        <button class="navbar-toggler order-0 me-2" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav"
                aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>

        <RouterLink 
          to="/" 
          class="navbar-brand d-flex align-items-center gap-2 text-decoration-none order-1 flex-grow-1"
          @click="handleHomeClick"
        >
          <img src="../assets/homes_logo.png" alt="Homes" class="brand-logo" />
          <span class="brand-name">Homes</span>
        </RouterLink>

        <div id="mainNav" class="collapse navbar-collapse order-2">
          <!-- Close button for mobile -->
          <div class="d-lg-none d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">
            <span class="fw-bold">Menu</span>
            <button type="button" class="btn-close" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-label="Close menu"></button>
          </div>

          <ul class="navbar-nav ms-auto align-items-center gap-lg-2">

            <template v-if="showAuthCtas">
              <li class="nav-item">
                <DarkModeToggle />
              </li>
              <li class="nav-item">
                <RouterLink to="/login" class="btn btn-primary me-2">Login</RouterLink>
              </li>
              <li class="nav-item">
                <RouterLink to="/signup" class="btn btn-primary">Sign up</RouterLink>
              </li>
            </template>

            <template v-else-if="isLoggedIn">
              <!-- Profile picture at top (mobile only) -->
              <li class="nav-item order-mobile-0 d-lg-none">
                <div class="mobile-profile-header">
                  <img :src="avatarUrl" alt="User avatar" class="mobile-avatar" :class="{ 'loaded': avatarLoaded }" />
                </div>
              </li>

              <!-- Profile button -->
              <li class="nav-item order-mobile-1 order-lg-last">
                <!-- Mobile: Profile button -->
                <RouterLink to="/profile" class="btn btn-brand d-lg-none mobile-nav-btn" @click="closeNavbar">
                  <Icon icon="mdi:account" class="icon-24" />
                  <span class="btn-text">Profile</span>
                </RouterLink>
                <!-- Desktop: Dropdown -->
                <div class="dropdown d-none d-lg-block">
                  <button class="btn p-0 dropdown-toggle avatar-btn" data-bs-toggle="dropdown" aria-expanded="false">
                    <img :src="avatarUrl" alt="User avatar" class="avatar-36" :class="{ 'loaded': avatarLoaded }" />
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><RouterLink to="/profile" class="dropdown-item">Profile</RouterLink></li>
                    <li v-if="isAdmin"><RouterLink to="/admin" class="dropdown-item">Admin Dashboard</RouterLink></li>
                    <li v-if="isAdmin"><RouterLink to="/manageReport" class="dropdown-item">Manage Feedbacks</RouterLink></li>
                    <li><hr class="dropdown-divider" /></li>
                    <li>
                      <button class="dropdown-item text-danger" @click="logout" :disabled="loggingOut">
                        {{ loggingOut ? 'Signing out…' : 'Sign out' }}
                      </button>
                    </li>
                  </ul>
                </div>
              </li>

              <!-- Badge and Progress (Desktop only) -->
              <li class="nav-item order-mobile-8 d-none d-lg-block">
                <span class="clickable-badge-desktop" @click="openBadgeInfoModal">
                  <SellerBadge :points="user?.stats ? (user.stats.reviews||0)+(user.stats.boosts||0)*5 : 0" :progress="true" />
                </span>
              </li>

              <!-- My Listings button -->
              <li class="nav-item order-mobile-2">
                <RouterLink to="/profile?tab=my" class="btn btn-brand mobile-nav-btn" @click="closeNavbar">
                  <Icon icon="mdi:store" class="icon-24" />
                  <span class="btn-text d-lg-none">My Listings</span>
                  <span class="d-none d-lg-inline ms-1">My Listings</span>
                </RouterLink>
              </li>

              <!-- Liked button -->
              <li class="nav-item order-mobile-3">
                <RouterLink to="/profile?tab=liked" class="btn btn-brand mobile-nav-btn" @click="closeNavbar">
                  <Icon icon="mdi:heart" class="icon-24" />
                  <span class="btn-text d-lg-none">Liked</span>
                  <span class="d-none d-lg-inline ms-1">Liked</span>
                </RouterLink>
              </li>

              <!-- Messages button -->
              <li class="nav-item order-mobile-4">
                <RouterLink to="/chat" class="btn btn-brand mobile-nav-btn position-relative" @click="closeNavbar">
                  <Icon icon="mdi:email" class="icon-24" />
                  <span class="btn-text d-lg-none">Messages</span>
                  <span class="d-none d-lg-inline ms-1">Messages</span>
                  <span
                    v-if="unreadCount > 0"
                    class="badge bg-danger position-absolute top-0 start-100 translate-middle notification-badge"
                    style="font-size: 0.7rem; min-width: 18px; height: 18px; padding: 0 5px; display: flex; align-items: center; justify-content: center;"
                  >
                    {{ unreadCount > 99 ? '99+' : unreadCount }}
                  </span>
                </RouterLink>
              </li>

              <!-- Create button -->
              <li class="nav-item order-mobile-5">
                <RouterLink to="/createService" class="btn btn-brand mobile-nav-btn" @click="closeNavbar">
                  <Icon icon="mdi:plus-circle" class="icon-24" />
                  <span class="btn-text">Create Listing</span>
                </RouterLink>
              </li>

              <!-- Admin button (mobile only) -->
              <li v-if="isAdmin" class="nav-item order-mobile-6 d-lg-none">
                <RouterLink to="/admin" class="btn btn-warning mobile-nav-btn">
                  <Icon icon="mdi:shield-account" class="icon-24" />
                  <span class="btn-text">Admin</span>
                </RouterLink>
              </li>

              <!-- Sign out button (mobile only) -->
              <li class="nav-item order-mobile-7 d-lg-none">
                <button class="btn btn-danger mobile-nav-btn mobile-signout-btn" @click="logout" :disabled="loggingOut">
                  <Icon icon="mdi:logout" class="icon-24" />
                  <span class="btn-text">{{ loggingOut ? 'Signing out…' : 'Sign out' }}</span>
                </button>
              </li>

              <!-- Dark mode toggle last on mobile, first on desktop -->
              <li class="nav-item order-mobile-last order-lg-first">
                <DarkModeToggle />
              </li>
            </template>
          </ul>
        </div>

        <!-- Backdrop overlay for mobile menu -->
        <div v-if="isMenuOpen" class="navbar-backdrop" @click="closeMenuFromBackdrop"></div>

        <!-- Drawer for badge info -->
        <Teleport to="body">
          <div v-if="badgeModalOpen" class="badge-drawer-overlay" @click="closeBadgeInfoModal">
            <div class="badge-drawer" @click.stop>
              <div class="drawer-header">
                <h5 class="drawer-title">Seller Level & Badges</h5>
                <button type="button" class="btn-close-drawer" @click="closeBadgeInfoModal">×</button>
              </div>
              <div class="drawer-body">
                <div class="mb-4"><SellerBadge :points="user?.stats ? (user.stats.reviews||0)+(user.stats.boosts||0)*5 : 0" :progress="true" /></div>
                <div class="mb-3">
                  <strong>Earn points by:</strong>
                  <ul class="mt-2">
                    <li><b>1</b> point per review received</li>
                    <li><b>5</b> points per boost</li>
                  </ul>
                </div>
                <div class="mb-3"><strong>Benefits:</strong> Higher badge = more search visibility & credibility</div>
                <div class="mb-3">
                  <strong>Badge Tiers:</strong>
                  <div class="badge-tiers mt-3">
                    <div v-for="(level, idx) in LEVELS" :key="level.key" class="badge-tier-item d-flex align-items-center gap-3 mb-3">
                      <img :src="level.badge" :alt="level.display + ' badge'" class="tier-badge-icon" />
                      <div class="flex-grow-1">
                        <div class="fw-semibold">{{ level.display }}</div>
                        <div class="text-muted small">{{ level.min }}–{{ level.max === Infinity ? '∞' : level.max }} pts</div>
                      </div>
                    </div>
                  </div>
                </div>
                <small class="text-muted">This badge is visible on your listings and profile to help build trust.</small>
              </div>
            </div>
          </div>
        </Teleport>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.bg-page {
  background: var(--color-bg-main) !important;
  transition: background var(--transition-normal);
}

.elevate {
  z-index: 1045;
}

.navbar {
  padding-left: 0;
  padding-right: 0;
}

.navbar-container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding-left: 1rem;
  padding-right: 1rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

@media (max-width: 991.98px) {
  .navbar-container {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
}

/* Extend mobile sidebar layout until navbar fits in one line (up to 1200px) */
@media (min-width: 992px) and (max-width: 1200px) {
  .navbar-container {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }

  /* Force hamburger menu to be visible */
  .navbar-toggler {
    display: block !important;
  }

  /* Force mobile layout - hide desktop elements */
  .d-none.d-lg-block {
    display: none !important;
  }

  /* Force mobile layout - show mobile elements */
  .d-lg-none {
    display: block !important;
  }

  /* Hide desktop dropdown, show mobile buttons */
  .dropdown.d-none.d-lg-block {
    display: none !important;
  }

  /* Show mobile profile button */
  .btn-brand.d-lg-none {
    display: flex !important;
  }
}

@media (max-width: 575.98px) {
  .navbar-container {
    padding-left: 1rem;
    padding-right: 1rem;
  }
}

.brand-logo { 
  height: 40px; 
  width: auto; 
}

.brand-name {
  font-size: clamp(1.25rem, 1.2vw + 1rem, 2.25rem);
  font-weight: 800;
  letter-spacing: 0.2px;
  color: var(--color-text-primary);
}

.icon-24 {
  width: 24px;               /* Adjust the size to ensure the icon shows up */
  height: 24px;              /* Adjust the size */
  object-fit: contain;       /* Ensure the icon fits properly */
  background-color: transparent; /* Transparent background behind the icon */
  padding: 0;                /* No extra padding */
  box-shadow: none;          /* Remove box shadow (if any) */
  border-radius: 50%;        /* Ensure the icon is circular */
  display: inline-block;     /* Make it behave like an inline element */
}

/* Avatar image styles */
.avatar-36 {
  width: 36px;
  height: 36px;
  object-fit: cover;  /* Ensures the image covers the circular area */
  border-radius: 50%;
  border: 2px solid #000;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  background: #fff;
  opacity: 0;
  transition: opacity 0.4s ease-in-out;
}

.avatar-36.loaded {
  opacity: 1;
}

/* Dark mode - white border */
:root.dark-mode .avatar-36 {
  border: 2px solid #fff;
}

.avatar-btn {
  background: transparent;
  border: 0;
  border-radius: 999px;
}

/* Fix dropdown arrow visibility in dark mode */
.dropdown-toggle::after {
  border-top-color: var(--color-text-primary);
  border-right-color: transparent;
  border-left-color: transparent;
}

:root.dark-mode .dropdown-toggle::after {
  border-top-color: var(--color-text-white);
}

/* Button styling */
.btn-brand,
.btn-outline-primary,
.btn-primary,
.btn-common {
  font-size: 0.875rem;  /* Standard font size for all buttons */
  padding: 0.5rem 1rem;  /* Consistent padding */
  height: 40px;  /* Ensure uniform button height */
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;  /* Rounded corners */
  font-weight: 600;
  transition: all 0.2s ease;
  border: 1px solid transparent;  /* Transparent border */
  min-width: 120px; /* Ensure buttons have a consistent width */
  width: auto;  /* Allow width to adapt based on content */
}

/* Dark mode button text fix */
:root.dark-mode .btn-outline-primary {
  color: var(--color-text-white) !important;
  border-color: var(--color-primary);
}

:root.dark-mode .btn-outline-primary:hover {
  color: var(--color-text-white) !important;
  background: var(--color-primary);
}

/* Mobile responsive buttons */
@media (max-width: 575.98px) {
  .btn-brand,
  .btn-outline-primary,
  .btn-primary,
  .btn-common {
    font-size: 0.813rem;
    padding: 0.4rem 0.75rem;
    height: 36px;
    min-width: 100px;
  }

  .navbar-nav {
    padding: 1rem 0;
  }

  .navbar-nav .nav-item {
    margin-bottom: 0.5rem;
  }

  /* Make Create Service button more compact on small screens */
  .btn-text {
    font-size: 0.813rem;
  }
}

/* Extra responsive for very small screens */
@media (max-width: 380px) {
  .btn-brand .btn-text {
    font-size: 0.75rem;
  }

  .btn-brand,
  .btn-outline-primary,
  .btn-primary {
    padding: 0.35rem 0.6rem;
    min-width: 90px;
  }
}

/* Specific styles for .btn-brand */
.btn-brand {
  background: var(--color-primary);
  color: var(--color-text-white);
  border-color: var(--color-primary);
}

/* Icon Styling for Buttons */
.btn-brand img, 
.icon-24 {
  width: 18px;  /* Standard icon size */
  height: 18px; /* Standard icon size */
  margin-right: 8px; /* Consistent spacing between icon and text */
  object-fit: contain;  /* Ensures icons fit properly */
}

/* Message Button Specific Styles */
.btn-common {
  width: auto;  /* Ensures buttons don't have fixed widths */
}

/* Hover Effects for Buttons */
.btn-brand:hover,
.btn-outline-primary:hover,
.btn-primary:hover,
.btn-common:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* Focus Effects */
.btn-brand:focus,
.btn-outline-primary:focus,
.btn-primary:focus,
.btn-common:focus {
  outline: none;
  box-shadow: var(--focus-ring-sm);
}

/* Link colors for light backgrounds */
.navbar-light .nav-link {
  color: var(--color-text-primary);
}

.navbar-light .nav-link:hover {
  color: var(--color-primary);
}

/* Dropdown Menu */
.dropdown-menu {
  border-radius: 12px;
  border: 1px solid rgba(0,0,0,.06);
  box-shadow: 0 8px 24px rgba(0,0,0,.08);
  background: var(--color-bg-white);
  color: var(--color-text-primary);
}

.dropdown-item {
  color: var(--color-text-primary);
}

.dropdown-item:hover {
  background: var(--color-bg-purple-tint);
  color: var(--color-text-primary);
}

/* Dark mode dropdown styling */
:root.dark-mode .dropdown-menu {
  background: var(--color-bg-white);
  border: 1px solid var(--color-border);
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
}

:root.dark-mode .dropdown-item {
  color: var(--color-text-primary);
}

:root.dark-mode .dropdown-item:hover {
  background: var(--color-bg-purple-tint);
  color: var(--color-text-primary);
}

:root.dark-mode .dropdown-divider {
  border-color: var(--color-border);
}

/* Navbar Toggler */
.navbar-toggler {
  border-color: rgba(0,0,0,.15);
}

.navbar-toggler:focus {
  box-shadow: 0 0 0 .15rem rgba(75,42,166,.15);
}

/* Dark mode hamburger visibility */
:root.dark-mode .navbar-toggler {
  border-color: rgba(255, 255, 255, 0.3);
}

:root.dark-mode .navbar-toggler-icon {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28255, 255, 255, 0.85%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
}

/* Mobile side menu slide from left - extended to 1200px */
@media (max-width: 1200px) {
  .navbar-collapse {
    position: fixed !important;
    top: 0;
    left: -280px;
    width: 280px;
    height: 100vh;
    background: var(--color-bg-white);
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.1);
    transition: left 0.15s ease-out !important;
    z-index: 1050;
    overflow-y: auto;
    padding: 1.25rem 1rem 1.25rem 1rem;
    display: block !important;
    visibility: hidden;
    border: none;
  }

  .navbar-collapse.show {
    left: 0;
    visibility: visible;
  }

  .navbar-collapse.collapsing {
    left: -280px;
    transition: left 0.15s ease-out !important;
    height: auto !important;
    visibility: hidden;
  }

  .navbar-collapse.show.collapsing {
    left: 0;
    visibility: visible;
    transition: left 0.15s ease-out !important;
  }

  .navbar-nav {
    padding-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .navbar-nav .nav-item {
    width: 100%;
    margin-bottom: 0;
  }

  /* Mobile single column layout */
  .order-mobile-0 {
    order: 0;
  }

  .order-mobile-1 {
    order: 1;
  }

  .order-mobile-2 {
    order: 2;
  }

  .order-mobile-3 {
    order: 3;
  }

  .order-mobile-4 {
    order: 4;
  }

  .order-mobile-5 {
    order: 5;
  }

  .order-mobile-6 {
    order: 6;
  }

  .order-mobile-last {
    order: 999;
    margin-top: 0.5rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--color-border);
  }

  /* Mobile profile header with avatar */
  .mobile-profile-header {
    display: flex;
    flex-direction: column; /* Changed to column for mobile */
    align-items: center;
    padding: 1rem 0;
    margin-bottom: 0.5rem;
  }

  .mobile-avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid var(--color-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    opacity: 0;
    transition: opacity 0.4s ease-in-out;
  }

  .mobile-avatar.loaded {
    opacity: 1;
  }

  /* Mobile navigation buttons - horizontal layout with icon on left */
  .mobile-nav-btn {
    width: 100%;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 0.75rem;
    min-height: 48px;
    padding: 0.75rem 1rem;
    text-align: left;
  }

  .mobile-nav-btn .icon-24 {
    width: 20px;
    height: 20px;
    margin: 0;
    flex-shrink: 0;
  }

  .mobile-nav-btn .btn-text {
    font-size: 0.875rem;
    margin: 0;
  }

  /* Mobile sign out button */
  .mobile-signout-btn {
    background: #dc3545;
    border-color: #dc3545;
    color: white;
  }

  .mobile-signout-btn:hover {
    background: #c82333;
    border-color: #bd2130;
    color: white;
  }

  /* Desktop buttons keep original layout */
  .navbar-nav .btn:not(.mobile-nav-btn) {
    width: 100%;
    justify-content: center;
    min-height: 48px;
    font-size: 0.85rem;
    padding: 0.6rem 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .navbar-nav .btn:not(.mobile-nav-btn) .icon-24 {
    width: 20px;
    height: 20px;
    margin: 0;
  }

  .navbar-nav .btn:not(.mobile-nav-btn) .btn-text {
    font-size: 0.75rem;
    margin: 0;
  }

  /* Desktop dropdown - hide on mobile */
  .navbar-nav .dropdown {
    width: 100%;
  }

  .navbar-nav .dropdown-menu {
    position: static !important;
    width: 100%;
    border: none;
    box-shadow: none;
    background: transparent;
    padding: 0;
    margin-top: 0.5rem;
  }

  .navbar-nav .dropdown-item {
    padding: 0.75rem 1rem;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    background: var(--color-bg-purple-tint);
  }

  /* Backdrop overlay for mobile menu */
  .navbar-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1049;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Dark mode support for mobile menu */
  :root.dark-mode .navbar-collapse {
    background: #1a1a1a !important;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }

  :root.dark-mode .navbar-collapse .border-bottom {
    border-color: rgba(255, 255, 255, 0.1) !important;
  }

  :root.dark-mode .btn-close {
    filter: invert(1);
  }

  :root.dark-mode .navbar-nav .dropdown-item {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-white);
  }
}

/* Notification badge styling */
.notification-badge {
  border-radius: 10px;
  font-weight: 600;
  border: 2px solid var(--color-bg-white);
  z-index: 10;
}

:root.dark-mode .notification-badge {
  border-color: var(--color-bg-main);
}

/* Badge Drawer Styles */
.badge-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1060;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.2s ease-out;
}

.badge-drawer {
  width: 50%;
  max-width: 600px;
  height: 100vh;
  background: var(--color-bg-white);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease-out;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.drawer-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.btn-close-drawer {
  background: transparent;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--color-text-primary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s ease;
}

.btn-close-drawer:hover {
  background: var(--color-bg-purple-tint);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 2rem 1.5rem;
  color: var(--color-text-primary);
}

.drawer-body ul {
  padding-left: 1.5rem;
}

.drawer-body li {
  margin-bottom: 0.5rem;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

:root.dark-mode .badge-drawer {
  background: #1a1a1a;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

:root.dark-mode .drawer-header {
  border-color: rgba(255, 255, 255, 0.1);
}

:root.dark-mode .btn-close-drawer:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Mobile responsive */
@media (max-width: 991.98px) {
  .badge-drawer {
    width: 100%;
    max-width: 100%;
  }
}

/* Clickable badge hover effect */
.clickable-badge {
  cursor: pointer;
  display: inline-block;
  transition: transform 0.2s ease-in-out;
  padding: 0.25rem;
  border-radius: 0.5rem;
}

.clickable-badge:hover {
  transform: scale(1.05);
  background: var(--color-bg-purple-tint);
}

/* Clickable badge desktop in navbar */
.clickable-badge-desktop {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: transform 0.2s ease-in-out;
  padding: 0.5rem;
  border-radius: 0.75rem;
  min-width: auto;
  width: auto;
}

.clickable-badge-desktop:hover {
  transform: scale(1.05);
  background: var(--color-bg-purple-tint);
}

/* Badge tier icons in drawer */
.tier-badge-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.badge-tier-item {
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--color-bg-purple-tint);
  transition: background 0.2s ease;
}

.badge-tier-item:hover {
  background: var(--color-primary);
  color: white;
}

.badge-tier-item:hover .text-muted {
  color: rgba(255, 255, 255, 0.8) !important;
}
</style>
