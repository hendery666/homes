<template>
  <Teleport to="body">
    <Transition name="map-explorer">
      <div v-if="isOpen" class="map-explorer-overlay" @click="closeExplorer">
        <div class="map-explorer-container" @click.stop>
          <!-- NavBar at top -->
          <div class="map-navbar-top">
            <NavBar />
          </div>

          <!-- Navigation Bar with Search -->
          <div class="map-navbar">
            <!-- Search and Filters Bar -->
            <div class="navbar-search-filters">
              <!-- Search Bar -->
              <div class="search-input-wrapper">
                <Icon icon="mdi:magnify" class="search-icon" />
                <input type="text" v-model="searchQuery" placeholder="Search businesses..." class="search-input"
                  @keyup.enter="handleSearch" />
                <button v-if="searchQuery" class="search-clear-btn" @click="clearSearch">
                  <Icon icon="mdi:close-circle" />
                </button>
              </div>

              <!-- Search Button -->
              <button class="search-btn" @click="handleSearch" :disabled="!searchQuery.trim()" title="Search">
                <Icon icon="mdi:magnify" />
              </button>

              <!-- Categories Dropdown -->
              <div class="filter-control">
                <select v-model="selectedCategory" class="category-select" @change="updateMarkers">
                  <option :value="null">All Categories</option>
                  <option v-for="cat in categories" :key="cat" :value="cat">
                    {{ cat }}
                  </option>
                </select>
              </div>

              <!-- Distance Filter -->
              <div v-if="userLocation && mapLoaded" class="filter-control">
                <select v-model="distanceFilterOption" class="distance-select" @change="handleDistanceFilterChange">
                  <option value="singapore">All of Singapore</option>
                  <option value="0.5">Within 0.5 km</option>
                  <option value="1">Within 1 km</option>
                  <option value="2">Within 2 km</option>
                  <option value="5">Within 5 km</option>
                  <option value="10">Within 10 km</option>
                  <option value="20">Within 20 km</option>
                  <option value="50">Within 50 km</option>
                </select>
              </div>

              <!-- My Location Button -->
              <button v-if="userLocation && mapLoaded" class="my-location-btn" @click="centerOnMyLocation"
                title="Center on My Location">
                <Icon icon="mdi:crosshairs-gps" />
              </button>
              <!-- Close Button -->
              <button class="map-close-btn" @click="closeExplorer" title="Close Map">
                <Icon icon="mdi:close" />
              </button>
            </div>

          </div>

          <!-- Location Permission Prompt -->
          <Transition name="prompt">
            <div v-if="showLocationPrompt" class="location-prompt">
              <div class="location-prompt-content">
                <Icon icon="mdi:map-marker-off" class="prompt-icon" />
                <h3>Enable Location Services</h3>
                <p>To see nearby businesses and use the distance filter, please enable location services.</p>
                <div class="prompt-buttons">
                  <button class="btn btn-primary" @click="requestLocation">
                    Enable Location
                  </button>
                  <button class="btn btn-secondary" @click="dismissLocationPrompt">
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </Transition>


          <!-- Map Container -->
          <div ref="mapContainer" class="map-container">
            <div v-if="!mapLoaded" class="map-loading">
              <div class="spinner-border text-primary mb-3" style="width: 3rem; height: 3rem;"></div>
              <h3>Loading Map...</h3>
              <p>Please wait while we load the interactive map</p>
            </div>
          </div>

          <!-- Business Cards (Bottom Sheet) -->
          <div class="business-cards-container" :class="{ collapsed: businessCardsCollapsed }">
            <!-- Collapse Toggle Button -->
            <button class="business-cards-toggle-btn" @click="toggleBusinessCards"
              :title="businessCardsCollapsed ? 'Show Listings' : 'Hide Listings'">
              <Icon :icon="businessCardsCollapsed ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
              <span class="toggle-text">{{ businessCardsCollapsed ? 'Show Listings' : 'Hide Listings' }}</span>
            </button>

            <Transition name="slide-up">
              <div v-show="!businessCardsCollapsed" class="business-cards-scroll">
                <div v-for="listing in filteredListings" :key="listing.id" class="business-card"
                  @click="openListing(listing)">
                  <div class="business-image">
                    <img :src="listing.photoUrls?.[0] || '/placeholder.jpg'" alt="" />
                    <div class="business-category-badge">{{ listing.businessCategory }}</div>
                  </div>
                  <div class="business-info">
                    <h4 class="business-name">{{ listing.businessName }}</h4>
                    <div class="business-rating">
                      <Icon icon="mdi:star" class="star-icon" />
                      <span>{{ (listingsReviews[listing.id || listing.listingId]?.avgRating ?? listing.averageRating ??
                        listing.rating ?? 0).toFixed(1) }}</span>
                      <span class="review-count"
                        v-if="(listingsReviews[listing.id || listing.listingId]?.totalReviews ?? listing.totalReviews ?? 0) > 0">
                        ({{ listingsReviews[listing.id || listing.listingId]?.totalReviews ?? listing.totalReviews ?? 0
                        }})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Listing Drawer -->
          <ListingDrawer :open="drawerOpen" :listing="drawerListing" :seller-name="drawerSellerName"
            :seller-avatar="drawerSellerAvatar" @close="closeDrawer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { db } from '@/firebase'
import { collection, getDocs, query, orderBy, limit, getDoc, doc, onSnapshot } from 'firebase/firestore'
import ListingDrawer from './ListingDrawer.vue'
import NavBar from './NavBar.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'openListing'])

