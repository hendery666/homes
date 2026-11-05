import { ref, computed } from 'vue'
import { auth, db } from '@/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore'

const unreadCount = ref(0)
let unsubscribeChats = null
let currentUserId = null
const chatUnreadCounts = ref({}) // chatId -> count
const optimisticallyReadChats = ref(new Set()) // Track chats optimistically marked as read
const savingReadStatus = ref(new Set()) // Track chats currently being saved to prevent duplicate writes

export function useMessageNotifications() {
  
  async function calculateUnreadCount() {
    if (!currentUserId) {
      unreadCount.value = 0
      return
    }
    
    try {
      // Get all chats for current user
      const chatsRef = collection(db, 'chats')
      const chatsQuery = query(chatsRef, where('participants', 'array-contains', currentUserId))
      const chatsSnap = await getDocs(chatsQuery)
      
      let totalUnread = 0
      const chatIds = []
      
      chatsSnap.forEach((chatDoc) => {
        chatIds.push(chatDoc.id)
      })
      
      // For each chat, count unread messages
      for (const chatId of chatIds) {
        // ALWAYS respect optimistic updates FIRST - if marked as read, count is 0
        // This prevents old messages from being counted as unread after opening a chat
        if (optimisticallyReadChats.value.has(chatId)) {
          chatUnreadCounts.value[chatId] = 0
          totalUnread += 0
          continue // Skip server calculation for optimistically read chats
        }
        
        // Calculate unread count from server - countUnreadInChat will properly check lastReadAt
        // and only count messages sent after lastReadAt
        const count = await countUnreadInChat(chatId)
        chatUnreadCounts.value[chatId] = count
        totalUnread += count
      }
      
      unreadCount.value = totalUnread
    } catch (error) {
      // Silently handle errors - don't log permission errors
      // Console filter will suppress these anyway
      unreadCount.value = 0
    }
  }
  
  async function countUnreadInChat(chatId) {
    if (!currentUserId || !chatId) return 0
    
    // Always count from server - don't skip based on optimistic value
    // This ensures new messages are counted even after a chat is marked as read
    
    try {
      // Get last read timestamp for this chat - silently handle permission errors
      // Store lastReadAt in the main chat document under a 'readBy' map field
      // This avoids subcollection permission issues
      let lastRead = null
      try {
        const chatDocRef = doc(db, 'chats', chatId)
        const chatSnap = await getDoc(chatDocRef)
        if (chatSnap.exists()) {
          const chatData = chatSnap.data()
          // readBy is a map of userId -> lastReadAt timestamp
          const readBy = chatData.readBy || {}
          lastRead = readBy[currentUserId] || null
        }
        // If chat doesn't exist or readBy doesn't have currentUserId, lastRead stays null
      } catch (readError) {
        // Permission errors mean we can't access readStatus - assume no read time
        // This will cause all messages to be counted as unread (conservative approach)
        // If there's no lastReadAt (permission error or doesn't exist), all messages will be counted as unread
        // This is correct behavior - user hasn't read the chat yet, or we can't access read status
        lastRead = null
        // Don't return 0 here - let it continue to count unread messages
        // Returning 0 would hide unread messages if there's a permission error
      }
      
      // Get all messages in this chat - silently handle permission errors
      let messagesSnap
      try {
        const messagesRef = collection(db, `chats/${chatId}/messages`)
        messagesSnap = await getDocs(messagesRef)
      } catch (msgError) {
        // Silently ignore permission errors for messages
        if (msgError.code !== 'permission-denied' && msgError.code !== 'PERMISSION_DENIED') {
          return 0
        }
        return 0
      }
      
      let count = 0
      // Convert Firestore Timestamp to Date properly
      // This is critical - if lastReadTime is null, ALL messages are unread
      // If lastReadTime exists, only messages sent after it are unread
      let lastReadTime = null
      if (lastRead) {
        if (lastRead.toDate && typeof lastRead.toDate === 'function') {
          lastReadTime = lastRead.toDate()
        } else if (lastRead.seconds && typeof lastRead.seconds === 'number') {
          // Convert Firestore Timestamp seconds to Date
          const nanoseconds = lastRead.nanoseconds || 0
          lastReadTime = new Date(lastRead.seconds * 1000 + nanoseconds / 1000000)
        } else if (lastRead instanceof Date) {
          lastReadTime = lastRead
        } else if (typeof lastRead === 'string') {
          lastReadTime = new Date(lastRead)
        } else if (lastRead._seconds) {
          // Alternative Firestore timestamp format
          const seconds = lastRead._seconds
          const nanoseconds = lastRead._nanoseconds || 0
          lastReadTime = new Date(seconds * 1000 + nanoseconds / 1000000)
        }

        // Validate that lastReadTime is a valid date
        if (lastReadTime && (isNaN(lastReadTime.getTime()) || !(lastReadTime instanceof Date))) {
          lastReadTime = null
        }
      }
      
      messagesSnap.forEach((msgDoc) => {
        const msg = msgDoc.data()
        // Only count messages NOT sent by current user (messages from others)
        if (msg.senderId && msg.senderId !== currentUserId) {
          // Convert message timestamp to Date properly
          let msgTime = null
          if (msg.timestamp) {
            if (msg.timestamp.toDate) {
              msgTime = msg.timestamp.toDate()
            } else if (msg.timestamp.seconds) {
              msgTime = new Date(msg.timestamp.seconds * 1000)
            } else if (msg.timestamp instanceof Date) {
              msgTime = msg.timestamp
            } else if (typeof msg.timestamp === 'string') {
              msgTime = new Date(msg.timestamp)
            }
          }
          
          if (!msgTime) return // Skip if we can't parse timestamp
          
          // Count only if message time is valid and after last read time
          if (lastReadTime) {
            const timeDiff = msgTime.getTime() - lastReadTime.getTime()

            // Messages sent BEFORE lastReadTime are always considered read (timeDiff <= 0)
            // Messages sent AFTER lastReadTime are unread (timeDiff > 0)
            // Use a 1-second buffer to account for timestamp precision and server sync delays
            if (timeDiff > 1000) {
              // Message was sent more than 1 second AFTER lastReadTime - it's unread
              count++
            }
            // If timeDiff <= 1000ms (or negative), message is considered read
            // This ensures that when we mark as read with serverTimestamp(), all existing messages
            // are properly excluded
          } else {
            // No lastReadTime means user has never read this chat - count ALL messages as unread
            count++
          }
        }
      })
      
      return count
    } catch (error) {
      // Silently return 0 for any errors - don't log permission errors
      // The console filter will suppress these anyway, but we avoid logging them
      return 0
    }
  }
  
  function startListening() {
    if (!auth.currentUser) return

    currentUserId = auth.currentUser.uid
    // Don't clear optimistic reads on login anymore - rely entirely on lastReadAt from Firestore
    // The optimistic reads are only needed during the current session to prevent race conditions
    // After login, lastReadAt timestamps in Firestore should be the source of truth
    // Clear optimistic only on logout (in stopListening)
    chatUnreadCounts.value = {}
    // Calculate unread count from server - this will read lastReadAt from Firestore
    // If lastReadAt exists, only messages sent after it will be counted as unread
    calculateUnreadCount()
    
    // Listen to all chats where user is a participant
    const chatsRef = collection(db, 'chats')
    const chatsQuery = query(chatsRef, where('participants', 'array-contains', currentUserId))
    
    unsubscribeChats = onSnapshot(chatsQuery, async (snap) => {
      try {
        const chatIds = snap.docs.map(doc => doc.id)
        
        // Count unread for all chats - silently handle any errors
        // IMPORTANT: Skip server calculation for optimistically read chats to prevent old messages from being counted
        const counts = await Promise.all(chatIds.map(async (chatId) => {
          try {
            // ALWAYS respect optimistic updates FIRST - if marked as read, count is 0
            // Don't even call countUnreadInChat for optimistically read chats
            // (These are chats that were opened in this session and marked as read)
            if (optimisticallyReadChats.value.has(chatId)) {
              return 0
            }
            
            // For all other chats, call countUnreadInChat which will properly check lastReadAt
            // and only count messages sent after lastReadAt
            return await countUnreadInChat(chatId)
          } catch (err) {
            // Silently return 0 for any errors
            return 0
          }
        }))
        
        // Update counts - ALWAYS respect optimistic updates
        chatIds.forEach((chatId, index) => {
          if (optimisticallyReadChats.value.has(chatId)) {
            // Never override optimistic reads - they should always be 0
            chatUnreadCounts.value[chatId] = 0
          } else {
            chatUnreadCounts.value[chatId] = counts[index]
          }
        })
        
        // Recalculate total from all chat counts
        const total = Object.values(chatUnreadCounts.value).reduce((sum, c) => sum + c, 0)
        unreadCount.value = total
      } catch (err) {
        // Silently handle any errors in the snapshot callback
        unreadCount.value = 0
      }
    }, (error) => {
      // Silently handle snapshot errors (permission denied, etc.)
      unreadCount.value = 0
    })
    
    // Listen for auth changes
    onAuthStateChanged(auth, (user) => {
      if (user && user.uid !== currentUserId) {
        if (unsubscribeChats) unsubscribeChats()
        currentUserId = user.uid
        chatUnreadCounts.value = {}
        startListening()
      } else if (!user) {
        if (unsubscribeChats) unsubscribeChats()
        unreadCount.value = 0
        chatUnreadCounts.value = {}
        optimisticallyReadChats.value.clear()
        currentUserId = null
      }
    })
  }
  
  function stopListening() {
    if (unsubscribeChats) {
      unsubscribeChats()
      unsubscribeChats = null
    }
    unreadCount.value = 0
    chatUnreadCounts.value = {}
    optimisticallyReadChats.value.clear()
  }
  
  async function markChatAsRead(chatId) {
    if (!currentUserId || !chatId) return

    // Prevent duplicate saves - if already saving, skip
    if (savingReadStatus.value.has(chatId)) {
      return
    }

    // Mark as currently saving to prevent duplicate calls
    savingReadStatus.value.add(chatId)

    // Mark this chat as optimistically read
    optimisticallyReadChats.value.add(chatId)

    // Update local count immediately (optimistic update)
    chatUnreadCounts.value[chatId] = 0
    const total = Object.values(chatUnreadCounts.value).reduce((sum, c) => sum + c, 0)
    unreadCount.value = total

    // Save read status to Firestore
    try {
      const chatDocRef = doc(db, 'chats', chatId)
      const now = Timestamp.now()

      // Update the readBy map field in the chat document
      await updateDoc(chatDocRef, {
        [`readBy.${currentUserId}`]: now
      })

      // Remove flags after successful write
      setTimeout(() => {
        optimisticallyReadChats.value.delete(chatId)
        savingReadStatus.value.delete(chatId)
      }, 2000)
    } catch (error) {
      // Remove saving flag on error so it can be retried
      savingReadStatus.value.delete(chatId)
      // Keep optimistic update to ensure UI is correct
    }
  }
  
  return {
    unreadCount: computed(() => unreadCount.value),
    chatUnreadCounts: computed(() => chatUnreadCounts.value),
    startListening,
    stopListening,
    markChatAsRead,
    countUnreadInChat
  }
}
