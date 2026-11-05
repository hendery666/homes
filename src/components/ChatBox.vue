<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { auth, db } from '@/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  deleteDoc,
  limit as fsLimit
} from 'firebase/firestore'
import { useDarkMode } from '@/composables/useDarkMode'
import { useMessageNotifications } from '@/composables/useMessageNotifications'
import ListingDrawer from '../components/ListingDrawer.vue' // <-- keep same path as Home if needed
import SellerBadge from './SellerBadge.vue'

// Initialize dark mode
useDarkMode()

// Message notifications
const { markChatAsRead, chatUnreadCounts } = useMessageNotifications()

// Helper to check if a chat has unread messages
function hasUnreadMessages(chatId) {
  return chatUnreadCounts.value[chatId] > 0
}

const route = useRoute()
const router = useRouter()

/* ───────── State ───────── */
const chats = ref([])
const activeChat = ref(null)
const messages = ref([])
const newMessage = ref('')
const currentUserId = ref(null)
const sidebarCollapsed = ref(false)
const userCache = ref({})                // uid -> meta (displayName/photoURL)
const msgScrollContainer = ref(null)
let unsubscribeMsgs = null

/* Listing attached to current chat (fetched by chat’s listingId) */
const activeChatListing = ref(null)

/* ── Drawer state (EXACTLY like Home) ── */
const drawerOpen         = ref(false)
const drawerListing      = ref(null)
const drawerSellerName   = ref('')
const drawerSellerAvatar = ref('')

/* ───────── Auth + subscribe ───────── */
onMounted(() => {
  if (auth.currentUser) {
    currentUserId.value = auth.currentUser.uid
    subscribeMyChats()
  }
  onAuthStateChanged(auth, (user) => {
    if (user && user.uid !== currentUserId.value) {
      currentUserId.value = user.uid
      subscribeMyChats()
    }
  })
})

onBeforeUnmount(async () => {
  // Before leaving, check if the current chat has zero messages and delete it
  // Only delete if we've actually loaded messages and confirmed it's empty
  if (activeChat.value && messages.value.length === 0) {
    // Check if messages have actually been loaded by checking the listener
    // If messages are still loading, don't delete
    try {
      // Small delay to ensure messages have loaded
      await new Promise(resolve => setTimeout(resolve, 100))
      // Double-check messages are still empty after delay
      if (messages.value.length === 0) {
        await deleteDoc(doc(db, 'chats', activeChat.value.id))
        console.log('Deleted empty chat:', activeChat.value.id)
      }
    } catch (err) {
      console.error('Failed to delete empty chat:', err)
    }
  }

  if (unsubscribeMsgs) unsubscribeMsgs()
})

/* Deep link */
watch(() => route.query.chatId, (newId) => {
  if (!newId) return
  const found = chats.value.find(c => c.id === newId)
  if (found) selectChat(found)
})

/* Auto scroll */
watch(messages, () => nextTick(() => {
  if (msgScrollContainer.value) msgScrollContainer.value.scrollTop = msgScrollContainer.value.scrollHeight
}), { deep: true })

/* ───────── Chats list ───────── */
function subscribeMyChats() {
  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', currentUserId.value),
    orderBy('updatedAt', 'desc')
  )

  onSnapshot(q, async (snap) => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    
    // First, populate meta from cache synchronously (instant display)
    for (const chat of rows) {
      chat.meta = chat.meta || {}
      if (chat.participants) {
        for (const uid of chat.participants) {
          if (uid === currentUserId.value) continue
          // Use cache if available (instant)
          if (userCache.value[uid]) {
            chat.meta[uid] = userCache.value[uid]
          }
        }
      }
    }
    
    // Update chats list with cached meta (instant display)
    chats.value = rows
    
    // Now fetch missing user meta asynchronously (non-blocking)
    Promise.all(rows.map(chat => populateUserMeta(chat))).catch(() => {})

    const deepId = route.query.chatId
    if (deepId) {
      const found = rows.find(c => c.id === deepId)
      if (found) { selectChat(found); return }
    }
    // Don't auto-select first chat - let user choose
  })
}

