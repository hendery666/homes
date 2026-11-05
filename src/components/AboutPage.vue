<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'
import NavBar from './NavBar.vue'
import { db } from '@/firebase'
import { collection, query, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore'

let io = null
let descriptionIo = null

const testimonials = ref([])
const loadingReviews = ref(true)
const trendingListings = ref([])
const loadingTrending = ref(true)
const statistics = ref({
  businesses: 0,
  users: 0,
  categories: 0
})
const loadingStats = ref(true)

// Typewriter effect
const typewriterText = ref('')
const fullText = 'Discover trusted home businesses near you'
let typewriterIndex = 0

function typewriterEffect() {
  if (typewriterIndex < fullText.length) {
    typewriterText.value += fullText.charAt(typewriterIndex)
    typewriterIndex++
    setTimeout(typewriterEffect, 80)
  }
}

// fetch real reviews from database
async function fetchRealReviews() {
  try {
    const listingsRef = collection(db, 'allListings')
    const listingsSnap = await getDocs(query(listingsRef, limit(50)))

    const allReviews = []

    for (const listingDoc of listingsSnap.docs) {
      const listingId = listingDoc.id
      const listingData = listingDoc.data()

      const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
      const reviewsQuery = query(reviewsRef, orderBy('createdAt', 'desc'), limit(5))
      const reviewsSnap = await getDocs(reviewsQuery)

      for (const reviewDoc of reviewsSnap.docs) {
        const reviewData = reviewDoc.data()

        const reviewComment = reviewData.reviewText || reviewData.comment || ''
        // Only show verified reviews (QR scan or booking verification) that are 4+ stars and have a comment
        if (reviewData.isVerified && reviewData.rating >= 4 && reviewComment && reviewComment.trim().length > 0) {
          let userName = reviewData.userName || reviewData.username || 'Anonymous'
          let userLocation = 'Singapore'

          if (reviewData.userId) {
            try {
              const userDoc = await getDoc(doc(db, 'users', reviewData.userId))
              if (userDoc.exists()) {
                const userData = userDoc.data()
                userName = userData.displayName || userData.username || userName
                // Always show Singapore as the location
                userLocation = 'Singapore'
              }
            } catch (e) {}
          }

          allReviews.push({
            text: reviewComment,
            rating: reviewData.rating,
            userName: userName,
            userLocation: userLocation,
            businessName: listingData.businessName
          })
        }
      }

      if (allReviews.length >= 6) break
    }

    const shuffled = allReviews.sort(() => 0.5 - Math.random())
    testimonials.value = shuffled.slice(0, 3)

    if (testimonials.value.length === 0) {
      testimonials.value = [
        {
          text: "Found the most amazing homemade pastries right in my neighbourhood. The quality is incredible and the service is so personal!",
          rating: 5,
          userName: "Sarah T.",
          userLocation: "Tampines"
        },
        {
          text: "As a home baker, this platform helped me reach so many new customers. The booking system makes everything seamless!",
          rating: 5,
          userName: "Michelle L.",
          userLocation: "Jurong West"
        },
        {
          text: "Best platform for finding local services. I've tried yoga classes, art workshops, and cooking lessons—all amazing!",
          rating: 5,
          userName: "James W.",
          userLocation: "Bishan"
        }
      ]
    }

  } catch (error) {
    console.error('Failed to fetch reviews:', error)
    testimonials.value = [
      {
        text: "Found the most amazing homemade pastries right in my neighbourhood. The quality is incredible and the service is so personal!",
        rating: 5,
        userName: "Sarah T.",
        userLocation: "Tampines"
      },
      {
        text: "As a home baker, this platform helped me reach so many new customers. The booking system makes everything seamless!",
        rating: 5,
        userName: "Michelle L.",
        userLocation: "Jurong West"
      },
      {
        text: "Best platform for finding local services. I've tried yoga classes, art workshops, and cooking lessons—all amazing!",
        rating: 5,
        userName: "James W.",
        userLocation: "Bishan"
      }
    ]
  } finally {
    loadingReviews.value = false
  }
}

async function fetchTrendingListings() {
  try {
    const listingsRef = collection(db, 'allListings')
    const trendingQuery = query(listingsRef, orderBy('viewCount', 'desc'), limit(4))
    const snapshot = await getDocs(trendingQuery)

    const listings = []
    for (const doc of snapshot.docs) {
      const data = doc.data()
      const listingId = doc.id

      let avgRating = 0
      let totalReviews = 0
      try {
        const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
        const reviewsSnap = await getDocs(reviewsRef)
        if (!reviewsSnap.empty) {
          const ratings = reviewsSnap.docs.map(d => d.data().rating || 0)
          avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length
          totalReviews = reviewsSnap.size
        }
      } catch (e) {
        console.warn('Failed to fetch ratings for', listingId)
      }

      const imageUrl = data.imageUrl ||
                      data.businessImage ||
                      data.image ||
                      (Array.isArray(data.photoUrls) && data.photoUrls.length > 0 ? data.photoUrls[0] : null) ||
                      (Array.isArray(data.photos) && data.photos.length > 0 ? data.photos[0].url : null) ||
                      (Array.isArray(data.images) && data.images.length > 0 ? data.images[0] : null) ||
                      data.photoURL ||
                      null

      listings.push({
        id: listingId,
        businessName: data.businessName,
        businessCategory: data.businessCategory,
        price: data.menu?.[0]?.price || null,
        avgRating: avgRating.toFixed(1),
        totalReviews: totalReviews,
        imageUrl: imageUrl
      })
    }

    trendingListings.value = listings

  } catch (error) {
    console.error('Failed to fetch trending listings:', error)
  } finally {
    loadingTrending.value = false
  }
}

function getCategoryClass(category) {
  const categoryMap = {
    'Fitness': 'fitness-bg',
    'Food & Drinks': 'food-bg',
    'Arts & Craft': 'arts-bg',
    'Education': 'education-bg',
    'Health & Wellness': 'fitness-bg',
    'Beauty': 'arts-bg',
    'Home Services': 'education-bg'
  }
  return categoryMap[category] || 'fitness-bg'
}

function getStars(rating) {
  const roundedRating = Math.round(parseFloat(rating))
  return '★'.repeat(roundedRating) + '☆'.repeat(5 - roundedRating)
}

async function fetchStatistics() {
  try {
    const listingsRef = collection(db, 'allListings')
    const listingsSnap = await getDocs(listingsRef)
    statistics.value.businesses = listingsSnap.size

    const usersRef = collection(db, 'users')
    const usersSnap = await getDocs(usersRef)
    statistics.value.users = usersSnap.size

    const categories = new Set()
    listingsSnap.docs.forEach(doc => {
      const category = doc.data().businessCategory
      if (category) categories.add(category)
    })
    statistics.value.categories = categories.size

  } catch (error) {
    console.error('Failed to fetch statistics:', error)
    statistics.value = {
      businesses: 0,
      users: 0,
      categories: 0
    }
  } finally {
    loadingStats.value = false
  }
}

onMounted(() => {
  // Start typewriter effect
  setTimeout(typewriterEffect, 500)

  fetchRealReviews()
  fetchTrendingListings()
  fetchStatistics()

  const section = document.querySelector('.about-section')
  if (!section) return

  io = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        section.classList.add('in-view')
        io && io.unobserve(section)
      }
    },
    { root: null, threshold: 0.25 }
  )
  io.observe(section)

  const containers = document.querySelectorAll('.feature-card')
  descriptionIo = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('fade-in')),
    { threshold: 0.15 }
  )
  containers.forEach((c) => descriptionIo.observe(c))
})

