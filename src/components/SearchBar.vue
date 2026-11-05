<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'

const emit = defineEmits(['search'])

const searchQuery = ref('')
const locationQuery = ref('')
const showLocationDropdown = ref(false)
const locationSuggestions = ref([])
const searchTimeout = ref(null)

// Singapore Planning Areas organized by region
const singaporeRegions = {
  'Central': ['Bishan', 'Bukit Merah', 'Bukit Timah', 'Central Area', 'Geylang', 'Kallang', 'Marine Parade', 'Queenstown', 'Toa Payoh'],
  'East': ['Bedok', 'Pasir Ris', 'Tampines'],
  'North': ['Ang Mo Kio', 'Sembawang', 'Woodlands', 'Yishun'],
  'North-East': ['Hougang', 'Punggol', 'Sengkang', 'Serangoon'],
  'West': ['Bukit Batok', 'Bukit Panjang', 'Choa Chu Kang', 'Clementi', 'Jurong East', 'Jurong West']
}

// Flatten for searching
const singaporePlanningAreas = Object.values(singaporeRegions).flat().sort()

// Watch for location input changes and fetch suggestions
watch(locationQuery, async (newVal) => {
  if (searchTimeout.value) clearTimeout(searchTimeout.value)

  if (!newVal || newVal.length < 2) {
    locationSuggestions.value = singaporePlanningAreas.slice(0, 10)
    return
  }

  // Debounce API calls
  searchTimeout.value = setTimeout(async () => {
    await fetchLocationSuggestions(newVal)
  }, 300)
})

async function fetchLocationSuggestions(query) {
  try {
    // Use OneMap API for geocoding
    const response = await fetch(
      `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=N&getAddrDetails=Y&pageNum=1`
    )
    const data = await response.json()

    if (data.results && data.results.length > 0) {
      // Extract unique addresses/locations
      const uniqueLocations = [...new Set(
        data.results.map(r => {
          // Try to extract the area/town name
          const roadName = r.ROAD_NAME || ''
          const building = r.BUILDING || ''
          return building || roadName
        }).filter(Boolean)
      )].slice(0, 8)

      locationSuggestions.value = uniqueLocations
    } else {
      // Fallback to planning areas that match
      const filtered = singaporePlanningAreas.filter(area =>
        area.toLowerCase().includes(query.toLowerCase())
      )
      locationSuggestions.value = filtered.slice(0, 10)
    }
  } catch (error) {
    console.error('Error fetching location suggestions:', error)
    // Fallback to local filtering
    const filtered = singaporePlanningAreas.filter(area =>
      area.toLowerCase().includes(query.toLowerCase())
    )
    locationSuggestions.value = filtered.slice(0, 10)
  }
}

const filteredLocations = computed(() => {
  return locationSuggestions.value.length > 0
    ? locationSuggestions.value
    : singaporePlanningAreas.slice(0, 10)
})

function selectLocation(location) {
  locationQuery.value = location
  showLocationDropdown.value = false
  handleSearch(new Event('submit'))
}

function handleSearch(e) {
  e.preventDefault()
  showLocationDropdown.value = false
  emit('search', {
    business: searchQuery.value.trim(),
    location: locationQuery.value.trim()
  })
}

function handleLocationFocus() {
  showLocationDropdown.value = true
  if (locationSuggestions.value.length === 0) {
    locationSuggestions.value = singaporePlanningAreas.slice(0, 10)
  }
}

function handleLocationBlur() {
  // Delay to allow click on dropdown item
  setTimeout(() => {
    showLocationDropdown.value = false
  }, 200)
}
</script>

<template>
  <div class="search mt-2">
    <form class="d-flex align-items-center gap-3" role="search" @submit="handleSearch">
      <div class="input-with-icon">
        <Icon icon="mdi:magnify" class="input-icon" />
        <input
          class="home-business form-control"
          type="search"
          placeholder="Search for a home business"
          aria-label="Search"
          v-model="searchQuery"
        />
      </div>
      <div class="location-dropdown-wrapper">
        <div class="input-with-icon">
          <Icon icon="mdi:map-marker" class="input-icon" />
          <input
            class="location-search form-control"
            type="search"
            placeholder="Search location"
            aria-label="Search Location"
            v-model="locationQuery"
            @focus="handleLocationFocus"
            @blur="handleLocationBlur"
            autocomplete="off"
          />
        </div>
        <div v-if="showLocationDropdown" class="location-dropdown">
          <!-- Show API suggestions if available and user typed something -->
          <div v-if="locationQuery && locationSuggestions.length > 0">
            <div class="dropdown-header">Search Results</div>
            <div
              v-for="location in locationSuggestions"
              :key="location"
              class="location-item"
              @click="selectLocation(location)"
            >
              <Icon icon="mdi:map-marker" class="location-icon" /> {{ location }}
            </div>
          </div>

          <!-- Show categorized regions when no search or as fallback -->
          <div v-else>
            <div v-for="(areas, region) in singaporeRegions" :key="region" class="region-group">
              <div class="dropdown-header">{{ region }}</div>
              <div
                v-for="area in areas"
                :key="area"
                class="location-item"
                @click="selectLocation(area)"
              >
                <Icon icon="mdi:map-marker" class="location-icon" /> {{ area }}
              </div>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-search" type="submit">Search</button>
    </form>
  </div>