async function populateUserMeta(chat) {
  if (!chat.participants) return
  chat.meta = chat.meta || {}

  let hasUpdates = false

  for (const uid of chat.participants) {
    if (uid === currentUserId.value) continue

    // Skip if already populated from cache (no need to fetch again)
    if (chat.meta[uid]) continue

    // Only fetch if not in cache (async, non-blocking)
    try {
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (userSnap.exists()) {
        const u = userSnap.data()
        const photoURL = u.photoURL || u.profilePicture || u.avatarUrl || u.profilePhoto || ''
        const displayName = u.username || u.displayName || u.firstName || 'User'
        userCache.value[uid] = { ...u, photoURL, displayName }
      } else {
        userCache.value[uid] = { displayName: 'User', photoURL: '' }
      }
      // Update chat meta
      chat.meta[uid] = userCache.value[uid]
      hasUpdates = true
    } catch (e) {
      // Silently handle errors - use fallback
      chat.meta[uid] = { displayName: 'User', photoURL: '' }
      hasUpdates = true
    }
  }

  // Only trigger reactivity once after all participants are processed
  // This prevents flickering by batching all updates together
  if (hasUpdates) {
    chats.value = [...chats.value]
  }
}

function getOtherUid(chat) {
  if (!currentUserId.value || !chat?.participants) return ''
  return chat.participants.find(u => u !== currentUserId.value) || ''
}
function getOtherName(chat) {
  const otherUid = getOtherUid(chat)
  const meta = chat?.meta?.[otherUid]
  return meta?.displayName || meta?.username || 'User'
}
function getOtherAvatar(chat) {
  const otherUid = getOtherUid(chat)
  const photoURL = chat?.meta?.[otherUid]?.photoURL
  if (!photoURL) {
    const name = getOtherName(chat)
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=ECE8FF&color=4b2aa6&size=128`
  }
  return photoURL
}
const otherUidActive = computed(() => activeChat.value ? getOtherUid(activeChat.value) : '')

// Computed properties for active chat to prevent flickering
const activeChatName = computed(() => {
  if (!activeChat.value) return 'User'
  const otherUid = otherUidActive.value
  // First check userCache for instant display
  if (userCache.value[otherUid]) {
    return userCache.value[otherUid].displayName || userCache.value[otherUid].username || 'User'
  }
  // Fall back to chat meta
  return getOtherName(activeChat.value)
})

const activeChatAvatar = computed(() => {
  if (!activeChat.value) return `https://ui-avatars.com/api/?name=User&background=ECE8FF&color=4b2aa6&size=128`
  const otherUid = otherUidActive.value
  // First check userCache for instant display
  if (userCache.value[otherUid]?.photoURL) {
    return userCache.value[otherUid].photoURL
  }
  // Fall back to chat meta or generated avatar
  return getOtherAvatar(activeChat.value)
})

const badgeModalOpen = ref(false)
function openBadgeInfoModal() { badgeModalOpen.value = true }
function closeBadgeInfoModal() { badgeModalOpen.value = false }

/* ───────── Preset Questions ───────── */
const presetQuestions = [
  "What are your business hours?",
  "Do you offer delivery?",
  "What is your pricing?",
  "Can you provide more details about your services?",
  "Do you have any special offers or promotions?",
  "How long does it take to complete an order?",
  "What payment methods do you accept?",
  "Do you provide samples or consultations?",
  "What areas do you serve?",
  "Can I see more photos of your work?"
]

const showPresetQuestions = ref(false)

function selectPresetQuestion(question) {
  newMessage.value = question
  showPresetQuestions.value = false
  // Auto-focus the input after selection
  nextTick(() => {
    const input = document.querySelector('.message-input')
    if (input) input.focus()
  })
}