onBeforeUnmount(() => {
  io && io.disconnect()
  descriptionIo && descriptionIo.disconnect()
})
</script>

<template>
  <NavBar :auth-ctas-only="true" />

  <!-- HERO with Typewriter -->
  <div class="hero-section">
    <div class="hero-video-bg">
      <video autoplay loop muted playsinline>
        <source src="../assets/homes_video/homes_video.mp4" type="video/mp4">
      </video>
      <div class="hero-overlay"></div>
    </div>

    <div class="hero-content">
      <div class="hero-badge">
        <span class="pulse-dot"></span>
        Now serving all of Singapore
      </div>
      <h1 class="hero-title">
        {{ typewriterText }}<span class="typewriter-cursor">|</span>
      </h1>
      <p class="hero-subtitle">
        Connect with talented entrepreneurs in your neighbourhood. From home-cooked meals to fitness classes,
        find everything you need, locally.
      </p>

      <!-- Floating stats -->
      <div class="hero-stats">
        <div class="stat-pill">
          <span class="stat-number">{{ statistics.businesses }}+</span>
          <span class="stat-label">Businesses</span>
        </div>
        <div class="stat-pill">
          <span class="stat-number">{{ statistics.users }}+</span>
          <span class="stat-label">Happy Users</span>
        </div>
        <div class="stat-pill">
          <span class="stat-number">{{ statistics.categories }}+</span>
          <span class="stat-label">Categories</span>
        </div>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div class="scroll-indicator">
      <div class="mouse">
        <div class="wheel"></div>
      </div>
    </div>
  </div>

  <!-- FEATURES SECTION -->
  <section class="features-section">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Everything you need</h2>
        <p class="section-subtitle">Discover local talent, support small businesses, and find exactly what you're looking for</p>
      </div>

      <div class="features-grid">
        <!-- Feature 1 -->
        <div class="feature-card">
          <div class="feature-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 7.61305 3.94821 5.32387 5.63604 3.63604C7.32387 1.94821 9.61305 1 12 1C14.3869 1 16.6761 1.94821 18.364 3.63604C20.0518 5.32387 21 7.61305 21 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="feature-title">Find Local Gems</h3>
          <p class="feature-desc">Discover amazing home businesses right in your neighbourhood—from artisan bakers to skilled tutors.</p>
        </div>

        <!-- Feature 2 -->
        <div class="feature-card">
          <div class="feature-icon feature-icon-green">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="feature-title">Support Real People</h3>
          <p class="feature-desc">Every purchase supports passionate entrepreneurs and strengthens your local community.</p>
        </div>

        <!-- Feature 3 -->
        <div class="feature-card">
          <div class="feature-icon feature-icon-orange">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="feature-title">Instant Connection</h3>
          <p class="feature-desc">Message sellers directly, ask questions, customize orders, and book appointments—all in one place.</p>
        </div>

        <!-- Feature 4 -->
        <div class="feature-card">
          <div class="feature-icon feature-icon-blue">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 2C14.5013 4.73835 15.9228 8.29203 16 12C15.9228 15.708 14.5013 19.2616 12 22C9.49872 19.2616 8.07725 15.708 8 12C8.07725 8.29203 9.49872 4.73835 12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h3 class="feature-title">Wide Variety</h3>
          <p class="feature-desc">Explore diverse categories—from food and fitness to arts, education, and everything in between.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CATEGORIES SHOWCASE -->
  <section class="about-section">
    <div class="content text-center px-3 mb-5">
      <h2 class="about-title">Browse by category</h2>
      <p class="section-subtitle">Find exactly what you're looking for</p>
    </div>

    <div class="about-grid mb-4">
      <div class="category-item">
        <img src="../assets/category_images/fitness.png" alt="Fitness" />
        <p class="category-label">Fitness</p>
      </div>
      <div class="category-item">
        <img src="../assets/category_images/arts_craft.png" alt="Arts & Craft" />
        <p class="category-label">Arts & Craft</p>
      </div>
      <div class="category-item">
        <img src="../assets/category_images/education.png" alt="Education" />
        <p class="category-label">Education</p>
      </div>
      <div class="category-item">
        <img src="../assets/category_images/food_drinks.png" alt="Food & Drinks" />
        <p class="category-label">Food & Drinks</p>
      </div>
    </div>
  </section>

  <!-- TESTIMONIALS -->
  <section class="testimonials-section">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Loved by thousands</h2>
        <p class="section-subtitle">See what our community has to say</p>
      </div>

      <div v-if="loadingReviews" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading reviews...</span>
        </div>
      </div>

      <div v-else class="testimonials-grid">
        <div v-for="(testimonial, index) in testimonials" :key="index" class="testimonial-card">
          <div class="testimonial-header">
            <div class="stars">★★★★★</div>
            <div class="quote-icon">"</div>
          </div>
          <p class="testimonial-text">{{ testimonial.text }}</p>
          <div class="testimonial-author">
            <div class="author-avatar">{{ testimonial.userName.charAt(0).toUpperCase() }}</div>
            <div>
              <div class="author-name">{{ testimonial.userName }}</div>
              <div class="author-location">{{ testimonial.userLocation }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- TRENDING LISTINGS -->
  <section class="trending-section">
    <div class="container">
      <div class="section-header">
        <h2 class="section-title">Trending now</h2>
        <p class="section-subtitle">Popular businesses in your area</p>
      </div>

      <div v-if="loadingTrending" class="text-center py-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      </div>

      <div v-else class="trending-grid">
        <div v-for="listing in trendingListings" :key="listing.id" class="trending-card">
          <div
            class="trending-image"
            :class="{ 'has-image': listing.imageUrl, [getCategoryClass(listing.businessCategory)]: !listing.imageUrl }"
            :style="listing.imageUrl ? `background-image: url('${listing.imageUrl}')` : ''"
          >
            <div class="trending-badge">Trending</div>
          </div>
          <div class="trending-content">
            <h6 class="trending-title">{{ listing.businessName }}</h6>
            <div class="trending-rating">
              <span class="stars-small">{{ getStars(listing.avgRating) }}</span>
              <span class="rating-text">{{ listing.avgRating }} ({{ listing.totalReviews }})</span>
            </div>
            <div class="trending-price" v-if="listing.price">From S${{ listing.price }}</div>
            <div class="trending-price text-muted" v-else>Price varies</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- FINAL CTA -->
  <section class="final-cta-section">
    <div class="container">
      <div class="final-cta-card">
        <div class="cta-glow"></div>
        <h2 class="final-cta-title">Ready to discover?</h2>
        <p class="final-cta-subtitle">Join thousands of Singaporeans supporting local businesses</p>
        <RouterLink to="/signup" class="btn-final-cta">
          Start Exploring
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ========== HERO SECTION ========== */
.hero-section {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-video-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.hero-video-bg video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: brightness(0.4);
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%);
}