const mapContainer = ref(null)
const map = ref(null)
const markers = ref([])
const listings = ref([])
const selectedCategory = ref(null)
const activeListing = ref(null)
const drawerOpen = ref(false)
const drawerListing = ref(null)
const drawerSellerName = ref('')
const drawerSellerAvatar = ref('')
const mapLoaded = ref(false)

// Reviews data for listings - same structure as ListingDrawer
const listingsReviews = ref({}) // { listingId: { avgRating, totalReviews, topReview } }
const reviewUnsubs = new Map() // Track review listeners for cleanup

// Seller profile map (for names and avatars)
const profileMap = ref({})
const profileUnsubs = new Map()

// Location services
const userLocation = ref(null)
const locationPermissionDenied = ref(false)
const showLocationPrompt = ref(false)
const hasRequestedLocation = ref(false)

// Distance filter - preset values
const distanceFilter = ref(5) // Default 5km
const distanceFilterEnabled = ref(false)
const distanceFilterOption = ref('singapore') // Default to Singapore (all listings)
const distancePresets = [0.5, 1, 2, 5, 10, 20, 50] // Preset distances in km

// Search
const searchQuery = ref('')
const businessCardsCollapsed = ref(false)


const categories = computed(() => {
  const cats = new Set(listings.value.map(l => l.businessCategory))
  return Array.from(cats).sort()
})

const filteredListings = computed(() => {
  let filtered = [...listings.value]

  // Category filter
  if (selectedCategory.value) {
    filtered = filtered.filter(l => l.businessCategory === selectedCategory.value)
  }

  // Search filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    filtered = filtered.filter(l => {
      const name = (l.businessName || '').toLowerCase()
      const desc = (l.businessDesc || '').toLowerCase()
      const category = (l.businessCategory || '').toLowerCase()
      return name.includes(query) || desc.includes(query) || category.includes(query)
    })
  }

  // Distance filter
  if (distanceFilterEnabled.value && userLocation.value) {
    filtered = filtered.filter(l => {
      // Try multiple location data structures
      const lat = l.location?.lat || l.geo?.lat || l.lat
      const lng = l.location?.lng || l.geo?.lng || l.lng

      if (!lat || !lng) return false

      const distance = calculateDistance(
        userLocation.value.lat,
        userLocation.value.lng,
        Number(lat),
        Number(lng)
      )
      return distance <= distanceFilter.value
    })
  }

  return filtered
})

// Watch for filtered listings changes to fetch reviews for new listings
watch(filteredListings, (newListings) => {
  // Fetch reviews and start listeners for listings that don't have them yet
  newListings.forEach(listing => {
    const listingId = listing.id || listing.listingId
    if (listingId) {
      if (!listingsReviews.value[listingId]) {
        // Fetch initial data and start listener
        fetchListingReviews(listingId)
      } else if (!reviewUnsubs.has(listingId)) {
        // Reviews exist but listener not started - start listener only
        startReviewListener(listingId)
      }
    }
  })
}, { immediate: true })

// Load Google Maps API dynamically
function loadGoogleMapsScript() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.google && window.google.maps) {
      resolve()
      return
    }

    // Check if script is already being loaded
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      // Wait for it to load
      const checkInterval = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 100)
      return
    }

    // Load the script
    const script = document.createElement('script')
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Maps'))
    document.head.appendChild(script)
  })
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Request user location
async function requestLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.')
    return
  }

  hasRequestedLocation.value = true
  showLocationPrompt.value = false

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation.value = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      }
      locationPermissionDenied.value = false

      // Center map on user location
      if (map.value) {
        map.value.setCenter(userLocation.value)
        map.value.setZoom(14)

        // Add user location marker
        addUserLocationMarker()

        // Show distance ring if enabled
        if (distanceFilterEnabled.value) {
          updateDistanceRing()
        }
      }
    },
    (error) => {
      console.error('Error getting location:', error)
      locationPermissionDenied.value = true
      showLocationPrompt.value = true

      if (error.code === 1) {
        // Permission denied
        alert('Location access denied. Please enable location services in your browser settings.')
      } else {
        alert('Unable to get your location. Please try again.')
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  )
}

// Add user location marker
function addUserLocationMarker() {
  if (!map.value || !userLocation.value) return

  // Remove existing marker if any
  if (window.userLocationMarker) {
    window.userLocationMarker.setMap(null)
  }

  // Create user location marker
  window.userLocationMarker = new window.google.maps.Marker({
    position: userLocation.value,
    map: map.value,
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: '#4285F4',
      fillOpacity: 1,
      strokeColor: '#FFFFFF',
      strokeWeight: 3
    },
    zIndex: 1000,
    title: 'Your Location'
  })
}

// Handle distance filter change
function handleDistanceFilterChange() {
  if (distanceFilterOption.value === 'singapore') {
    // Show all listings (Singapore wide)
    distanceFilterEnabled.value = false
    distanceFilter.value = 50 // Set a large distance but don't use it
  } else {
    // Enable distance filter with selected distance
    distanceFilterEnabled.value = true
    distanceFilter.value = Number(distanceFilterOption.value)
  }
  updateMarkers()
}

// Update distance filter (no visual ring, just filtering)
function updateDistanceRing() {
  // Just update markers based on distance filter
  // No visual circles on the map
  updateMarkers()
}