/* ───────── Select chat ───────── */
async function selectChat(chat) {
  // Before switching, delete the previous chat if it had no messages
  // Only delete if we've confirmed it was empty (not just cleared)
  const previousChat = activeChat.value
  const previousChatHadMessages = messages.value.length > 0
  
  // Update active chat immediately for instant UI response
  activeChat.value = chat
  activeChatListing.value = null
  drawerOpen.value = false
  drawerListing.value = null
  drawerSellerName.value = ''
  drawerSellerAvatar.value = ''

  // Clear messages immediately to avoid showing old messages
  messages.value = []

  // Update router query (non-blocking)
  router.replace({ query: { chatId: chat.id } }).catch(() => {})

  // Mark chat as read when selected - this will set lastReadAt to now
  // This ensures all existing messages are marked as read, not just new ones
  markChatAsRead(chat.id)

  // Clean up previous message listener
  if (unsubscribeMsgs) { unsubscribeMsgs(); unsubscribeMsgs = null }

  // Set up new message listener immediately
  const q = query(collection(db, `chats/${chat.id}/messages`), orderBy('timestamp', 'asc'))
  unsubscribeMsgs = onSnapshot(q, (snap) => {
    messages.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    // Don't call markChatAsRead here - it's already called once when selecting the chat
    // Calling it on every snapshot would create infinite loops with Firestore updates
  })

  // Delete previous chat only if it truly had no messages (not just cleared)
  // Wait a bit to ensure messages have loaded for the new chat before deleting old one
  if (previousChat && !previousChatHadMessages && previousChat.id !== chat.id) {
    // Wait for new chat messages to load first
    setTimeout(async () => {
      try {
        // Double-check the previous chat still has no messages by querying it
        const prevMsgsRef = collection(db, `chats/${previousChat.id}/messages`)
        const prevMsgsSnap = await getDocs(prevMsgsRef)
        if (prevMsgsSnap.empty) {
          await deleteDoc(doc(db, 'chats', previousChat.id))
          console.log('Deleted empty chat:', previousChat.id)
        }
      } catch (err) {
        console.error('Failed to delete empty chat:', err)
      }
    }, 500) // Give time for messages to load
  }

  // Fetch listing info asynchronously (non-blocking) - don't wait for it
  const sellerId = getOtherUid(chat)
  const listingId =
    chat.listingId ||
    chat.listingID ||
    chat.startedListingId ||
    chat.startedFromListingId ||
    chat.context?.listingId ||
    chat.context?.listing?.listingId ||
    route.query.listingId

  if (sellerId && listingId) {
    // Don't await - let it load in background
    fetchListingForChat(sellerId, listingId).catch(() => {})
  }
}

/* ───────── Fetch listing for chat (shape compatible with Home) ───────── */
async function fetchListingForChat(sellerId, listingId) {
  try {
    // 1) allListings/{listingId}
    const snap = await getDoc(doc(db, 'allListings', listingId))
    if (snap.exists()) {
      const data = snap.data()
      activeChatListing.value = {
        listingId: snap.id,
        userId: data.userId || sellerId,
        businessCategory: data.businessCategory || '',
        ...data
      }
      return
    }
    // 2) fallback: users/{sellerId}/myListings where listingId == listingId
    const myListingsRef = collection(db, 'users', sellerId, 'myListings')
    const q = query(myListingsRef, where('listingId', '==', listingId), fsLimit(1))
    const mySnap = await getDocs(q)
    if (!mySnap.empty) {
      const d = mySnap.docs[0]
      const data = d.data()
      activeChatListing.value = {
        listingId,
        userId: sellerId,
        businessCategory: data.businessCategory || '',
        ...data
      }
      return
    }
    activeChatListing.value = null
  } catch (e) {
    // Silently handle errors - console filter will suppress them
    activeChatListing.value = null
  }
}

/* ───────── Drawer open/close (SAME as Home) ───────── */
function openDrawer(listing) {
  if (!listing) {
    alert('No listing attached to this chat.')
    return
  }
  drawerListing.value = listing
  const sellerMeta = userCache.value[listing.userId] || userCache.value[otherUidActive.value] || {}
  drawerSellerName.value   = sellerMeta.displayName || ''
  drawerSellerAvatar.value = sellerMeta.photoURL || ''
  drawerOpen.value = true
}
function closeDrawer() {
  drawerOpen.value = false
  // keep drawerListing so reopening is instant (same as Home behaviour)
}