.hero-content {
  position: relative;
  z-index: 2;
  text-align: center;
  max-width: 900px;
  padding: 2rem;
  animation: fadeInUp 0.8s ease-out;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 0.5rem 1.25rem;
  border-radius: 50px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  animation: fadeIn 0.8s ease-out 0.3s both;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.hero-title {
  font-size: clamp(2rem, 6vw, 4rem);
  font-weight: 800;
  color: white;
  margin-bottom: 1.5rem;
  line-height: 1.2;
  min-height: 1.5em;
  animation: fadeIn 0.8s ease-out 0.5s both;
}

.typewriter-cursor {
  display: inline-block;
  animation: blink 1s steps(1) infinite;
  color: var(--color-primary);
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.hero-subtitle {
  font-size: clamp(1rem, 2vw, 1.25rem);
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2.5rem;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
  animation: fadeIn 0.8s ease-out 0.7s both;
}

.hero-cta {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 3rem;
  animation: fadeIn 0.8s ease-out 0.9s both;
}

.btn-hero-primary,
.btn-hero-secondary {
  padding: 1rem 2rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1.0625rem;
  transition: all 0.3s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-hero-primary {
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: white;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.35);
}

.btn-hero-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.45);
}

.btn-hero-secondary {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.btn-hero-secondary:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
  transform: translateY(-2px);
}

