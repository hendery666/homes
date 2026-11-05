<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  getFirestore, collection, query, orderBy, limit, getDoc, getDocs, startAfter,
  doc, setDoc, updateDoc, increment, arrayUnion, deleteDoc, onSnapshot, where,
  getCountFromServer, addDoc, serverTimestamp
} from 'firebase/firestore'
import { onAuthStateChanged, getAuth } from 'firebase/auth'
import { db, auth } from '@/firebase'
import { useRoute, useRouter } from 'vue-router'

import SearchBar from './SearchBar.vue'
import Categories from './Categories.vue'
import ListingCard from './ListingCard.vue'
import ListingDrawer from './ListingDrawer.vue'
import MapExplorer from './MapExplorer.vue'
import { Icon } from '@iconify/vue'

const route = useRoute()
const router = useRouter()

const listings     = ref([])
const loading      = ref(true)
const loadingMore  = ref(false)
const error        = ref('')
const pageSize     = 20 // Changed from 12 to 20 to better fill grid rows (divisible by 2,4,5)
const lastDoc      = ref(null)
const noMore       = ref(false)

const selectedCats = ref([])
const searchFilters = ref({ business: '', location: '' })
const isApplyingFilter = ref(false) // Flag to prevent infinite loops

const sortDropdownOpen = ref(false)
const sortBy = ref('best-match')
const minPrice = ref(null)
const maxPrice = ref(null)
const userLocation = ref(null)

// Map Explorer state
const mapExplorerOpen = ref(false)

// Card loading coordination - show all cards at once when ready
const readyCards = ref(new Set())
const showAllCards = ref(false)

function handleCardReady(listingId) {
  readyCards.value.add(listingId)
  // Check if all current listings have their names loaded
  const allReady = listings.value.every(l => readyCards.value.has(l.listingId || l.id))
  if (allReady && listings.value.length > 0) {
    // Small delay to ensure all DOM updates are complete
    setTimeout(() => {
      showAllCards.value = true
    }, 100)
  }
}

// Distance calculation helper (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Get lat/lng from listing location (simplified - would need geocoding in production)
async function getLatLngForListing(listing) {
  // For now, return null - would need Google Maps geocoding
  // This is a placeholder for the actual geocoding logic
  return null
}

function calculateBestMatchScore(listing) {
  let score = 0
  
  // Category relevance (highest weight)
  if (selectedCats.value.length > 0 && listing.businessCategory) {
    if (selectedCats.value.includes(listing.businessCategory)) {
      score += 1000
    }
  }
  
  // Business name/desc relevance (KEY SEARCH FEATURE)
  const bizQuery = searchFilters.value.business.toLowerCase().trim()
  if (bizQuery) {
    const businessName = (listing.businessName || '').toLowerCase()
    const businessDesc = (listing.businessDesc || '').toLowerCase()
    
    // Exact matches get highest score
    if (businessName === bizQuery) score += 500
    else if (businessName.includes(bizQuery)) score += 300
    else if (businessDesc.includes(bizQuery)) score += 200
    
    // Also check for individual word matches for better relevance
    const queryWords = bizQuery.split(/\s+/)
    queryWords.forEach(word => {
      if (word.length > 2) {
        if (businessName.includes(word)) score += 50
        if (businessDesc.includes(word)) score += 25
      }
    })
  }
  
  // Location relevance (KEY SEARCH FEATURE) - higher priority for Best Match
  const locQuery = searchFilters.value.location.toLowerCase().trim()
  if (locQuery) {
    const location = (listing.locationFormatted || listing.location?.street || '').toLowerCase()
    // Exact location match gets very high score
    if (location === locQuery) score += 800
    else if (location.includes(locQuery)) score += 500
    
    // Also check for individual location words
    const locWords = locQuery.split(/\s+/)
    locWords.forEach(word => {
      if (word.length > 2 && location.includes(word)) score += 200
    })
  }
  
  // Add trending factors as tie-breaker and quality signals
  const id = listing.id || listing.listingId
  const viewCount = listing.viewCount || 0
  const likes = likeCounts[id] || 0
  const reviews = listing.totalReviews || 0
  const rating = listing.rating || 0
  
  // Trending factors as quality indicators
  let trendingScore = 0
  
  // Check if boosted
  let boosted = 0
  if (listing.boostedUntil) {
    const boostedUntil = listing.boostedUntil?.seconds ? listing.boostedUntil.seconds * 1000 : Date.parse(listing.boostedUntil)
    if (boostedUntil > Date.now()) {
      boosted = 1
    }
  }
  
  // Get badge level points from profile map
  let badgePoints = 0
  if (listing.userId && profileMap.value[listing.userId]?.stats) {
    const stats = profileMap.value[listing.userId].stats
    badgePoints = (stats.reviews || 0) + (stats.boosts || 0) * 5
  }
  
  // Calculate age decay
  let ageScore = 1
  if (listing.createdAt) {
    const createdAt = listing.createdAt?.seconds ? listing.createdAt.seconds * 1000 : Date.parse(listing.createdAt)
    const ageInDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000)
    ageScore = Math.max(0.5, 1 - (ageInDays / 180))
  }
  
  // Add trending factors to score with substantial weight
  trendingScore = (
    (viewCount * 0.3) +
    (likes * 2) +
    (reviews * 3) +
    (rating * 5) +
    (boosted * 300) +
    (badgePoints * 0.1) +
    (ageScore * 50)
  )
  
  return score + trendingScore
}

