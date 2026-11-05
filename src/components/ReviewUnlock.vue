<template>
  <div class="review-unlock-page">
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-md-8 col-lg-6">
          <div class="unlock-card shadow-lg">
            <!-- Loading State -->
            <div v-if="loading" class="text-center py-5">
              <div class="spinner-border text-primary mb-3"></div>
              <p class="text-muted">Loading...</p>
            </div>

            <!-- Review Form -->
            <div v-else-if="showReviewForm" class="py-4">
              <div class="text-center mb-4">
                <Icon icon="mdi:star" style="font-size: 48px; color: #ffc107;" />
                <h3 class="mt-3">Leave a Review</h3>
                <p class="text-muted">{{ listingName }}</p>
              </div>

              <!-- Star Rating -->
              <div class="mb-4">
                <label class="form-label">Rating</label>
                <div class="stars-input" @mouseleave="hoverRating = 0">
                  <span
                    v-for="i in 5"
                    :key="i"
                    class="star"
                    :class="{ filled: i <= rating, hover: hoverRating > 0 && i <= hoverRating }"
                    @click="rating = i"
                    @mouseenter="hoverRating = i"
                  >
                    ★
                  </span>
                </div>
              </div>

              <!-- Review Comment -->
              <div class="mb-4">
                <label class="form-label">Your Review</label>
                <textarea
                  v-model="comment"
                  class="form-control"
                  rows="4"
                  placeholder="Share your experience..."
                  maxlength="500"
                ></textarea>
                <small class="text-muted">{{ comment.length }}/500 characters</small>
              </div>

              <!-- Submit Button -->
              <div class="d-flex gap-2">
                <button
                  class="btn btn-primary flex-grow-1"
                  @click="submitReview"
                  :disabled="submitting || rating === 0"
                >
                  <span v-if="submitting">
                    <span class="spinner-border spinner-border-sm me-2"></span>
                    Submitting...
                  </span>
                  <span v-else>Submit Review</span>
                </button>
                <button class="btn btn-secondary" @click="goToHome">
                  Cancel
                </button>
              </div>
            </div>

            <!-- Success State -->
            <div v-else-if="submitted" class="text-center py-4">
              <div class="success-icon mb-4">
                <Icon icon="mdi:check-circle" style="font-size: 64px; color: #28a745;" />
              </div>
              <h3 class="mb-3">Thank You!</h3>
              <p class="text-muted mb-4">Your review has been submitted successfully.</p>
              <button class="btn btn-primary" @click="goToHome">
                Return to Home
              </button>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="text-center py-4">
              <div class="error-icon mb-4">
                <Icon icon="mdi:alert-circle" style="font-size: 64px; color: #dc3545;" />
              </div>
              <h3 class="mb-3">Unable to Submit Review</h3>
              <p class="text-danger mb-4">{{ errorMessage }}</p>
              <button class="btn btn-secondary" @click="goToHome">
                Return to Home
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { auth, db } from '@/firebase'
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import { useToast } from '@/composables/useToast'

