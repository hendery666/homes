<script setup>
import { useRouter } from 'vue-router'
import { auth } from '@/firebase'
import { startChatWithUser } from '../helpers/chatHelper'

const props = defineProps({
  targetUserId: { type: String, required: true },
  listingId:    { type: String, default: '' },         // 👈 new
  listingTitle: { type: String, default: '' },         // 👈 optional
  listingCover: { type: String, default: '' }          // 👈 optional
})

const router = useRouter()

async function handleStartChat() {
  const currentUser = auth.currentUser
  if (!currentUser) { alert('You must be logged in to start a chat.'); return }

  // Forward listing info so it’s saved on the chat
  const chatId = await startChatWithUser(
    currentUser.uid,
    props.targetUserId,
    props.listingId,
    { title: props.listingTitle, cover: props.listingCover }  // optional preview
  )
  if (chatId) router.push({ name: 'chat', query: { chatId } })
}
</script>

<template>
  <button class="btn btn-sm btn-outline-secondary" @click.stop="handleStartChat">
    💬 Chat
  </button>
</template>
