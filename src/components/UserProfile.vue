<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { db } from '@/firebase'
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import ListingCard from './ListingCard.vue'
import ListingDrawer from './ListingDrawer.vue'
import SellerBadge from '@/components/SellerBadge.vue'

const route = useRoute()
const userId = ref(route.params.userId)

const userProfile = ref(null)
const userListings = ref([])
const userReviews = ref([])
const loading = ref(true)
const error = ref('')

// Drawer state
const drawerOpen = ref(false)
const drawerListing = ref(null)

// Stats
const totalRating = ref(0)
const avgRating = computed(() => {
  if (userReviews.value.length === 0) return 0
  return totalRating.value / userReviews.value.length
})

// Computed values for seller info to ensure they're always valid
const sellerName = computed(() => {
  if (!userProfile.value) return 'User'
  return userProfile.value.username || userProfile.value.displayName || 'User'
})

const sellerAvatar = computed(() => {
  if (!userProfile.value) return ''
  return userProfile.value.photoURL || userProfile.value.profilePicture || ''
})

async function fetchUserProfile() {
  try {
    loading.value = true
    error.value = ''

    // Fetch user profile data
    const userDoc = await getDoc(doc(db, 'users', userId.value))
    if (!userDoc.exists()) {
      error.value = 'User not found'
      return
    }

    userProfile.value = { id: userDoc.id, ...userDoc.data() }

    // Fetch user's listings
    const listingsQuery = query(
      collection(db, 'allListings'),
      where('userId', '==', userId.value),
      orderBy('createdAt', 'desc')
    )
    const listingsSnapshot = await getDocs(listingsQuery)
    userListings.value = listingsSnapshot.docs.map(doc => ({ id: doc.id, listingId: doc.id, ...doc.data() }))

    // Fetch all reviews from user's listings
    const allReviews = []
    let total = 0

    for (const listing of userListings.value) {
      const reviewsQuery = query(
        collection(db, 'allListings', listing.id, 'reviews'),
        orderBy('createdAt', 'desc')
      )
      const reviewsSnapshot = await getDocs(reviewsQuery)

      reviewsSnapshot.forEach(reviewDoc => {
        const reviewData = reviewDoc.data()
        allReviews.push({
          id: reviewDoc.id,
          listingId: listing.id,
          listingName: listing.businessName,
          ...reviewData
        })
        total += reviewData.rating || 0
      })
    }

    userReviews.value = allReviews
    totalRating.value = total

  } catch (e) {
    console.error('Error fetching user profile:', e)
    error.value = 'Failed to load user profile'
  } finally {
    loading.value = false
  }
}

function openDrawer(listing) {
  drawerListing.value = listing
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  drawerListing.value = null
}

onMounted(() => {
  fetchUserProfile()
})
</script>

