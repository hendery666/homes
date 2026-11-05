<script setup>
import StartChatButton from './StartChatButton.vue'
import { computed, ref, onMounted, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '@/firebase'
import { collection, query, doc, getDoc, getDocs } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import SellerBadge from './SellerBadge.vue'

const router = useRouter()

const auth = getAuth()
const $auth = reactive({ currentUser: auth.currentUser })
onAuthStateChanged(auth, (u) => { $auth.currentUser = u })

const props = defineProps({
  listing: { type: Object, required: true },
  liked: { type: Boolean, default: false },
  likesCount: { type: Number, default: 0 },
  sellerNameOverride: { type: String, default: '' },
  sellerAvatarOverride: { type: String, default: '' },
  reveal: { type: Boolean, default: true },
  showAll: { type: Boolean, default: false } // New prop to control batch visibility
})
const emit = defineEmits(['toggle-like', 'image-loaded', 'open', 'card-ready'])

// Cache the seller name once loaded to prevent flickering
const cachedSellerName = ref('')
const cachedSellerAvatar = ref('')
let nameDebounceTimer = null
let avatarDebounceTimer = null
const isNameStable = ref(false)
const isAvatarStable = ref(false)

watch(() => props.sellerNameOverride, (newName) => {
  // Once we've cached a stable name, don't update it anymore
  if (isNameStable.value) return

  // Clear previous timer
  if (nameDebounceTimer) clearTimeout(nameDebounceTimer)

  // Only cache non-empty, valid names (allow any truthy non-Loading value)
  if (newName && newName.trim() && newName !== 'Loading...') {
    // Set immediately without setTimeout - no delay needed
    cachedSellerName.value = newName
    isNameStable.value = true // Mark as stable - no more updates
    // Notify parent that this card is ready
    emit('card-ready', props.listing.listingId || props.listing.id)
  } else if (newName === '') {
    // If explicitly empty string, still mark as ready but don't cache
    // This handles cases where profile hasn't loaded yet
  }
}, { immediate: true })

watch(() => props.sellerAvatarOverride, (newAvatar) => {
  // Once we've cached a stable avatar, don't update it anymore
  if (isAvatarStable.value) return

  // Clear previous timer
  if (avatarDebounceTimer) clearTimeout(avatarDebounceTimer)

  if (newAvatar && newAvatar.trim()) {
    // Set immediately without setTimeout - no delay needed
    cachedSellerAvatar.value = newAvatar
    isAvatarStable.value = true // Mark as stable - no more updates
  }
}, { immediate: true })

const avgRating = ref(0)
const totalReviews = ref(0)

async function fetchRating() {
  try {
    const listingId = props.listing.listingId || props.listing.id
    if (!listingId) return

    const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
    const snapshot = await getDocs(query(reviewsRef))

    if (snapshot.empty) {
      avgRating.value = 0
      totalReviews.value = 0
      return
    }

    let totalRating = 0
    snapshot.forEach(doc => {
      const data = doc.data()
      totalRating += (data.rating || 0)
    })

    totalReviews.value = snapshot.size
    avgRating.value = totalReviews.value > 0 ? totalRating / totalReviews.value : 0
  } catch (e) {
    console.warn('Failed to fetch rating for listing:', e)
  }
}

onMounted(() => {
  fetchRating()
})

/* ---------------- LISTING DATA ---------------- */
const photo = computed(() =>
  props.listing.photoUrls?.[0] || props.listing.photos?.[0]?.url || null
)
const firstPrice = computed(() => props.listing.menu?.[0]?.price ?? null)

const sellerName = computed(() => {
  // If showAll is true, show either the cached name OR the override directly
  if (props.showAll) {
    return cachedSellerName.value || props.sellerNameOverride || ''
  }

  // Hide the name until all cards are ready (prevents any flickering)
  return ''
})

const sellerAvatar = computed(() => {
  // If showAll is true, show either the cached avatar OR the override directly
  if (props.showAll) {
    return cachedSellerAvatar.value || props.sellerAvatarOverride || ''
  }

  // Hide the avatar until all cards are ready
  return ''
})

const imgLoaded = ref(false)
const imgErrored = ref(false)
function onImgLoad() {
  imgLoaded.value = true
  emit('image-loaded', props.listing.listingId || props.listing.id)
}
function onImgError() {
  imgErrored.value = true
  emit('image-loaded', props.listing.listingId || props.listing.id)
}

const boostCountdown = computed(() => {
  let ts = props.listing.boostedUntil
  if (!ts) return null

  if (ts.timestampValue) ts = ts.timestampValue

  const target = typeof ts === 'object' && ts.seconds ? ts.seconds * 1000 : Date.parse(ts)
  if (!target || isNaN(target)) return null

  const diff = target - Date.now()
  if (diff <= 0) return 'Expired'

  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
})

function goToUserProfile(event) {
  event.stopPropagation()
  if (props.listing.userId) {
    router.push({ name: 'UserProfile', params: { userId: props.listing.userId } })
  }
}
</script>

<template>
  <div class="card h-100 shadow-sm selectable card-border" :class="{ 'reveal-in': reveal }"
    @click="emit('open', listing)">
    <!-- Header -->
    <div class="card-header bg-transparent border-0 pb-0 d-flex align-items-center gap-2">
      <!-- Show skeleton loader while waiting for all cards to be ready -->
      <template v-if="!showAll">
        <div class="skeleton-avatar rounded-circle" style="width:28px;height:28px;"></div>
        <div class="skeleton-text" style="width:80px;height:16px;"></div>
        <div style="min-width:40px;"></div>
      </template>

      <!-- Show actual content once all cards are ready -->
      <template v-else>
        <div class="avatar-box rounded-circle overflow-hidden d-inline-block" style="width:28px;height:28px;"
          @click="goToUserProfile">
          <img v-if="sellerAvatar" :src="sellerAvatar" alt="avatar" class="w-100 h-100" style="object-fit:cover;">
          <div v-else
            class="w-100 h-100 d-flex align-items-center justify-content-center bg-secondary-subtle text-secondary small">
            {{ (sellerName || 'S').toString().trim().charAt(0).toUpperCase() }}
          </div>
        </div>
        <span class="fw-semibold small text-truncate seller-name-link" style="max-width:100px" :title="sellerName"
          @click="goToUserProfile">{{ sellerName }}</span>
        <SellerBadge
          :points="listing.sellerStats ? (listing.sellerStats.reviews || 0) + (listing.sellerStats.boosts || 0) * 5 : 0"
          :progress="false" style="min-width:40px;" />
      </template>
    </div>

    <!-- Image box -->
    <div class="px-3 pt-2">
      <div class="img-box rounded-4 overflow-hidden position-relative">
        <!-- Skeleton placeholder -->
        <div v-if="!imgLoaded && !imgErrored" class="skeleton"></div>

        <!-- Actual image -->
        <img v-if="photo && !imgErrored" :src="photo" :alt="listing.businessName" class="img-cover" loading="lazy"
          decoding="async" referrerpolicy="no-referrer-when-downgrade"
          @load="onImgLoad" @error="onImgError" :class="{ 'img-visible': imgLoaded }" />

        <!-- Fallback -->
        <div v-if="!photo || imgErrored" class="img-fallback">No photo</div>
      </div>
    </div>

    <!-- Content -->
    <div class="card-body d-flex flex-column">
      <!-- Business name + social icons -->
      <div class="d-flex align-items-center justify-content-between mb-1">
        <h6 class="card-title mb-0 text-truncate flex-grow-1" :title="listing.businessName">
          {{ listing.businessName }}
        </h6>
      </div>


      <!-- Rating Display -->
      <div v-if="totalReviews > 0" class="rating-display mb-2">
        <div class="stars-small">
          <span v-for="i in 5" :key="i" class="star" :class="{ filled: i <= Math.round(avgRating) }">★</span>
        </div>
        <span class="rating-text">{{ avgRating.toFixed(1) }} ({{ totalReviews }})</span>
      </div>
      <div v-else class="rating-display mb-2">
        <span class="text-muted small">No reviews yet</span>
      </div>

      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-bold">
          <span v-if="firstPrice">S${{ firstPrice }}</span>
        </div>
        <span class="badge text-bg-primary">{{ listing.businessCategory }}</span>
      </div>

      <!-- Boost Countdown -->

      <div class="mt-auto"></div>
    </div>

    <!-- Footer -->
    <div class="card-footer bg-transparent d-flex justify-content-between align-items-center">
      <div class="d-flex align-items-center gap-2 footer-left">
        <span class="small text-muted">{{ likesCount }}</span>
        <button class="btn btn-sm like-btn" :class="liked ? 'btn-danger' : 'btn-outline-danger'"
          @click.stop="emit('toggle-like', listing)" aria-label="Toggle like">♥</button>
      </div>
      <div class="d-flex gap-2 align-items-center footer-right">
        <!-- ✅ Only show StartChatButton if this is NOT your own listing -->
        <StartChatButton v-if="listing.userId !== $auth?.currentUser?.uid" :targetUserId="listing.userId"
          :listingId="listing.listingId || listing.id" :listingTitle="listing.businessName"
          :listingCover="listing.photoUrls?.[0] || listing.photos?.[0]?.url" class="chat-btn-mobile" @click.stop />
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-border {
  border: 1px solid var(--color-border);
  background: var(--color-bg-white);
  backdrop-filter: blur(10px);
  position: relative;
  overflow: hidden;
}

.card-border::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-lighter) 100%);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.card-border:hover::before {
  opacity: 1;
}