function calculateTrendingScore(listings, likeCounts, profileMap) {
  return listings.map(listing => {
    const id = listing.id || listing.listingId
    const viewCount = listing.viewCount || 0
    const likes = likeCounts[id] || 0
    
    // Get reviews count from the listing (fetching all reviews would be too expensive)
    const reviews = listing.totalReviews || 0
    const rating = listing.rating || 0
    
    // Check if boosted
    let boosted = 0
    if (listing.boostedUntil) {
      const boostedUntil = listing.boostedUntil?.seconds ? listing.boostedUntil.seconds * 1000 : Date.parse(listing.boostedUntil)
      if (boostedUntil > Date.now()) {
        boosted = 1
      }
    }
    
    // Get badge level points from profile map
    let badgePoints = 0
    if (listing.userId && profileMap[listing.userId]?.stats) {
      const stats = profileMap[listing.userId].stats
      badgePoints = (stats.reviews || 0) + (stats.boosts || 0) * 5
    }
    
    // Calculate age decay (newer listings get boost, but not too much)
    let ageScore = 1
    if (listing.createdAt) {
      const createdAt = listing.createdAt?.seconds ? listing.createdAt.seconds * 1000 : Date.parse(listing.createdAt)
      const ageInDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000)
      ageScore = Math.max(0.5, 1 - (ageInDays / 180)) // Decay over 6 months
    }
    
    // Trending score formula with weights
    const trendingScore = (
      (viewCount * 0.3) +           // Views matter but not too much
      (likes * 2) +                 // Likes count more
      (reviews * 3) +               // Reviews count even more
      (rating * 5) +                // Average rating matters
      (boosted * 300) +             // Boosted listings get significant boost
      (badgePoints * 0.1) +         // Badge level gives small boost
      (ageScore * 50)               // Newer listings get some boost
    )
    
    return { ...listing, trendingScore }
  }).sort((a, b) => b.trendingScore - a.trendingScore) // Sort descending
}

async function applySorting() {
  let filtered = [...listings.value]
  
  // Apply price range filter (only if both min and max are set)
  if (minPrice.value !== null && maxPrice.value !== null) {
    filtered = filtered.filter(listing => {
      const price = parseFloat(listing.menu?.[0]?.price?.replace(/[^0-9.]/g, '')) || 0
      return price >= minPrice.value && price <= maxPrice.value
    })
  }
  
  // Apply sorting
  switch (sortBy.value) {
    case 'best-match':
      // Best Match algorithm
      filtered = filtered.map(listing => ({
        ...listing,
        bestMatchScore: calculateBestMatchScore(listing)
      })).sort((a, b) => b.bestMatchScore - a.bestMatchScore)
      break
    case 'trending':
      // Trending algorithm
      filtered = calculateTrendingScore(filtered, likeCounts, profileMap.value)
      break
    case 'most-reviewed':
      // Sort by review count (descending - most reviews first)
      // First, ensure all listings have review counts by fetching from Firestore
      await Promise.all(filtered.map(async (listing) => {
        const listingId = listing.id || listing.listingId
        if (listingId) {
          // Always fetch the actual count to ensure accuracy
          try {
            const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
            const countSnap = await getCountFromServer(reviewsRef)
            listing.totalReviews = countSnap.data().count || 0
          } catch (e) {
            // Fallback to stored value if fetch fails
            listing.totalReviews = Number(listing.totalReviews) || Number(listing.reviewCount) || 0
          }
        } else {
          listing.totalReviews = Number(listing.totalReviews) || Number(listing.reviewCount) || 0
        }
      }))
      
      // Now sort by review count (descending - most reviews first)
      filtered.sort((a, b) => {
        // Get review counts (should be set from above)
        const aReviews = Number(a.totalReviews) || 0
        const bReviews = Number(b.totalReviews) || 0
        
        // Primary sort: descending by review count (most reviews first)
        if (bReviews !== aReviews) {
          return bReviews - aReviews
        }
        
        // Secondary sort by average rating if reviews are equal (highest rating first)
        const aRating = Number(a.averageRating) || Number(a.rating) || 0
        const bRating = Number(b.averageRating) || Number(b.rating) || 0
        return bRating - aRating
      })
      break
    case 'oldest':
      filtered.sort((a, b) => {
        const aTime = a.createdAt?.seconds || a.createdAt || 0
        const bTime = b.createdAt?.seconds || b.createdAt || 0
        return aTime - bTime
      })
      break
    case 'cheapest':
      filtered.sort((a, b) => {
        const aPrice = parseFloat(a.menu?.[0]?.price?.replace(/[^0-9.]/g, '')) || Infinity
        const bPrice = parseFloat(b.menu?.[0]?.price?.replace(/[^0-9.]/g, '')) || Infinity
        return aPrice - bPrice
      })
      break
    case 'most-expensive':
      filtered.sort((a, b) => {
        const aPrice = parseFloat(a.menu?.[0]?.price?.replace(/[^0-9.]/g, '')) || 0
        const bPrice = parseFloat(b.menu?.[0]?.price?.replace(/[^0-9.]/g, '')) || 0
        return bPrice - aPrice
      })
      break
    case 'nearby':
      // Sort by location match if location is provided
      if (searchFilters.value.location) {
        filtered.sort((a, b) => {
          const locA = (a.locationFormatted || a.location?.street || '').toLowerCase()
          const locB = (b.locationFormatted || b.location?.street || '').toLowerCase()
          const query = searchFilters.value.location.toLowerCase()
          const matchA = locA.includes(query) ? 1 : 0
          const matchB = locB.includes(query) ? 1 : 0
          return matchB - matchA
        })
      }
      break
  }
  
  listings.value = filtered
  sortDropdownOpen.value = false
}