<template>
  <div class="container-fluid bg-page">
    <div class="container py-5">
      <!-- Loading State -->
      <div v-if="loading" class="d-flex justify-content-center my-5">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>

      <!-- Profile Content -->
      <div v-else-if="userProfile">
        <!-- User Header -->
        <div class="profile-header card shadow-sm p-4 mb-4">
          <div class="d-flex align-items-center gap-4">
            <!-- Avatar -->
            <div class="profile-avatar">
              <img
                v-if="userProfile.photoURL || userProfile.profilePicture"
                :src="userProfile.photoURL || userProfile.profilePicture"
                alt="Profile Picture"
                class="rounded-circle"
                style="width: 120px; height: 120px; object-fit: cover;"
              />
              <div
                v-else
                class="rounded-circle bg-secondary d-flex align-items-center justify-content-center"
                style="width: 120px; height: 120px; font-size: 48px; color: white;"
              >
                {{ (userProfile.username || userProfile.displayName || 'U').charAt(0).toUpperCase() }}
              </div>
            </div>

            <!-- User Info & Stats -->
            <div class="flex-grow-1">
              <div class="d-flex align-items-center mb-1">
                <h2 class="mb-0">{{ userProfile.username || userProfile.displayName || 'User' }}</h2>
                <SellerBadge 
                  v-if="userProfile.stats" 
                  :points="(userProfile.stats.reviews || 0) + (userProfile.stats.boosts || 0) * 5" 
                  :progress="false" 
                />
              </div>

              <p class="text-muted mb-3">{{ userProfile.email }}</p>

              <!-- Stats Row -->
              <div class="stats-row d-flex gap-4">
                <div class="stat-item">
                  <div class="stat-value">{{ userListings.length }}</div>
                  <div class="stat-label">Listings</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ userReviews.length }}</div>
                  <div class="stat-label">Reviews</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">
                    <span v-if="avgRating > 0">{{ avgRating.toFixed(1) }} ★</span>
                    <span v-else>N/A</span>
                  </div>
                  <div class="stat-label">Avg Rating</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <ul class="nav nav-tabs mb-4" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#listings" type="button" role="tab">
              Listings ({{ userListings.length }})
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" data-bs-toggle="tab" data-bs-target="#reviews" type="button" role="tab">
              Reviews ({{ userReviews.length }})
            </button>
          </li>
        </ul>

        <!-- Tab Content -->
        <div class="tab-content">
          <!-- Listings Tab -->
          <div class="tab-pane fade show active" id="listings" role="tabpanel">
            <div v-if="userListings.length === 0" class="text-center text-muted py-5">
              No listings yet
            </div>
            <div v-else class="row g-3 row-cols-2 row-cols-sm-3 row-cols-lg-4 row-cols-xxl-5">
              <div class="col" v-for="listing in userListings" :key="listing.id">
                <ListingCard
                  :listing="listing"
                  :sellerNameOverride="sellerName"
                  :sellerAvatarOverride="sellerAvatar"
                  :showAll="true"
                  @open="openDrawer"
                />
              </div>
            </div>
          </div>

          <!-- Reviews Tab -->
          <div class="tab-pane fade" id="reviews" role="tabpanel">
            <div v-if="userReviews.length === 0" class="text-center text-muted py-5">
              No reviews yet
            </div>
            <div v-else class="reviews-list">
              <div v-for="review in userReviews" :key="review.id" class="review-card card shadow-sm p-3 mb-3">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <h6 class="mb-1">{{ review.listingName }}</h6>
                    <div class="stars">
                      <span v-for="i in 5" :key="i" class="star" :class="{ filled: i <= review.rating }">★</span>
                    </div>
                  </div>
                  <small class="text-muted">{{ review.createdAt?.toDate?.().toLocaleDateString() }}</small>
                </div>
                <p class="mb-0">{{ review.comment }}</p>
                <div v-if="review.userName" class="mt-2 text-muted small">
                  - {{ review.userName }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Listing Drawer -->
    <ListingDrawer
      :open="drawerOpen"
      :listing="drawerListing"
      :sellerName="sellerName"
      :sellerAvatar="sellerAvatar"
      @close="closeDrawer"
    />
  </div>
</template>

<style scoped>
.bg-page {
  background: var(--color-bg-main);
  min-height: 100vh;
}

.profile-header {
  background: var(--color-bg-white);
  border-radius: 12px;
  color: var(--color-text-primary);
}

.profile-header h2 {
  color: var(--color-text-primary);
}

.stats-row {
  display: flex;
  gap: 2rem;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-tabs .nav-link {
  color: var(--color-text-secondary);
  border: none;
  border-bottom: 3px solid transparent;
  font-weight: 600;
  transition: all var(--transition-fast);
}

.nav-tabs .nav-link.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  background: transparent;
}

.review-card {
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-white);
  color: var(--color-text-primary);
}

.review-card h6 {
  color: var(--color-text-primary);
}

.review-card p {
  color: var(--color-text-primary);
}

.stars {
  display: flex;
  gap: 2px;
}

.star {
  color: var(--color-border);
  font-size: 18px;
}

.star.filled {
  color: #ffc107;
}
</style>