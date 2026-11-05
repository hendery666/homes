<script>
import { ref, computed, onMounted } from 'vue'
import { collection, getDoc, getDocs, doc, updateDoc, getFirestore, query, orderBy } from 'firebase/firestore'

export default {
    components: {},
    setup() {
        const submissions = ref([])
        const filter = ref('all')
        const dbInstance = getFirestore()
        
        // Toast notification state
        const notification = ref({ show: false, type: '', message: '' });

        // Fetching feedbacks and issues
        const fetchSubmissions = async () => {
            const qFeedback = query(collection(dbInstance, 'feedback'), orderBy('createdAt', 'desc'))
            const qIssues = query(collection(dbInstance, 'issues'), orderBy('createdAt', 'desc'))

            const feedbackSnapshot = await getDocs(qFeedback)
            const issuesSnapshot = await getDocs(qIssues)

            const feedbacks = feedbackSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'feedback' }))
            const issues = issuesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'issue' }))

            submissions.value = [...feedbacks, ...issues].sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds || 0)
        }

        // Mark as reviewed function with toast notifications
        const markReviewed = async (item) => {
            try {
                const collectionName = item.type === 'feedback' ? 'feedback' : 'issues';
                const docRef = doc(dbInstance, collectionName, item.id);

                // Ensure the document exists before updating
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    throw new Error('Document not found');
                }

                // Update the 'reviewed' field to true
                await updateDoc(docRef, { reviewed: true });

                // Update the item in the UI (local state)
                item.reviewed = true;

                console.log(`Document ${item.id} marked as reviewed successfully.`);

                // Show success toast notification
                notification.value = {
                    show: true,
                    type: 'success', // Success type
                    message: `Feedback has been marked as reviewed!`,
                };

                // Hide the notification after 5 seconds
                setTimeout(() => {
                    notification.value.show = false;
                }, 5000);

            } catch (err) {
                console.error('Error marking reviewed:', err);

                // Show error toast notification
                notification.value = {
                    show: true,
                    type: 'danger', // Error type
                    message: 'Failed to mark as reviewed. Please try again.',
                };

                // Hide the notification after 5 seconds
                setTimeout(() => {
                    notification.value.show = false;
                }, 5000);
            }
        }

        const formatDate = (timestamp) => {
            if (!timestamp) return ''
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
            return date.toLocaleString()
        }

        const filteredSubmissions = computed(() => {
            if (filter.value === 'all') return submissions.value
            if (filter.value === 'reviewed') return submissions.value.filter(s => s.reviewed)
            if (filter.value === 'unreviewed') return submissions.value.filter(s => !s.reviewed)
            return submissions.value
        })

        onMounted(fetchSubmissions)

        return { submissions, filteredSubmissions, filter, markReviewed, formatDate, notification }
    }
}

</script>

<template>
    <div class="container my-5">
        <h2 class="text-center mb-4">User Feedback & Reported Issues</h2>

        <!-- Filter Buttons -->
        <div class="d-flex justify-content-center mb-4">
            <button class="btn all-btn me-2" :class="filter === 'all' ? 'active-all' : 'btn-outline-primary'"
                @click="filter = 'all'">
                All
            </button>
            <button class="btn btn-outline-success me-2" :class="filter === 'reviewed' ? 'active' : ''"
                @click="filter = 'reviewed'">
                Reviewed
            </button>
            <button class="btn btn-outline-danger" :class="filter === 'unreviewed' ? 'active' : ''"
                @click="filter = 'unreviewed'">
                Unreviewed
            </button>
        </div>

        <!-- Toast Notification -->
        <div v-if="notification.show" :class="['notification-toast', notification.type]">
            <div class="notification-content">
                <span class="notification-icon">{{ notification.type === 'danger' ? '⚠️' : '✓' }}</span>
                <span class="notification-message">{{ notification.message }}</span>
                <button class="notification-close" @click="notification.show = false">✕</button>
            </div>
        </div>

        <div class="row g-3">
            <div v-if="filteredSubmissions.length === 0" class="col-12">
                <p class="text-muted text-center">No submissions to display.</p>
            </div>

            <div v-for="doc in filteredSubmissions" :key="doc.id" class="col-12">
                <div :class="['card', doc.reviewed ? 'border-success' : 'border-danger']">
                    <div class="card-body d-flex justify-content-between align-items-start">
                        <div>
                            <h5 class="card-title">
                                {{ doc.type === 'feedback' ? 'Feedback' : 'Report Issue' }}
                                <span v-if="doc.reviewed" class="badge bg-success ms-2">Reviewed</span>
                            </h5>
                            <h6 class="card-subtitle mb-2 text-muted">
                                {{ doc.name }} | {{ doc.email }} | {{ doc.phone }}
                            </h6>
                            <p class="card-text">
                                <strong>Context / Category:</strong> {{ doc.context }}<br />
                                <strong>Description:</strong> {{ doc.description }}
                            </p>
                            <small class="text-muted">
                                Submitted on: {{ formatDate(doc.createdAt) }}
                            </small>
                        </div>
                        <button v-if="!doc.reviewed" class="btn btn-success" @click="markReviewed(doc)">
                            Mark as Reviewed
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>


<style scoped>
/* Container and page title */
.container {
    color: var(--color-text-primary);
}