// Center map on user's location
function centerOnMyLocation() {
  if (!userLocation.value || !map.value) {
    // Request location if not available
    requestLocation()
    return
  }

  map.value.setCenter(userLocation.value)
  map.value.setZoom(14)

  // Add user location marker if not already added
  if (!window.userLocationMarker) {
    addUserLocationMarker()
  }
}

// Dismiss location prompt
function dismissLocationPrompt() {
  showLocationPrompt.value = false
  hasRequestedLocation.value = true
}

// Handle search - only when button is pressed
function handleSearch() {
  if (!searchQuery.value.trim()) {
    // If search is empty, show all listings
    updateMarkers()
    return
  }
  // Update markers based on search filter
  updateMarkers()
}

// Clear search
function clearSearch() {
  searchQuery.value = ''
  updateMarkers()
}

// Toggle business cards
function toggleBusinessCards() {
  businessCardsCollapsed.value = !businessCardsCollapsed.value
}

// Initialize map
async function initMap() {
  try {
    // Load Google Maps API first
    await loadGoogleMapsScript()

    if (!mapContainer.value) return

    // Singapore center
    const singapore = { lat: 1.3521, lng: 103.8198 }

    map.value = new window.google.maps.Map(mapContainer.value, {
      center: singapore,
      zoom: 12,
      styles: isDarkMode() ? darkModeMapStyles : zenlyMapStyles,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy'
    })

    mapLoaded.value = true

    // Check if location services are available and request permission
    if (navigator.geolocation && !hasRequestedLocation.value) {
      // Try to get location silently first
      navigator.geolocation.getCurrentPosition(
        (position) => {
          userLocation.value = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          if (map.value) {
            map.value.setCenter(userLocation.value)
            map.value.setZoom(14)
            addUserLocationMarker()
          }
        },
        () => {
          // Location denied or unavailable - show prompt
          showLocationPrompt.value = true
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      )
    } else if (!navigator.geolocation) {
      // Geolocation not supported
      showLocationPrompt.value = true
    }

    await loadListings()
  } catch (error) {
    console.error('Error initializing map:', error)
    mapLoaded.value = false
  }
}

// Start profile listener for a user
function startProfileListener(uid) {
  if (!uid || profileUnsubs.has(uid)) return
  const unsub = onSnapshot(doc(db, 'users', uid), snap => {
    const data = snap.data() || {}
    const displayName = data.username || data.displayName || ''
    const photoURL = data.photoURL || data.profilePicture || data.avatarUrl || data.profilePhoto || ''
    profileMap.value = { ...profileMap.value, [uid]: { displayName, photoURL } }
  })
  profileUnsubs.set(uid, unsub)
}

// Attach profile listeners for listings
function attachProfileListeners(rows) {
  const uids = new Set(rows.map(r => r.userId).filter(Boolean))
  uids.forEach(startProfileListener)
}

// Set up real-time listener for a single listing's reviews
function startReviewListener(listingId) {
  if (!listingId || reviewUnsubs.has(listingId)) return

  // Listen to the listing document for averageRating and totalReviews updates
  const listingUnsub = onSnapshot(doc(db, 'allListings', listingId), (listingSnap) => {
    if (!listingSnap.exists()) return

    const data = listingSnap.data()
    const avgRating = Number(data.averageRating) || Number(data.rating) || 0
    const totalReviews = Number(data.totalReviews) || 0

    // Update the listing in the listings array
    const listingIndex = listings.value.findIndex(l => (l.id || l.listingId) === listingId)
    if (listingIndex !== -1) {
      listings.value[listingIndex] = {
        ...listings.value[listingIndex],
        averageRating: avgRating,
        rating: avgRating,
        totalReviews: totalReviews
      }
    }
  }, (error) => {
    console.error(`Error listening to listing ${listingId}:`, error)
  })

  // Listen to all reviews and recalculate - same as ListingDrawer
  const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
  const q = query(reviewsRef, orderBy('createdAt', 'desc'))
  const reviewUnsub = onSnapshot(q, (snapshot) => {
    let avgRating = 0
    let totalReviews = 0
    let topReview = null
    let totalRating = 0
    let totalWeight = 0

    // Calculate from all reviews - same as ListingDrawer
    snapshot.docs.forEach((docSnap) => {
      const reviewData = docSnap.data()

      // Get top review (most recent) - same field names as ListingDrawer
      if (!topReview && (reviewData.reviewText || reviewData.text) && (reviewData.reviewText || reviewData.text).length > 0) {
        topReview = {
          text: reviewData.reviewText || reviewData.text,
          author: reviewData.userName || 'Anonymous'
        }
      }

      // Weighted rating: verified reviews count 2x, unverified count 1x (same as ListingDrawer)
      const rating = reviewData.rating || 0
      const weight = reviewData.isVerified ? 2 : 1
      totalRating += rating * weight
      totalWeight += weight
    })

    totalReviews = snapshot.size
    // Calculate weighted average (verified reviews count more) - same as ListingDrawer
    avgRating = totalWeight > 0 ? totalRating / totalWeight : 0

    // Update listingsReviews
    listingsReviews.value = {
      ...listingsReviews.value,
      [listingId]: { avgRating, totalReviews, topReview }
    }

    // Update the listing object
    const listingIndex = listings.value.findIndex(l => (l.id || l.listingId) === listingId)
    if (listingIndex !== -1) {
      listings.value[listingIndex] = {
        ...listings.value[listingIndex],
        averageRating: avgRating,
        rating: avgRating,
        totalReviews: totalReviews
      }
    }
  }, (error) => {
    console.error(`Error listening to reviews for ${listingId}:`, error)
  })

  // Store both unsubscribers
  reviewUnsubs.set(listingId, () => {
    listingUnsub()
    reviewUnsub()
  })
}

// Fetch reviews for a single listing - same approach as ListingDrawer
async function fetchListingReviews(listingId) {
  if (!listingId) return

  try {
    const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
    const q = query(reviewsRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)

    let avgRating = 0
    let totalReviews = 0
    let topReview = null
    let totalRating = 0
    let totalWeight = 0

    // Calculate from all reviews - same as ListingDrawer
    for (const docSnap of snapshot.docs) {
      const reviewData = docSnap.data()

      // Get top review (most recent) - same field names as ListingDrawer
      if (!topReview && (reviewData.reviewText || reviewData.text) && (reviewData.reviewText || reviewData.text).length > 0) {
        topReview = {
          text: reviewData.reviewText || reviewData.text,
          author: reviewData.userName || 'Anonymous'
        }
      }

      // Weighted rating: verified reviews count 2x, unverified count 1x (same as ListingDrawer)
      const rating = reviewData.rating || 0
      const weight = reviewData.isVerified ? 2 : 1
      totalRating += rating * weight
      totalWeight += weight
    }

    totalReviews = snapshot.size
    // Calculate weighted average (verified reviews count more) - same as ListingDrawer
    avgRating = totalWeight > 0 ? totalRating / totalWeight : 0

    listingsReviews.value = {
      ...listingsReviews.value,
      [listingId]: { avgRating, totalReviews, topReview }
    }

    // Update the listing object with calculated values
    const listingIndex = listings.value.findIndex(l => (l.id || l.listingId) === listingId)
    if (listingIndex !== -1) {
      listings.value[listingIndex] = {
        ...listings.value[listingIndex],
        averageRating: avgRating,
        rating: avgRating,
        totalReviews: totalReviews
      }
    }

    // Start real-time listener
    startReviewListener(listingId)
  } catch (error) {
    console.error(`Error fetching reviews for ${listingId}:`, error)
  }
}

// Fetch reviews for all listings
async function fetchAllReviews() {
  const promises = listings.value.map(listing => fetchListingReviews(listing.id || listing.listingId))
  await Promise.all(promises)
  console.log('All reviews fetched.')
}

// Load all listings
async function loadListings() {
  try {
    const snapshot = await getDocs(collection(db, 'allListings'))
    listings.value = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        listingId: doc.id,
        ...data,
        // Ensure averageRating and totalReviews are numbers, default to 0
        // Support both 'averageRating' and 'rating' field names
        averageRating: Number(data.averageRating) || Number(data.rating) || 0,
        rating: Number(data.averageRating) || Number(data.rating) || 0,
        totalReviews: Number(data.totalReviews) || 0
      }
    })
    console.log('Loaded listings:', listings.value.length)
    console.log('Sample listing:', listings.value[0])
    console.log('Sample listing rating:', listings.value[0]?.averageRating, 'reviews:', listings.value[0]?.totalReviews)

    // Attach profile listeners
    attachProfileListeners(listings.value)

    // Fetch reviews for all listings
    await fetchAllReviews()

    // Ensure distance filter defaults to Singapore (all listings)
    distanceFilterOption.value = 'singapore'
    distanceFilterEnabled.value = false

    // Update markers to show all listings
    updateMarkers()
  } catch (error) {
    console.error('Error loading listings:', error)
  }
}

