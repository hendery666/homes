import { db } from '@/firebase'
import {
  addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp, updateDoc
} from 'firebase/firestore'

export async function startChatWithUser(currentUid, targetUid, listingId) {
  const chatsRef = collection(db, 'chats')

  // Reuse existing 1:1 chat if present
  const q = query(chatsRef, where('participants', 'array-contains', currentUid))
  const snap = await getDocs(q)
  let existing = null
  snap.forEach(d => {
    const p = d.data()?.participants || []
    if (p.length === 2 && p.includes(targetUid)) existing = { id: d.id, ...d.data() }
  })

  // If chat exists, backfill listingId if we have one
  if (existing) {
    if (listingId && !existing.listingId) {
      await updateDoc(doc(db, 'chats', existing.id), {
        listingId,
        sellerId: targetUid,                 // optional but handy
        updatedAt: serverTimestamp()
      })
    }
    return existing.id
  }

  // Optional: grab a tiny preview so the header can render instantly
  let listingPreview = null
  if (listingId) {
    const ls = await getDoc(doc(db, 'allListings', listingId)).catch(() => null)
    if (ls?.exists()) {
      const d = ls.data()
      listingPreview = {
        title: d.businessName || '',
        cover: d.photoUrls?.[0] || d.photos?.[0]?.url || ''
      }
    }
  }

  const payload = {
    participants: [currentUid, targetUid],
    lastMessage: '',
    updatedAt: serverTimestamp(),
    ...(listingId ? { listingId, sellerId: targetUid } : {}),
    ...(listingPreview ? { listingPreview } : {})
  }

  const created = await addDoc(chatsRef, payload)
  return created.id
}