.selectable {
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 12px rgba(75, 42, 166, 0.08);
}

.selectable:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 12px 32px rgba(75, 42, 166, 0.18), 0 0 0 1px rgba(75, 42, 166, 0.1) !important;
  border-color: transparent !important;
}

.selectable:active {
  transform: translateY(-4px) scale(1.01);
  box-shadow: 0 8px 24px rgba(75, 42, 166, 0.15) !important;
}

.reveal-in {
  animation: fadeIn .35s ease both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px)
  }

  to {
    opacity: 1;
    transform: none
  }
}

.img-box {
  height: 220px;
  position: relative;
  background: var(--color-bg-purple-tint);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: inset 0 2px 8px rgba(75, 42, 166, 0.05);
}

.img-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: 0;
  transition: opacity 0.4s ease;
}

.img-visible {
  opacity: 1;
}

.skeleton {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #eee 0%, #f5f5f5 20%, #eee 40%, #eee 100%);
  background-size: 200% 100%;
  animation: shimmer 1.1s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0
  }

  100% {
    background-position: -200% 0
  }
}

/* Skeleton loaders for seller info */
.skeleton-avatar,
.skeleton-text {
  background: linear-gradient(90deg, #eee 0%, #f5f5f5 20%, #eee 40%, #eee 100%);
  background-size: 200% 100%;
  animation: shimmer 1.1s infinite;
  border-radius: 4px;
}

.skeleton-avatar {
  border-radius: 50% !important;
}

:root.dark-mode .skeleton-avatar,
:root.dark-mode .skeleton-text {
  background: linear-gradient(90deg, #2a2a2a 0%, #3a3a3a 20%, #2a2a2a 40%, #2a2a2a 100%);
  background-size: 200% 100%;
}

.img-fallback {
  position: absolute;
  inset: 0;
  background: var(--color-bg-purple-tint);
  color: var(--color-text-secondary);
  display: flex;
  justify-content: center;
  align-items: center;
}

.rating-display {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stars-small {
  display: flex;
  gap: 1px;
}

.stars-small .star {
  color: var(--color-border);
  font-size: 14px;
}

.stars-small .star.filled {
  color: #ffc107 !important;
}

:root.dark-mode .stars-small .star.filled {
  color: #ffd700 !important;
}

.rating-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.boost-timer {
  background: var(--color-bg-purple-tint);
  border-radius: 6px;
  padding: 4px 8px;
  display: inline-block;
}

.card-title {
  color: var(--color-text-primary);
}

.card-header {
  color: var(--color-text-primary);
}

.bg-secondary-subtle {
  background: var(--color-bg-purple-tint) !important;
}

.text-secondary {
  color: var(--color-text-secondary) !important;
}

.text-muted {
  color: var(--color-text-secondary) !important;
}

.avatar-box {
  border: 1px solid var(--color-border);
}

.fw-bold {
  color: var(--color-text-primary);
}

.seller-name-link {
  cursor: pointer;
  transition: color var(--transition-fast);
}

.seller-name-link:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

/* Hide mobile social icons on desktop by default */
.social-icons-mobile {
  display: none !important;
}

.btn-sm {
  transition: all var(--transition-fast);
}

.btn-sm:hover {
  transform: scale(1.15);
}

.avatar-box {
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.avatar-box:hover {
  transform: scale(1.1);
}

@media (max-width: 767.98px) {
  .img-box {
    height: 200px !important;
  }

  .card-body {
    padding: 0.85rem 1rem !important;
  }

  .card-footer {
    padding: 0.65rem 1rem !important;
  }

  .card-title {
    font-size: 1rem !important;
  }

  .badge {
    font-size: 0.7rem !important;
    padding: 0.35rem 0.65rem;
  }

  .rating-text {
    font-size: 0.8rem;
  }

  .stars-small .star {
    font-size: 13px;
  }

  .fw-bold {
    font-size: 0.95rem;
  }
}

@media (max-width: 575.98px) {
  .card {
    border-radius: 12px;
    display: flex !important;
    flex-direction: column !important;
  }

  .img-box {
    height: 200px !important;
    border-radius: 10px !important;
  }

  .card-header {
    padding: 0.4rem 0.75rem 0.25rem !important;
  }

  .card-body {
    padding: 0.3rem 0.75rem 0.25rem !important;
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
  }

  .card-footer {
    padding: 0.4rem 0.75rem !important;
    margin-top: auto !important;
  }

  .card-title {
    font-size: 0.9rem !important;
    margin-bottom: 0.25rem !important;
  }

  /* Hide desktop social icons on mobile */
  .social-icons-desktop {
    display: none !important;
  }

  .badge {
    font-size: 0.625rem !important;
    padding: 0.25rem 0.5rem;
  }

  /* Smaller buttons on mobile */
  .btn-sm {
    font-size: 0.65rem !important;
    padding: 0.2rem 0.4rem !important;
  }

  .like-btn {
    min-width: auto !important;
  }

  /* Show social icons in footer on mobile */
  .social-icons-mobile {
    display: flex !important;
    gap: 0.15rem !important;
  }

  .social-icon {
    width: 14px !important;
    height: 14px !important;
  }

  .social-link {
    display: flex !important;
    align-items: center !important;
  }

  /* Reduce footer gap */
  .card-footer {
    gap: 0.25rem !important;
  }

  .footer-left {
    gap: 0.25rem !important;
  }

  .footer-right {
    gap: 0.3rem !important;
  }

  .small {
    font-size: 0.7rem !important;
  }

  .avatar-box {
    width: 28px !important;
    height: 28px !important;
  }

  .fw-bold {
    font-size: 0.85rem;
  }

  .rating-display {
    gap: 4px;
    margin-bottom: 0.25rem !important;
  }

  .rating-text {
    font-size: 0.7rem;
  }

  .stars-small .star {
    font-size: 11px;
  }

  .fw-semibold {
    font-size: 0.75rem !important;
  }

  .d-flex.justify-content-between.align-items-center.mb-2 {
    margin-bottom: 0.25rem !important;
  }

  .mt-auto {
    margin-top: auto !important;
    flex-grow: 1 !important;
  }
}

/* Narrow mobile screens (393px - 420px width) - 2 column layout optimized */
@media (max-width: 420px) {
  .card {
    border-radius: 10px;
    display: flex !important;
    flex-direction: column !important;
  }

  .img-box {
    height: 160px !important;
    border-radius: 8px !important;
  }

  .card-header {
    padding: 0.35rem 0.65rem 0.2rem !important;
  }

  .card-body {
    padding: 0.25rem 0.65rem 0.2rem !important;
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
  }

  .card-footer {
    padding: 0.35rem 0.65rem !important;
    margin-top: auto !important;
  }

  .card-title {
    font-size: 0.85rem !important;
    margin-bottom: 0.2rem !important;
    line-height: 1.2;
  }

  /* Hide desktop social icons on narrow mobile */
  .social-icons-desktop {
    display: none !important;
  }

  .badge {
    font-size: 0.6rem !important;
    padding: 0.2rem 0.4rem;
  }

  /* Smaller buttons on narrow mobile */
  .btn-sm {
    font-size: 0.6rem !important;
    padding: 0.18rem 0.35rem !important;
  }

  .like-btn {
    min-width: auto !important;
  }

  /* Show social icons in footer on mobile */
  .social-icons-mobile {
    display: flex !important;
    gap: 0.1rem !important;
  }

  .social-icon {
    width: 12px !important;
    height: 12px !important;
  }

  .social-link {
    display: flex !important;
    align-items: center !important;
  }

  /* Reduce footer gap */
  .card-footer {
    gap: 0.2rem !important;
  }

  .footer-left {
    gap: 0.2rem !important;
  }

  .footer-right {
    gap: 0.25rem !important;
  }

  .small {
    font-size: 0.65rem !important;
  }

  .fw-bold {
    font-size: 0.8rem;
  }

  .rating-display {
    gap: 3px;
    margin-bottom: 0.2rem !important;
  }

  .rating-text {
    font-size: 0.65rem;
  }

  .stars-small .star {
    font-size: 10px;
  }

  .fw-semibold {
    font-size: 0.7rem !important;
  }

  .avatar-box {
    width: 24px !important;
    height: 24px !important;
  }

  .d-flex.justify-content-between.align-items-center.mb-2 {
    margin-bottom: 0.2rem !important;
  }

  .mt-auto {
    margin-top: auto !important;
    flex-grow: 1 !important;
  }
}

</style>