</template>



<style scoped>
.search form {
  width: 100%;
}

.input-with-icon {
  position: relative;
  flex: 1;
  min-width: 0;
}

.input-icon {
  position: absolute;
  left: 15px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 20px;
  color: var(--color-text-secondary);
  pointer-events: none;
  z-index: 1;
}

.home-business {
  width: 100%;
  padding: 15px 15px 15px 45px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-bg-white);
  color: var(--color-text-primary);
  transition: border-color 0.3s ease;
  height: 52px;
}

.home-business::placeholder {
  color: var(--color-text-secondary);
}

.home-business:focus {
  border-color: var(--color-primary);
  outline: none;
}

.home-business:focus ~ .input-icon,
.location-search:focus ~ .input-icon {
  color: var(--color-primary);
}

.location-dropdown-wrapper {
  position: relative;
  flex: 0 0 auto;
  width: 280px;
}

.location-search {
  width: 100%;
  padding: 15px 15px 15px 45px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  background: var(--color-bg-white);
  color: var(--color-text-primary);
  transition: border-color var(--transition-normal);
  height: 52px;
}

.location-search::placeholder {
  color: var(--color-text-secondary);
}

.location-search:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: var(--focus-ring);
}

.location-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-bg-white);
  border: 2px solid var(--color-primary);
  border-radius: 8px;
  max-height: 400px;
  overflow-y: auto;
  z-index: 1000;
  box-shadow: var(--shadow-lg);
}

.dropdown-header {
  padding: 8px 15px;
  background: var(--color-bg-purple-tint);
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: sticky;
  top: 0;
  z-index: 1;
  border-bottom: 1px solid var(--color-border);
}

.region-group:not(:last-child) {
  border-bottom: 2px solid var(--color-border);
}

.location-item {
  padding: 12px 15px;
  padding-left: 25px;
  cursor: pointer;
  color: var(--color-text-primary);
  transition: all 0.2s ease;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 8px;
}

.location-item:last-child {
  border-bottom: none;
}

.location-item:hover {
  background-color: var(--color-bg-purple-tint);
  color: var(--color-primary);
  padding-left: 30px;
}

.location-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.btn-search {
  flex: 0 0 auto;
  color: white;
  background-color: var(--color-primary);
  padding: 0 40px;
  height: 52px;
  transition: all var(--transition-fast);
  border: none;
  font-weight: 600;
  border-radius: 12px;
  white-space: nowrap;
}

.btn-search:hover {
  background-color: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-search:active {
  transform: translateY(0);
}

.search {
  animation: slideDown 0.4s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive */
@media (max-width: 768px) {
  .search form {
    flex-wrap: wrap;
    gap: 0.75rem !important;
  }

  .input-with-icon {
    width: 100%;
    flex: 1 1 100%;
  }

  .home-business {
    height: 48px;
    padding: 12px 12px 12px 42px;
  }

  .location-dropdown-wrapper {
    width: 100%;
    flex: 1 1 100%;
  }

  .location-search {
    height: 48px;
    padding: 12px 12px 12px 42px;
  }

  .input-icon {
    left: 12px;
    font-size: 18px;
  }

  .btn-search {
    width: 100%;
    flex: 1 1 100%;
    height: 48px;
    padding: 0 20px;
  }
}

@media (max-width: 575.98px) {
  .search form {
    gap: 0.5rem !important;
  }

  .home-business,
  .location-search {
    height: 44px;
    padding: 10px 10px 10px 10px;
    padding-left: 40px !important;
    font-size: 0.875rem;
  }

  .input-icon {
    left: 12px;
    font-size: 16px;
  }

  .btn-search {
    height: 44px;
    font-size: 0.875rem;
  }

  .home-business::placeholder,
  .location-search::placeholder {
    font-size: 0.8rem;
  }
}
</style>