/* ───────── Messaging ───────── */
async function sendMessage() {
  if (!newMessage.value.trim() || !activeChat.value) return
  const text = newMessage.value.trim()
  newMessage.value = ''
  showPresetQuestions.value = false // Hide preset questions when sending a message

  await addDoc(collection(db, `chats/${activeChat.value.id}/messages`), {
    senderId: currentUserId.value,
    text,
    timestamp: serverTimestamp()
  })
  await setDoc(doc(db, 'chats', activeChat.value.id), {
    lastMessage: text,
    updatedAt: serverTimestamp()
  }, { merge: true })
}

/* ───────── Delete chat ───────── */
async function deleteChat(chatId) {
  const confirmed = window.confirm('Delete this chat permanently?')
  if (!confirmed) return
  try {
    const msgsRef = collection(db, `chats/${chatId}/messages`)
    const snap = await getDocs(msgsRef)
    for (const m of snap.docs) await deleteDoc(m.ref)

    await deleteDoc(doc(db, 'chats', chatId))

    if (activeChat.value?.id === chatId) {
      activeChat.value = null
      messages.value = []
      activeChatListing.value = null
      closeDrawer()
      router.replace({ query: {} })
    }
    chats.value = chats.value.filter(c => c.id !== chatId)
  } catch (err) {
    // Silently handle errors - console filter will suppress them
    alert('Failed to delete chat. Please try again.')
  }
}



/* ───────── Time helpers + date dividers ───────── */
function formatTime(ts) {
  if (!ts) return ''
  const d = ts.toDate()
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' })
}
function formatMessageTime(ts) {
  if (!ts) return ''
  const d = ts.toDate()
  return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate()
}
function labelForDate(d) {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-SG', { year: 'numeric', month: 'short', day: 'numeric' })
}
const groupedMessages = computed(() => {
  const groups = []
  let currentKey = ''
  messages.value.forEach(m => {
    const d = m.timestamp?.toDate ? m.timestamp.toDate() : new Date()
    const key = d.toDateString()
    if (key !== currentKey) {
      groups.push({ key, label: labelForDate(d), items: [m] })
      currentKey = key
    } else {
      groups[groups.length - 1].items.push(m)
    }
  })
  return groups
})
</script>