function resetFilter() {
  sortBy.value = 'trending'
  minPrice.value = null
  maxPrice.value = null
  reloadForFilters()
  sortDropdownOpen.value = false
}

// Computed title for page
const pageTitle = computed(() => {
  if (searchFilters.value.business && !selectedCats.value.length) {
    return `Search Results for "${searchFilters.value.business}"`
  } else if (selectedCats.value.length > 0) {
    return selectedCats.value[0] // Show first selected category
  } else {
    return 'Trending'
  }
})

// likes state
const likedSet     = ref(new Set())
let unsubLikes     = null
let unsubAuth      = null

/* like counts per listing */
const likeCounts   = reactive({})

/* seller names/avatars (live) */
const profileMap   = ref({})
const profileUnsubs = new Map()

/* ---------- batch reveal state ---------- */
/** IDs whose images are allowed to show (revealed). */
const revealedIds = ref(new Set())
/** The IDs added by the most recent fetch (current batch). */
let currentBatchIds = []
/** Count images in the current batch that we must wait for. */
const batchTotalImages = ref(0)
/** Track how many of those images have fired load/error. */
const batchLoadedImages = ref(0)

function hasPhoto(l) {
  return Boolean(l.photoUrls?.[0] || l.photos?.[0]?.url)
}

function markBatchRevealed(ids) {
  const s = new Set(revealedIds.value)
  ids.forEach(id => s.add(id))
  revealedIds.value = s
  // reset batch counters
  currentBatchIds = []
  batchTotalImages.value = 0
  batchLoadedImages.value = 0
}

function handleImageLoaded(listingId) {
  if (!currentBatchIds.includes(listingId)) return
  batchLoadedImages.value++
  if (batchLoadedImages.value >= batchTotalImages.value && batchTotalImages.value > 0) {
    markBatchRevealed(currentBatchIds)
  }
}

function startProfileListener(uid) {
  if (!uid || profileUnsubs.has(uid)) return
  const unsub = onSnapshot(doc(db, 'users', uid), snap => {
    const data = snap.data() || {}
    const displayName = data.username || data.displayName || ''
    const photoURL    = data.photoURL || data.profilePicture || data.avatarUrl || data.profilePhoto || ''
    const stats = data.stats || { reviews: 0, boosts: 0 }
    profileMap.value = { ...profileMap.value, [uid]: { displayName, photoURL, stats } }
  })
  profileUnsubs.set(uid, unsub)
}

function attachProfileListeners(rows) {
  const uids = new Set(rows.map(r => r.userId).filter(Boolean))
  uids.forEach(startProfileListener)
}

/* ---------- reload helpers (for filters) ---------- */
function resetPaging() {
  listings.value = []
  lastDoc.value = null
  noMore.value = false
  // reset reveal state
  revealedIds.value = new Set()
  currentBatchIds = []
  batchTotalImages.value = 0
  batchLoadedImages.value = 0
  // reset card loading coordination
  readyCards.value = new Set()
  showAllCards.value = false
}
async function reloadForFilters() {
  loading.value = true
  resetPaging()
  await fetchPage()
  // Apply sorting after data is loaded
  await nextTick()
  if (sortBy.value && listings.value.length > 0) {
    await applySorting()
  }
}

/* watch: whenever categories or search changes, reload first page */
watch(selectedCats, async (newCats) => {
  if (isApplyingFilter.value) return
  isApplyingFilter.value = true
  
  // Ensure only one category is selected (safety check)
  if (newCats.length > 1) {
    selectedCats.value = [newCats[0]]
    await nextTick()
  }
  
  // Automatically switch to Best Match when category is selected
  if (newCats.length > 0 && sortBy.value !== 'best-match') {
    sortBy.value = 'best-match'
  }
  // Clear search if category is selected
  if (newCats.length > 0 && searchFilters.value.business) {
    searchFilters.value = { business: '', location: '' }
  }
  
  await nextTick()
  isApplyingFilter.value = false
  reloadForFilters()
}, { deep: true })

watch(searchFilters, async (newFilters) => {
  if (isApplyingFilter.value) return
  isApplyingFilter.value = true
  
  // Automatically switch to Best Match when search is performed
  if (newFilters.business && sortBy.value !== 'best-match') {
    sortBy.value = 'best-match'
  }
  // Clear category if search is performed
  if (newFilters.business && selectedCats.value.length > 0) {
    selectedCats.value = []
  }
  // If Best Match was selected but search was cleared, reset to Trending
  if (!newFilters.business && sortBy.value === 'best-match' && selectedCats.value.length === 0) {
    sortBy.value = 'trending'
  }
  
  await nextTick()
  isApplyingFilter.value = false
  reloadForFilters()
}, { deep: true })