export default {
  name: 'ReviewUnlock',
  components: { Icon },

  setup() {
    const route = useRoute()
    const router = useRouter()
    const toast = useToast()

    const loading = ref(true)
    const showReviewForm = ref(false)
    const submitted = ref(false)
    const error = ref(false)
    const errorMessage = ref('')
    const listingName = ref('')
    const listingId = ref('')
    const listingOwnerId = ref('')

    // Review form fields
    const rating = ref(0)
    const hoverRating = ref(0)
    const comment = ref('')
    const submitting = ref(false)

    onMounted(async () => {
      const code = route.query.code
      listingId.value = route.params.listingId

      if (!listingId.value || !code) {
        error.value = true
        errorMessage.value = 'Invalid review link. Missing listing ID or code.'
        loading.value = false
        return
      }

      const user = auth.currentUser

      if (!user) {
        // User not logged in - redirect to login with return URL
        toast.info('Please log in to leave a review')
        router.push({
          name: 'login',
          query: { redirect: `/review/${listingId.value}?code=${code}` }
        })
        return
      }

      try {
        // Fetch listing details
        const listingDoc = await getDoc(doc(db, 'allListings', listingId.value))
        if (!listingDoc.exists()) {
          error.value = true
          errorMessage.value = 'Listing not found. This QR code may be invalid.'
          loading.value = false
          return
        }

        const listingData = listingDoc.data()
        listingName.value = listingData.businessName || 'this listing'
        listingOwnerId.value = listingData.userId

        // Check if review code matches
        if (listingData.reviewCode !== code) {
          error.value = true
          errorMessage.value = 'Invalid review code.'
          loading.value = false
          return
        }

        // Check if user is trying to review their own listing
        if (listingData.userId === user.uid) {
          error.value = true
          errorMessage.value = 'You cannot review your own listing.'
          loading.value = false
          return
        }

        // Check if user already reviewed this listing
        const reviewsRef = collection(db, 'allListings', listingId.value, 'reviews')
        const userReviewQuery = query(reviewsRef, where('userId', '==', user.uid))
        const existingReviews = await getDocs(userReviewQuery)

        if (!existingReviews.empty) {
          error.value = true
          errorMessage.value = 'You have already reviewed this listing.'
          loading.value = false
          return
        }

        // Show review form
        showReviewForm.value = true
        loading.value = false

      } catch (err) {
        console.error('Error loading review form:', err)
        error.value = true
        errorMessage.value = `An error occurred: ${err.message || 'Please try again.'}`
        loading.value = false
      }
    })

    async function submitReview() {
      if (rating.value === 0) {
        toast.error('Please select a rating')
        return
      }

      const user = auth.currentUser
      if (!user) {
        toast.error('You must be logged in to submit a review')
        return
      }

      submitting.value = true

      try {
        // Get user data for review
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        const userData = userDoc.data() || {}

        // Add review to listing's reviews subcollection
        // Mark as QR verified since user came through QR code
        await addDoc(collection(db, 'allListings', listingId.value, 'reviews'), {
          userId: user.uid,
          username: userData.username || 'Anonymous',
          rating: rating.value,
          reviewText: comment.value.trim(),
          qrVerified: true,
          bookingVerified: false,
          isVerified: true,
          createdAt: serverTimestamp()
        })

        submitted.value = true
        showReviewForm.value = false
        toast.success('Review submitted successfully!')

      } catch (err) {
        console.error('Error submitting review:', err)
        toast.error('Failed to submit review. Please try again.')
      } finally {
        submitting.value = false
      }
    }

    function goToHome() {
      router.push('/home')
    }

    return {
      loading,
      showReviewForm,
      submitted,
      error,
      errorMessage,
      listingName,
      rating,
      hoverRating,
      comment,
      submitting,
      submitReview,
      goToHome
    }
  }
}
</script>

<style scoped>
.review-unlock-page {
  min-height: 100vh;
  background: var(--color-bg-main);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.unlock-card {
  background: white;
  border-radius: 16px;
  padding: 40px;
}

:root.dark-mode .unlock-card {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

:root.dark-mode .text-muted {
  color: #aaa !important;
}

:root.dark-mode h3 {
  color: var(--color-text-primary) !important;
}

:root.dark-mode .form-control {
  background: #2a2a3e;
  border-color: #444;
  color: var(--color-text-primary);
}

:root.dark-mode .form-label {
  color: var(--color-text-primary) !important;
}

/* Star Rating Input */
.stars-input {
  display: flex;
  gap: 8px;
  font-size: 36px;
  cursor: pointer;
}

.stars-input .star {
  color: #ddd;
  transition: color 0.2s ease;
  cursor: pointer;
  user-select: none;
}

.stars-input .star:hover,
.stars-input .star.hover,
.stars-input .star.filled {
  color: #ffc107 !important;
}

:root.dark-mode .stars-input .star {
  color: #555;
}

:root.dark-mode .stars-input .star:hover,
:root.dark-mode .stars-input .star.hover,
:root.dark-mode .stars-input .star.filled {
  color: #ffc107 !important;
}

/* Button styling to match project */
.btn-primary {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  color: white !important;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover) !important;
  border-color: var(--color-primary-hover) !important;
  color: white !important;
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #6c757d !important;
  border-color: #6c757d !important;
  color: white !important;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background-color: #5a6268 !important;
  border-color: #545b62 !important;
  color: white !important;
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.btn-secondary:active {
  transform: translateY(0);
}

/* Ensure buttons never turn white - force specificity */
.btn-primary:focus,
.btn-primary:focus-visible {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  color: white !important;
  box-shadow: 0 0 0 0.25rem rgba(106, 90, 248, 0.25) !important;
}

/* Dark mode button overrides */
:root.dark-mode .btn-primary {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  color: white !important;
}

:root.dark-mode .btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover) !important;
  border-color: var(--color-primary-hover) !important;
  color: white !important;
}

:root.dark-mode .btn-primary:focus,
:root.dark-mode .btn-primary:focus-visible {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  color: white !important;
}

:root.dark-mode .btn-secondary {
  background-color: #6c757d !important;
  border-color: #6c757d !important;
  color: white !important;
}

:root.dark-mode .btn-secondary:hover {
  background-color: #5a6268 !important;
  border-color: #545b62 !important;
  color: white !important;
}

:root.dark-mode .btn-secondary:focus,
:root.dark-mode .btn-secondary:focus-visible {
  background-color: #6c757d !important;
  border-color: #6c757d !important;
  color: white !important;
}

.success-icon, .error-icon {
  animation: scaleIn 0.3s ease-out;
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

@media (max-width: 575.98px) {
  .unlock-card {
    padding: 30px 20px;
  }
}
</style>