<template>
  <div class="chatbox-container">
    <div class="chat-layout">
      <!-- LEFT: Conversations -->
      <div :class="['conversations-sidebar', { collapsed: sidebarCollapsed }]">
        <div class="sidebar-header">
          <h4 class="sidebar-title">Messages</h4>
          <button
            class="toggle-sidebar-btn d-md-none"
            @click="sidebarCollapsed = !sidebarCollapsed"
            :title="sidebarCollapsed ? 'Show chats' : 'Hide chats'"
          >
            {{ sidebarCollapsed ? '☰' : '✕' }}
          </button>
        </div>

        <div class="conversations-list">
          <div
            v-for="chat in chats"
            :key="chat.id"
            :class="['conversation-item', { active: activeChat?.id === chat.id, 'has-unread': hasUnreadMessages(chat.id) }]"
            @click="selectChat(chat); sidebarCollapsed = true"
          >
            <div class="avatar-wrapper">
              <img
                :src="getOtherAvatar(chat)"
                :alt="getOtherName(chat)"
                class="user-avatar"
                @error="$event.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getOtherName(chat))}&background=ECE8FF&color=4b2aa6&size=128`"
              />
            </div>
            <div class="conversation-details">
              <div class="conversation-header">
                <!-- Name links to profile -->
                <router-link
                  class="user-name router-link"
                  :to="{ name: 'UserProfile', params: { userId: getOtherUid(chat) } }"
                  @click.stop
                >
                  {{ getOtherName(chat) }}
                </router-link>
                <span class="time-ago">{{ formatTime(chat.updatedAt) }}</span>
              </div>
              <p class="last-message">{{ chat.lastMessage || 'No messages yet' }}</p>
            </div>
          </div>

          <div v-if="chats.length === 0" class="empty-state">
            <p class="text-muted">No conversations yet</p>
          </div>
        </div>
      </div>

      <!-- RIGHT: Active Chat -->
      <div class="chat-panel">
        <div v-if="!activeChat" class="empty-chat-state">
          <div class="empty-content">
            <div class="empty-icon">💬</div>
            <h5>Select a chat to start messaging</h5>
            <p class="text-muted">Choose a conversation from the list</p>
          </div>
        </div>

        <div v-else class="active-chat">
          <!-- Header -->
          <div class="chat-header">
            <button
              class="back-btn d-md-none"
              @click="sidebarCollapsed = false; activeChat = null; activeChatListing = null; closeDrawer(); router.replace({ query: {} })"
            >
              ← Back
            </button>

            <!-- Avatar + name clickable to profile -->
            <router-link
              :to="{ name: 'UserProfile', params: { userId: otherUidActive } }"
              class="chat-user-info router-link flex-gap"
            >
              <img
                :src="activeChatAvatar"
                :alt="activeChatName"
                class="chat-user-avatar"
                @error="$event.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activeChatName)}&background=ECE8FF&color=4b2aa6&size=128`"
              />
              <div class="chat-user-details d-flex align-items-center gap-2">
                <h5 class="chat-user-name mb-0">{{ activeChatName }}</h5>
                <span style="cursor:pointer;" @click.stop="openBadgeInfoModal">
                  <SellerBadge :points="activeChat?.meta?.[otherUidActive]?.stats ? (activeChat.meta[otherUidActive].stats.reviews||0)+(activeChat.meta[otherUidActive].stats.boosts||0)*5 : 0" :progress="false" />
                </span>
              </div>
            </router-link>

            <!-- Listing preview: cover + title (click opens drawer exactly like Home) -->
            <div
              v-if="activeChatListing"
              class="listing-preview listing-preview--lg"
              @click="openDrawer(activeChatListing)"
              title="Open listing"
            >
              <img
                v-if="activeChatListing.photoUrls?.[0] || activeChatListing.photos?.[0]?.url"
                :src="activeChatListing.photoUrls?.[0] || activeChatListing.photos?.[0]?.url"
                alt="listing cover"
                class="listing-cover"
              />
              <div class="listing-title">
                {{ activeChatListing.businessName || 'Listing' }}
              </div>
            </div>

            <button
              class="delete-chat-btn"
              @click="deleteChat(activeChat.id)"
              title="Delete conversation"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>

          <!-- Messages + date dividers -->
          <div class="messages-container" ref="msgScrollContainer">
            <template v-for="group in groupedMessages" :key="group.key">
              <div class="date-divider">
                <span class="date-divider-label">{{ group.label }}</span>
              </div>

              <div
                v-for="msg in group.items"
                :key="msg.id"
                :class="['message-wrapper', msg.senderId === currentUserId ? 'sent' : 'received']"
              >
                <div class="message-bubble">
                  <p class="message-text">{{ msg.text }}</p>
                  <span class="message-time">{{ formatMessageTime(msg.timestamp) }}</span>
                </div>
              </div>
            </template>

            <div v-if="messages.length === 0" class="no-messages">
              <p class="text-muted">Start the conversation!</p>
            </div>
          </div>

          <!-- Preset Questions -->
          <div v-if="showPresetQuestions && messages.length === 0" class="preset-questions-container">
            <div class="preset-questions-header">
              <span class="preset-questions-title">Quick Questions</span>
              <button class="preset-questions-close" @click="showPresetQuestions = false" title="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div class="preset-questions-grid">
              <button
                v-for="(question, index) in presetQuestions"
                :key="index"
                class="preset-question-btn"
                @click="selectPresetQuestion(question)"
              >
                {{ question }}
              </button>
            </div>
          </div>

          <!-- Input -->
          <div class="message-input-container">
            <div class="input-wrapper">
              <button
                v-if="messages.length === 0"
                class="preset-toggle-btn"
                @click="showPresetQuestions = !showPresetQuestions"
                :title="showPresetQuestions ? 'Hide preset questions' : 'Show preset questions'"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
              <input
                v-model="newMessage"
                type="text"
                placeholder="Type a message..."
                class="message-input"
                @keyup.enter="sendMessage"
                @focus="showPresetQuestions = false"
                autocomplete="off"
              />
              <button class="send-btn" @click="sendMessage" :disabled="!newMessage.trim()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Drawer: EXACT same prop pattern as Home -->
      <ListingDrawer
        :open="drawerOpen"
        :listing="drawerListing"
        :sellerName="drawerSellerName"
        :sellerAvatar="drawerSellerAvatar"
        :radiusM="3000"
        :nearbyCap="60"
        :cacheGeocode="true"
        @close="closeDrawer"
      />

      <!-- Modal for badge info -->
      <Teleport to="body">
        <div v-if="badgeModalOpen" class="modal-backdrop" @click="closeBadgeInfoModal">
          <div class="modal-dialog modal-dialog-centered modal-badgeinfo" @click.stop>
            <div class="modal-content p-4">
              <div class="modal-header border-0 mb-2">
                <h5 class="modal-title">Seller Level & Badges</h5>
                <button type="button" class="btn-close-custom" @click="closeBadgeInfoModal">×</button>
              </div>
              <div class="modal-body">
                <div class="mb-3"><SellerBadge :points="activeChat?.meta?.[otherUidActive]?.stats ? (activeChat.meta[otherUidActive].stats.reviews||0)+(activeChat.meta[otherUidActive].stats.boosts||0)*5 : 0" :progress="true" /></div>
                <div>Earn points by:
                  <ul>
                    <li><b>1</b> point per review received</li>
                    <li><b>5</b> points per boost</li>
                  </ul>
                </div>
                <div class="mb-2"><b>Benefits:</b> Higher badge = more search visibility & credibility</div>
                <div>
                  <b>Levels:</b>
                  <ul>
                    <li>Bronze: 0–49 pts</li>
                    <li>Silver: 50–149 pts</li>
                    <li>Gold: 150–299 pts</li>
                    <li>Platinum: 300–499 pts</li>
                    <li>Diamond: 500+ pts</li>
                  </ul>
                </div>
                <small class="text-muted">This badge is visible on your listings and profile to help build trust.</small>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.chatbox-container { width: 100%; background: var(--color-bg-main); padding: 0; }