.hero-stats {
  display: flex;
  gap: 1.5rem;
  justify-content: center;
  flex-wrap: wrap;
  animation: fadeIn 0.8s ease-out 1.1s both;
}

.stat-pill {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(10px);
  padding: 0.75rem 1.5rem;
  border-radius: 50px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stat-number {
  color: white;
  font-weight: 700;
  font-size: 1.125rem;
}

.stat-label {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
}

.scroll-indicator {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  animation: fadeIn 0.8s ease-out 1.3s both;
}

.mouse {
  width: 26px;
  height: 40px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 15px;
  display: flex;
  justify-content: center;
  padding-top: 8px;
}

.wheel {
  width: 3px;
  height: 8px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 2px;
  animation: scroll 2s infinite;
}

@keyframes scroll {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  100% {
    transform: translateY(12px);
    opacity: 0;
  }
}

/* ========== FEATURES SECTION ========== */
.features-section {
  padding: 6rem 0;
  background: var(--color-bg-page);
}

.section-header {
  text-align: center;
  margin-bottom: 4rem;
}

.section-title {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
}

.section-subtitle {
  font-size: 1.125rem;
  color: var(--color-text-secondary);
  max-width: 600px;
  margin: 0 auto;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.feature-card {
  background: var(--color-bg-white);
  padding: 2.5rem 2rem;
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  border: 1px solid var(--color-border);
  opacity: 0;
  transform: translateY(20px);
  cursor: default;
}

.feature-card.fade-in {
  animation: fadeInUp 0.6s ease-out forwards;
}

.feature-card:nth-child(1) { animation-delay: 0.1s; }
.feature-card:nth-child(2) { animation-delay: 0.2s; }
.feature-card:nth-child(3) { animation-delay: 0.3s; }
.feature-card:nth-child(4) { animation-delay: 0.4s; }

.feature-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 40px rgba(102, 126, 234, 0.15);
}

.feature-icon {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  color: white;
}

.feature-icon-green {
  background: linear-gradient(135deg, #10b981, #059669);
}

.feature-icon-orange {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.feature-icon-blue {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.feature-title {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
}

.feature-desc {
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* ========== CATEGORIES ========== */
.about-section {
  padding: 6rem 0;
  background: var(--color-bg-white);
}

.about-title {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.about-grid {
  margin: 0 auto;
  max-width: 1100px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 2.5rem;
  place-items: center;
  padding: 0 1.5rem;
}

.category-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.category-label {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.about-grid img {
  width: 100%;
  max-width: 280px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  opacity: 0;
  transform: translateY(10px);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

:root.dark-mode .about-grid img {
  filter: invert(1) brightness(1.2);
}

.about-grid img:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}

.about-section.in-view .about-grid .category-item img {
  animation: fadeInUp 0.6s ease-out forwards;
}

.about-section.in-view .about-grid .category-item:nth-child(1) img { animation-delay: 0.1s; }
.about-section.in-view .about-grid .category-item:nth-child(2) img { animation-delay: 0.2s; }
.about-section.in-view .about-grid .category-item:nth-child(3) img { animation-delay: 0.3s; }
.about-section.in-view .about-grid .category-item:nth-child(4) img { animation-delay: 0.4s; }

/* ========== TESTIMONIALS ========== */
.testimonials-section {
  padding: 6rem 0;
  background: var(--color-bg-page);
}

.testimonials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.testimonial-card {
  background: var(--color-bg-white);
  padding: 2rem;
  border-radius: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  border: 1px solid var(--color-border);
}

.testimonial-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.15);
}

.testimonial-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.stars {
  color: #ffc107 !important;
  font-size: 1.25rem;
  letter-spacing: 2px;
}

:root.dark-mode .stars {
  color: #ffc107 !important;
}

.quote-icon {
  font-size: 3rem;
  color: var(--color-primary);
  opacity: 0.2;
  line-height: 1;
}

.testimonial-text {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
  font-style: italic;
}

.testimonial-author {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.author-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1.125rem;
}

.author-name {
  font-weight: 600;
  color: var(--color-text-primary);
}

.author-location {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

/* ========== TRENDING ========== */
.trending-section {
  padding: 6rem 0;
  background: var(--color-bg-white);
}

.trending-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.trending-card {
  background: var(--color-bg-white);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  border: 1px solid var(--color-border);
  cursor: default;
}

.trending-card:hover {
  transform: translateY(-8px) scale(1.02);
  box-shadow: 0 12px 40px rgba(102, 126, 234, 0.15);
}

.trending-image {
  height: 200px;
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 1rem;
}

.trending-image.has-image {
  background-size: cover !important;
  background-position: center !important;
}

.fitness-bg {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.food-bg {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.arts-bg {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.education-bg {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.trending-badge {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 0.4rem 1rem;
  border-radius: 50px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.trending-content {
  padding: 1.25rem;
}

.trending-title {
  font-weight: 700;
  margin-bottom: 0.5rem;
  color: var(--color-text-primary);
  font-size: 1.125rem;
}

.trending-rating {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.stars-small {
  color: #ffc107;
  font-size: 0.875rem;
}

.rating-text {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.trending-price {
  font-weight: 700;
  color: var(--color-primary);
  font-size: 1.125rem;
}

/* Dark mode styles for trending section */
:root.dark-mode .trending-section {
  background: var(--color-bg-secondary);
}

:root.dark-mode .trending-card {
  background: var(--color-bg-primary);
  border-color: #2a2a3e;
}

:root.dark-mode .trending-badge {
  background: rgba(50, 50, 70, 0.95);
  color: #ffffff;
}

:root.dark-mode .trending-title {
  color: var(--color-text-primary);
}

:root.dark-mode .rating-text {
  color: var(--color-text-secondary);
}

/* ========== FINAL CTA ========== */
.final-cta-section {
  padding: 6rem 0;
  background: var(--color-bg-page);
}

.final-cta-card {
  background: linear-gradient(135deg, #4b2aa6 0%, #6d3cc4 100%);
  border-radius: 24px;
  padding: 4rem 2rem;
  text-align: center;
  position: relative;
  overflow: hidden;
  max-width: 900px;
  margin: 0 auto;
}

:root.dark-mode .final-cta-card {
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  border: 1px solid var(--color-border);
}

.cta-glow {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  animation: rotate 20s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.final-cta-title {
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  color: white;
  margin-bottom: 1rem;
  position: relative;
  z-index: 1;
}

.final-cta-subtitle {
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2.5rem;
  position: relative;
  z-index: 1;
}

.btn-final-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: white;
  color: var(--color-primary);
  padding: 1.125rem 2.5rem;
  border-radius: 12px;
  font-weight: 700;
  font-size: 1.125rem;
  transition: all 0.3s ease;
  text-decoration: none;
  position: relative;
  z-index: 1;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.btn-final-cta:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  color: var(--color-primary);
}

:root.dark-mode .btn-final-cta {
  background: var(--color-primary);
  color: white;
}

:root.dark-mode .btn-final-cta:hover {
  background: var(--color-primary-hover);
  color: white;
}

/* ========== ANIMATIONS ========== */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ========== RESPONSIVE ========== */
@media (max-width: 768px) {
  .hero-title {
    font-size: 2rem;
  }

  .hero-subtitle {
    font-size: 1rem;
  }

  .hero-cta {
    flex-direction: column;
  }

  .btn-hero-primary,
  .btn-hero-secondary {
    width: 100%;
    justify-content: center;
  }

  .features-grid,
  .testimonials-grid,
  .trending-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .section-title {
    font-size: 2rem;
  }

  .final-cta-card {
    padding: 3rem 1.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
