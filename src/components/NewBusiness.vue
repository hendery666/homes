<script>
import { addDoc, collection, doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { auth, db, storage } from '@/firebase'
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { Icon } from '@iconify/vue';
import { useDarkMode } from '@/composables/useDarkMode'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'
import { generateReviewCode } from '@/utils/reviewCode'

export default {
  name: 'CreateListing',
  components: {},

  setup() {
    // Initialize dark mode
    useDarkMode()
    const route = useRoute()
    const router = useRouter()
    const toast = useToast()
    return { route, router, toast }
  },

  data() {
    return {
      editMode: false,
      editingListingId: null,
      businessName: '',
      businessDesc: '',
      businessCategory: '',
      locationBlk: '',
      locationStreet: '',
      locationPostal: '',
      locationUnit: '',
      isLanded: false,

      photos: [],
      existingPhotoUrls: [], // For edit mode - existing photos
      isDragging: false,
      photoError: '',
      menuItems: [{ name: '', price: '', image: null, imagePreview: '' }],

      // Weekly operating hours
      operatingHours: {
        monday: { enabled: true, start: '09:00', end: '17:00' },
        tuesday: { enabled: true, start: '09:00', end: '17:00' },
        wednesday: { enabled: true, start: '09:00', end: '17:00' },
        thursday: { enabled: true, start: '09:00', end: '17:00' },
        friday: { enabled: true, start: '09:00', end: '17:00' },
        saturday: { enabled: true, start: '09:00', end: '17:00' },
        sunday: { enabled: true, start: '09:00', end: '17:00' }
      },

      addrError: '',
      addrWarning: '',
      validatingAddress: false,
      validationTimeout: null,

      // Loading state for creating listing
      isCreatingListing: false,

      // Success modal
      showSuccessModal: false,
      createdListingId: null,

      // Booking system
      acceptsBookings: false,
      bookingDuration: 60, // default 1 hour in minutes
      availableSlots: {
        mon: { enabled: false, start: '09:00', end: '17:00' },
        tue: { enabled: false, start: '09:00', end: '17:00' },
        wed: { enabled: false, start: '09:00', end: '17:00' },
        thu: { enabled: false, start: '09:00', end: '17:00' },
        fri: { enabled: false, start: '09:00', end: '17:00' },
        sat: { enabled: false, start: '09:00', end: '17:00' },
        sun: { enabled: false, start: '09:00', end: '17:00' }
      }
    }
  },

  computed: {
    isFoodCategory() { return this.businessCategory === 'Food and Drinks' },
    listLabel() { return this.isFoodCategory ? 'Menu' : 'Services' },
    addItemBtnText() { return this.isFoodCategory ? 'Add Item' : 'Add Service' },
    itemNamePlaceholder() { return this.isFoodCategory ? 'Item name' : 'Service name' },
    pricePlaceholder() { return this.isFoodCategory ? 'Price' : 'Price / Rate' },
    emptyLineAlertText() {
      return this.isFoodCategory
        ? 'Please ensure each menu item has a name and price.'
        : 'Please ensure each service has a name and price.'
    },
    orderedAvailableSlots() {
      // Return days in correct order: Mon, Tue, Wed, Thu, Fri, Sat, Sun
      const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
      return order.map(key => ({
        key,
        data: this.availableSlots[key],
        label: key === 'mon' ? 'Monday' : key === 'tue' ? 'Tuesday' : key === 'wed' ? 'Wednesday' :
          key === 'thu' ? 'Thursday' : key === 'fri' ? 'Friday' : key === 'sat' ? 'Saturday' : 'Sunday'
      }))
    }
  },

  watch: {
    locationBlk() { this.triggerValidation() },
    locationStreet() { this.triggerValidation() },
    isLanded(newVal) {
      // Clear/normalize unit when toggling formats, then re-validate
      if (newVal) this.locationUnit = ''
      this.triggerValidation()
    },

    // Sync booking hours from operating hours whenever operating hours change
    operatingHours: {
      handler(newHours) {
        const dayMap = {
          monday: 'mon', tuesday: 'tue', wednesday: 'wed',
          thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun'
        }

        Object.keys(dayMap).forEach(fullDay => {
          const shortDay = dayMap[fullDay]
          const opHours = newHours[fullDay]

          if (opHours && opHours.enabled) {
            // Sync the start and end times from operating hours
            this.availableSlots[shortDay].start = opHours.start
            this.availableSlots[shortDay].end = opHours.end
          }
        })
      },
      deep: true
    }
  },

  async mounted() {
    // Check if we're in edit mode
    const editId = this.route.query.edit
    if (editId) {
      this.editMode = true
      this.editingListingId = editId
      await this.loadListingForEdit(editId)
    }
  },

  methods: {
    async loadListingForEdit(listingId) {
      try {
        const listingDoc = await getDoc(doc(db, 'allListings', listingId))
        if (!listingDoc.exists()) {
          this.toast.error('Listing not found')
          this.router.push('/profile?tab=my')
          return
        }

        const data = listingDoc.data()

        // Check if current user owns this listing
        if (data.userId !== auth.currentUser?.uid) {
          this.toast.error('You can only edit your own listings')
          this.router.push('/profile?tab=my')
          return
        }

        // Populate form fields
        this.businessName = data.businessName || ''
        this.businessDesc = data.businessDesc || ''
        this.businessCategory = data.businessCategory || ''

        // Location
        if (data.location) {
          this.locationBlk = data.location.blk || ''
          this.locationStreet = data.location.street || ''
          this.locationPostal = data.location.postal || ''
          this.locationUnit = data.location.unit || ''
          this.isLanded = data.location.isLanded || false
        }

        // Photos
        this.existingPhotoUrls = data.photoUrls || data.photos?.map(p => p.url) || []

        // Menu items
        if (data.menu && data.menu.length > 0) {
          this.menuItems = data.menu.map(item => ({
            name: item.name || '',
            price: item.price || '',
            image: null,
            imagePreview: item.imageUrl || ''
          }))
        }

        // Operating hours - convert from stored format to form format
        if (data.operatingHours) {
          const dayMap = {
            mon: 'monday', tue: 'tuesday', wed: 'wednesday',
            thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday'
          }
          Object.keys(dayMap).forEach(key => {
            const fullDay = dayMap[key]
            const hours = data.operatingHours[key]
            if (hours) {
              if (hours.closed) {
                this.operatingHours[fullDay] = { enabled: false, start: '09:00', end: '17:00' }
              } else {
                this.operatingHours[fullDay] = {
                  enabled: true,
                  start: hours.open || '09:00',
                  end: hours.close || '17:00'
                }
              }
            }
          })
        }

        // Booking system
        this.acceptsBookings = data.acceptsBookings || false
        this.bookingDuration = data.bookingDuration || 60

        if (data.availableSlots) {
          this.availableSlots = data.availableSlots
        }

      } catch (error) {
        console.error('Error loading listing:', error)
        this.toast.error('Failed to load listing for editing')
        this.router.push('/profile?tab=my')
      }
    },


    /* ---------- Photos ---------- */
    openFilePicker() { this.$refs.photoInput?.click() },
    onPhotoPicked(e) {
      const files = Array.from(e.target.files || [])
      const ok = ['image/jpeg', 'image/png', 'image/webp']
      files.forEach(f => {
        if (!ok.includes(f.type)) return
        this.photos.push({ file: f, url: URL.createObjectURL(f) })
      })
      e.target.value = ''
      if (this.photos.length > 0) this.photoError = ''
    },
    onDrop(e) {
      e.preventDefault()
      this.isDragging = false
      this.onPhotoPicked({ target: { files: e.dataTransfer.files } })
    },
    onDragOver(e) { e.preventDefault(); this.isDragging = true },
    onDragLeave() { this.isDragging = false },
    removePhoto(i) {
      const p = this.photos[i]; if (p?.url) URL.revokeObjectURL(p.url)
      this.photos.splice(i, 1)
      if (this.photos.length === 0) this.photoError = 'Please upload at least 1 photo.'
    },

    /* ---------- Menu/Services ---------- */
    addMenuItem() { this.menuItems.push({ name: '', price: '', image: null, imagePreview: '' }) },
    removeMenuItem(i) {
      if (this.menuItems.length > 1) {
        const item = this.menuItems[i]
        if (item?.imagePreview && !item.imagePreview.startsWith('http')) {
          URL.revokeObjectURL(item.imagePreview)
        }
        this.menuItems.splice(i, 1)
      }
    },
    onMenuImagePicked(e, index) {
      const file = e.target.files?.[0]
      if (!file) return

      const ok = ['image/jpeg', 'image/png', 'image/webp']
      if (!ok.includes(file.type)) {
        this.toast.warning('Please upload a valid image (JPG, PNG, or WEBP)')
        return
      }

      // Revoke previous preview if exists
      if (this.menuItems[index].imagePreview && !this.menuItems[index].imagePreview.startsWith('http')) {
        URL.revokeObjectURL(this.menuItems[index].imagePreview)
      }

      this.menuItems[index].image = file
      this.menuItems[index].imagePreview = URL.createObjectURL(file)
      e.target.value = ''
    },
    removeMenuImage(index) {
      if (this.menuItems[index].imagePreview && !this.menuItems[index].imagePreview.startsWith('http')) {
        URL.revokeObjectURL(this.menuItems[index].imagePreview)
      }
      this.menuItems[index].image = null
      this.menuItems[index].imagePreview = ''
    },

    /* ---------- Address utils & OneMap (strict) ---------- */
    normalizeStr(s) { return (s || '').toString().trim().toUpperCase().replace(/\s+/g, ' ').replace(/[.,']/g, '') },
    expandAbbrev(road) {
      const A = [[' AVE ', ' AVENUE '], [' RD ', ' ROAD '], [' ST ', ' STREET '], [' DR ', ' DRIVE '],
      [' CRES ', ' CRESCENT '], [' CTRL ', ' CENTRAL '], [' PK ', ' PARK '], [' PKWY ', ' PARKWAY '],
      [' TER ', ' TERRACE '], [' HTS ', ' HEIGHTS '], [' HWY ', ' HIGHWAY '],
      [' GDN ', ' GARDEN '], [' GDNS ', ' GARDENS '], [' CTR ', ' CENTRE '], [' PL ', ' PLACE '], [' CL ', ' CLOSE ']]
      let out = ` ${this.normalizeStr(road)} `; A.forEach(([a, b]) => out = out.replaceAll(a, b)); return out.trim()
    },
    levDist(a, b) {
      const m = a.length, n = b.length; if (!m) return n; if (!n) return m; const d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
      for (let i = 0; i <= m; i++)d[i][0] = i; for (let j = 0; j <= n; j++)d[0][j] = j
      for (let i = 1; i <= m; i++)for (let j = 1; j <= n; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c) }
      return d[m][n]
    },
    similarity(a, b) {
      const A = this.expandAbbrev(a), B = this.expandAbbrev(b); const dist = this.levDist(A, B); const L = Math.max(A.length, B.length) || 1; return 1 - dist / L
    },

    async fetchJSON(url, { timeoutMs = 6000 } = {}) {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, mode: 'cors' })
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
        return await res.json()
      } finally { clearTimeout(t) }
    },
    async oneMapSearchByPostal(postal) {
      const q = `searchVal=${encodeURIComponent(postal)}&returnGeom=N&getAddrDetails=Y&pageNum=1`
      const urls = [
        `https://www.onemap.gov.sg/api/common/elastic/search?${q}`,
        `https://developers.onemap.sg/commonapi/search?${q}`,
      ]
      let lastErr
      for (const u of urls) { try { return await this.fetchJSON(u) } catch (e) { lastErr = e } }
      throw lastErr || new Error('All OneMap endpoints failed')
    },

    async validateAddressWithOneMap({ blk, street, postal, isLanded }, threshold = 0.80) {
      if (!/^[0-9]{6}$/.test(postal)) return { ok: false, reason: 'Postal Code must be 6 digits.' }

      let json
      try { json = await this.oneMapSearchByPostal(postal) }
      catch (err) {
        console.error('OneMap error:', err)
        return { ok: false, reason: 'Address service not reachable. (Check network/DNS or try again.)' }
      }

      const results = Array.isArray(json?.results) ? json.results : []
      const exact = results.filter(r => r.POSTAL === postal)
      const candidates = exact.length ? exact : results
      if (!candidates.length) return { ok: false, reason: 'Address not found. Please check your street name and postal code.' }

      const userStreet = this.expandAbbrev(street || '')
      let best = null, score = -1
      for (const r of candidates) { const s = this.similarity(userStreet, r.ROAD_NAME || ''); if (s > score) { best = r; score = s } }

      const omBlk = this.normalizeStr(best?.BLK_NO || ''), omRoad = this.expandAbbrev(best?.ROAD_NAME || '')
      const omBldg = this.normalizeStr(best?.BUILDING || ''), userBlk = this.normalizeStr(blk || '')

      // Only validate block for non-landed properties
      if (!isLanded && userBlk && omBlk && userBlk !== omBlk)
        return { ok: false, reason: 'Address not found. Please check your block, street name, and postal code.' }

      // Extract and compare street numbers (must match exactly)
      const extractStreetNumber = (str) => {
        const match = str.match(/\b(\d+[A-Z]?)\b/)
        return match ? match[1] : null
      }

      const userNumber = extractStreetNumber(userStreet)
      const omNumber = extractStreetNumber(omRoad)

      if (userNumber && omNumber && userNumber !== omNumber)
        return { ok: false, reason: 'Address not found. Please check your street name and postal code.' }

      const streetOk = score >= threshold
      const buildingOk = omBldg && this.similarity(this.normalizeStr(street || ''), omBldg) >= threshold
      if (!streetOk && !buildingOk)
        return { ok: false, reason: 'Address not found. Please check your street name and postal code.' }

      return {
        ok: true,
        data: {
          blk: omBlk || userBlk,
          road: omRoad || userStreet,
          postal,
          building: best?.BUILDING || '',
          address: best?.ADDRESS || '',
          confidence: Math.max(score, buildingOk ? 1 : 0),
          lat: best?.LATITUDE ? parseFloat(best.LATITUDE) : null,
          lng: best?.LONGITUDE ? parseFloat(best.LONGITUDE) : null
        }
      }
    },

    /* ---------- Real-time validation ---------- */
    async validateAddressRealtime() {
      this.addrError = ''
      this.addrWarning = ''

      const { locationPostal, locationStreet, locationBlk, isLanded } = this

      if (!locationPostal || locationPostal.length !== 6) {
        this.validatingAddress = false
        return
      }

      this.validatingAddress = true

      try {
        const check = await this.validateAddressWithOneMap({
          blk: locationBlk,
          street: locationStreet,
          postal: locationPostal,
          isLanded: isLanded
        }, 0.80)

        if (check.ok) {
          this.addrWarning = `✓ Valid address: ${check.data.address}`
        } else {
          this.addrError = check.reason
        }
      } catch (err) {
        this.addrError = 'Unable to verify address. Please check your internet connection and try again.'
      } finally {
        this.validatingAddress = false
      }
    },

    /* ---------- Input formatters ---------- */
    handlePostalInput(e) {
      this.locationPostal = e.target.value.replace(/\D/g, '').slice(0, 6)
      this.triggerValidation()
    },
    // UPDATED: dynamically formats Unit No depending on Landed toggle
    handleDynamicUnitInput(e) {
      let v = e.target.value.toUpperCase().replace(/\s+/g, '')
      if (this.isLanded) {
        // Landed → #09 (2 digits)
        const m = v.match(/^#?(\d{0,2})$/)
        if (m) {
          const digits = m[1] || ''
          v = digits ? `#${digits}` : ''
        }
      } else {
        // Non-landed → #09-12 or #09-142 (2 or 3 digits after dash)
        const m = v.match(/^#?(\d{0,2})(-)?(\d{0,3})$/)
        if (m) {
          const a = m[1] || '', b = m[3] || ''
          if (a.length >= 2 && b.length > 0) v = `#${a.slice(0, 2)}-${b.slice(0, 3)}`
          else if (a.length >= 2) v = `#${a.slice(0, 2)}-`
          else v = `#${a}`
        }
      }
      this.locationUnit = v
    },
    triggerValidation() {
      if (this.validationTimeout) clearTimeout(this.validationTimeout)
      this.validationTimeout = setTimeout(() => {
        this.validateAddressRealtime()
      }, 500)
    },

    /* ---------- Upload ---------- */
    async uploadAllPhotos(uid, listingId) {
      if (!this.photos.length) return []
      const uploads = this.photos.map((p, idx) => {
        const file = p.file
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `listings/${uid}/${listingId}/${Date.now()}-${idx}.${ext}`
        const sref = storageRef(storage, path)
        return new Promise((resolve, reject) => {
          const task = uploadBytesResumable(sref, file, { contentType: file.type })
          task.on('state_changed', null, reject, async () => {
            try { const url = await getDownloadURL(task.snapshot.ref); resolve({ url, path }) }
            catch (e) { reject(e) }
          })
        })
      })
      return Promise.all(uploads)
    },

    async uploadMenuImages(uid, listingId) {
      const uploads = []
      for (let i = 0; i < this.menuItems.length; i++) {
        const item = this.menuItems[i]
        if (item.image) {
          const file = item.image
          const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
          const path = `listings/${uid}/${listingId}/menu/${Date.now()}-${i}.${ext}`
          const sref = storageRef(storage, path)

          const uploadPromise = new Promise((resolve, reject) => {
            const task = uploadBytesResumable(sref, file, { contentType: file.type })
            task.on('state_changed', null, reject, async () => {
              try {
                const url = await getDownloadURL(task.snapshot.ref)
                resolve({ index: i, url, path })
              } catch (e) {
                reject(e)
              }
            })
          })
          uploads.push(uploadPromise)
        }
      }
      return Promise.all(uploads)
    },

    /* ---------- Submit (STRICT) ---------- */
    async handleSubmit() {
      const user = auth.currentUser
      if (!user) { this.toast.error('You must be logged in to publish a listing.'); return }

      // Set loading state
      this.isCreatingListing = true

      if (!this.businessName.trim() || !this.businessDesc.trim() || !this.businessCategory.trim()) {
        this.isCreatingListing = false
        this.toast.warning('Please fill in Service Name, Description, and Category.')
        return
      }

      // Validate address fields
      if (!this.isLanded && !this.locationBlk.trim()) {
        this.isCreatingListing = false
        this.toast.warning('Block number is required for HDB/Condominium. Toggle "Landed Property" if applicable.')
        return
      }

      if (!this.locationStreet.trim() || !this.locationPostal.trim() || !this.locationUnit.trim()) {
        this.isCreatingListing = false
        this.toast.warning('Please fill in Street Address, Postal Code, and Unit No.')
        return
      }
      if (!/^[0-9]{6}$/.test(this.locationPostal.trim())) {
        this.isCreatingListing = false
        this.toast.warning('Postal Code must be a 6-digit number (Singapore).')
        return
      }

      // UPDATED: Unit validation depends on Landed toggle
      if (this.isLanded) {
        if (!/^#?[0-9]{2}$/.test(this.locationUnit.trim())) {
          this.isCreatingListing = false
          this.toast.warning('Unit No must look like #09 for landed properties.')
          return
        }
      } else {
        if (!/^#?[0-9]{2}-[0-9]{2,3}$/.test(this.locationUnit.trim())) {
          this.isCreatingListing = false
          this.toast.warning('Unit No must look like #09-12 or #09-142 for non-landed properties.')
          return
        }
      }

      // In edit mode, allow existing photos; in create mode, require at least 1 new photo
      if (!this.editMode && this.photos.length < 1) {
        this.isCreatingListing = false
        this.photoError = 'Please upload at least 1 photo of your business.'
        this.$nextTick(() => this.$refs.uploadZone?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        return
      }
      if (this.editMode && this.photos.length === 0 && this.existingPhotoUrls.length === 0) {
        this.isCreatingListing = false
        this.photoError = 'Please keep at least 1 photo of your business.'
        this.$nextTick(() => this.$refs.uploadZone?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        return
      }

      // Validate address with OneMap
      this.addrError = ''
      const check = await this.validateAddressWithOneMap({
        blk: this.locationBlk,
        street: this.locationStreet,
        postal: this.locationPostal,
        isLanded: this.isLanded
      }, 0.80)

      if (!check.ok) {
        this.isCreatingListing = false
        this.addrError = check.reason || 'Invalid address.'
        this.toast.error('Please provide a valid Singapore address.')
        return
      }

      const { blk, road: street, postal } = check.data
      for (const m of this.menuItems) {
        if (!m.name.trim() || !m.price.trim()) {
          this.isCreatingListing = false
          this.toast.warning(this.emptyLineAlertText)
          return
        }
        // Validate image for Food & Drinks category
        if (this.isFoodCategory && !m.image && !m.imagePreview) {
          this.isCreatingListing = false
          this.toast.warning('Please upload an image for all food/drink items.')
          return
        }
      }

      const unit = this.locationUnit.trim()
      const unitFormatted = unit.startsWith('#') ? unit : `#${unit}`
      const locationFormatted = `BLK ${blk} ${street} Singapore ${postal} ${unitFormatted}`

      try {
        // First prepare menu without image URLs (we'll add them after upload)
        const menu = this.menuItems
          .filter(m => (m.name || '').trim())
          .map(m => ({
            name: m.name.trim(),
            price: (m.price || '').trim(),
            imageUrl: m.imagePreview && m.imagePreview.startsWith('http') ? m.imagePreview : '' // Keep existing URLs
          }))

        // Convert operating hours to the format expected by ListingDrawer
        const operatingHoursFormatted = {
          mon: this.operatingHours.monday.enabled ? { open: this.operatingHours.monday.start, close: this.operatingHours.monday.end } : { closed: true },
          tue: this.operatingHours.tuesday.enabled ? { open: this.operatingHours.tuesday.start, close: this.operatingHours.tuesday.end } : { closed: true },
          wed: this.operatingHours.wednesday.enabled ? { open: this.operatingHours.wednesday.start, close: this.operatingHours.wednesday.end } : { closed: true },
          thu: this.operatingHours.thursday.enabled ? { open: this.operatingHours.thursday.start, close: this.operatingHours.thursday.end } : { closed: true },
          fri: this.operatingHours.friday.enabled ? { open: this.operatingHours.friday.start, close: this.operatingHours.friday.end } : { closed: true },
          sat: this.operatingHours.saturday.enabled ? { open: this.operatingHours.saturday.start, close: this.operatingHours.saturday.end } : { closed: true },
          sun: this.operatingHours.sunday.enabled ? { open: this.operatingHours.sunday.start, close: this.operatingHours.sunday.end } : { closed: true }
        }

        // Determine listing ID and whether we're creating or updating
        let listingId
        let allListingsDocRef

        if (this.editMode) {
          // Edit mode: use existing listing ID
          listingId = this.editingListingId
          allListingsDocRef = doc(db, 'allListings', listingId)
        } else {
          // Create mode: create new document with review code
          const reviewCode = generateReviewCode()
          allListingsDocRef = await addDoc(collection(db, 'allListings'), {
            businessName: this.businessName.trim(),
            businessDesc: this.businessDesc.trim(),
            businessCategory: this.businessCategory.trim(),
            userId: user.uid,
            location: {
              country: 'Singapore',
              blk,
              street,
              postal,
              unit: unitFormatted,
              lat: check.data.lat,
              lng: check.data.lng
            },
            locationFormatted,
            menu,
            operatingHours: operatingHoursFormatted,
            reviewCode, // Add the unique review code
            createdAt: serverTimestamp(),
            viewCount: 0
          })
          listingId = allListingsDocRef.id
        }

        // Upload new photos and get the URLs
        let photoObjs = []
        let photoUrls = [...this.existingPhotoUrls] // Keep existing photos in edit mode

        if (this.photos.length > 0) {
          photoObjs = await this.uploadAllPhotos(user.uid, listingId)
          const newPhotoUrls = photoObjs.map(p => p.url)
          photoUrls = [...photoUrls, ...newPhotoUrls]
        }

        // Upload menu images for Food & Drinks category
        if (this.isFoodCategory) {
          const menuImageUploads = await this.uploadMenuImages(user.uid, listingId)
          menuImageUploads.forEach(({ index, url }) => {
            menu[index].imageUrl = url
          })
        }

        // Prepare the final payload with photos and booking settings
        const payload = {
          businessName: this.businessName.trim(),
          businessDesc: this.businessDesc.trim(),
          businessCategory: this.businessCategory.trim(),
          userId: user.uid,
          listingId,
          location: {
            country: 'Singapore',
            blk,
            street,
            postal,
            unit: unitFormatted,
            lat: check.data.lat,
            lng: check.data.lng
          },
          locationFormatted,
          photos: photoObjs.length > 0 ? photoObjs : undefined,
          photoUrls,
          menu,
          operatingHours: operatingHoursFormatted,
          viewCount: this.editMode ? undefined : 0, // Don't reset viewCount in edit mode
          // Booking settings
          acceptsBookings: this.acceptsBookings,
          bookingDuration: this.bookingDuration,
          availableSlots: this.availableSlots
        };

        // Only add createdAt for new listings
        if (!this.editMode) {
          payload.createdAt = serverTimestamp()
        } else {
          payload.updatedAt = serverTimestamp()

          // In edit mode, preserve existing reviewCode or generate one if missing
          const existingDoc = await getDoc(allListingsDocRef)
          if (existingDoc.exists()) {
            const existingData = existingDoc.data()
            // Keep existing reviewCode, or generate new one if missing
            payload.reviewCode = existingData.reviewCode || generateReviewCode()
          } else {
            // If document doesn't exist (shouldn't happen), generate new code
            payload.reviewCode = generateReviewCode()
          }
        }

        // Remove undefined values
        Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key])

        // Now you can save the payload to the correct collections
        await setDoc(allListingsDocRef, payload, { merge: true });
        await setDoc(doc(db, 'users', user.uid, 'myListings', listingId), payload, { merge: true });

        if (this.editMode) {
          this.router.push('/profile?tab=my')
        } else {
          // Show success modal after creating new listing
          this.createdListingId = listingId
          this.showSuccessModal = true
        }
      } catch (e) {
        console.error(e)
        this.toast.error('Failed to add listing, please try again')
      } finally {
        this.isCreatingListing = false
      }
    },

    viewListing() {
      this.showSuccessModal = false
      this.clearForm()
      // Navigate to home and open the listing drawer
      this.router.push({ path: '/', query: { listing: this.createdListingId } })
    },

    returnToHome() {
      this.showSuccessModal = false
      this.clearForm()
      this.router.push('/')
    },

    clearForm() {
      this.businessName = ''
      this.businessDesc = ''
      this.businessCategory = ''
      this.locationBlk = ''
      this.locationStreet = ''
      this.locationPostal = ''
      this.locationUnit = ''
      // Clean up menu item image previews
      this.menuItems.forEach(item => {
        if (item.imagePreview && !item.imagePreview.startsWith('http')) {
          URL.revokeObjectURL(item.imagePreview)
        }
      })
      this.menuItems = [{ name: '', price: '', image: null, imagePreview: '' }]
      this.operatingHours = {
        monday: { enabled: true, start: '09:00', end: '17:00' },
        tuesday: { enabled: true, start: '09:00', end: '17:00' },
        wednesday: { enabled: true, start: '09:00', end: '17:00' },
        thursday: { enabled: true, start: '09:00', end: '17:00' },
        friday: { enabled: true, start: '09:00', end: '17:00' },
        saturday: { enabled: true, start: '09:00', end: '17:00' },
        sunday: { enabled: true, start: '09:00', end: '17:00' }
      }
      this.photos.forEach(p => p.url && URL.revokeObjectURL(p.url)); this.photos = []
      this.photoError = ''
      this.addrError = ''
      this.addrWarning = ''
      this.isLanded = false
      this.acceptsBookings = false
      this.bookingDuration = 60
      this.availableSlots = {
        mon: { enabled: false, start: '09:00', end: '17:00' },
        tue: { enabled: false, start: '09:00', end: '17:00' },
        wed: { enabled: false, start: '09:00', end: '17:00' },
        thu: { enabled: false, start: '09:00', end: '17:00' },
        fri: { enabled: false, start: '09:00', end: '17:00' },
        sat: { enabled: false, start: '09:00', end: '17:00' },
        sun: { enabled: false, start: '09:00', end: '17:00' }
      }
    },

    // Get operating hours for a specific day (used to display booking hours)
    getOperatingHoursForDay(dayKey) {
      const dayMap = {
        mon: 'monday', tue: 'tuesday', wed: 'wednesday',
        thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday'
      }
      const fullDayName = dayMap[dayKey]
      const dayHours = this.operatingHours[fullDayName]

      if (!dayHours || !dayHours.enabled) {
        return 'Closed'
      }

      return `${dayHours.start} - ${dayHours.end}`
    }
  },

  beforeUnmount() { this.photos.forEach(p => p.url && URL.revokeObjectURL(p.url)) }
}
</script>

<template>
  <div class="bg-page">
    <!-- Loading Popup -->
    <div v-if="isCreatingListing" class="loading-overlay">
      <div class="loading-popup">
        <div class="spinner-border text-primary mb-3" role="status" style="width: 3rem; height: 3rem;">
          <span class="visually-hidden">Loading...</span>
        </div>
        <h5>{{ editMode ? 'Updating Listing...' : 'Creating Listing...' }}</h5>
        <p class="text-muted">Please wait while we process your listing</p>
      </div>
    </div>

    <!-- Success Modal -->
    <div v-if="showSuccessModal" class="loading-overlay" @click="returnToHome">
      <div class="success-popup" @click.stop>
        <div class="success-icon mb-3">
          <Icon icon="mdi:check-circle" style="font-size: 4rem; color: #28a745;" />
        </div>
        <h4 class="mb-3">Listing Created Successfully!</h4>
        <p class="text-muted mb-4">Your listing has been published and is now live.</p>
        <div class="d-flex gap-3 justify-content-center">
          <button class="btn btn-primary px-4 py-2" @click="viewListing">
            <Icon icon="mdi:eye" class="me-2" />View Listing
          </button>
          <button class="btn btn-outline-secondary px-4 py-2" @click="returnToHome">
            <Icon icon="mdi:home" class="me-2" />Return to Homepage
          </button>
        </div>
      </div>
    </div>

    <!-- content zone (mirrors HomePage's container pb-5) -->
    <div class="container pb-5 mt-5">
      <div class="d-flex justify-content-center">
        <div class="listing-card shadow-soft rounded-4 p-4 p-md-5">
          <div class="text-center mb-5">
            <h2 class="fw-bold py-1 px-4 rounded mb-0" 
    style="color: rgb(75, 42, 166); font-size: 32px; line-height: 1.2;">
  {{ editMode ? 'Edit Listing' : 'Create New Listing' }}
</h2>



            <div style="
              width: 100%;      
              height: 4px; 
              border-radius: 2px;
              background: linear-gradient(90deg, rgb(75, 42, 166), #9b6cff);
              margin-top: 4px;
              margin-bottom: 0; /* remove bottom margin */
            "></div>
          </div>

          <form @submit.prevent="handleSubmit" novalidate>
            <div class="d-flex flex-column">
              <!-- Name and Category (side by side) -->
              <div class="d-flex gap-3 mb-3 mt-0">
                <div class="flex-grow-1">
                  <label class="form-label fw-semibold mb-1">
                    Category
                    <Icon icon="mdi:view-dashboard" />
                  </label>
                  <select class="form-select" v-model="businessCategory" required>
                    <option disabled value="">-- select category --</option>
                    <option>Food and Drinks</option>
                    <option>Beauty</option>
                    <option>Fitness</option>
                    <option>Arts & Craft</option>
                    <option>Education</option>
                    <option>Pets</option>
                    <option>Others</option>
                  </select>
                </div>

                <div class="flex-grow-1">
                  <label class="form-label fw-semibold">
                    {{ businessCategory === 'Food and Drinks' ? 'Business Name' : 'Service Name' }}
                    <Icon icon="mdi:briefcase" />
                  </label>
                  <input class="form-control form-control-lg" v-model="businessName"
                    :placeholder="businessCategory === 'Food and Drinks' ? 'Enter your business name here' : 'Enter your service name here'" />
                </div>
              </div>


              <!-- Description (full-width) -->
              <div class="mb-3">
                <label class="form-label fw-semibold">
                  Description
                  <Icon icon="mdi:pencil" />
                </label>
                <textarea class="form-control" rows="4" v-model="businessDesc"
                  placeholder="Describe your service"></textarea>
              </div>

              <!-- Property Type Toggle -->
              <div class="mb-4">
                <div class="custom-checkbox-wrapper mb-2">
                  <input class="custom-checkbox-input" type="checkbox" id="isLanded" v-model="isLanded">
                  <label class="custom-checkbox-label fw-semibold" for="isLanded">
                    <span class="custom-checkbox-box">
                      <Icon icon="mdi:check" class="custom-checkbox-icon" />
                    </span>
                    Landed Property
                  </label>
                </div>
                <div class="text-muted small" style="padding-left: 2rem;">
                  Check this if your property does not have a block number (e.g., Bungalow, Terrace, Semi-Detached)
                </div>
              </div>

              <!-- Block and Street Address (side by side) -->
              <div class="d-flex gap-3 mb-3">
                <div v-if="!isLanded" class="flex-grow-1">
                  <label class="form-label fw-semibold">
                    Block
                    <Icon icon="mdi:home" />
                  </label>
                  <input class="form-control" v-model.trim="locationBlk" placeholder="e.g 999B" />
                </div>
                <div class="flex-grow-1">
                  <label class="form-label fw-semibold">
                    Street Address
                    <Icon icon="mdi:map-marker" />
                  </label>
                  <input class="form-control" v-model.trim="locationStreet" placeholder="e.g Tampines Ave 7" />
                </div>
              </div>

              <!-- Postal and Unit No (side by side) -->
              <div class="d-flex gap-3 mb-3">
                <div class="flex-grow-1">
                  <label class="form-label fw-semibold">
                    Postal Code
                  </label>
                  <input class="form-control" v-model.trim="locationPostal" inputmode="numeric" pattern="[0-9]{6}"
                    maxlength="6" placeholder="6-digit postal code" title="Enter a 6-digit Singapore postal code"
                    @input="handlePostalInput" />
                </div>
                <div class="flex-grow-1">
                  <label class="form-label fw-semibold">
                    Unit No
                  </label>
                  <input class="form-control" v-model.trim="locationUnit"
                    :pattern="isLanded ? '#?[0-9]{2}' : '#?[0-9]{2}-[0-9]{2,3}'"
                    :placeholder="isLanded ? '#01' : '#01-23 or #01-234'"
                    :title="isLanded ? 'Format like #09' : 'Format like #09-12 or #09-142'"
                    @input="handleDynamicUnitInput" />
                </div>
              </div>

              <!-- Validation Messages -->
              <div v-if="validatingAddress" class="text-primary small mt-n2 mb-2">
                <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                Validating address...
              </div>
              <div v-if="addrError" class="text-danger small mt-n2 mb-2">❌ {{ addrError }}</div>
              <div v-if="addrWarning" class="text-success small mt-n2 mb-2">{{ addrWarning }}</div>

              <!-- Operating Hours Section -->
              <div class="mb-4">
                <label class="form-label fw-semibold mb-3">
                  Operating Hours
                  <Icon icon="mdi:clock-outline" />
                </label>

                <!-- Monday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="monEnabled"
                      v-model="operatingHours.monday.enabled">
                    <label class="custom-checkbox-label" for="monEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Monday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.monday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.monday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.monday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>

                <!-- Tuesday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="tueEnabled"
                      v-model="operatingHours.tuesday.enabled">
                    <label class="custom-checkbox-label" for="tueEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Tuesday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.tuesday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.tuesday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.tuesday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>

                <!-- Wednesday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="wedEnabled"
                      v-model="operatingHours.wednesday.enabled">
                    <label class="custom-checkbox-label" for="wedEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Wednesday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.wednesday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.wednesday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.wednesday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>

                <!-- Thursday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="thuEnabled"
                      v-model="operatingHours.thursday.enabled">
                    <label class="custom-checkbox-label" for="thuEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Thursday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.thursday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.thursday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.thursday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>

                <!-- Friday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="friEnabled"
                      v-model="operatingHours.friday.enabled">
                    <label class="custom-checkbox-label" for="friEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Friday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.friday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.friday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.friday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>

                <!-- Saturday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="satEnabled"
                      v-model="operatingHours.saturday.enabled">
                    <label class="custom-checkbox-label" for="satEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Saturday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.saturday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.saturday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.saturday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>

                <!-- Sunday -->
                <div class="d-flex align-items-center gap-3 mb-2">
                  <div class="custom-checkbox-wrapper" style="min-width: 120px;">
                    <input class="custom-checkbox-input" type="checkbox" id="sunEnabled"
                      v-model="operatingHours.sunday.enabled">
                    <label class="custom-checkbox-label" for="sunEnabled">
                      <span class="custom-checkbox-box">
                        <Icon icon="mdi:check" class="custom-checkbox-icon" />
                      </span>
                      Sunday
                    </label>
                  </div>
                  <div class="d-flex align-items-center gap-2 flex-grow-1" v-if="operatingHours.sunday.enabled">
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.sunday.start">
                    <span class="text-muted">to</span>
                    <input type="time" class="form-control form-control-sm" v-model="operatingHours.sunday.end">
                  </div>
                  <span v-else class="text-muted small">Closed</span>
                </div>
              </div>

              <!-- Menu Items Section -->
              <div class="mb-3">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <label class="form-label fw-semibold m-0">
                    {{ listLabel }}
                    <Icon icon="mdi:list-box" />
                  </label>
                  <button type="button" class="btn btn-primary px-4 py-2" @click="addMenuItem">{{ addItemBtnText
                  }}</button>
                </div>
                <div class="menu-list d-flex flex-column gap-3">
                  <div class="menu-item-card card p-3" v-for="(m, i) in menuItems" :key="i">
                    <div class="mb-2">
                      <input class="form-control" :placeholder="itemNamePlaceholder" v-model.trim="m.name" />
                    </div>
                    <div class="mb-3">
                      <div class="input-group">
                        <span class="input-group-text">$</span>
                        <input class="form-control" :placeholder="pricePlaceholder" v-model.trim="m.price" />
                      </div>
                    </div>

                    <!-- Image Upload for Food & Drinks - Below name and price -->
                    <div v-if="isFoodCategory" class="mb-3">
                      <label class="form-label small mb-2 fw-semibold">Food/Drink Image *</label>
                      <div v-if="m.imagePreview" class="menu-image-preview-wrapper mb-2">
                        <img :src="m.imagePreview" alt="Menu item" class="menu-preview-img" />
                        <button type="button" class="btn btn-sm btn-danger menu-img-remove"
                          @click="removeMenuImage(i)">×</button>
                      </div>
                      <input type="file" accept="image/*" class="form-control form-control-sm"
                        @change="onMenuImagePicked($event, i)"
                        :ref="el => { if (el) $refs[`menuImageInput${i}`] = el }" />
                    </div>

                    <div class="d-flex justify-content-end">
                      <button class="btn btn-outline-danger btn-sm" type="button" @click="removeMenuItem(i)"
                        :disabled="menuItems.length === 1">×</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Photo Upload Section -->
              <div class="mb-3">
                <label class="form-label fw-semibold">
                  Photos
                  <Icon icon="mdi:camera" />
                </label>

                <div v-if="photoError" class="text-danger small mb-2">{{ photoError }}</div>

                <div ref="uploadZone"
                  class="upload-zone rounded-4 mb-3 d-flex flex-column align-items-center justify-content-center"
                  :class="{ dragging: isDragging }" @drop="onDrop" @dragover="onDragOver" @dragleave="onDragLeave"
                  @click="openFilePicker" role="button" tabindex="0">
                  <input ref="photoInput" type="file" accept="image/*" class="d-none" multiple
                    @change="onPhotoPicked" />
                  <div class="text-center">
                    <div class="camera-icon mb-2">📷</div>
                    <div class="upload-title">Add Photos</div>
                    <div class="upload-hint">Minimum 1 photo (PNG, JPG, WEBP). We recommend 3+.</div>
                  </div>
                </div>

                <div class="thumbs d-flex flex-wrap gap-2 mb-1">
                  <div v-for="(p, i) in photos" :key="i" class="thumb rounded-3 overflow-hidden position-relative">
                    <img :src="p.url" alt="preview" />
                    <button type="button" class="btn btn-sm btn-light remove-btn"
                      @click.stop="removePhoto(i)">×</button>
                  </div>
                </div>
                <div class="text-muted small mb-3">Tip: upload at least 3 photos for a better listing.</div>
              </div>

              <!-- Booking System Section -->
              <div class="mb-3">
                <div class="booking-section card p-4 mb-3">
                  <h5 class="mb-3">📅 Booking System (Optional)</h5>

                  <div class="form-check form-switch mb-3">
                    <input class="form-check-input" type="checkbox" id="acceptsBookings" v-model="acceptsBookings">
                    <label class="form-check-label fw-semibold" for="acceptsBookings" style="margin-left: 0.5rem;">
                      Enable Booking System for this Service
                    </label>
                    <div class="text-muted small" style="margin-left: 1rem; margin-top: 0.25rem;">Allow customers to book appointments in advance</div>
                  </div>

                  <div v-if="acceptsBookings" class="booking-settings">
                    <div class="mb-3">
                      <label class="form-label fw-semibold">Typical Session Duration</label>
                      <select class="form-select" v-model.number="bookingDuration">
                        <option :value="30">30 minutes</option>
                        <option :value="60">1 hour</option>
                        <option :value="90">1.5 hours</option>
                        <option :value="120">2 hours</option>
                        <option :value="180">3 hours</option>
                      </select>
                    </div>

                    <div class="mb-3">
                      <label class="form-label fw-semibold">Available Days for Booking</label>
                      <p class="text-muted small mb-2">Select which days customers can book appointments. Booking hours
                        will automatically match your operating hours.</p>
                      <div class="days-grid">
                        <div v-for="dayObj in orderedAvailableSlots" :key="dayObj.key" class="day-row card p-3 mb-2">
                          <div class="form-check">
                            <input class="form-check-input" type="checkbox" :id="`day-${dayObj.key}`"
                              v-model="dayObj.data.enabled">
                            <label class="form-check-label fw-semibold clickable-label" :for="`day-${dayObj.key}`"
                              style="cursor: pointer;">
                              {{ dayObj.label }}
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="alert alert-info small">
                      💡 Customers will be able to request bookings during your operating hours on the selected days.
                      You can accept or reject each request.
                    </div>
                  </div>
                </div>
              </div>

              <!-- Submit & Clear Form Buttons -->
              <div class="mt-3 d-flex justify-content-center gap-3">
                <button type="submit" class="btn btn-primary px-4 py-2">
                  {{ editMode ? 'Update Listing' : 'Publish Listing' }}
                </button>
                <button v-if="!editMode" type="button" class="btn btn-outline-secondary px-4 py-2"
                  @click="clearForm">Clear Form</button>
                <button v-else type="button" class="btn btn-outline-secondary px-4 py-2"
                  @click="router.push('/profile?tab=my')">Cancel</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root {
  --font-family: 'Arial', sans-serif;
  /* Global font-family */
  --font-size-base: 1rem;
  /* Base font size (16px) */
  --font-size-large: 1.125rem;
  /* Large font size for headings/labels */
  --font-size-input: 1rem;
  /* Input text size */
  --font-size-placeholder: 0.875rem;
  /* Placeholder text size */
}

.bg-page {
  background: var(--color-bg-main);
}

.shadow-soft {
  box-shadow: var(--shadow-md);
}

.listing-card {
  max-width: 920px;
  width: 100%;
  background: var(--color-bg-white);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

/* Global font styles */
* {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
}

.container.py-3 h2 {
  line-height: 1.2;
}

/* Labels */
.form-label {
  font-size: var(--font-size-large);
  color: var(--color-primary);
  font-weight: 600;
  padding-top: 12px;
}

/* Inputs and Textareas */
.form-control,
.form-select {
  font-size: var(--font-size-input);
  font-family: var(--font-family);
  background: var(--color-bg-white);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

/* Ensure select dropdown arrow is visible */
.form-select {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23666' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
  background-size: 16px 12px;
  padding-right: 2.5rem;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
}

/* Dark mode - lighter arrow color */
:root.dark-mode .form-select {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23ccc' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e");
}

/* When select has the placeholder (disabled) option selected, show it in secondary color like input placeholders */
.form-select:invalid {
  color: var(--color-text-secondary);
}

/* Placeholder styling for form-control (input) and form-select (select) */
.form-control::placeholder,
.form-select::placeholder,
.form-select option:disabled {
  font-size: var(--font-size-placeholder);
  color: var(--color-text-secondary);
  opacity: 1;
  /* Override default opacity of placeholder */
}

/* The first option (which acts as a placeholder) for select elements */
.form-select option:first-child {
  color: var(--color-text-secondary);
}

/* Ensure option elements have proper colors in dark mode */
.form-select option {
  background: var(--color-bg-white);
  color: var(--color-text-primary);
}

/* Input focus state */
.form-control:focus,
.form-select:focus {
  border-color: var(--color-primary-lighter);
  box-shadow: var(--focus-ring);
}

/* Input group */
.input-group-text {
  font-size: var(--font-size-input);
  background: var(--color-bg-purple-tint);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

/* Button Styles */
.btn-primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  font-size: var(--font-size-base);
  transition: all var(--transition-fast);
}

.btn-primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.btn-outline-secondary {
  color: var(--color-text-primary);
  border-color: var(--color-border);
}

.btn-outline-secondary:hover {
  background: var(--color-bg-purple-tint);
  border-color: var(--color-border-dark);
}

/* Upload Zone */
.upload-zone {
  border: 2px dashed var(--color-primary-pale);
  background: var(--color-bg-white);
  min-height: 180px;
  cursor: pointer;
  transition: background .2s, border-color .2s;
}

.upload-zone.dragging {
  background: var(--color-bg-purple-tint);
  border-color: var(--color-primary-light);
}

.camera-icon {
  font-size: 28px;
  color: var(--color-text-secondary);
}

.upload-title {
  font-weight: 600;
  color: var(--color-primary);
}

.upload-hint {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
}

/* Thumbnails */
.thumbs .thumb {
  width: 88px;
  height: 88px;
  background: var(--color-bg-white);
  border: 1px solid var(--color-border);
}

.thumbs .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  line-height: 1;
  padding: 2px 8px;
  border-radius: 999px;
}

/* Form styling */
.form-control:focus,
.form-select:focus {
  border-color: var(--color-primary-lighter);
  box-shadow: var(--focus-ring);
}

/* Booking System Styles */
.booking-section {
  background: var(--color-bg-purple-tint);
  border: 2px solid var(--color-border);
}

.booking-section h5 {
  color: var(--color-primary);
  font-weight: 600;
}

.form-check-input:checked {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.form-switch .form-check-input {
  width: 3em;
  height: 1.5em;
}

.day-row {
  background: var(--color-bg-white);
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
}

.day-row:hover {
  border-color: var(--color-primary-lighter);
  box-shadow: var(--shadow-sm);
}

.alert-info {
  background-color: var(--color-bg-purple-tint);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

.menu-item-card {
  background: var(--color-bg-purple-tint);
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
}

.menu-item-card:hover {
  border-color: var(--color-primary-lighter);
  box-shadow: var(--shadow-sm);
}

.menu-image-preview-wrapper {
  position: relative;
  display: block;
  width: 100%;
}

.menu-preview-img {
  width: 100%;
  max-width: 300px;
  height: 200px;
  border-radius: 8px;
  border: 2px solid var(--color-border);
  object-fit: cover;
  display: block;
}

.menu-img-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 24px;
  height: 24px;
  padding: 0;
  line-height: 1;
  border-radius: 50%;
  font-size: 16px;
}

/* Mobile responsive styles */
@media (max-width: 767.98px) {
  .container {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .card {
    padding: 1.25rem;
  }

  .upload-zone {
    min-height: 150px;
  }

  .thumbs .thumb {
    width: 72px;
    height: 72px;
  }

  .camera-icon {
    font-size: 24px;
  }

  .upload-title {
    font-size: 0.95rem;
  }

  .upload-hint {
    font-size: 0.813rem;
  }

  /* Stack booking time inputs on mobile */
  .day-row .row {
    flex-direction: column;
  }

  .day-row .col {
    width: 100%;
    max-width: 100%;
  }
}

@media (max-width: 575.98px) {
  .container {
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }

  .listing-card {
    max-width: 100%;
    margin: 0;
  }

  .card {
    padding: 1rem 0.85rem;
    border-radius: 12px;
  }

  h2 {
    font-size: 5rem;
    margin-bottom: 1rem;
  }

  h5 {
    font-size: 0.95rem;
  }

  .form-label {
    font-size: 0.95rem;
    padding-top: 8px;
  }

  .btn {
    font-size: 0.85rem;
    padding: 0.6rem 1rem;
    border-radius: 10px;
  }

  .btn-primary {
    min-height: 44px;
  }

  .form-control,
  .form-select {
    font-size: 0.85rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
  }

  .input-group-text {
    font-size: 0.85rem;
    padding: 0.6rem 0.75rem;
  }

  .upload-zone {
    min-height: 140px;
    padding: 1rem;
  }

  .camera-icon {
    font-size: 20px;
  }

  .upload-title {
    font-size: 0.9rem;
  }

  .upload-hint {
    font-size: 0.75rem;
  }

  .thumbs .thumb {
    width: 70px;
    height: 70px;
  }

  .remove-btn {
    font-size: 0.75rem;
    padding: 2px 6px;
  }

  .menu-item-card {
    padding: 0.85rem;
    margin-bottom: 0.75rem;
  }

  /* Better spacing for form groups */
  .mb-3 {
    margin-bottom: 0.85rem !important;
  }

  .mb-4 {
    margin-bottom: 1.25rem !important;
  }

  /* Booking section */
  .booking-section {
    padding: 1rem;
  }

  .day-row {
    padding: 0.75rem;
    margin-bottom: 0.65rem;
  }

  /* Row spacing for 2-column layout */
  .row.g-3 {
    --bs-gutter-x: 0.65rem;
    --bs-gutter-y: 0.75rem;
  }

  /* Operating hours mobile fix */
  .d-flex.align-items-center.gap-3 {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 0.5rem !important;
  }

  .d-flex.align-items-center.gap-3 .form-check {
    width: 100%;
  }

  .d-flex.align-items-center.gap-3 .d-flex.align-items-center.gap-2 {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
  }

  .d-flex.align-items-center.gap-3 .form-control-sm {
    flex: 1;
    min-width: 0;
  }

  .d-flex.align-items-center.gap-3 .text-muted {
    flex-shrink: 0;
    padding: 0 0.25rem;
  }
}

/* Custom Checkbox Styles */
.custom-checkbox-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.custom-checkbox-input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.custom-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  color: var(--color-primary);
  margin: 0;
  font-weight: 500;
}

.custom-checkbox-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border-dark);
  border-radius: 4px;
  background: var(--color-bg-white);
  transition: all 0.2s ease;
}

.custom-checkbox-icon {
  font-size: 14px;
  color: white;
  opacity: 0;
  transform: scale(0);
  transition: all 0.2s ease;
}

/* Checked state */
.custom-checkbox-input:checked+.custom-checkbox-label .custom-checkbox-box {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.custom-checkbox-input:checked+.custom-checkbox-label .custom-checkbox-icon {
  opacity: 1;
  transform: scale(1);
}

/* Hover state */
.custom-checkbox-label:hover .custom-checkbox-box {
  border-color: var(--color-primary);
}

/* Focus state */
.custom-checkbox-input:focus+.custom-checkbox-label .custom-checkbox-box {
  box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-popup {
  background: var(--color-bg-white);
  padding: 3rem 4rem;
  border-radius: 1rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
  max-width: 400px;
}

.loading-popup h5 {
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.loading-popup .text-muted {
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}

.success-popup {
  background: var(--color-bg-white);
  padding: 3rem 4rem;
  border-radius: 1rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
  max-width: 500px;
}

.success-popup h4 {
  color: var(--color-text-primary);
  font-weight: 600;
}

.success-popup .text-muted {
  color: var(--color-text-secondary);
  font-size: 1rem;
}

.success-icon {
  animation: scaleIn 0.3s ease-out;
}

@keyframes scaleIn {
  from {
    transform: scale(0);
  }

  to {
    transform: scale(1);
  }
}

/* Fix helper text visibility in dark mode - use :deep() to override Bootstrap's global .text-muted */
:deep(.text-muted) {
  color: var(--color-text-secondary) !important;
}

/* Fix day labels visibility in dark mode */
.day-row .form-check-label {
  color: var(--color-text-primary);
}
</style>

<style>
/* Non-scoped style to override Bootstrap's .text-muted globally */
.text-muted {
  color: #b0b0b0 !important;
}

:root.dark-mode .text-muted {
  color: #b0b0b0 !important;
}

</style>