h2 {
    color: var(--color-text-primary);
}

:root.dark-mode h2 {
    color: var(--color-text-primary);
}

/* Card styling */
.card {
    transition: all 0.2s ease;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border-width: 2px;
}

:root.dark-mode .card {
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
}

/* Card borders based on status */
.card.border-success {
    border-color: #28a745 !important;
}

.card.border-danger {
    border-color: #dc3545 !important;
}

:root.dark-mode .card.border-success {
    border-color: #4ade80 !important;
}

:root.dark-mode .card.border-danger {
    border-color: #fb7185 !important;
}

/* Card content */
.card-title {
    color: var(--color-text-primary);
}

.card-subtitle,
.card-text strong,
small.text-muted {
    color: var(--color-text-secondary) !important;
}

:root.dark-mode .card-subtitle,
:root.dark-mode .card-text strong,
:root.dark-mode small.text-muted {
    color: var(--color-text-secondary) !important;
}

.card-text {
    color: var(--color-text-primary);
}

/* Badge styling */
.badge.bg-success {
    background-color: #28a745 !important;
    color: white;
}

:root.dark-mode .badge.bg-success {
    background-color: #3dd365 !important;
    color: #000;
}

/* Empty state text */
p.text-muted {
    color: var(--color-text-secondary) !important;
}

/* Filter buttons */
.all-btn {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: transparent;
    transition: all 0.2s ease;
}

:root.dark-mode .all-btn {
    border-color: var(--color-primary);
    color: var(--color-primary);
}

.active-all {
    background-color: var(--color-primary) !important;
    color: #fff !important;
    border-color: var(--color-primary) !important;
}

:root.dark-mode .active-all {
    background-color: var(--color-primary) !important;
    color: #fff !important;
}

.all-btn:focus {
    box-shadow: none;
    outline: none;
    background-color: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
}

.all-btn.btn-outline-primary:hover {
    background-color: var(--color-primary);
    color: #fff;
    border-color: var(--color-primary);
}

/* Reviewed button (green) */
.btn-outline-success {
    border-color: #28a745;
    color: #28a745;
    background: transparent;
    transition: all 0.2s ease;
}

:root.dark-mode .btn-outline-success {
    border-color: #3dd365;
    color: #3dd365;
}

.btn-outline-success.active,
.btn-outline-success:hover {
    background-color: #28a745 !important;
    color: #fff !important;
    border-color: #28a745 !important;
}

:root.dark-mode .btn-outline-success.active,
:root.dark-mode .btn-outline-success:hover {
    background-color: #3dd365 !important;
    color: #000 !important;
    border-color: #3dd365 !important;
}

/* Unreviewed button (red) */
.btn-outline-danger {
    border-color: #dc3545;
    color: #dc3545;
    background: transparent;
    transition: all 0.2s ease;
}

:root.dark-mode .btn-outline-danger {
    border-color: #f56e7e;
    color: #f56e7e;
}

.btn-outline-danger.active,
.btn-outline-danger:hover {
    background-color: #dc3545 !important;
    color: #fff !important;
    border-color: #dc3545 !important;
}

:root.dark-mode .btn-outline-danger.active,
:root.dark-mode .btn-outline-danger:hover {
    background-color: #f56e7e !important;
    color: #000 !important;
    border-color: #f56e7e !important;
}

/* Mark as Reviewed button */
.btn-success {
    background-color: #28a745;
    border-color: #28a745;
    color: #fff;
    transition: all 0.2s ease;
}

.btn-success:hover {
    background-color: #218838;
    border-color: #1e7e34;
}

:root.dark-mode .btn-success {
    background-color: #3dd365;
    border-color: #3dd365;
    color: #000;
}

:root.dark-mode .btn-success:hover {
    background-color: #2fc157;
    border-color: #2fc157;
    color: #000;
}

/* Custom Notification Toast */
.notification-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  min-width: 320px;
  max-width: 500px;
  background: var(--color-bg-white); /* Default background */
  color: var(--color-text-primary); /* Default text color */
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: slideInRight 0.3s ease-out;
  z-index: 10000;
  border-left: 4px solid;
}

/* Success Toast */
.notification-toast.success {
  background-color: #28a745; /* Green background */
  color: #fff; /* White text */
  border-left-color: #28a745; /* Green border */
}

/* Error Toast */
.notification-toast.error {
  background-color: #dc3545; /* Red background */
  color: #fff; /* White text */
  border-left-color: #dc3545; /* Red border */
}

/* Warning Toast */
.notification-toast.warning {
  background-color: #ffc107; /* Yellow background */
  color: #fff; /* White text */
  border-left-color: #ffc107; /* Yellow border */
}

/* Info Toast */
.notification-toast.info {
  background-color: #17a2b8; /* Blue background */
  color: #fff; /* White text */
  border-left-color: #17a2b8; /* Blue border */
}

.notification-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
}

.notification-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.notification-message {
  flex: 1;
  color: inherit; /* Inherit text color */
  font-weight: 500;
  font-size: 0.938rem;
  line-height: 1.4;
}

.notification-close {
  background: none;
  border: none;
  color: inherit; /* Inherit text color */
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.notification-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: var(--color-text-primary);
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
</style>
