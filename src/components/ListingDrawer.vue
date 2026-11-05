<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { db, auth } from '@/firebase'
import {
  collection, query, where, limit as fsLimit, getDocs,
  doc, updateDoc, addDoc, serverTimestamp, getDoc, orderBy, increment
} from 'firebase/firestore'
import { useToast } from '@/composables/useToast'
import { startChatWithUser } from '@/helpers/chatHelper'
import SellerBadge from './SellerBadge.vue'
import { Icon } from '@iconify/vue'
import {VueDatePicker} from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'

const router = useRouter()
const toast = useToast()

const props = defineProps({
  open: { type: Boolean, default: false },
  listing: { type: Object, default: null },
  sellerName: { type: String, default: '' },
  sellerAvatar: { type: String, default: '' },
  radiusM: { type: Number, default: 3000 },
  nearbyCap: { type: Number, default: 60 },
  cacheGeocode: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

// Dark mode detection
const isDarkMode = computed(() => {
  return document.documentElement.classList.contains('dark-mode')
})

/* Report Modal State */
const showReportModal = ref(false)
const reportReason = ref('')
const reportExplanation = ref('')
const submittingReport = ref(false)

/* Booking Modal State */
const showBookingModal = ref(false)
const bookingDate = ref('')
const bookingTime = ref('')
const bookingMessage = ref('')
const submittingBooking = ref(false)

const loadingHandles = ref(false)
const handleError = ref('')

const reportReasons = [
  'Scam/Fraud',
  'Inappropriate Content',
  'False Information',
  'Spam',
  'Duplicate Listing',
  'Other'
]

async function submitReport() {
  const user = auth.currentUser
  if (!user) {
    toast.error('Please log in to report this listing')
    return
  }

  if (!reportReason.value) {
    toast.warning('Please select a reason for reporting')
    return
  }

  if (!reportExplanation.value.trim()) {
    toast.warning('Please provide an explanation for your report')
    return
  }

  try {
    submittingReport.value = true

    const listingId = active.value?.listingId || active.value?.id
    await addDoc(collection(db, 'reports'), {
      listingId,
      listingName: active.value?.businessName,
      reportedBy: user.uid,
      reporterEmail: user.email,
      reason: reportReason.value,
      explanation: reportExplanation.value.trim(),
      timestamp: serverTimestamp(),
      status: 'pending'
    })

    // Update listing report count
    const listingRef = doc(db, 'allListings', listingId)
    await updateDoc(listingRef, {
      reportCount: (active.value?.reportCount || 0) + 1
    })

    toast.success('Report submitted successfully. Our team will review it shortly.')
    showReportModal.value = false
    reportReason.value = ''
    reportExplanation.value = ''
  } catch (error) {
    console.error('Error submitting report:', error)
    toast.error('Failed to submit report. Please try again.')
  } finally {
    submittingReport.value = false
  }
}

function openReportModal() {
  reportReason.value = ''
  reportExplanation.value = ''
  showReportModal.value = true
}

function closeReportModal() {
  showReportModal.value = false
  reportReason.value = ''
  reportExplanation.value = ''
}

/* Booking Modal Functions */
function openBookingModal() {
  const user = auth.currentUser
  if (!user) {
    toast.error('Please log in to book an appointment')
    return
  }

  // Prevent booking your own listing
  if (user.uid === active.value?.userId) {
    toast.warning('You cannot book your own listing')
    return
  }

  bookingDate.value = null
  bookingTime.value = ''
  bookingMessage.value = ''
  showBookingModal.value = true
}

function closeBookingModal() {
  showBookingModal.value = false
  bookingDate.value = null
  bookingTime.value = ''
  bookingMessage.value = ''
}

// Get max date (1 year from now to limit year input to 4 digits)
function getMaxDate() {
  const maxDate = new Date()
  maxDate.setFullYear(maxDate.getFullYear() + 1)
  return maxDate.toISOString().split('T')[0]
}

// Check if a specific date is a closed day
function isDateClosed(dateString) {
  if (!active.value?.operatingHours || !dateString) return false

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const selectedDay = new Date(dateString + 'T12:00:00').getDay() // Add time to avoid timezone issues
  const dayName = dayNames[selectedDay]

  const hours = active.value.operatingHours

  if (typeof hours === 'object' && hours[dayName]) {
    const dayHours = hours[dayName]
    return dayHours === 'Closed' || dayHours === 'closed' || !dayHours
  }

  return false
}

// Function to disable specific week days in date picker (for VueDatePicker)
const disabledWeekDays = computed(() => {
  // Use availableSlots for booking calendar, not operatingHours
  if (!active.value?.availableSlots) return []

  const slots = active.value.availableSlots
  const closedDays = []

  // Map of day names to day numbers (0 = Sunday, 6 = Saturday)
  const dayMapping = {
    'sun': 0,
    'mon': 1,
    'tue': 2,
    'wed': 3,
    'thu': 4,
    'fri': 5,
    'sat': 6
  }

  // Check which days are NOT available for booking based on the 'enabled' field
  Object.keys(dayMapping).forEach(dayName => {
    const daySlot = slots[dayName]

    // If day is not enabled for booking, disable it in calendar
    if (!daySlot || daySlot.enabled !== true) {
      closedDays.push(dayMapping[dayName])
    }
  })

  return closedDays
})

// Function to check if a specific date should be disabled
const isDateDisabled = (date) => {
  const dayOfWeek = date.getDay()
  return disabledWeekDays.value.includes(dayOfWeek)
}

// Convert bookingDate to string format for backend
const bookingDateString = computed(() => {
  if (!bookingDate.value) return ''
  // With model-type="yyyy-MM-dd", it's already a string in the correct format
  if (typeof bookingDate.value === 'string') return bookingDate.value
  // Fallback: If it's a Date object, convert to YYYY-MM-DD
  const d = new Date(bookingDate.value)
  return d.toISOString().split('T')[0]
})

// Get operating hours for selected date (returns {min, max} time strings or null if closed)
const timeRestrictions = computed(() => {
  if (!bookingDateString.value || !active.value?.availableSlots) {
    return null
  }

  if (isDateClosed(bookingDateString.value)) {
    return null
  }

  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const selectedDay = new Date(bookingDateString.value + 'T12:00:00').getDay()
  const dayName = dayNames[selectedDay]

  const slots = active.value.availableSlots

  // Get the time range from availableSlots
  if (slots[dayName] && slots[dayName].enabled === true) {
    const startTime = slots[dayName].start
    const endTime = slots[dayName].end

    if (startTime && endTime) {
      return {
        min: startTime,
        max: endTime
      }
    }
  }

  return null
})

// Generate available time slots based on booking duration
const availableTimeSlots = computed(() => {
  if (!timeRestrictions.value || !active.value?.bookingDuration) return []

  const { min, max } = timeRestrictions.value
  const [startHour, startMin] = min.split(':').map(Number)
  const [endHour, endMin] = max.split(':').map(Number)

  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  // Use the booking duration from the listing (in minutes)
  const interval = active.value.bookingDuration || 30

  const slots = []
  // Generate slots up to the last possible start time (end time - booking duration)
  for (let minutes = startMinutes; minutes <= endMinutes - interval; minutes += interval) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
    slots.push(timeStr)
  }

  return slots
})

// Handle date input change - prevent selection of closed days
function handleDateInput(event) {
  const selectedDate = event.target.value

  if (selectedDate && isDateClosed(selectedDate)) {
    // Clear the date and show warning
    bookingDate.value = ''
    event.target.value = ''

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const selectedDay = new Date(selectedDate + 'T12:00:00').getDay()
    const dayName = dayNames[selectedDay]

    toast.warning(`This business is closed on ${dayName}s. Please select another day.`)
    return false
  }

  bookingDate.value = selectedDate
}

// Handle time input change - validate against operating hours
function handleTimeInput(event) {
  const selectedTime = event.target.value

  if (!bookingDate.value) {
    toast.warning('Please select a date first')
    bookingTime.value = ''
    event.target.value = ''
    return false
  }

  if (selectedTime && timeRestrictions.value) {
    const { min, max } = timeRestrictions.value

    // Convert times to minutes for comparison
    const [selectedHour, selectedMin] = selectedTime.split(':').map(Number)
    const selectedMinutes = selectedHour * 60 + selectedMin

    const [minHour, minMin] = min.split(':').map(Number)
    const minMinutes = minHour * 60 + minMin

    const [maxHour, maxMin] = max.split(':').map(Number)
    const maxMinutes = maxHour * 60 + maxMin

    if (selectedMinutes < minMinutes || selectedMinutes > maxMinutes) {
      // Clear the time and show warning
      bookingTime.value = ''
      event.target.value = ''

      toast.warning(`Please select a time between ${min} and ${max}`)
      return false
    }
  }

  bookingTime.value = selectedTime
}

// Watch for date changes and clear time if new date is closed
watch(bookingDate, (newDate) => {
  if (newDate) {
    const dateStr = typeof newDate === 'string' ? newDate : new Date(newDate).toISOString().split('T')[0]
    if (isDateClosed(dateStr)) {
      bookingTime.value = ''
    }
  }
})

// Check if time is within operating hours (kept for backward compatibility)
function isTimeWithinOperatingHours(date, time) {
  if (!active.value?.operatingHours) return true // If no operating hours set, allow any time

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const selectedDay = new Date(date + 'T12:00:00').getDay()
  const dayName = dayNames[selectedDay]

  const hours = active.value.operatingHours

  // Check if it's structured operating hours object
  if (typeof hours === 'object' && hours[dayName]) {
    const dayHours = hours[dayName]

    // Check if business is closed that day
    if (dayHours === 'Closed' || dayHours === 'closed' || !dayHours) {
      return false
    }

    // Parse hours like "09:00 - 17:00"
    const hoursMatch = dayHours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
    if (hoursMatch) {
      const [_, openHour, openMin, closeHour, closeMin] = hoursMatch
      const openTime = parseInt(openHour) * 60 + parseInt(openMin)
      const closeTime = parseInt(closeHour) * 60 + parseInt(closeMin)

      const [selectedHour, selectedMin] = time.split(':').map(Number)
      const selectedTime = selectedHour * 60 + selectedMin

      return selectedTime >= openTime && selectedTime <= closeTime
    }
  }

  return true // Allow if operating hours format is not recognized
}

async function submitBooking() {
  const user = auth.currentUser
  if (!user) {
    toast.error('Please log in to book an appointment')
    return
  }

  if (!bookingDateString.value) {
    toast.warning('Please select a date')
    return
  }

  if (!bookingTime.value) {
    toast.warning('Please select a time')
    return
  }

  // Check if selected date is in the past
  const selectedDate = new Date(bookingDateString.value)
  const today = new Date()
  today.setHours(0, 0, 0, 0) // Reset time to midnight for accurate comparison

  if (selectedDate < today) {
    toast.warning('Please select a future date')
    return
  }

  try {
    submittingBooking.value = true

    const listingId = active.value?.listingId || active.value?.id

    // Get user details
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    const userData = userDoc.data()

    // Create booking request
    await addDoc(collection(db, 'bookingRequests'), {
      listingId,
      listingName: active.value?.businessName,
      sellerId: active.value?.userId,
      buyerId: user.uid,
      buyerName: `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() || user.email,
      buyerEmail: user.email,
      buyerPhone: userData?.address?.phone || '',
      date: bookingDateString.value,
      time: bookingTime.value,
      message: bookingMessage.value.trim(),
      status: 'pending',
      createdAt: serverTimestamp()
    })

    toast.success('Booking request submitted successfully! The seller will review your request.')
    showBookingModal.value = false
    bookingDate.value = null
    bookingTime.value = ''
    bookingMessage.value = ''
  } catch (error) {
    console.error('Error submitting booking:', error)
    toast.error('Failed to submit booking request. Please try again.')
  } finally {
    submittingBooking.value = false
  }
}

/* Esc to close */
function onEsc(e) {
  if (e.key === 'Escape') {
    if (showReportModal.value) {
      closeReportModal()
    } else if (showBookingModal.value) {
      closeBookingModal()
    } else {
      emit('close')
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc))

/* Hours helpers */
const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
function isStructuredHours(v) { return v && typeof v === 'object' && !Array.isArray(v) }
function fmt(h) {
  if (!h || h.closed) return 'Closed'
  if (h.open && h.close) return `${h.open} – ${h.close}`
  return ''
}

/* Active business (changes when clicking map markers) */
const active = ref(null)
watch(() => props.listing, (v) => { active.value = v || null }, { immediate: true })

/* Photos from active */
const photos = computed(() => {
  const L = active.value
  if (!L) return []
  // prefer photoUrls; fall back to photos[]
  const urls = (Array.isArray(L.photoUrls) && L.photoUrls.length)
    ? [...L.photoUrls]
    : (Array.isArray(L.photos) ? L.photos.map(p => p?.url).filter(Boolean) : [])
  const seen = new Set()
  return urls.filter(u => u && !seen.has(u) && (seen.add(u), true))
})

/* Map state */
const mapEl = ref(null)
let map = null
let markers = []
let infoWindow = null
let geocoder = null
const geoCache = new Map()
let resizeObs = null
const mapsLoadError = ref(false)
const mapsLoading = ref(false)

/* Load Maps JS once */
// robust loader: safe to paste over your existing function


// ✅ tiny loader used only if window.google is missing
let mapsLoadingPromise
function ensureMapsLoaded() {
  if (typeof window !== 'undefined' && window.google?.maps) {
    mapsLoadError.value = false
    return Promise.resolve()
  }
  if (mapsLoadingPromise) return mapsLoadingPromise
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) {
    console.warn('[Maps] Missing VITE_GOOGLE_MAPS_API_KEY')
    mapsLoadError.value = true
    return Promise.reject(new Error('Missing API key'))
  }

  mapsLoading.value = true
  mapsLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gmaps="1"]')
    if (existing) {
      const wait = () => {
        if (window.google?.maps) {
          mapsLoading.value = false
          mapsLoadError.value = false
          resolve()
        } else {
          setTimeout(wait, 40)
        }
      }
      wait()
      return
    }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`
    s.async = true
    s.defer = true
    s.dataset.gmaps = '1'
    s.onload = () => {
      const wait = () => {
        if (window.google?.maps) {
          mapsLoading.value = false
          mapsLoadError.value = false
          resolve()
        } else {
          setTimeout(wait, 25)
        }
      }
      wait()
    }
    s.onerror = () => {
      mapsLoading.value = false
      mapsLoadError.value = true
      console.error('[Maps] Failed to load Google Maps JS - Check your API key, billing, and network connection')
      reject(new Error('[Maps] Failed to load Google Maps JS'))
    }
    document.head.appendChild(s)
  })
  return mapsLoadingPromise
}

// 🔁 When the drawer opens, (1) wait for DOM, (2) ensure maps, (3) init map, (4) resize
watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  try {
    await ensureMapsLoaded()
  } catch (err) {
    console.error('Failed to load Google Maps:', err)
    mapsLoadError.value = true
    return
  }
  // give CSS/transition one frame to size the container
  await new Promise(r => requestAnimationFrame(r))

  // Initialize map and markers
  try {
    await initMapAndMarkers()
  } catch (e) {
    console.error('Map init error:', e)
    mapsLoadError.value = true
  }

  // final resize "kick" in case transition is still settling
  setTimeout(() => {
    try {
      if (map && window.google?.maps?.event) {
        window.google.maps.event.trigger(map, 'resize')
      }
    } catch (e) {
      console.error('Map resize error:', e)
    }
  }, 120)
})