/* handle search from SearchBar component */
function handleSearch(filters) {
  searchFilters.value = filters
  // Automatically switch to Best Match when search is performed
  if (filters.business && sortBy.value !== 'best-match') {
    sortBy.value = 'best-match'
  }
}

/* ---------- listings pagination ---------- */
async function fetchPage () {
  const first = !lastDoc.value
  if (first) loading.value = true; else loadingMore.value = true
  error.value = ''
  try {
    const base = collection(db, 'allListings')
    const parts = []

    // Apply category filter if any (Firestore 'in' supports up to 10 items)
    // Exclude "Trending" from category filter as it's a special sort-only category
    const regularCategories = selectedCats.value.filter(cat => cat !== 'Trending')
    if (regularCategories.length > 0) {
      // Filter by selected categories (max 10 for Firestore `in` clause)
      parts.push(where('businessCategory', 'in', regularCategories.slice(0, 10)))
    }
    parts.push(orderBy('createdAt','desc'))
    if (lastDoc.value) parts.push(startAfter(lastDoc.value))
    parts.push(limit(pageSize))

    const q = query(base, ...parts)
    const snap = await getDocs(q)
    if (snap.empty) {
      if (first) listings.value = []
      noMore.value = true
      return
    }

    lastDoc.value = snap.docs[snap.docs.length - 1]
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    // ----- Client-side filtering by search terms -----
    const bizQuery = searchFilters.value.business.toLowerCase()
    const locQuery = searchFilters.value.location.toLowerCase()

    if (bizQuery || locQuery) {
      rows = rows.filter(r => {
        const name = (r.businessName || '').toLowerCase()
        const desc = (r.businessDesc || '').toLowerCase()
        const location = (r.locationFormatted || r.location?.street || '').toLowerCase()

        const matchesBusiness = !bizQuery || name.includes(bizQuery) || desc.includes(bizQuery)
        const matchesLocation = !locQuery || location.includes(locQuery)

        return matchesBusiness && matchesLocation
      })
    }

    // ----- Batch reveal prep (for *new* rows only) -----
    currentBatchIds = rows.map(r => r.listingId || r.id)
    // Count only listings with a real image to wait for
    batchTotalImages.value = rows.filter(hasPhoto).length
    batchLoadedImages.value = 0

    // If there are no images in this batch, reveal immediately
    if (batchTotalImages.value === 0) {
      markBatchRevealed(currentBatchIds)
    }

    // Merge data and listeners
    listings.value.push(...rows)
    attachProfileListeners(rows)
    rows.forEach(r => fetchLikesCount(r.listingId || r.id))

    // Use cached rating from listing document instead of fetching all reviews
    // This dramatically improves performance by avoiding getDocs calls for every listing
    rows.forEach(r => {
      // Use the rating stored in the listing document, or default to 0
      r.rating = Number(r.averageRating) || Number(r.rating) || 0
      // Ensure averageRating is also set as a number
      r.averageRating = Number(r.averageRating) || r.rating || 0
      // Fetch totalReviews - try multiple field names
      r.totalReviews = Number(r.totalReviews) || Number(r.reviewCount) || Number(r.total_reviews) || 0
    })
    
    // If most-reviewed is selected, fetch actual review counts for listings that don't have it
    if (sortBy.value === 'most-reviewed') {
      await Promise.all(rows.map(async (r) => {
        if (!r.totalReviews || r.totalReviews === 0) {
          try {
            const listingId = r.id || r.listingId
            if (listingId) {
              const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
              const countSnap = await getCountFromServer(reviewsRef)
              r.totalReviews = countSnap.data().count || 0
            }
          } catch (e) {
            // Silently handle errors - console filter will suppress them
            r.totalReviews = 0
          }
        }
      }))
    }



    if (snap.size < pageSize) noMore.value = true
  } catch (e) {
    console.error(e)
    error.value = 'Failed to load listings.'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

/* ---------- like counts ---------- */
async function fetchLikesCount(listingId) {
  try {
    const col = collection(db, 'listingLikes', listingId, 'users')
    const snap = await getCountFromServer(col)
    likeCounts[listingId] = snap.data().count || 0
  } catch (e) {
    console.warn('likes count error:', listingId, e)
  }
}

/* ---------- likes listener ---------- */
function startLikesListener(user) {
  if (unsubLikes) { unsubLikes(); unsubLikes = null }
  likedSet.value = new Set()
  if (!user) return
  const colRef = collection(db, 'users', user.uid, 'likedListings')
  unsubLikes = onSnapshot(colRef, snap => {
    const s = new Set()
    snap.forEach(d => s.add(d.id))
    likedSet.value = s
  })
}

/* ---------- like toggle ---------- */
async function onToggleLike(listing) {
  const uid = auth.currentUser?.uid
  if (!uid) return alert('Please log in to like.')

  const id = listing.listingId || listing.id
  const userLikeRef   = doc(db, 'users', uid, 'likedListings', id)
  const publicLikeRef = doc(db, 'listingLikes', id, 'users', uid)

  const isLiked = likedSet.value.has(id)
  if (isLiked) likedSet.value.delete(id); else likedSet.value.add(id)
  const prev = likeCounts[id] || 0
  likeCounts[id] = Math.max(0, prev + (isLiked ? -1 : +1))

  try {
    if (isLiked) {
      await Promise.all([ deleteDoc(userLikeRef), deleteDoc(publicLikeRef) ])
    } else {
      const payload = { at: new Date() }
      await Promise.all([ setDoc(userLikeRef, { listingId: id, ...payload }), setDoc(publicLikeRef, payload) ])
    }
  } catch (e) {
    if (isLiked) likedSet.value.add(id); else likedSet.value.delete(id)
    likeCounts[id] = prev
    console.error('like toggle error:', e)
    alert('Could not update like. Please try again.')
  }
}

/* UI actions */
function toggleCategory(name) {
  // Allow only one category at a time
  if (selectedCats.value.length === 1 && selectedCats.value[0] === name) {
    selectedCats.value = [] // Deselect if already selected
  } else {
    selectedCats.value = [name] // Select only this category
  }
}
function clearFilters() {
  if (selectedCats.value.length === 0) return
  selectedCats.value = []
}

/* ---------- drawer wiring (ADDED) ---------- */
const drawerOpen          = ref(false)
const drawerListing       = ref(null)
const drawerSellerName    = ref('')
const drawerSellerAvatar  = ref('')

async function openDrawer(l) {
  drawerListing.value = l
  const prof = l?.userId ? profileMap.value[l.userId] : null
  drawerSellerName.value   = prof?.displayName || ''
  drawerSellerAvatar.value = prof?.photoURL || ''
  drawerOpen.value = true

  // Track view when drawer opens
  const listingId = l?.listingId || l?.id
  if (listingId) {
    await incrementViewCount(listingId)
  }
}
function closeDrawer() {
  drawerOpen.value = false
  drawerListing.value = null
}

function openDrawerFromMap(listing) {
  openDrawer(listing)
}

async function incrementViewCount(listingId) {
  const user = auth.currentUser;

  if (!user) {
    console.warn("⚠️ User must be signed in to count a view.");
    return;
  }

  if (!listingId) {
    console.warn("⚠️ No listing ID provided.");
    return;
  }

  const listingRef = doc(db, "allListings", listingId);

  try {
    console.log(`🔍 Checking listing ${listingId}...`);
    const listingSnap = await getDoc(listingRef);

    if (!listingSnap.exists()) {
      console.warn("⚠️ Listing does not exist.");
      return;
    }

    const data = listingSnap.data();

    // Don't count views from the listing owner
    if (data.userId === user.uid) {
      console.log("👤 Viewing own listing — skipping view count increment.");
      return;
    }

    const viewedBy = data.viewedBy || [];

    // Only count unique views (don't increment if user already viewed)
    if (!viewedBy.includes(user.uid)) {
      console.log(`📝 Updating view count for listing ${listingId}...`);

    // Always increment viewCount for non-owner users (counts every view, even repeat views)
    try {
      // Check if viewCount exists, if not initialize it to 0 first
      const currentViewCount = data.viewCount ?? 0;
      console.log(`📊 Current viewCount: ${currentViewCount}`);
      
      // Use increment which works even if field doesn't exist
      await updateDoc(listingRef, {
        viewCount: increment(1),
        viewedBy: arrayUnion(user.uid) // Track who has viewed (but don't prevent repeat counts)
      });
      
      // Verify the update worked by reading the document back
      const verifySnap = await getDoc(listingRef);
      const verifiedData = verifySnap.data();
      const newViewCount = verifiedData?.viewCount ?? 0;
      
      console.log(`✅ View count updated: ${currentViewCount} → ${newViewCount} for user ${user.uid}`);
      
      if (newViewCount === currentViewCount) {
        console.warn(`⚠️ View count didn't change! Expected ${currentViewCount + 1}, got ${newViewCount}`);
      }
    } catch (updateError) {
      console.error("❌ Error updating viewCount:", updateError);
      console.error("Error details:", {
        code: updateError.code,
        message: updateError.message,
        listingId,
        userId: user.uid,
        currentViewCount: data.viewCount
      });
      
      // If increment fails, try setting it directly (fallback)
      try {
        const currentViewCount = data.viewCount ?? 0;
        const newViewCount = currentViewCount + 1;
        await updateDoc(listingRef, {
          viewCount: newViewCount,
          viewedBy: arrayUnion(user.uid)
        });
        console.log(`✅ View count set directly to ${newViewCount} (fallback method)`);
      } catch (fallbackError) {
        console.error("❌ Fallback method also failed:", fallbackError);
      }
    }

      // Add to viewHistory for analytics (only for first-time views)
      try {
        console.log(`📊 Adding to viewHistory for listing ${listingId}...`);
        const viewHistoryRef = collection(db, "allListings", listingId, "viewHistory");
        await addDoc(viewHistoryRef, {
          timestamp: serverTimestamp(),
          userId: user.uid
        });
        console.log(`✅ View logged to analytics for user ${user.uid}`);
      } catch (viewHistoryError) {
        // Log but don't fail the whole operation if viewHistory write fails
        console.error("❌ Error adding to viewHistory:", viewHistoryError);
        console.error("Error details:", {
          code: viewHistoryError.code,
          message: viewHistoryError.message,
          listingId,
          userId: user.uid
        });
      }
    } else {
      console.log("👀 Already viewed this listing — skipping increment.");
    }

  } catch (error) {
    console.error("❌ Error updating view count:", error);
    console.error("Error details:", {
      code: error.code,
      message: error.message,
      listingId,
      userId: user?.uid
    });
  }
}

async function handleListingClick(listingId) {
  try {
    await incrementViewCount(listingId);
  } catch (error) {
    console.error("❌ Error handling listing click:", error);
  }
}

// Handler for sort option clicks
async function handleSortChange(newSort) {
  sortBy.value = newSort
  await applySorting()
}

/* ---------- lifecycle ---------- */
onMounted(async () => {
  await fetchPage()
  // Apply sorting after initial load
  await nextTick()
  if (sortBy.value && listings.value.length > 0) {
    await applySorting()
  }
  unsubAuth = onAuthStateChanged(auth, user => startLikesListener(user))

  // Check if there's a listing query parameter (from new listing creation)
  if (route.query.listing) {
    const listingId = route.query.listing
    try {
      const listingDoc = await getDoc(doc(db, 'allListings', listingId))
      if (listingDoc.exists()) {
        const listingData = { id: listingId, listingId, ...listingDoc.data() }
        // Wait a bit to ensure drawer is ready
        await nextTick()
        openDrawer(listingData)
        // Clear the query parameter
        router.replace({ query: {} })
      }
    } catch (error) {
      console.error('Error loading listing from query:', error)
    }
  }
})

onBeforeUnmount(() => {
  if (unsubLikes) unsubLikes()
  if (unsubAuth) unsubAuth()
  profileUnsubs.forEach(unsub => unsub && unsub())
  profileUnsubs.clear()
})
</script>

<template>
  <div class="page-wrapper">
    <div class="content-container py-3">
      <SearchBar @search="handleSearch" />

      <!-- Map Explorer Banner -->
      <div class="map-banner" @click="mapExplorerOpen = true">
        <div class="map-banner-content">
          <div class="map-banner-icon">
            <Icon icon="mdi:map-marker-radius" />
          </div>
          <div class="map-banner-text">
            <h3>Explore Nearby Businesses</h3>
            <p>Discover home businesses on an interactive map</p>
          </div>
          <div class="map-banner-arrow">
            <Icon icon="mdi:arrow-right" />
          </div>
        </div>
      </div>

      <div class="categories-row mt-3">
        <Categories :selected="selectedCats" @toggle="toggleCategory" />
      </div>

      <!-- Page Title -->
      <h2 class="page-title mt-4 mb-3">{{ pageTitle }}</h2>

      <!-- Sort Dropdown -->
      <div class="d-flex justify-content-end align-items-center my-3 gap-2 flex-wrap">
        <div class="sort-dropdown-wrapper position-relative">
          <button
            class="btn btn-outline-primary d-flex align-items-center gap-2 sort-btn"
            @click="sortDropdownOpen = !sortDropdownOpen"
          >
            <span class="sort-label">Sort by:<strong v-if="sortBy !== 'trending'"> {{ sortBy === 'best-match' ? 'Best Match' : sortBy === 'most-reviewed' ? 'Most Reviewed' : sortBy === 'oldest' ? 'Oldest First' : sortBy === 'cheapest' ? 'Cheapest First' : sortBy === 'most-expensive' ? 'Most Expensive First' : sortBy === 'nearby' ? 'Nearest First' : '' }}</strong></span>
            <i class="fas" :class="sortDropdownOpen ? 'fa-caret-up' : 'fa-caret-down'"></i>
          </button>

          <!-- Dropdown Menu -->
          <div v-if="sortDropdownOpen" class="sort-dropdown-menu">
            <div 
              v-if="searchFilters.business"
              class="sort-dropdown-item" 
              :class="{ active: sortBy === 'best-match' }"
              @click="handleSortChange('best-match')"
            >
              <span class="radio-dot"></span>
              <span>Best Match</span>
            </div>
            <div 
              class="sort-dropdown-item" 
              :class="{ active: sortBy === 'most-reviewed' }"
              @click="handleSortChange('most-reviewed')"
            >
              <span class="radio-dot"></span>
              <span>Most Reviewed</span>
            </div>
            <div 
              class="sort-dropdown-item" 
              :class="{ active: sortBy === 'oldest' }"
              @click="handleSortChange('oldest')"
            >
              <span class="radio-dot"></span>
              <span>Oldest First</span>
            </div>
            <div 
              class="sort-dropdown-item" 
              :class="{ active: sortBy === 'cheapest' }"
              @click="handleSortChange('cheapest')"
            >
              <span class="radio-dot"></span>
              <span>Cheapest First</span>
            </div>
            <div 
              class="sort-dropdown-item" 
              :class="{ active: sortBy === 'most-expensive' }"
              @click="handleSortChange('most-expensive')"
            >
              <span class="radio-dot"></span>
              <span>Most Expensive First</span>
            </div>
            <div 
              class="sort-dropdown-item" 
              :class="{ active: sortBy === 'nearby' }"
              @click="handleSortChange('nearby')"
            >
              <span class="radio-dot"></span>
              <span>Nearest First</span>
            </div>
          </div>
        </div>
        
        <!-- Price Range Filters -->
        <div class="d-flex align-items-center gap-2 price-filter-wrapper">
          <label class="small mb-0 price-label">Price:</label>
          <input type="number" class="form-control form-control-sm price-input" v-model.number="minPrice" placeholder="Min" />
          <span class="text-muted">-</span>
          <input type="number" class="form-control form-control-sm price-input" v-model.number="maxPrice" placeholder="Max" />
          <button class="btn btn-sm btn-primary apply-btn" @click="applySorting">Apply</button>
        </div>
      </div>
      
      <!-- Click outside to close dropdown -->
      <div v-if="sortDropdownOpen" class="dropdown-overlay" @click="sortDropdownOpen = false"></div>


    </div>

    <div class="content-container pb-5">
      <!-- loading / error -->
      <div v-if="loading" class="d-flex justify-content-center my-5">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
      </div>
      <div v-else-if="error" class="alert alert-danger">{{ error }}</div>

      <!-- listings grid -->
      <div v-else class="listings-container">
        <div class="row g-3 row-cols-2 row-cols-md-3 row-cols-lg-4 row-cols-xxl-5 align-items-stretch">
          <div class="col" v-for="l in listings" :key="l.id">
            <div class="card-sm">
              <ListingCard
                :listing="l"
                :liked="likedSet?.has(l.listingId || l.id)"
                :likesCount="likeCounts[l.listingId || l.id] || 0"
                :sellerNameOverride="profileMap[l.userId]?.displayName || ''"
                :sellerAvatarOverride="profileMap[l.userId]?.photoURL || ''"
                :reveal="revealedIds.has(l.listingId || l.id)"
                :showAll="true"
                @toggle-like="onToggleLike"
                @image-loaded="() => handleImageLoaded(l.listingId || l.id)"
                @card-ready="handleCardReady"
                @open="openDrawer(l)"
                @click="handleListingClick(l.listingId || l.id)"
              />
            </div>
          </div>
        </div>

        <div v-if="!listings.length" class="text-center text-muted py-5">No listings yet.</div>

        <!-- pagination -->
        <div v-if="listings.length && !noMore" class="d-flex justify-content-center mt-4">
          <button class="btn btn-outline-primary px-4" :disabled="loadingMore" @click="fetchPage">
            <span v-if="loadingMore" class="spinner-border spinner-border-sm me-2"></span>
            Load more
          </button>
        </div>
        <div v-else-if="listings.length && noMore" class="text-center text-muted mt-4">
          You've reached the end.
        </div>
      </div>
    </div>


    <!-- Drawer (REUSED) -->
    <ListingDrawer
      :open="drawerOpen"
      :listing="drawerListing"
      :sellerName="drawerSellerName"
      :sellerAvatar="drawerSellerAvatar"
      @close="closeDrawer"
    />

    <!-- Map Explorer -->
    <MapExplorer
      :isOpen="mapExplorerOpen"
      @close="mapExplorerOpen = false"
      @openListing="openDrawerFromMap"
    />
  </div>
</template>

<style scoped>
.page-wrapper {
  width: 100%;
  min-height: 100vh;
}

.content-container {
  max-width: 1400px;
  margin: 0 auto;
  padding-left: 1rem;
  padding-right: 1rem;
}

@media (max-width: 991.98px) {
  .content-container {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
}

@media (max-width: 575.98px) {
  .content-container {
    padding-left: 1rem;
    padding-right: 1rem;
  }
}

.categories-row {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 0.25rem;
}
.categories-row :deep(.navbar) {
  flex-wrap: nowrap !important;
  gap: 18px;
}
.categories-row :deep(.category img) {
  width: 110px;
  height: 110px;
}
.categories-row :deep(.category-text) {
  font-size: 0.95rem !important;
}

.listings-container {
  min-height: 600px;
  transition: opacity 0.2s ease;
}

.listings-container .col {
  display: flex;
  flex-direction: column;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.chip-bar { text-align: center; }
.chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  margin: 4px;
  border-radius: 999px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;
  user-select: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.chip:hover:not(.chip--selected) {
  background: var(--color-primary-pale);
  transform: translateY(-1px);
}
.chip--selected {
  background: var(--color-primary);
  color: var(--color-text-white);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}
.chip-clear {
  background: transparent;
  border: 1px solid var(--color-border-purple);
  color: var(--color-primary);
  padding: 6px 12px;
  border-radius: 999px;
  line-height: 1;
  transition: all var(--transition-fast);
}
.chip-clear:hover {
  background: var(--color-primary-pale);
  border-color: var(--color-primary-light);
  color: var(--color-primary-hover);
}

.card-sm {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-sm :deep(.card) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.card-sm :deep(.img-box) { height: 220px !important; }
.card-sm :deep(.card-title) { font-size: 1rem; }
.card-sm :deep(.badge) { font-size: 0.7rem; }
.card-sm :deep(.card-body) {
  padding: 0.75rem 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.card-sm :deep(.card-footer) { padding: 0.5rem 1rem; }

@media (min-width: 992px) {
  .categories-row { scrollbar-width: none; }
  .categories-row::-webkit-scrollbar { display: none; }
}

/* Sort Dropdown Styles */
.sort-dropdown-wrapper {
  z-index: 1000;
}

.sort-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background: var(--color-bg-white);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  min-width: 250px;
  overflow: hidden;
  z-index: 1001;
  animation: fadeIn 0.2s ease-out;
}

.sort-dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1.25rem;
  cursor: pointer;
  transition: background 0.2s ease;
  border-bottom: 1px solid var(--color-border);
}

.sort-dropdown-item:last-child {
  border-bottom: none;
}

.sort-dropdown-item:hover {
  background: var(--color-bg-purple-tint);
}

.sort-dropdown-item.active {
  background: var(--color-bg-purple-tint);
}

.radio-dot {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.sort-dropdown-item.active .radio-dot {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.sort-dropdown-item.active .radio-dot::after {
  content: '';
  width: 8px;
  height: 8px;
  background: white;
  border-radius: 50%;
}

.dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}

/* Price label styling */
.price-label {
  color: var(--color-primary) !important;
  font-weight: 600;
  font-family: inherit;
  font-size: 0.875rem;
}

.price-input {
  font-family: inherit !important;
  font-size: 0.875rem !important;
  font-weight: 600 !important;
}

.apply-btn {
  font-family: inherit !important;
  font-weight: 600 !important;
  font-size: 0.875rem !important;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 767.98px) {
  /* 2 cards per row on mobile */
  .row.g-3 {
    --bs-gutter-x: 0.75rem;
    --bs-gutter-y: 0.75rem;
  }

  .card-sm :deep(.img-box) {
    height: 180px !important;
  }

  .chip-bar {
    font-size: 0.875rem;
  }

  .chip {
    padding: 5px 10px;
    font-size: 0.813rem;
  }
}

@media (max-width: 575.98px) {
  /* Keep 2 cards per row, adjust gutter */
  .row.g-3 {
    --bs-gutter-x: 0.6rem;
    --bs-gutter-y: 0.85rem;
  }

  .card-sm :deep(.img-box) {
    height: 200px !important;
  }

  .btn {
    font-size: 0.813rem;
    padding: 0.4rem 0.75rem;
  }

  .py-3 {
    padding-top: 0.65rem !important;
    padding-bottom: 0.65rem !important;
  }

  /* Better spacing on mobile */
  .my-3 {
    margin-top: 0.65rem !important;
    margin-bottom: 0.65rem !important;
  }

  .mt-3 {
    margin-top: 0.65rem !important;
  }

  .pb-5 {
    padding-bottom: 2rem !important;
  }

  /* Mobile sort and price filter fixes */
  .sort-btn {
    font-size: 0.75rem;
    padding: 0.4rem 0.65rem;
    white-space: nowrap;
  }

  .sort-label {
    font-size: 0.75rem;
  }

  .price-filter-wrapper {
    gap: 0.35rem !important;
  }

  .price-label {
    font-size: 0.7rem;
  }

  .price-input {
    width: 65px !important;
    font-size: 0.75rem;
    padding: 0.3rem 0.4rem;
  }

  .apply-btn {
    font-size: 0.7rem;
    padding: 0.35rem 0.55rem;
  }
}

/* Narrow mobile screens (393px - 412px width) */
@media (max-width: 420px) {
  .sort-btn {
    font-size: 0.7rem;
    padding: 0.35rem 0.6rem;
  }

  .sort-label {
    font-size: 0.7rem;
  }

  .price-filter-wrapper {
    gap: 0.3rem !important;
  }

  .price-label {
    font-size: 0.65rem;
  }

  .price-input {
    width: 58px !important;
    font-size: 0.7rem;
    padding: 0.3rem 0.35rem;
  }

  .apply-btn {
    font-size: 0.65rem;
    padding: 0.35rem 0.5rem;
  }

  .page-title {
    font-size: 1.5rem;
  }

  /* Reduce card spacing for less cramped feel */
  .row.g-3 {
    --bs-gutter-x: 0.35rem;
    --bs-gutter-y: 0.6rem;
  }

  .card-sm :deep(.img-box) {
    height: 120px !important;
  }

  .content-container {
    padding-left: 0.35rem;
    padding-right: 0.35rem;
  }
}

/* Extra small devices */
@media (max-width: 380px) {
  .row.g-3 {
    --bs-gutter-x: 0.4rem;
    --bs-gutter-y: 0.6rem;
  }

  .card-sm :deep(.img-box) {
    height: 160px !important;
  }
}

/* Map Banner Styles */
.map-banner {
  margin: 20px 0;
  margin-bottom: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
  overflow: hidden;
  position: relative;
}

.map-banner::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  border-radius: 50%;
  transform: translate(50%, -50%);
}

:root.dark-mode .map-banner {
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
}

:root.dark-mode .map-banner:hover {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.7);
}

.map-banner:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
}

.map-banner-content {
  display: flex;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 1;
}

.map-banner-icon {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: white;
  flex-shrink: 0;
}

.map-banner-text {
  flex: 1;
}

.map-banner-text h3 {
  margin: 0;
  color: white;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}

.map-banner-text p {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
}

.map-banner-arrow {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  transition: all 0.3s ease;
}

.map-banner:hover .map-banner-arrow {
  background: rgba(255, 255, 255, 0.3);
  transform: translateX(4px);
}

@media (max-width: 768px) {
  .map-banner {
    padding: 16px;
    margin: 16px 0;
    margin-bottom: 20px;
  }

  .map-banner-content {
    gap: 14px;
  }

  .map-banner-icon {
    width: 50px;
    height: 50px;
    font-size: 28px;
  }

  .map-banner-text h3 {
    font-size: 16px;
  }

  .map-banner-text p {
    font-size: 12px;
  }

  .map-banner-arrow {
    width: 36px;
    height: 36px;
    font-size: 20px;
  }
}

</style>