// Update markers on map
function updateMarkers() {
  if (!map.value) return

  // Clear existing markers and overlays
  markers.value.forEach(marker => {
    if (marker.overlay) {
      marker.overlay.setMap(null)
    }
    marker.setMap(null)
  })
  markers.value = []

  const bounds = new window.google.maps.LatLngBounds()
  let markersAdded = 0

  filteredListings.value.forEach(listing => {
    // Try multiple location data structures
    const lat = listing.location?.lat || listing.geo?.lat || listing.lat
    const lng = listing.location?.lng || listing.geo?.lng || listing.lng

    if (!lat || !lng) {
      console.log('Listing missing location:', listing.businessName)
      return
    }

    const position = {
      lat: Number(lat),
      lng: Number(lng)
    }

    console.log(`Adding marker for ${listing.businessName} at`, position)

    // Create invisible marker for click handling
    const marker = new window.google.maps.Marker({
      position,
      map: map.value,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 0
      },
      title: listing.businessName
    })

    // Create custom HTML overlay with image and name
    const overlay = createCustomOverlay(position, listing)
    overlay.setMap(map.value)
    marker.overlay = overlay

    marker.addListener('click', () => {
      openDrawer(listing)
      map.value.panTo(position)
      map.value.setZoom(15)
    })

    markers.value.push(marker)
    bounds.extend(position)
    markersAdded++
  })

  console.log(`Added ${markersAdded} markers to map`)

  // Fit bounds to show all markers, or show Singapore if no markers
  if (markers.value.length > 0) {
    map.value.fitBounds(bounds)

    // Prevent zooming in too much after fitBounds
    // Add a listener to check and limit zoom after bounds are fitted
    const boundsListener = window.google.maps.event.addListenerOnce(map.value, 'bounds_changed', () => {
      const currentZoom = map.value.getZoom()
      if (currentZoom > 13) {
        map.value.setZoom(13) // Max zoom level to prevent being too close
      }
    })
  } else {
    // Default to Singapore center if no markers
    map.value.setCenter({ lat: 1.3521, lng: 103.8198 })
    map.value.setZoom(12)
  }
}