/* Geocode helpers */
async function getLatLngForListing(L) {
  if (!L) return null
  if (L.geo?.lat && L.geo?.lng) return { lat: L.geo.lat, lng: L.geo.lng }

  const addr = L.locationFormatted
    || (L.location
      ? `BLK ${L.location?.blk || ''} ${L.location?.street || ''} Singapore ${L.location?.postal || ''} ${L.location?.unit || ''}`.trim()
      : null)
  if (!addr) return null

  const cacheKey = `addr:${addr}`
  if (geoCache.has(cacheKey)) return geoCache.get(cacheKey)

  if (!window.google?.maps) return null
  if (!geocoder) geocoder = new window.google.maps.Geocoder()
  const res = await geocoder.geocode({ address: addr })
  const g = res?.results?.[0]?.geometry?.location
  if (!g) return null
  const pair = { lat: g.lat(), lng: g.lng() }
  geoCache.set(cacheKey, pair)

  try {
    if (props.cacheGeocode && L.listingId) {
      await updateDoc(doc(db, 'allListings', L.listingId), { geo: pair })
    }
  } catch (_) { /* ignore write errors */ }

  return pair
}

function distM(a, b) {
  const R = 6371e3
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180
  const Δφ = (b.lat - a.lat) * Math.PI / 180
  const Δλ = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

const gmapsLink = computed(() => {
  const L = active.value
  if (!L) return '#'
  const addr = L.locationFormatted
    || (L.location
      ? `BLK ${L.location?.blk || ''} ${L.location?.street || ''} Singapore ${L.location?.postal || ''} ${L.location?.unit || ''}`.trim()
      : L.businessName)
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr || L.businessName)}`
})

/* Nearby */
const nearby = ref([])
const loadingNearby = ref(false)
const errorNearby = ref('')

async function fetchNearby(centerLL, category) {
  if (!centerLL) { nearby.value = []; return }
  loadingNearby.value = true
  errorNearby.value = ''

  try {
    // Make sure Google Maps JS is available before geocoding
    if (!window.google?.maps) {
      await ensureMapsLoaded().catch(() => { })
    }

    // Query all nearby listings (no category filter)
    const qy = query(
      collection(db, 'allListings'),
      fsLimit(props.nearbyCap)
    )
    const snap = await getDocs(qy)
    const raw = snap.docs.map(d => ({ listingId: d.id, ...d.data() }))

    // Geocode all results in parallel (much faster than sequential)
    const geoPromises = raw.map(async (L) => {
      try {
        const ll = await getLatLngForListing(L)
        return ll ? { ...L, geo: ll } : null
      } catch (_) {
        return null
      }
    })
    const withGeo = (await Promise.all(geoPromises)).filter(Boolean)

    // Exclude the active listing and compute distances
    const currentId = props.listing?.listingId || props.listing?.id
    const within = withGeo
      .filter(L => (L.listingId || L.id) !== currentId)
      .map(L => ({ ...L, _distanceM: distM(centerLL, L.geo) }))
      .filter(L => Number.isFinite(L._distanceM) && L._distanceM <= (props.radiusM || 3000))
      .sort((a, b) => a._distanceM - b._distanceM)

    nearby.value = within
  } catch (e) {
    errorNearby.value = e?.message || String(e)
    nearby.value = []
  } finally {
    loadingNearby.value = false
  }
}


/* Build / refresh map + markers */
async function initMapAndMarkers() {
  if (!props.open) return
  if (!mapEl.value) return
  if (!window.google?.maps) return

  const center = await getLatLngForListing(props.listing)
  if (!center) return

  // Create or re-create map
  if (!map) {
    map = new window.google.maps.Map(mapEl.value, {
      center, zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    })
    infoWindow = new window.google.maps.InfoWindow()
  } else {
    map.setCenter(center)
  }

  // Clear markers
  markers.forEach(m => m.setMap(null))
  markers = []

  // Current listing marker
  const currentMarker = new window.google.maps.Marker({
    position: center, map,
    title: props.listing?.businessName || 'Current',
    icon: {
      path: window.google.maps.SymbolPath.CIRCLE,
      scale: 8, fillColor: '#0d6efd', fillOpacity: 1,
      strokeColor: '#fff', strokeWeight: 2
    }
  })
  markers.push(currentMarker)

  // Nearby markers
  for (const L of nearby.value) {
    const m = new window.google.maps.Marker({
      position: L.geo, map,
      title: L.businessName || 'Listing'
    })
    m.addListener('click', () => {
      active.value = L
      infoWindow.setContent(
        `<div style="font-size:13px;"><strong>${escapeHtml(L.businessName || 'Listing')}</strong><br>${escapeHtml(L.businessCategory || '')}</div>`
      )
      infoWindow.open({ map, anchor: m })
    })
    markers.push(m)
  }

  // Ensure map lays out correctly after transition
  setTimeout(() => window.google.maps.event.trigger(map, 'resize'), 50)
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]))
}

function formatDate(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return date.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
  }
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

/* Orchestration */
async function refreshAll() {
  if (!props.open || !props.listing) return

  await nextTick()                 // ensure DOM is painted
  await ensureMapsLoaded().catch(() => { })


  if (!window.google?.maps) return
  if (!geocoder) geocoder = new window.google.maps.Geocoder()

  // wait 2 frames so the sliding drawer finishes sizing the map container
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

  const center = await getLatLngForListing(props.listing)
  if (!center) return

  await fetchNearby(center, props.listing.businessCategory)
  await initMapAndMarkers()

  // keep map responsive to container size changes
  if (!resizeObs && mapEl.value) {
    resizeObs = new ResizeObserver(() => {
      try { window.google.maps.event.trigger(map, 'resize') } catch (_) { }
    })
    resizeObs.observe(mapEl.value)
  }

  // extra kick after CSS transition
  setTimeout(() => {
    try { window.google.maps.event.trigger(map, 'resize') } catch (_) { }
  }, 150)
}

/* Watchers */
watch([() => props.open, () => props.listing?.listingId], async ([isOpen]) => {
  if (isOpen) {
    active.value = props.listing || null
    await nextTick()          // wait for panel DOM
    setTimeout(refreshAll, 10)
  } else {
    // TEARDOWN (fixes "map not appearing again" on re-open)
    if (infoWindow) { try { infoWindow.close() } catch (_) { } }
    infoWindow = null
    markers.forEach(m => m.setMap(null))
    markers = []
    map = null
    // do not clear geocoder/geoCache; re-use across opens
    if (resizeObs) { try { resizeObs.disconnect() } catch (_) { } resizeObs = null }
  }
})

/* Resize */
function handleResize() { if (map && window.google?.maps) window.google.maps.event.trigger(map, 'resize') }
onMounted(() => window.addEventListener('resize', handleResize))
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  // final teardown
  if (infoWindow) { try { infoWindow.close() } catch (_) { } }
  infoWindow = null
  markers.forEach(m => m.setMap(null))
  markers = []
  map = null
  if (resizeObs) { try { resizeObs.disconnect() } catch (_) { } resizeObs = null }
})

/* ========== REVIEWS & RATING SYSTEM ========== */
const reviews = ref([])
const loadingReviews = ref(false)
const avgRating = ref(0)
const totalReviews = ref(0)
const verifiedReviews = ref(0)

// Review form state
const userRating = ref(0)
const hoverRating = ref(0)
const userReviewText = ref('')
const submittingReview = ref(false)
const reviewError = ref('')
const reviewSuccess = ref('')

// Check if user has verification via QR code scan
async function checkQRVerification(userId, listingId) {
  try {
    const usedCodesQuery = query(
      collection(db, 'usedReviewCodes'),
      where('userId', '==', userId),
      where('listingId', '==', listingId)
    )
    const usedCodesSnapshot = await getDocs(usedCodesQuery)
    return !usedCodesSnapshot.empty
  } catch (error) {
    console.error('Error checking QR verification:', error)
    return false
  }
}

// Check if user has a verified booking for this listing
async function checkBookingVerification(userId, listingId) {
  try {
    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('buyerId', '==', userId),
      where('listingId', '==', listingId),
      where('status', '==', 'accepted')
    )
    const bookingsSnapshot = await getDocs(bookingsQuery)
    return !bookingsSnapshot.empty
  } catch (error) {
    console.error('Error checking booking verification:', error)
    return false
  }
}

// Get all verification statuses for a user
async function getUserVerificationStatus(userId, listingId) {
  const [hasQRScan, hasBooking] = await Promise.all([
    checkQRVerification(userId, listingId),
    checkBookingVerification(userId, listingId)
  ])

  return {
    qrVerified: hasQRScan,
    bookingVerified: hasBooking,
    isVerified: hasQRScan || hasBooking
  }
}

// Fetch reviews for current listing
async function fetchReviews() {
  if (!props.listing?.listingId && !props.listing?.id) {
    reviews.value = []
    avgRating.value = 0
    totalReviews.value = 0
    verifiedReviews.value = 0
    return
  }

  loadingReviews.value = true
  reviewError.value = ''

  try {
    const listingId = props.listing.listingId || props.listing.id
    // console.log('[Reviews] Fetching reviews for listing:', listingId)
    const reviewsRef = collection(db, 'allListings', listingId, 'reviews')
    const q = query(reviewsRef, orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)
    // console.log('[Reviews] Found', snapshot.size, 'reviews')

    const reviewsList = []
    let totalRating = 0
    let totalWeight = 0
    let verifiedCount = 0

    for (const docSnap of snapshot.docs) {
      const reviewData = docSnap.data()

      // Fetch reviewer info
      let reviewerName = 'Anonymous'
      let reviewerAvatar = ''

      if (reviewData.userId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', reviewData.userId))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            reviewerName = userData.username || userData.displayName || 'Anonymous'
            reviewerAvatar = userData.photoURL || userData.profilePicture || ''
          }
        } catch (e) {
          console.warn('Could not fetch reviewer info:', e)
        }
      }

      reviewsList.push({
        id: docSnap.id,
        ...reviewData,
        reviewerName,
        reviewerAvatar
      })

      // Weighted rating: verified reviews count 2x, unverified count 1x
      const rating = reviewData.rating || 0
      const weight = reviewData.isVerified ? 2 : 1
      totalRating += rating * weight
      totalWeight += weight

      if (reviewData.isVerified) {
        verifiedCount++
      }
    }

    reviews.value = reviewsList
    totalReviews.value = reviewsList.length
    verifiedReviews.value = verifiedCount
    // Calculate weighted average (verified reviews count more)
    avgRating.value = totalWeight > 0 ? totalRating / totalWeight : 0

  } catch (e) {
    console.error('Failed to fetch reviews:', e)
    reviewError.value = 'Failed to load reviews.'
  } finally {
    loadingReviews.value = false
  }
}

// Submit a new review
async function submitReview() {
  reviewError.value = ''
  reviewSuccess.value = ''

  const user = auth.currentUser
  // console.log('[Reviews] Current user:', user?.uid)

  if (!user) {
    reviewError.value = 'Please log in to leave a review.'
    return
  }

  if (userRating.value === 0) {
    reviewError.value = 'Please select a star rating.'
    return
  }

  if (!userReviewText.value.trim()) {
    reviewError.value = 'Please write a review.'
    return
  }

  // Check if this is the user's own listing
  const listingUserId = props.listing?.userId
  // console.log('[Reviews] Listing owner:', listingUserId, 'Current user:', user.uid)

  if (listingUserId === user.uid) {
    reviewError.value = 'You cannot review your own listing.'
    return
  }

  submittingReview.value = true

  try {
    const listingId = props.listing.listingId || props.listing.id

    // Get user's verification status (QR scan or booking)
    const verificationStatus = await getUserVerificationStatus(user.uid, listingId)

    // console.log('[Reviews] Submitting review for listing:', listingId)
    const reviewsRef = collection(db, 'allListings', listingId, 'reviews')

    await addDoc(reviewsRef, {
      userId: user.uid,
      rating: userRating.value,
      reviewText: userReviewText.value.trim(),
      createdAt: serverTimestamp(),
      // Verification badges
      qrVerified: verificationStatus.qrVerified,
      bookingVerified: verificationStatus.bookingVerified,
      isVerified: verificationStatus.isVerified
    })

    // console.log('[Reviews] Review submitted successfully')

    // Update the seller's average rating
    await updateSellerRating(listingUserId, userRating.value)

    // Increment review count for seller for badge system
    try {
      const sellerRef = doc(db, 'users', listingUserId)
      const sellerDoc = await getDoc(sellerRef)

      if (sellerDoc.exists()) {
        const currentStats = sellerDoc.data().stats || {}
        await updateDoc(sellerRef, {
          stats: {
            ...currentStats,
            reviews: (currentStats.reviews || 0) + 1
          }
        })
      }
    } catch (statsError) {
      console.warn('Could not update seller stats:', statsError)
    }

    reviewSuccess.value = 'Review submitted successfully!'
    userRating.value = 0
    userReviewText.value = ''

    // Refresh reviews
    await fetchReviews()

    setTimeout(() => {
      reviewSuccess.value = ''
    }, 3000)

  } catch (e) {
    console.error('Failed to submit review:', e)
    reviewError.value = 'Failed to submit review. Please try again.'
  } finally {
    submittingReview.value = false
  }
}

// Update seller's overall rating
async function updateSellerRating(sellerId, newRating) {
  if (!sellerId) return

  try {
    const sellerRef = doc(db, 'users', sellerId)
    const sellerDoc = await getDoc(sellerRef)

    if (sellerDoc.exists()) {
      const data = sellerDoc.data()
      const currentRating = data.averageRating || 0
      const currentCount = data.totalReviews || 0

      const newTotalReviews = currentCount + 1
      const newAverageRating = ((currentRating * currentCount) + newRating) / newTotalReviews

      await updateDoc(sellerRef, {
        averageRating: newAverageRating,
        totalReviews: newTotalReviews
      })
    } else {
      // First review for this seller
      await updateDoc(sellerRef, {
        averageRating: newRating,
        totalReviews: 1
      })
    }
  } catch (e) {
    console.warn('Could not update seller rating:', e)
  }
}

// Watch for listing changes to fetch reviews
watch(() => props.listing?.listingId || props.listing?.id, (newId) => {
  if (newId && props.open) {
    fetchReviews()
  }
}, { immediate: true })

/* Navigate to user profile */
function goToSellerProfile(event) {
  event.stopPropagation()
  const userId = props.listing?.userId
  if (userId) {
    emit('close')
    router.push({ name: 'UserProfile', params: { userId } })
  }
}

function goToReviewerProfile(userId, event) {
  event.stopPropagation()
  if (userId) {
    emit('close')
    router.push({ name: 'UserProfile', params: { userId } })
  }
}

/* Start chat with seller */
async function startChat() {
  const user = auth.currentUser
  if (!user) {
    toast.error('Please log in to start a chat')
    router.push({ name: 'login' })
    return
  }

  const sellerId = props.listing?.userId
  if (!sellerId) {
    toast.error('Seller information not available')
    return
  }

  if (sellerId === user.uid) {
    toast.info('You cannot chat with yourself')
    return
  }

  try {
    const listingId = props.listing?.listingId || props.listing?.id
    const chatId = await startChatWithUser(user.uid, sellerId, listingId)
    emit('close')
    router.push({ name: 'chat', query: { chatId } })
  } catch (error) {
    // Silently handle errors - console filter will suppress them
    toast.error('Failed to start chat. Please try again.')
  }
}

// Fetch reviews when drawer opens
watch(() => props.open, (isOpen) => {
  if (isOpen && props.listing) {
    fetchReviews()
  } else {
    // Reset state when closing
    reviews.value = []
    avgRating.value = 0
    totalReviews.value = 0
    verifiedReviews.value = 0
    userRating.value = 0
    userReviewText.value = ''
    reviewError.value = ''
    reviewSuccess.value = ''
  }
})
</script>

<template>
  <!-- Backdrop -->
  <transition name="fade">
    <div v-if="open" class="drawer-backdrop" @click="$emit('close')" />
  </transition>

  <!-- Panel -->
  <transition name="modal-fade">
    <aside v-if="open" class="drawer-panel">
      <button class="btn-close close-btn" aria-label="Close" @click="$emit('close')" />

      <!-- Header -->
      <div class="header d-flex align-items-center gap-3 mb-3">
        <!-- Avatar -->
        <div class="rounded-circle overflow-hidden avatar seller-avatar-clickable" @click="goToSellerProfile">
          <img v-if="sellerAvatar" :src="sellerAvatar" class="w-100 h-100" style="object-fit:cover"
            alt="Seller avatar" />
          <div v-else
            class="w-100 h-100 d-flex align-items-center justify-content-center bg-secondary-subtle text-secondary fw-bold">
            {{ (sellerName || 'S').toString().trim().charAt(0).toUpperCase() }}
          </div>
        </div>

        <!-- Seller Info -->
        <div class="flex-grow-1">
          <!-- Name + socials + badge -->
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <span class="fw-semibold seller-name-clickable" @click="goToSellerProfile">
              {{ sellerName || 'Seller' }}
            </span>

            <!-- Seller badge -->
            <SellerBadge :points="listing?.sellerStats
              ? (listing.sellerStats.reviews || 0) +
              (listing.sellerStats.boosts || 0) * 5
              : 0" :progress="false" />
          </div>
        </div>

        <!-- Chat button -->
        <button class="btn btn-sm btn-outline-primary" @click="startChat" title="Chat with seller">
          <Icon icon="mdi:message-text" class="me-1" />
          Chat
        </button>

        <!-- Category badge -->
        <span class="badge text-bg-primary">
          {{ active?.businessCategory || listing?.businessCategory }}
        </span>
      </div>

      <!-- Title row -->
      <div class="title-row">
        <h3 class="mb-0 truncate listing-title">{{ active?.businessName || listing?.businessName }}</h3>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-danger" @click="openReportModal">
            <i class="fas fa-flag me-2"></i>Report
          </button>
        </div>
      </div>

      <!-- Two-column layout -->
      <div class="grid">
        <!-- Left -->
        <section class="left">
          <div class="map" ref="mapEl">
            <div v-if="mapsLoadError" class="map-fallback error">
              <div class="text-center p-4">
                <i class="fas fa-exclamation-triangle mb-2" style="font-size: 2rem; color: #dc3545;"></i>
                <p class="mb-2 fw-semibold">Map Failed to Load</p>
                <p class="small text-muted mb-0">Please check your internet connection or try refreshing the page.</p>
              </div>
            </div>
            <div v-else-if="mapsLoading" class="map-fallback">
              <div class="text-center p-4">
                <div class="spinner-border text-primary mb-2" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <p class="small text-muted mb-0">Loading map...</p>
              </div>
            </div>
            <div v-else-if="!active" class="map-fallback">Loading map…</div>
          </div>

          <div class="nearby card">
            <div class="card-body p-2">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <h6 class="m-0">Nearby Businesses</h6>
                <small class="text-muted" v-if="active">within ~{{ Math.round(radiusM / 1000) }}km</small>
              </div>

              <div v-if="loadingNearby" class="small text-muted">Loading nearby…</div>
              <div v-else-if="errorNearby" class="small text-danger">{{ errorNearby }}</div>
              <ul v-else class="list-unstyled m-0 nearby-list">
                <li v-for="n in nearby" :key="n.listingId"
                  :class="['nearby-item', { 'is-active': n.listingId === active?.listingId }]" @click="active = n">
                  <div class="d-flex align-items-center gap-2">
                    <img v-if="(n.photoUrls && n.photoUrls[0]) || (n.photos && n.photos[0]?.url)"
                      :src="n.photoUrls?.[0] || n.photos?.[0]?.url" class="thumb" alt="">
                    <div class="flex-grow-1">
                      <div class="fw-semibold small truncate">{{ n.businessName }}</div>
                      <div class="xsmall text-muted">{{ (n._distanceM / 1000).toFixed(2) }} km</div>
                    </div>
                  </div>
                </li>
                <li v-if="!nearby.length" class="small text-muted px-2 py-1">No nearby businesses found.</li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Right -->
        <section class="right">
          <!-- Gallery -->
          <div v-if="photos?.length" class="gallery mb-3">
            <img v-for="(p, i) in photos" :key="i" :src="p" class="gallery-img" :alt="`photo-${i + 1}`" />
          </div>

          <!-- Menu / Services -->
          <div v-if="active?.menu?.length" class="mb-3">
            <h6 class="section-title">Menu / Services</h6>
            <ul class="list-unstyled small m-0">
              <li v-for="(m, i) in active.menu" :key="i" class="d-flex justify-content-between border-bottom py-1">
                <span>{{ m.name }}</span>
                <strong v-if="m.price">S${{ m.price }}</strong>
              </li>
            </ul>
          </div>

          <!-- Description -->
          <div v-if="active?.businessDesc" class="mb-3">
            <h6 class="section-title">Description</h6>
            <p class="mb-0">{{ active.businessDesc }}</p>
          </div>

          <!-- Operating hours -->
          <div v-if="active?.operatingHours" class="mb-3">
            <h6 class="section-title">Operating Hours</h6>
            <div v-if="isStructuredHours(active.operatingHours)" class="oh-table small">
              <div class="oh-row" v-for="k in dayKeys" :key="k">
                <div class="oh-day">{{ DAY_LABEL[k] }}</div>
                <div class="oh-time">{{ fmt(active.operatingHours[k]) }}</div>
              </div>
            </div>
            <pre v-else class="small mb-0">{{ active.operatingHours }}</pre>
          </div>

          <!-- Location -->
          <div v-if="active?.locationFormatted || active?.location" class="mb-3">
            <h6 class="section-title">Location</h6>
            <div class="small">
              {{ active.locationFormatted ||
                `BLK ${active.location?.blk} ${active.location?.street} Singapore ${active.location?.postal}
              ${active.location?.unit || ''}` }}
            </div>
          </div>

          <!-- Booking Section -->
          <div v-if="active?.acceptsBookings" class="mb-3">
            <h6 class="section-title">Book an Appointment</h6>
            <div class="booking-info-box card p-3">
              <div class="d-flex align-items-center gap-2 mb-2">
                <i class="fas fa-calendar-check" style="color: var(--color-primary);"></i>
                <span class="fw-semibold">Online Booking Available</span>
              </div>
              <p class="small text-muted mb-2">Session Duration: {{ active.bookingDuration || 60 }} minutes</p>
              <button class="btn btn-primary w-100" @click="openBookingModal">
                <i class="fas fa-calendar-plus me-2"></i>Request Appointment
              </button>
            </div>
          </div>

          <!-- REVIEWS & RATING SECTION -->
          <div class="reviews-section mt-4">
            <div class="d-flex align-items-center justify-content-between mb-3">
              <h6 class="section-title m-0">Reviews & Ratings</h6>
              <div class="d-flex align-items-center gap-2">
                <div class="stars-display">
                  <span v-for="i in 5" :key="i" class="star" :class="{ filled: i <= Math.round(avgRating) }">★</span>
                </div>
                <span class="fw-semibold">{{ avgRating.toFixed(1) }}</span>
                <span class="text-muted small">
                  ({{ totalReviews }} {{ totalReviews === 1 ? 'review' : 'reviews' }}<template v-if="verifiedReviews > 0">, {{ verifiedReviews }} verified</template>)
                </span>
              </div>
            </div>

            <!-- Write Review Form -->
            <div class="review-form card mb-3">
              <div class="card-body p-3">
                <h6 class="mb-2">Write a Review</h6>

                <!-- Star Rating Input -->
                <div class="mb-2">
                  <label class="form-label small mb-1">Your Rating:</label>
                  <div class="stars-input" @mouseleave="hoverRating = 0">
                    <span v-for="i in 5" :key="i" class="star"
                      :class="{ filled: i <= userRating, hover: hoverRating > 0 && i <= hoverRating }"
                      @click="userRating = i" @mouseenter="hoverRating = i">★</span>
                  </div>
                </div>

                <!-- Review Text -->
                <div class="mb-2">
                  <label class="form-label small mb-1">Your Review:</label>
                  <textarea v-model="userReviewText" class="form-control form-control-sm" rows="3"
                    placeholder="Share your experience with this service..."></textarea>
                </div>

                <!-- Alerts -->
                <div v-if="reviewError" class="alert alert-danger alert-sm py-1 px-2 small mb-2">{{ reviewError }}</div>
                <div v-if="reviewSuccess" class="alert alert-success alert-sm py-1 px-2 small mb-2">{{ reviewSuccess }}
                </div>

                <!-- Submit Button -->
                <button class="btn btn-primary btn-sm w-100" :disabled="submittingReview" @click="submitReview">
                  <span v-if="!submittingReview">Submit Review</span>
                  <span v-else>
                    <span class="spinner-border spinner-border-sm me-1"></span>
                    Submitting...
                  </span>
                </button>
              </div>
            </div>

            <!-- Reviews List -->
            <div class="reviews-list">
              <div v-if="loadingReviews" class="text-center py-3">
                <div class="spinner-border spinner-border-sm"></div>
              </div>

              <div v-else-if="reviews.length === 0" class="text-muted text-center py-3 small">
                No reviews yet. Be the first to review!
              </div>

              <div v-else>
                <div v-for="review in reviews" :key="review.id" class="review-item card mb-2">
                  <div class="card-body p-3">
                    <div class="d-flex align-items-start gap-2 mb-2">
                      <!-- Reviewer Avatar -->
                      <div class="reviewer-avatar rounded-circle overflow-hidden"
                        :class="{ 'reviewer-avatar-clickable': review.userId }"
                        @click="review.userId ? goToReviewerProfile(review.userId, $event) : null">
                        <img v-if="review.reviewerAvatar" :src="review.reviewerAvatar" class="w-100 h-100"
                          style="object-fit:cover" alt="">
                        <div v-else
                          class="w-100 h-100 d-flex align-items-center justify-content-center bg-secondary-subtle text-secondary fw-bold small">
                          {{ (review.reviewerName || 'A').charAt(0).toUpperCase() }}
                        </div>
                      </div>

                      <div class="flex-grow-1">
                        <div class="d-flex align-items-center justify-content-between mb-1">
                          <div class="d-flex align-items-center gap-2">
                            <span class="fw-semibold small" :class="{ 'reviewer-name-clickable': review.userId }"
                              @click="review.userId ? goToReviewerProfile(review.userId, $event) : null">{{
                              review.reviewerName }}</span>
                            <!-- Verification Badges -->
                            <span v-if="review.qrVerified" class="badge bg-success-subtle text-success xsmall px-2 py-1" title="Verified Purchase via QR Code">
                              <Icon icon="mdi:check-decagram" class="me-1" style="font-size: 12px;" />Verified
                            </span>
                            <span v-else-if="review.bookingVerified" class="badge bg-primary-subtle text-primary xsmall px-2 py-1" title="Verified Booking">
                              <Icon icon="mdi:calendar-check" class="me-1" style="font-size: 12px;" />Verified
                            </span>
                            <span v-else class="badge bg-secondary-subtle text-secondary xsmall px-2 py-1" title="Not Verified">
                              <Icon icon="mdi:alert-circle-outline" class="me-1" style="font-size: 12px;" />Not Verified
                            </span>
                          </div>
                          <div class="stars-display-small">
                            <span v-for="i in 5" :key="i" class="star" :class="{ filled: i <= review.rating }">★</span>
                          </div>
                        </div>
                        <p class="mb-1 small">{{ review.reviewText || review.comment }}</p>
                        <span class="text-muted xsmall">{{ formatDate(review.createdAt) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </section>
      </div>

    </aside>
  </transition>

  <!-- Report Modal - Teleported to body -->
  <Teleport to="body">
    <div v-if="showReportModal" class="report-modal-backdrop" @click="closeReportModal">
      <div class="report-modal" @click.stop>
        <div class="report-modal-header">
          <h4 class="mb-0">Report Listing</h4>
          <button class="btn-close-custom" @click="closeReportModal">×</button>
        </div>

        <div class="report-modal-body">
          <p class="text-muted mb-3">Help us keep the platform safe by reporting inappropriate or fraudulent listings.
          </p>

          <div class="mb-3">
            <label class="form-label fw-semibold">Reason for Report *</label>
            <select v-model="reportReason" class="form-select">
              <option value="">-- Select a reason --</option>
              <option v-for="reason in reportReasons" :key="reason" :value="reason">{{ reason }}</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label fw-semibold">Explanation *</label>
            <textarea v-model="reportExplanation" class="form-control" rows="4"
              placeholder="Please provide details about why you're reporting this listing..."
              maxlength="500"></textarea>
            <div class="text-end text-muted small mt-1">{{ reportExplanation.length }}/500</div>
          </div>
        </div>

        <div class="report-modal-footer">
          <button class="btn btn-secondary" @click="closeReportModal" :disabled="submittingReport">Cancel</button>
          <button class="btn btn-danger" @click="submitReport" :disabled="submittingReport">
            <span v-if="submittingReport" class="spinner-border spinner-border-sm me-2"></span>
            {{ submittingReport ? 'Submitting...' : 'Submit Report' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Booking Modal - Teleported to body -->
  <Teleport to="body">
    <div v-if="showBookingModal" class="booking-modal-backdrop" @click="closeBookingModal">
      <div class="booking-modal" @click.stop>
        <div class="booking-modal-header">
          <h4 class="mb-0">Request Appointment</h4>
          <button class="btn-close-custom" @click="closeBookingModal">×</button>
        </div>

        <div class="booking-modal-body">
          <p class="text-muted mb-3">Fill in the details below to request an appointment with {{ active?.businessName
            }}.</p>

          <div class="mb-3">
            <label class="form-label fw-semibold">Preferred Date *</label>
            <VueDatePicker
              v-model="bookingDate"
              :min-date="new Date()"
              :max-date="new Date(getMaxDate())"
              :time-config="{ enableTimePicker: false }"
              :disabled-week-days="disabledWeekDays"
              :disabled-dates="isDateDisabled"
              mode-height="255"
              placeholder="Select a date"
              auto-apply
              :dark="isDarkMode"
              :clearable="false"
              format="MM/dd/yyyy"
              model-type="yyyy-MM-dd"
              :time-picker="false"
            />
            <div v-if="disabledWeekDays.length > 0" class="text-muted small mt-1">
              <i class="fas fa-info-circle me-1"></i>
              Closed days: {{ disabledWeekDays.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ') }}
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label fw-semibold">Preferred Time *</label>
            <div v-if="!bookingDate" class="text-muted small mb-2">
              <i class="fas fa-info-circle me-1"></i>
              Please select a date first
            </div>
            <div v-else-if="availableTimeSlots.length === 0" class="text-danger small mb-2">
              <i class="fas fa-exclamation-circle me-1"></i>
              No time slots available for this date
            </div>
            <div v-else class="time-slots-grid">
              <button
                v-for="slot in availableTimeSlots"
                :key="slot"
                type="button"
                class="time-slot-btn"
                :class="{ active: bookingTime === slot }"
                @click="bookingTime = slot"
              >
                {{ slot }}
              </button>
            </div>
            <div v-if="timeRestrictions && bookingDate" class="text-muted small mt-2">
              <i class="fas fa-clock me-1"></i>
              Business hours: {{ timeRestrictions.min }} - {{ timeRestrictions.max }}
              <span v-if="active.bookingDuration"> | Session: {{ active.bookingDuration }} min</span>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label fw-semibold">Message (Optional)</label>
            <textarea v-model="bookingMessage" class="form-control" rows="3"
              placeholder="Any special requests or additional information..." maxlength="300"></textarea>
            <div class="text-end text-muted small mt-1">{{ bookingMessage.length }}/300</div>
          </div>

          <div class="alert alert-info small mb-0">
            <i class="fas fa-info-circle me-2"></i>
            The seller will review your request and contact you to confirm the appointment.
          </div>
        </div>

        <div class="booking-modal-footer">
          <button class="btn btn-secondary" @click="closeBookingModal" :disabled="submittingBooking">Cancel</button>
          <button class="btn btn-primary" @click="submitBooking" :disabled="submittingBooking">
            <span v-if="submittingBooking" class="spinner-border spinner-border-sm me-2"></span>
            {{ submittingBooking ? 'Submitting...' : 'Submit Request' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .35);
  backdrop-filter: blur(1px);
  z-index: 1050;
}

.drawer-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(1200px, calc(100vw - 4rem));
  max-height: calc(100vh - 4rem);
  background: var(--color-bg-main);
  color: var(--color-text-primary);
  z-index: 1060;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  padding: 32px 40px;
  padding-top: 70px;
  /* Space for close button */
  overflow-y: auto;
  border-radius: 20px;
}

/* Tablet - slightly smaller */
@media (max-width: 991.98px) {
  .drawer-panel {
    width: calc(100vw - 2rem);
    max-height: calc(100vh - 2rem);
    padding: 24px 28px;
    padding-top: 65px;
  }
}

/* Mobile responsive - full screen on small devices */
@media (max-width: 767.98px) {
  .drawer-panel {
    width: 100vw;
    max-height: 100vh;
    border-radius: 0;
    top: 0;
    left: 0;
    transform: none;
    padding: 20px 16px;
    padding-top: 60px;
  }
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  filter: invert(var(--btn-close-invert, 0));
}

:root.dark-mode .close-btn {
  --btn-close-invert: 1;
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

.header {
  padding-right: 20px;
  /* Extra space so badge doesn't touch close button */
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.header .avatar {
  width: 48px;
  height: 48px;
  border: 2px solid var(--color-border);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.listing-title {
  color: var(--color-text-primary);
  font-size: 1.75rem;
  font-weight: 700;
  flex: 1;
  min-width: 0;
  /* Allow truncation */
}

@media (max-width: 767.98px) {
  .listing-title {
    font-size: 1.5rem;
  }

  .title-row .btn {
    font-size: 0.875rem;
    padding: 0.5rem 0.875rem;
  }
}

.truncate {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
}

@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

.left .map {
  width: 100%;
  height: 400px;
  border-radius: 16px;
  min-height: 320px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  margin-bottom: 16px;
}

.map-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: .9rem;
}

.nearby {
  background: var(--color-bg-white);
  color: var(--color-text-primary);
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.nearby h6 {
  color: var(--color-text-primary);
  font-size: 1rem;
}

.nearby .nearby-list {
  max-height: 280px;
  overflow: auto;
}

.nearby-item {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
}

.nearby-item:hover {
  background: var(--color-bg-purple-tint);
  border-color: var(--color-border);
}

.nearby-item.is-active {
  background: var(--color-bg-purple-tint);
  border-color: var(--color-primary-pale);
}

.nearby-item .fw-semibold {
  color: var(--color-text-primary);
}

.thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--color-border);
}

.xsmall {
  font-size: .8rem;
  color: var(--color-text-secondary);
}

.section-title {
  color: var(--color-text-primary);
  margin-bottom: 0.75rem;
  font-weight: 600;
  font-size: 1rem;
}

.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.gallery-img {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  transition: transform 0.2s ease;
  cursor: pointer;
}

.gallery-img:hover {
  transform: scale(1.02);
}

.oh-table {
  display: grid;
  gap: 6px;
}

.oh-row {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px dashed var(--color-border);
  padding-bottom: 4px;
}

.oh-day {
  width: 64px;
  color: var(--color-text-secondary);
}

.oh-time {
  font-weight: 600;
  color: var(--color-text-primary);
}

/* Booking Info Box */
.booking-info-box {
  background: var(--color-bg-purple-tint);
  border: 2px solid var(--color-primary-pale);
  transition: all 0.2s ease;
}

.booking-info-box:hover {
  border-color: var(--color-primary-lighter);
  box-shadow: var(--shadow-sm);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity .18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modal fade and scale animation */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all .25s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}

.modal-fade-enter-to,
.modal-fade-leave-from {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

/* Mobile - slide up from bottom */
@media (max-width: 767.98px) {

  .modal-fade-enter-from,
  .modal-fade-leave-to {
    opacity: 0;
    transform: translateY(100%);
  }

  .modal-fade-enter-to,
  .modal-fade-leave-from {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Reviews & Rating Styles */
.reviews-section {
  border-top: 2px solid var(--color-border);
  padding-top: 20px;
}

.stars-display .star,
.stars-display-small .star,
.stars-input .star {
  color: #ddd;
  font-size: 20px;
  transition: color 0.2s ease;
}

.stars-display-small .star {
  font-size: 14px;
}

.stars-display .star.filled,
.stars-display-small .star.filled {
  color: #ffc107 !important;
}

/* Dark mode for display stars */
:root.dark-mode .stars-display .star,
:root.dark-mode .stars-display-small .star {
  color: #666;
}

:root.dark-mode .stars-display .star.filled,
:root.dark-mode .stars-display-small .star.filled {
  color: #ffc107 !important;
}

.stars-input {
  display: flex;
  gap: 4px;
  cursor: pointer;
}

.stars-input .star {
  font-size: 28px;
  transition: all 0.2s ease;
  color: #ddd;
  cursor: pointer;
}

.stars-input .star:hover,
.stars-input .star.hover {
  color: #ffc107 !important;
  transform: scale(1.1);
}

.stars-input .star.filled {
  color: #ffc107 !important;
}

/* Dark mode star visibility */
:root.dark-mode .stars-input .star {
  color: #666;
}

:root.dark-mode .stars-input .star:hover,
:root.dark-mode .stars-input .star.hover,
:root.dark-mode .stars-input .star.filled {
  color: #ffc107 !important;
}

.review-form {
  background: var(--color-bg-purple-tint);
  border: 1px solid var(--color-border);
}

.review-form .card-body h6 {
  color: var(--color-text-primary);
  font-size: 0.95rem;
}

.review-form .form-label {
  color: var(--color-text-primary);
}

.review-form .form-control {
  background-color: var(--color-bg-white);
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.review-form .form-control::placeholder {
  color: var(--color-text-light);
}

.review-item {
  border: 1px solid var(--color-border);
  background: var(--color-bg-white);
  transition: box-shadow 0.2s ease;
  color: var(--color-text-primary);
}

.review-item .fw-semibold {
  color: var(--color-text-primary) !important;
}

.review-item .text-muted {
  color: var(--color-text-secondary) !important;
}

.review-item .small {
  color: var(--color-text-secondary);
}

.review-item p {
  color: var(--color-text-primary) !important;
}

.review-item:hover {
  box-shadow: var(--shadow-sm);
}

/* Verification badge dark mode styles */
:root.dark-mode .bg-success-subtle {
  background-color: rgba(25, 135, 84, 0.2) !important;
}

:root.dark-mode .text-success {
  color: #4ade80 !important;
}

:root.dark-mode .bg-primary-subtle {
  background-color: rgba(102, 126, 234, 0.2) !important;
}

:root.dark-mode .text-primary {
  color: var(--color-primary) !important;
}

.reviewer-avatar {
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  flex-shrink: 0;
}

.reviews-list {
  max-height: 500px;
  overflow-y: auto;
}

.alert-sm {
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.seller-name-clickable {
  cursor: pointer;
  transition: color 0.2s ease;
}

.seller-name-clickable:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

.seller-avatar-clickable {
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.seller-avatar-clickable:hover {
  transform: scale(1.05);
}

.reviewer-name-clickable {
  cursor: pointer;
  transition: color var(--transition-fast);
}

.reviewer-name-clickable:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

.reviewer-avatar-clickable {
  cursor: pointer;
  transition: transform 0.2s ease;
}

.reviewer-avatar-clickable:hover {
  transform: scale(1.05);
}

/* Text and Background Utilities */
.text-muted {
  color: var(--color-text-secondary) !important;
}

.bg-secondary-subtle {
  background: var(--color-bg-purple-tint) !important;
}

.text-secondary {
  color: var(--color-text-secondary) !important;
}

h4,
h5,
h6 {
  color: var(--color-text-primary);
}

.form-control,
.form-select,
textarea {
  background: var(--color-bg-white);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.form-control:focus,
.form-select:focus,
textarea:focus {
  background: var(--color-bg-white);
  border-color: var(--color-primary);
  color: var(--color-text-primary);
}

.form-control::placeholder,
textarea::placeholder {
  color: var(--color-text-secondary);
}

/* Report Modal Styles */
.report-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.report-modal {
  background: var(--color-bg-white);
  border-radius: 16px;
  width: 100%;
  max-width: 540px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: modalSlideIn 0.3s ease-out;
}

.report-modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.report-modal-header h4 {
  color: var(--color-text-primary);
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.btn-close-custom {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
}

.btn-close-custom:hover {
  background: var(--color-bg-purple-tint);
  color: var(--color-text-primary);
}

.report-modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.report-modal-body .form-label {
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.report-modal-body .form-select,
.report-modal-body .form-control {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.625rem 0.875rem;
  font-size: 0.95rem;
}

.report-modal-body .form-select:focus,
.report-modal-body .form-control:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(138, 116, 249, 0.1);
}

.report-modal-body textarea {
  resize: vertical;
  min-height: 100px;
}

.report-modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.report-modal-footer .btn {
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.report-modal-footer .btn-secondary {
  background: var(--color-bg-purple-tint);
  color: var(--color-text-primary);
}

.report-modal-footer .btn-secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.report-modal-footer .btn-danger {
  background: #dc3545;
  color: white;
}

.report-modal-footer .btn-danger:hover:not(:disabled) {
  background: #c82333;
}

.report-modal-footer .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Booking Modal Styles */
.booking-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.booking-modal {
  background: var(--color-bg-white);
  border-radius: 16px;
  width: 100%;
  max-width: 540px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  animation: modalSlideIn 0.3s ease-out;
}

.booking-modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.booking-modal-header h4 {
  color: var(--color-text-primary);
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.booking-modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  overflow-x: visible; /* Allow dropdown to extend outside */
  flex: 1;
}

.booking-modal-body .form-label {
  color: var(--color-text-primary);
  font-size: 0.9rem;
}

.booking-modal-body .form-control {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.625rem 0.875rem;
  font-size: 0.95rem;
}

.booking-modal-body .form-control:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(138, 116, 249, 0.1);
}

.booking-modal-body textarea {
  resize: vertical;
  min-height: 80px;
}

.booking-modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.booking-modal-footer .btn {
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.booking-modal-footer .btn-secondary {
  background: var(--color-bg-purple-tint);
  color: var(--color-text-primary);
}

.booking-modal-footer .btn-secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.booking-modal-footer .btn-primary {
  background: var(--color-primary);
  color: white;
}

.booking-modal-footer .btn-primary:hover:not(:disabled) {
  background: var(--color-primary-lighter);
}

.booking-modal-footer .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* VueDatePicker custom styling */
.booking-modal :deep(.dp__input_wrap) {
  width: 100%;
}

.booking-modal :deep(.dp__input) {
  border-radius: 8px;
  border: 1px solid var(--color-border);
  padding: 0.625rem 3.5rem 0.625rem 0.75rem;
  font-size: 0.95rem;
  width: 100%;
}

.booking-modal :deep(.dp__input_icon) {
  right: 2.5rem;
  left: auto;
}

.booking-modal :deep(.dp__clear_icon) {
  right: 0.75rem;
  left: auto;
}

.booking-modal :deep(.dp__input:focus) {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: 0 0 0 3px rgba(106, 90, 248, 0.1);
}

.booking-modal :deep(.dp__disabled) {
  opacity: 0.3;
  text-decoration: line-through;
  background-color: #f5f5f5 !important;
  color: #999 !important;
  cursor: not-allowed !important;
}

:root.dark-mode .booking-modal :deep(.dp__disabled) {
  background-color: #2a2a2a !important;
  color: #666 !important;
}

/* Hide time picker in calendar */
.booking-modal :deep(.dp__time_input),
.booking-modal :deep(.dp__time_col) {
  display: none !important;
}

/* Dark mode adaptations */
:root.dark-mode .booking-modal :deep(.dp__input) {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border-color: #444;
}

:root.dark-mode .booking-modal :deep(.dp__input::placeholder) {
  color: #aaa;
}

/* Dark mode fix for alert-info */
:root.dark-mode .booking-modal .alert-info {
  background-color: rgba(13, 202, 240, 0.15) !important;
  border-color: rgba(13, 202, 240, 0.3) !important;
  color: #9ed9f0 !important;
}

:root.dark-mode .booking-modal .alert-info .fa-info-circle {
  color: #9ed9f0 !important;
}

/* Dark mode for select dropdown */
:root.dark-mode .booking-modal .form-select {
  background-color: #2d2d2d !important;
  color: #ffffff !important;
  border-color: #404040 !important;
  /* Force browser to use our colors */
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ffffff' d='M6 9L1 4h10z'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 12px;
  padding-right: 2.5rem;
}

:root.dark-mode .booking-modal .form-select:focus {
  background-color: #2d2d2d !important;
  color: #ffffff !important;
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 3px rgba(106, 90, 248, 0.1) !important;
}

:root.dark-mode .booking-modal .form-select option {
  background-color: #2d2d2d !important;
  color: #ffffff !important;
  padding: 8px;
}

:root.dark-mode .booking-modal .form-select option:hover {
  background-color: #3d3d3d !important;
}

/* Time Slots Grid - Calendar Style */
.time-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
  background: var(--color-bg-main);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.time-slot-btn {
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  background: var(--color-bg-white);
  color: var(--color-text-primary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
  text-align: center;
}

.time-slot-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-pale);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.time-slot-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.time-slot-btn.active:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

/* Dark mode time slots */
:root.dark-mode .time-slots-grid {
  background: #1a1a1a;
  border-color: #404040;
}

:root.dark-mode .time-slot-btn {
  background: #2d2d2d;
  border-color: #404040;
  color: #ffffff;
}

:root.dark-mode .time-slot-btn:hover {
  border-color: var(--color-primary);
  background: #3d3348;
}

:root.dark-mode .time-slot-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Ensure select dropdown opens downward */
.booking-modal .form-select {
  position: relative;
}

.booking-modal-body .mb-3:has(.form-select) {
  position: relative;
  z-index: 1;
}

@keyframes modalSlideIn {
  from {
    transform: translateY(-50px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Mobile Responsive Styles */
@media (max-width: 767.98px) {
  .drawer-panel {
    padding: 16px;
    width: 100vw;
    border-radius: 0;
  }

  /* Fix header badge positioning - move below on mobile */
  .header {
    flex-wrap: wrap;
  }

  .header .badge {
    order: 3;
    width: 100%;
    margin-top: 0.5rem;
    text-align: center;
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
  }

  /* Mobile time slots - adjust grid for smaller screens */
  .time-slots-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
    padding: 8px;
  }

  .time-slot-btn {
    padding: 10px 12px;
    font-size: 0.85rem;
  }

  /* Fix Google Maps button - center and resize */
  .d-flex.align-items-center.justify-content-between {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 0.75rem;
  }

  .btn-outline-primary {
    width: 100%;
    text-align: center;
    padding: 0.6rem 1rem;
    font-size: 0.85rem;
  }

  /* Fix reviews display - single row */
  .reviews-section .d-flex.align-items-center.justify-content-between {
    flex-direction: row !important;
    align-items: center !important;
  }

  .reviews-section .d-flex.align-items-center.gap-2 {
    flex-wrap: nowrap;
    gap: 0.35rem !important;
  }

  .stars-display .star {
    font-size: 14px;
  }

  .reviews-section .fw-semibold {
    font-size: 0.9rem;
  }

  .reviews-section .text-muted.small {
    font-size: 0.75rem;
    white-space: nowrap;
  }

  /* Report Modal Styles */
  .report-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
    z-index: 1070;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .report-modal {
    background: var(--color-bg-white);
    border-radius: 16px;
    width: 100%;
    max-width: 500px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .report-modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .report-modal-header h4 {
    color: var(--color-text-primary);
    font-size: 1.25rem;
    font-weight: 600;
  }

  .btn-close-custom {
    background: none;
    border: none;
    font-size: 2rem;
    line-height: 1;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
  }

  .btn-close-custom:hover {
    background: var(--color-bg-purple-tint);
    color: var(--color-primary);
  }

  .report-modal-body {
    padding: 1.5rem;
    overflow-y: auto;
  }

  .report-modal-body .form-label {
    color: var(--color-text-primary);
    margin-bottom: 0.5rem;
  }

  .report-modal-body .form-select,
  .report-modal-body .form-control {
    background: var(--color-bg-white);
    border: 2px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: 8px;
    padding: 0.75rem;
    transition: border-color 0.2s ease;
  }

  .report-modal-body .form-select:focus,
  .report-modal-body .form-control:focus {
    border-color: var(--color-primary);
    outline: none;
    box-shadow: 0 0 0 3px rgba(75, 42, 166, 0.1);
  }

  .report-modal-body textarea {
    resize: vertical;
    min-height: 100px;
  }

  .report-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .report-modal-footer .btn {
    padding: 0.625rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  .report-modal-footer .btn-secondary {
    background: var(--color-bg-purple-tint);
    color: var(--color-text-primary);
    border: 2px solid var(--color-border);
  }

  .report-modal-footer .btn-secondary:hover:not(:disabled) {
    background: var(--color-bg-white);
    border-color: var(--color-primary);
  }

  .report-modal-footer .btn-danger {
    background: #dc3545;
    color: white;
    border: none;
  }

  .report-modal-footer .btn-danger:hover:not(:disabled) {
    background: #c82333;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
  }

  .report-modal-footer .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 767.98px) {
    .report-modal {
      max-width: calc(100vw - 2rem);
      max-height: calc(100vh - 2rem);
    }

    .report-modal-header,
    .report-modal-body,
    .report-modal-footer {
      padding: 1rem;
    }

    .report-modal-footer {
      flex-direction: column;
    }

    .report-modal-footer .btn {
      width: 100%;
    }
  }

  /* Better spacing */
  .section-title {
    font-size: 0.95rem;
    margin-bottom: 0.5rem;
  }

  .gallery {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 6px;
  }

  .map {
    height: 280px !important;
  }

  /* Review form */
  .review-form .card-body {
    padding: 0.85rem !important;
  }

  .stars-input .star {
    font-size: 24px;
  }

  /* Nearby items */
  .nearby-list {
    max-height: 200px !important;
  }

  .thumb {
    width: 36px;
    height: 36px;
  }
}

@media (max-width: 575.98px) {
  .drawer-panel {
    padding: 12px;
  }

  .close-btn {
    top: 8px;
    right: 8px;
  }

  .header .avatar {
    width: 36px;
    height: 36px;
  }

  h4 {
    font-size: 1.1rem;
  }

  h6 {
    font-size: 0.9rem;
  }

  .section-title {
    font-size: 0.85rem;
  }

  .btn-outline-primary {
    font-size: 0.8rem;
    padding: 0.5rem 0.85rem;
  }

  .gallery {
    grid-template-columns: repeat(2, 1fr);
  }

  .map {
    height: 240px !important;
  }

  .stars-display .star {
    font-size: 12px;
  }

  .reviews-section .fw-semibold {
    font-size: 0.85rem;
  }

  .reviews-section .text-muted.small {
    font-size: 0.7rem;
  }
}
</style>