.chat-layout { display: flex; height: 80vh; max-height: 800px; background: var(--color-bg-white); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow-lg); border: 1px solid var(--color-border); }

/* LEFT */
.conversations-sidebar { width: 380px; min-width: 380px; background: var(--color-bg-white); border-right: 1px solid var(--color-border); display: flex; flex-direction: column; transition: all .3s ease; }
.sidebar-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-bg-white); }
.sidebar-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--color-text-primary); }
.toggle-sidebar-btn { background: none; border: none; font-size: 1.5rem; color: var(--color-text-primary); cursor: pointer; padding: .25rem; display: none; }
.conversations-list { flex: 1; overflow-y: auto; background: var(--color-bg-white); }
.conversation-item { display: flex; align-items: center; padding: 1rem 1.5rem; cursor: pointer; transition: background-color .2s ease; border-bottom: 1px solid var(--color-border); gap: 1rem; }
.conversation-item:hover { background: var(--color-bg-purple-tint); }
.conversation-item.active { background: var(--color-primary-pale); border-left: 3px solid var(--color-primary); }
.conversation-item.has-unread { background: rgba(75, 42, 166, 0.15); border-left: 3px solid var(--color-primary); font-weight: 600; }
.conversation-item.has-unread:hover { background: rgba(75, 42, 166, 0.2); }
.conversation-item.has-unread.active { background: var(--color-primary-pale); border-left: 3px solid var(--color-primary); }
.avatar-wrapper { flex-shrink: 0; }
.user-avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border); }
.conversation-details { flex: 1; min-width: 0; }
.conversation-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .25rem; }
.user-name { font-weight: 600; font-size: 1rem; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.router-link { text-decoration: none; color: inherit; }
.router-link:hover { text-decoration: underline; }
.time-ago { font-size: .813rem; color: var(--color-text-secondary); flex-shrink: 0; margin-left: .5rem; }
.last-message { margin: 0; font-size: .875rem; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty-state { padding: 3rem 1.5rem; text-align: center; }
.text-muted { color: var(--color-text-secondary) !important; }

/* RIGHT */
.chat-panel { flex: 1; display: flex; flex-direction: column; background: var(--color-bg-main); }
.empty-chat-state { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.empty-content { text-align: center; }
.empty-icon { font-size: 4rem; margin-bottom: 1rem; }
.empty-content h5 { color: var(--color-text-primary); margin-bottom: .5rem; }
.active-chat { flex: 1; display: flex; flex-direction: column; height: 100%; }

/* Header */
.chat-header { display: flex; align-items: center; gap: .75rem; padding: 1rem 1.5rem; background: var(--color-bg-white); border-bottom: 1px solid var(--color-border); }
.flex-gap { display: flex; align-items: center; gap: .75rem; }
.back-btn { background: none; border: none; color: var(--color-primary); font-weight: 600; cursor: pointer; padding: .5rem; display: none; }
.chat-user-info { display: flex; align-items: center; gap: .75rem; flex: 1; }
.chat-user-avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border); }
.chat-user-details { flex: 1; }
.chat-user-name { margin: 0; font-size: 1.125rem; font-weight: 600; color: var(--color-text-primary); }
.delete-chat-btn { background: none; border: none; color: var(--color-text-secondary); cursor: pointer; padding: .5rem; border-radius: 8px; transition: all .2s ease; }
.delete-chat-btn:hover { color: var(--color-error); background: rgba(220,53,69,.1); }

/* Listing preview chip */
.listing-preview { display: inline-flex; align-items: center; gap: .6rem; border: 1px solid var(--color-border); background: var(--color-bg-white); padding: .35rem .6rem; border-radius: 999px; cursor: pointer; transition: background .2s ease, transform .06s ease; max-width: 340px; }
.listing-preview:hover { background: var(--color-bg-purple-tint); }
.listing-preview:active { transform: scale(0.98); }
.listing-cover { width: 34px; height: 34px; border-radius: 8px; object-fit: cover; border: 1px solid var(--color-border); }
.listing-title { max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }

/* Messages */
.messages-container { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: .75rem; background: var(--color-bg-main); }
.messages-container::-webkit-scrollbar { width: 8px; }
.messages-container::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }
.message-wrapper { display: flex; margin-bottom: .5rem; }
.message-wrapper.received { justify-content: flex-start; }
.message-wrapper.sent { justify-content: flex-end; }
.message-bubble { max-width: 65%; padding: .75rem 1rem; border-radius: 16px; position: relative; }
.received .message-bubble { background: var(--color-bg-white); color: var(--color-text-primary); border: 1px solid var(--color-border); border-bottom-left-radius: 4px; }
.sent .message-bubble { background: var(--color-primary); color: white; border-bottom-right-radius: 4px; }
.message-text { margin: 0; font-size: .938rem; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
.message-time { display: block; font-size: .75rem; margin-top: .25rem; opacity: .7; text-align: right; }

/* Date divider */
.date-divider { display: flex; align-items: center; gap: .75rem; margin: .35rem 0 .5rem; opacity: .9; }
.date-divider::before, .date-divider::after { content: ''; flex: 1; height: 1px; background: var(--color-border); }
.date-divider-label { font-size: .78rem; color: var(--color-text-secondary); background: var(--color-bg-white); border: 1px solid var(--color-border); padding: .15rem .5rem; border-radius: 999px; }

/* Input */
.message-input-container { padding: 1rem 1.5rem; background: var(--color-bg-white); border-top: 1px solid var(--color-border); }
.input-wrapper { display: flex; align-items: center; gap: .75rem; background: var(--color-bg-main); border: 2px solid var(--color-border); border-radius: 24px; padding: .5rem .75rem; transition: border-color .2s ease; }
.input-wrapper:focus-within { border-color: var(--color-primary); }
.message-input { flex: 1; border: none; background: transparent; padding: .5rem; font-size: .938rem; color: var(--color-text-primary); outline: none; }
.message-input::placeholder { color: var(--color-text-secondary); }
.send-btn { background: var(--color-primary); color: white; border: none; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .2s ease; flex-shrink: 0; }
.send-btn:hover:not(:disabled) { background: var(--color-primary-hover); transform: scale(1.05); }
.send-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Preset Questions */
.preset-questions-container {
  padding: 1rem 1.5rem;
  background: var(--color-bg-white);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.preset-questions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.preset-questions-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preset-questions-close {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.preset-questions-close:hover {
  background: var(--color-bg-purple-tint);
  color: var(--color-primary);
}

.preset-questions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
}

.preset-question-btn {
  padding: 0.75rem 1rem;
  background: var(--color-bg-main);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  color: var(--color-text-primary);
  font-size: 0.875rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  word-wrap: break-word;
  white-space: normal;
}

.preset-question-btn:hover {
  background: var(--color-primary-pale);
  border-color: var(--color-primary);
  color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(75, 42, 166, 0.15);
}

.preset-question-btn:active {
  transform: translateY(0);
}

.preset-toggle-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.preset-toggle-btn:hover {
  background: var(--color-bg-purple-tint);
  color: var(--color-primary);
}

/* Responsive */
@media (max-width: 991.98px) {
  .conversations-sidebar { width: 320px; min-width: 320px; }
  .user-avatar { width: 50px; height: 50px; }
}
@media (max-width: 767.98px) {
  .chat-layout {
    height: calc(100vh - 120px);
    min-height: 500px;
    max-height: 80vh;
  }
  .conversations-sidebar { position: absolute; width: 100%; min-width: 100%; height: 100%; z-index: 10; transition: transform .3s ease; }
  .conversations-sidebar.collapsed { transform: translateX(-100%); }
  .toggle-sidebar-btn, .back-btn { display: block; }
  .chat-header { padding: .875rem 1rem; flex-wrap: wrap; gap: .5rem; }
  .listing-preview { order: 3; width: 100%; justify-content: center; }
  .messages-container { padding: 1rem; }
  .message-bubble { max-width: 85%; }
  .message-input-container { padding: .75rem 1rem; }
  .preset-questions-container { padding: 0.75rem 1rem; }
  .preset-questions-grid { grid-template-columns: 1fr; gap: 0.5rem; }
  .preset-question-btn { font-size: 0.813rem; padding: 0.625rem 0.875rem; }

  /* Ensure chat takes full width on mobile */
  .chat-section { width: 100%; }
}
@media (max-width: 575.98px) {
  .chat-layout {
    height: calc(100vh - 100px);
    min-height: 450px;
    max-height: 85vh;
    border-radius: 8px;
  }
  .user-avatar { width: 42px; height: 42px; }
  .chat-user-avatar { width: 36px; height: 36px; }
  .chat-user-name { font-size: 0.95rem; }
  .message-text { font-size: .85rem; }
  .message-time { font-size: .7rem; }
  .send-btn { width: 38px; height: 38px; }
  .message-bubble { max-width: 90%; font-size: 0.875rem; padding: 0.625rem 0.875rem; }
  .message-input { font-size: 0.875rem; }
}
.btn-close-custom {
  background:transparent; border:none; font-size:2rem; line-height:1; color:var(--color-text-primary); cursor:pointer; padding:0;width:28px;height:28px;display:flex;align-items:center;justify-content:center;}
.modal-badgeinfo { max-width: 380px; width: 94%;}
.modal-badgeinfo .modal-content { box-shadow: 0 4px 24px rgba(0,0,0,0.13); border-radius:10px;}
</style>