// Create custom HTML overlay with business image and name
function createCustomOverlay(position, listing) {
  class CustomOverlay extends window.google.maps.OverlayView {
    constructor(position, listing) {
      super()
      this.position = position
      this.listing = listing
      this.div = null
    }

    onAdd() {
      const div = document.createElement('div')
      div.style.position = 'absolute'
      div.style.cursor = 'pointer'
      div.style.display = 'flex'
      div.style.flexDirection = 'column'
      div.style.alignItems = 'center'
      div.style.gap = '4px'
      div.style.transform = 'translate(-50%, -100%)'
      div.style.zIndex = '1000'

      // Business image container
      const imageContainer = document.createElement('div')
      imageContainer.style.width = '48px'
      imageContainer.style.height = '48px'
      imageContainer.style.borderRadius = '50%'
      imageContainer.style.overflow = 'hidden'
      imageContainer.style.border = '3px solid white'
      imageContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)'
      imageContainer.style.backgroundColor = '#f0f0f0'

      const img = document.createElement('img')
      img.src = this.listing.photoUrls?.[0] || this.listing.imageUrl || 'https://via.placeholder.com/48'
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'cover'
      imageContainer.appendChild(img)

      // Business name label
      const nameLabel = document.createElement('div')
      nameLabel.textContent = this.listing.businessName
      // Use dark background with light text for better visibility on both light and dark maps
      nameLabel.style.backgroundColor = '#1a1a1a'
      nameLabel.style.color = 'white'
      nameLabel.style.padding = '4px 8px'
      nameLabel.style.borderRadius = '12px'
      nameLabel.style.fontSize = '11px'
      nameLabel.style.fontWeight = '600'
      nameLabel.style.whiteSpace = 'nowrap'
      nameLabel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)'
      nameLabel.style.maxWidth = '120px'
      nameLabel.style.overflow = 'hidden'
      nameLabel.style.textOverflow = 'ellipsis'

      div.appendChild(imageContainer)
      div.appendChild(nameLabel)

      // Click handler - need to access Vue refs from closure
      const listingData = this.listing
      const listingPosition = this.position
      div.addEventListener('click', () => {
        // Access current profileMap value
        const currentProfileMap = profileMap.value
        const prof = listingData?.userId ? currentProfileMap[listingData.userId] : null
        drawerListing.value = listingData
        drawerSellerName.value = prof?.displayName || ''
        drawerSellerAvatar.value = prof?.photoURL || ''
        drawerOpen.value = true
        if (map.value) {
          map.value.panTo(listingPosition)
          map.value.setZoom(15)
        }
      })

      this.div = div
      const panes = this.getPanes()
      panes.overlayMouseTarget.appendChild(div)
    }

    draw() {
      const overlayProjection = this.getProjection()
      const pos = overlayProjection.fromLatLngToDivPixel(
        new window.google.maps.LatLng(this.position.lat, this.position.lng)
      )

      if (this.div) {
        this.div.style.left = pos.x + 'px'
        this.div.style.top = pos.y + 'px'
      }
    }

    onRemove() {
      if (this.div) {
        this.div.parentNode.removeChild(this.div)
        this.div = null
      }
    }
  }

  return new CustomOverlay(position, listing)
}

// Check if dark mode is active
const isDarkMode = () => document.documentElement.classList.contains('dark-mode')

// Light mode map styles - vibrant, colorful, and playful
const zenlyMapStyles = [
  {
    "featureType": "all",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFE8D6" }]
  },
  {
    "featureType": "all",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#4A4A4A" }]
  },
  {
    "featureType": "all",
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#FFFFFF", "weight": 3 }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#A8D8EA" }]
  },
  {
    "featureType": "landscape",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFE8D6" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFFFFF" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#FFD4A3" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFCAA8" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#FFB088" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFE4C4" }]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFD4E5" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#C7F0BD" }]
  },
  {
    "featureType": "poi.school",
    "elementType": "geometry",
    "stylers": [{ "color": "#FFE8A1" }]
  },
  {
    "featureType": "poi.business",
    "elementType": "geometry",
    "stylers": [{ "color": "#E8D4F0" }]
  },
  {
    "featureType": "transit",
    "elementType": "geometry",
    "stylers": [{ "color": "#D4E8FF" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#FFB4D4", "weight": 1 }]
  }
]

// Dark mode map styles - darker, muted colors
const darkModeMapStyles = [
  {
    "featureType": "all",
    "elementType": "geometry",
    "stylers": [{ "color": "#242f3e" }]
  },
  {
    "featureType": "all",
    "elementType": "labels.text.fill",
    "stylers": [{ "color": "#b0b0b0" }]
  },
  {
    "featureType": "all",
    "elementType": "labels.text.stroke",
    "stylers": [{ "color": "#1a1a1a", "weight": 2 }]
  },
  {
    "featureType": "water",
    "elementType": "geometry",
    "stylers": [{ "color": "#17263c" }]
  },
  {
    "featureType": "landscape",
    "elementType": "geometry",
    "stylers": [{ "color": "#242f3e" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [{ "color": "#38414e" }]
  },
  {
    "featureType": "road",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#212a37" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry",
    "stylers": [{ "color": "#746855" }]
  },
  {
    "featureType": "road.highway",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#1f2835" }]
  },
  {
    "featureType": "road.arterial",
    "elementType": "geometry",
    "stylers": [{ "color": "#38414e" }]
  },
  {
    "featureType": "poi",
    "elementType": "geometry",
    "stylers": [{ "color": "#283d54" }]
  },
  {
    "featureType": "poi.park",
    "elementType": "geometry",
    "stylers": [{ "color": "#263c3f" }]
  },
  {
    "featureType": "poi.school",
    "elementType": "geometry",
    "stylers": [{ "color": "#3d3d3d" }]
  },
  {
    "featureType": "poi.business",
    "elementType": "geometry",
    "stylers": [{ "color": "#2d3748" }]
  },
  {
    "featureType": "transit",
    "elementType": "geometry",
    "stylers": [{ "color": "#2f3948" }]
  },
  {
    "featureType": "administrative",
    "elementType": "geometry.stroke",
    "stylers": [{ "color": "#4b6878", "weight": 1 }]
  }
]

function selectCategory(category) {
  selectedCategory.value = category
  updateMarkers()
}

function openListing(listing) {
  openDrawer(listing)
  // Try multiple location data structures
  const lat = listing.location?.lat || listing.geo?.lat || listing.lat
  const lng = listing.location?.lng || listing.geo?.lng || listing.lng
  if (lat && lng) {
    map.value.panTo({
      lat: Number(lat),
      lng: Number(lng)
    })
    map.value.setZoom(15)
  }
}

function openDrawer(listing) {
  drawerListing.value = listing
  // Get seller info from profile map if available
  const prof = listing?.userId ? profileMap.value[listing.userId] : null
  drawerSellerName.value = prof?.displayName || ''
  drawerSellerAvatar.value = prof?.photoURL || ''
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  drawerListing.value = null
  activeListing.value = null
}

function closeExplorer() {
  emit('close')
}

// Watch for map open
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    // Prevent body scrolling
    document.body.classList.add('map-explorer-open')
    setTimeout(initMap, 100)
  } else {
    // Re-enable body scrolling
    document.body.classList.remove('map-explorer-open')
  }
})

// Listen for close event from NavBar home link
function handleCloseEvent() {
  if (props.isOpen) {
    closeExplorer()
  }
}

onMounted(() => {
  if (props.isOpen) {
    initMap()
  }
  // Listen for close event from NavBar
  window.addEventListener('close-map-explorer', handleCloseEvent)
})

onBeforeUnmount(() => {
  // Re-enable body scrolling
  document.body.classList.remove('map-explorer-open')
  // Clean up event listener
  window.removeEventListener('close-map-explorer', handleCloseEvent)
  markers.value.forEach(marker => marker.setMap(null))
  // Clean up profile listeners
  profileUnsubs.forEach(unsub => unsub && unsub())
  profileUnsubs.clear()
  // Clean up review listeners
  reviewUnsubs.forEach(unsub => unsub && unsub())
  reviewUnsubs.clear()
})
</script>

<style scoped>
.map-explorer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Prevent body scrolling when map explorer is open */
body.map-explorer-open {
  overflow: hidden !important;
}

.map-explorer-container {
  position: relative;
  width: 100%;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  background: white;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:root.dark-mode .map-explorer-container {
  background: var(--color-bg-main);
}

/* NavBar at top */
.map-navbar-top {
  position: relative;
  flex-shrink: 0;
  z-index: 106;
  background: var(--color-bg-main);
}

.map-navbar-top :deep(.navbar) {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

:root.dark-mode .map-navbar-top :deep(.navbar) {
  border-bottom-color: rgba(255, 255, 255, 0.1);
}

.map-navbar-top :deep(.elevate) {
  z-index: 106;
}

/* Navigation Bar with Search */
.map-navbar {
  position: relative;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%);
  backdrop-filter: blur(10px);
  padding: 12px 20px;
  z-index: 105;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
}

:root.dark-mode .map-navbar {
  background: linear-gradient(180deg, rgba(26, 26, 46, 0.98) 0%, rgba(26, 26, 46, 0.95) 100%);
}

/* Search and Filters Bar - All in one line */
.navbar-search-filters {
  display: flex;
  gap: 12px;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.filter-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-select {
  padding: 8px 32px 8px 12px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  background: white;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  min-width: 150px;
  height: 40px;
  color-scheme: light;
}

:root.dark-mode .category-select {
  background: #2a2a3e;
  border-color: #3a3a4e;
  color: #e0e0e0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23aaa' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  color-scheme: dark;
}

:root.dark-mode .category-select option {
  background-color: #2a2a3e;
  color: #e0e0e0;
}

.category-select:hover {
  border-color: var(--color-primary);
}

.category-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.distance-select {
  padding: 8px 32px 8px 12px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  background: white;
  font-size: 14px;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  min-width: 130px;
  height: 40px;
  z-index: 1;
  pointer-events: auto;
  color-scheme: light;
}

:root.dark-mode .distance-select {
  background: #2a2a3e;
  border-color: #3a3a4e;
  color: #e0e0e0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23aaa' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  color-scheme: dark;
}

:root.dark-mode .distance-select option {
  background-color: #2a2a3e;
  color: #e0e0e0;
}

.distance-select:hover {
  border-color: var(--color-primary);
}

.distance-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.navbar-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.navbar-toggle-btn {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #666;
  font-size: 20px;
}

:root.dark-mode .navbar-toggle-btn {
  background: var(--color-bg-secondary);
  border-color: #2a2a3e;
  color: #aaa;
}

.navbar-toggle-btn:hover {
  background: var(--color-primary-pale);
  border-color: var(--color-primary);
  color: var(--color-primary);
  transform: translateY(-2px);
}

.navbar-toggle-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

:root.dark-mode .navbar-toggle-btn.active {
  background: var(--color-primary);
  color: white;
}


.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 8px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;
  min-width: 150px;
}

.search-input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

:root.dark-mode .search-input-wrapper {
  background: var(--color-bg-secondary);
  border-color: #2a2a3e;
}

.search-icon {
  color: #999;
  font-size: 20px;
  margin-right: 8px;
}

:root.dark-mode .search-icon {
  color: #aaa;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text-primary);
  padding: 4px 0;
}

.search-input::placeholder {
  color: #999;
}

:root.dark-mode .search-input::placeholder {
  color: #666;
}

.search-clear-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  transition: color 0.2s ease;
}

.search-clear-btn:hover {
  color: #666;
}

:root.dark-mode .search-clear-btn {
  color: #666;
}

:root.dark-mode .search-clear-btn:hover {
  color: #aaa;
}

/* Search Button */
.search-btn {
  background: var(--color-primary);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  font-size: 20px;
  color: white;
  flex-shrink: 0;
}

.search-btn:hover:not(:disabled) {
  background: var(--color-primary-dark);
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* My Location Button */
.my-location-btn, .map-close-btn
 {
  background: var(--color-primary);
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  font-size: 20px;
  color: white;
  flex-shrink: 0;
}

.my-location-btn:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* .map-close-btn {
  background: white;
  border: 1px solid #e0e0e0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
  font-size: 20px;
  color: #666;
} */

:root.dark-mode .close-btn {
  background: var(--color-bg-secondary);
  border-color: #2a2a3e;
  color: var(--color-text-primary);
}

.map-close-btn:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* Location Prompt */
.location-prompt {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.location-prompt-content {
  background: white;
  border-radius: 20px;
  padding: 32px;
  max-width: 400px;
  width: 90%;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

:root.dark-mode .location-prompt-content {
  background: var(--color-bg-secondary);
}

.prompt-icon {
  font-size: 64px;
  color: var(--color-primary);
  margin-bottom: 16px;
}

.location-prompt-content h3 {
  margin: 0 0 12px 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.location-prompt-content p {
  margin: 0 0 24px 0;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

:root.dark-mode .location-prompt-content p {
  color: #aaa;
}

.prompt-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.prompt-buttons .btn {
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.prompt-buttons .btn-primary {
  background: var(--color-primary);
  color: white;
}

.prompt-buttons .btn-primary:hover {
  background: var(--color-primary-dark);
  transform: scale(1.02);
}

.prompt-buttons .btn-secondary {
  background: #e0e0e0;
  color: #333;
}

:root.dark-mode .prompt-buttons .btn-secondary {
  background: #2a2a3e;
  color: var(--color-text-primary);
}

.prompt-buttons .btn-secondary:hover {
  background: #d0d0d0;
}

:root.dark-mode .prompt-buttons .btn-secondary:hover {
  background: #3a3a4e;
}


/* Category Pills */
.category-pills {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 5px;
}

.category-pills::-webkit-scrollbar {
  height: 4px;
}

.category-pills::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 2px;
}

.category-pill {
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid #e0e0e0;
  background: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  display: flex;
  align-items: center;
}

:root.dark-mode .category-pill {
  background: var(--color-bg-secondary);
  border-color: #2a2a3e;
  color: var(--color-text-primary);
}

.category-pill:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
}

.category-pill.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

/* Map Container */
.map-container {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

.map-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
}

.map-loading h3 {
  margin: 0 0 12px 0;
  color: #1a1a2e;
  font-size: 24px;
}

:root.dark-mode .map-loading h3 {
  color: var(--color-text-primary);
}

.map-loading p {
  color: #666;
  margin: 0;
  font-size: 16px;
}

:root.dark-mode .map-loading p {
  color: #aaa;
}

.map-loading small {
  display: block;
  color: #999;
}

:root.dark-mode .map-loading small {
  color: #777;
}

/* Business Cards Bottom Sheet */
.business-cards-container {
  position: relative;
  flex: 0 0 280px;
  background: white;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  z-index: 99;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.business-cards-container.collapsed {
  flex: 0 0 40px;
}

/* Business Cards Toggle Button */
.business-cards-toggle-btn {
  background: white;
  border: none;
  border-bottom: 1px solid #e0e0e0;
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 18px;
  color: #666;
  border-radius: 20px 20px 0 0;
  flex-shrink: 0;
}

:root.dark-mode .business-cards-toggle-btn {
  background: var(--color-bg-secondary);
  border-bottom-color: #2a2a3e;
  color: var(--color-text-primary);
}

.business-cards-toggle-btn:hover {
  background: var(--color-primary-pale);
  color: var(--color-primary);
}

.business-cards-toggle-btn .toggle-text {
  font-size: 13px;
  font-weight: 600;
}

.business-cards-toggle-btn svg {
  font-size: 20px;
}

:root.dark-mode .business-cards-container {
  background: var(--color-bg-secondary);
}

.business-cards-scroll {
  display: flex;
  gap: 15px;
  padding: 20px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  min-height: 0;
}

.business-cards-scroll::-webkit-scrollbar {
  height: 6px;
}

.business-cards-scroll::-webkit-scrollbar-thumb {
  background: var(--color-primary);
  border-radius: 3px;
}

.business-card {
  flex-shrink: 0;
  width: 240px;
  min-height: 240px;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

:root.dark-mode .business-card {
  background: var(--color-bg-main);
}

.business-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.business-image {
  position: relative;
  width: 100%;
  height: 140px;
  overflow: hidden;
}

.business-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.business-category-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.business-info {
  padding: 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.business-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

:root.dark-mode .business-name {
  color: var(--color-text-primary);
}

.business-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #666;
  margin: 0;
}

.business-review-preview {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

:root.dark-mode .business-review-preview {
  border-top-color: #2a2a3e;
}

.review-text {
  font-size: 12px;
  color: #666;
  line-height: 1.4;
  margin: 0 0 4px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

:root.dark-mode .review-text {
  color: #aaa;
}

.review-author {
  font-size: 11px;
  color: #999;
  font-style: italic;
}

:root.dark-mode .review-author {
  color: #777;
}

:root.dark-mode .business-rating {
  color: #aaa;
}

.star-icon {
  color: #ffc107;
}

/* Listing Popup */
.listing-popup {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

:root.dark-mode .listing-popup {
  background: rgba(0, 0, 0, 0.7);
}

/* Slide up transition for business cards */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.slide-up-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(10px);
}

.slide-up-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(10px);
}

.slide-up-enter-to,
.slide-up-leave-from {
  opacity: 1;
  max-height: 500px;
  transform: translateY(0);
}

:root.dark-mode .popup-content {
  background: #1e1e2e;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
}

.popup-close {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
}

.popup-image {
  width: 100%;
  height: 200px;
  object-fit: cover;
}

.popup-info {
  padding: 20px;
}

.popup-info h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 700;
}

:root.dark-mode .popup-info h3 {
  color: var(--color-text-primary);
}

.popup-category {
  color: var(--color-primary);
  font-size: 14px;
  margin: 0 0 8px 0;
}

.popup-rating {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  margin-bottom: 15px;
  color: #666;
}

:root.dark-mode .popup-rating {
  color: #aaa;
}

.popup-view-btn {
  width: 100%;
  padding: 12px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.popup-view-btn:hover {
  background: var(--color-primary-dark);
  transform: scale(1.02);
}

/* Transitions */
.map-explorer-enter-active,
.map-explorer-leave-active {
  transition: opacity 0.3s ease;
}

.map-explorer-enter-from,
.map-explorer-leave-to {
  opacity: 0;
}


.prompt-enter-active,
.prompt-leave-active {
  transition: opacity 0.3s ease;
}

.prompt-enter-from,
.prompt-leave-to {
  opacity: 0;
}

/* Slide down animation for header */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

/* Fade animation for search and categories */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .map-navbar {
    padding: 8px 10px;
    gap: 6px;
    flex-wrap: wrap;
  }

  .navbar-search-filters {
    gap: 6px;
    flex-wrap: wrap;
    width: 100%;
  }

  .search-input-wrapper {
    min-width: 0;
    flex: 1 1 100%;
    padding: 6px 10px;
    order: 1;
  }

  .search-input {
    font-size: 14px;
  }

  .search-btn {
    width: 36px;
    height: 36px;
    font-size: 18px;
    flex-shrink: 0;
  }

  .filter-control {
    flex: 1 1 auto;
    min-width: 0;
  }

  .category-select {
    min-width: 0;
    width: 100%;
    height: 36px;
    font-size: 12px;
    padding: 6px 28px 6px 10px;
    order: 2;
  }

  .distance-select {
    min-width: 0;
    width: 100%;
    height: 36px;
    font-size: 12px;
    padding: 6px 28px 6px 10px;
    order: 3;
  }

  .map-close-btn,
  .search-btn,
  .my-location-btn {
    width: 36px;
    height: 36px;
    font-size: 18px;
    flex-shrink: 0;
  }

  .business-cards-container {
    flex: 0 0 180px;
  }

  .business-cards-container.collapsed {
    flex: 0 0 40px;
  }

  .business-cards-toggle-btn {
    height: 36px;
    font-size: 16px;
  }

  .business-cards-toggle-btn .toggle-text {
    font-size: 12px;
  }

  .business-card {
    width: 180px;
    min-height: 180px;
  }

  .business-image {
    height: 110px;
  }

  .location-prompt-content {
    padding: 24px;
    margin: 20px;
  }

  .prompt-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .location-prompt-content h3 {
    font-size: 20px;
  }

  .prompt-buttons {
    flex-direction: column;
  }

  .prompt-buttons .btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .map-navbar {
    padding: 6px 8px;
    gap: 4px;
  }

  .navbar-search-filters {
    gap: 4px;
  }

  .search-input-wrapper {
    padding: 6px 8px;
    font-size: 14px;
  }

  .search-input {
    font-size: 14px;
  }

  .category-select,
  .distance-select {
    height: 32px;
    font-size: 11px;
    padding: 4px 24px 4px 8px;
  }

  .map-close-btn,
  .search-btn,
  .my-location-btn {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }

  .business-cards-container {
    flex: 0 0 150px;
  }

  .business-cards-container.collapsed {
    flex: 0 0 36px;
  }

  .business-cards-toggle-btn {
    height: 32px;
    font-size: 14px;
    gap: 6px;
  }

  .business-cards-toggle-btn .toggle-text {
    font-size: 11px;
  }

  .business-cards-toggle-btn svg {
    font-size: 18px;
  }

  .business-card {
    width: 160px;
    min-height: 150px;
  }

  .business-image {
    height: 90px;
  }

  .business-info {
    padding: 10px;
    gap: 4px;
  }

  .business-name {
    font-size: 13px;
  }

  .business-rating {
    font-size: 11px;
  }

  .review-text {
    font-size: 11px;
  }

  .review-author {
    font-size: 10px;
  }
}
</style>
