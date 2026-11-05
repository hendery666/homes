<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { auth, db } from '@/firebase'
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'

const router = useRouter()
const loading = ref(true)
const isAdmin = ref(false)
const reports = ref([])
const selectedReport = ref(null)
const showDetailsModal = ref(false)
const processingAction = ref(false)
const filterStatus = ref('all') // all, pending, resolved, dismissed

onMounted(async () => {
  try {
    const user = auth.currentUser
    if (!user) {
      router.push('/login')
      return
    }

    // Check if user is admin
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    if (!userDoc.exists() || !userDoc.data().isAdmin) {
      alert('Access denied. Admin privileges required.')
      router.push('/home')
      return
    }

    isAdmin.value = true
    await loadReports()
  } catch (error) {
    console.error('Error loading admin dashboard:', error)
    alert('Failed to load admin dashboard')
    router.push('/home')
  } finally {
    loading.value = false
  }
})

async function loadReports() {
  try {
    // Try with orderBy first, if it fails (index not created), fetch without ordering
    let snapshot
    try {
      const reportsQuery = query(collection(db, 'reports'), orderBy('timestamp', 'desc'))
      snapshot = await getDocs(reportsQuery)
    } catch (indexError) {
      console.warn('Firestore index not found, fetching without ordering:', indexError)
      // Fallback: fetch all reports without ordering
      snapshot = await getDocs(collection(db, 'reports'))
    }

    if (snapshot.empty) {
      console.log('No reports found')
      reports.value = []
      return
    }

    reports.value = await Promise.all(snapshot.docs.map(async (reportDoc) => {
      const reportData = reportDoc.data()

      // Fetch listing details
      let listingDetails = null
      if (reportData.listingId) {
        try {
          const listingDoc = await getDoc(doc(db, 'allListings', reportData.listingId))
          if (listingDoc.exists()) {
            listingDetails = listingDoc.data()
          }
        } catch (err) {
          console.error('Error fetching listing:', err)
        }
      }

      // Fetch reporter details
      let reporterDetails = null
      if (reportData.reportedBy) {
        try {
          const reporterDoc = await getDoc(doc(db, 'users', reportData.reportedBy))
          if (reporterDoc.exists()) {
            reporterDetails = reporterDoc.data()
          }
        } catch (err) {
          console.error('Error fetching reporter:', err)
        }
      }

      return {
        id: reportDoc.id,
        ...reportData,
        listingDetails,
        reporterDetails
      }
    }))

    // Sort by timestamp client-side if we have timestamps
    reports.value.sort((a, b) => {
      const aTime = a.timestamp?.toMillis?.() || 0
      const bTime = b.timestamp?.toMillis?.() || 0
      return bTime - aTime
    })
  } catch (error) {
    console.error('Error loading reports:', error)
    alert('Failed to load reports: ' + error.message)
  }
}

const filteredReports = computed(() => {
  if (filterStatus.value === 'all') return reports.value
  return reports.value.filter(r => r.status === filterStatus.value)
})

const pendingCount = computed(() => reports.value.filter(r => r.status === 'pending').length)
const resolvedCount = computed(() => reports.value.filter(r => r.status === 'resolved').length)
const dismissedCount = computed(() => reports.value.filter(r => r.status === 'dismissed').length)

function openDetails(report) {
  selectedReport.value = report
  showDetailsModal.value = true
}

function closeDetails() {
  showDetailsModal.value = false
  selectedReport.value = null
}

async function updateReportStatus(reportId, status) {
  try {
    processingAction.value = true
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      reviewedAt: new Date()
    })

    // Update local state
    const report = reports.value.find(r => r.id === reportId)
    if (report) {
      report.status = status
    }

    alert(`Report ${status} successfully`)
    closeDetails()
  } catch (error) {
    console.error('Error updating report:', error)
    alert('Failed to update report')
  } finally {
    processingAction.value = false
  }
}

async function deleteListing(listingId, reportId) {
  if (!confirm('Are you sure you want to delete this listing? This action cannot be undone.')) {
    return
  }

  try {
    processingAction.value = true

    // Delete the listing
    await deleteDoc(doc(db, 'allListings', listingId))

    // Mark report as resolved
    await updateDoc(doc(db, 'reports', reportId), {
      status: 'resolved',
      action: 'listing_deleted',
      reviewedAt: new Date()
    })

    // Update local state
    const report = reports.value.find(r => r.id === reportId)
    if (report) {
      report.status = 'resolved'
    }

    alert('Listing deleted and report marked as resolved')
    closeDetails()
  } catch (error) {
    console.error('Error deleting listing:', error)
    alert('Failed to delete listing')
  } finally {
    processingAction.value = false
  }
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleString()
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'pending': return 'badge bg-warning text-dark'
    case 'resolved': return 'badge bg-success'
    case 'dismissed': return 'badge bg-secondary'
    default: return 'badge bg-secondary'
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="container-fluid py-4">
      <div class="admin-container">
        <div class="admin-header mb-4">
          <h1 class="admin-title">Admin Dashboard</h1>
          <p class="text-muted">Manage user reports and listings</p>
        </div>

        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>

        <template v-else>
          <!-- Stats Cards -->
          <div class="row mb-4">
            <div class="col-md-4 mb-3">
              <div class="stat-card pending">
                <div class="stat-icon">
                  <i class="fas fa-clock"></i>
                </div>
                <div class="stat-content">
                  <h3>{{ pendingCount }}</h3>
                  <p>Pending Reports</p>
                </div>
              </div>
            </div>
            <div class="col-md-4 mb-3">
              <div class="stat-card resolved">
                <div class="stat-icon">
                  <i class="fas fa-check-circle"></i>
                </div>
                <div class="stat-content">
                  <h3>{{ resolvedCount }}</h3>
                  <p>Resolved</p>
                </div>
              </div>
            </div>
            <div class="col-md-4 mb-3">
              <div class="stat-card dismissed">
                <div class="stat-icon">
                  <i class="fas fa-times-circle"></i>
                </div>
                <div class="stat-content">
                  <h3>{{ dismissedCount }}</h3>
                  <p>Dismissed</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Filter Tabs -->
          <div class="filter-tabs mb-4">
            <button
              :class="['filter-btn', { active: filterStatus === 'all' }]"
              @click="filterStatus = 'all'"
            >
              All Reports ({{ reports.length }})
            </button>
            <button
              :class="['filter-btn', { active: filterStatus === 'pending' }]"
              @click="filterStatus = 'pending'"
            >
              Pending ({{ pendingCount }})
            </button>
            <button
              :class="['filter-btn', { active: filterStatus === 'resolved' }]"
              @click="filterStatus = 'resolved'"
            >
              Resolved ({{ resolvedCount }})
            </button>
            <button
              :class="['filter-btn', { active: filterStatus === 'dismissed' }]"
              @click="filterStatus = 'dismissed'"
            >
              Dismissed ({{ dismissedCount }})
            </button>
          </div>

          <!-- Reports Table -->
          <div class="reports-table-container">
            <table class="reports-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Listing</th>
                  <th>Reason</th>
                  <th>Reporter</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="filteredReports.length === 0">
                  <td colspan="6" class="text-center py-4 text-muted">
                    No reports found
                  </td>
                </tr>
                <tr v-for="report in filteredReports" :key="report.id" class="report-row">
                  <td>
                    <span :class="getStatusBadgeClass(report.status)">
                      {{ report.status }}
                    </span>
                  </td>
                  <td>
                    <div class="listing-cell">
                      <strong>{{ report.listingName || 'Unknown' }}</strong>
                      <small class="text-muted d-block">ID: {{ report.listingId }}</small>
                    </div>
                  </td>
                  <td>{{ report.reason }}</td>
                  <td>
                    <div class="reporter-cell">
                      {{ report.reporterDetails?.username || report.reporterEmail || 'Unknown' }}
                    </div>
                  </td>
                  <td>
                    <small>{{ formatDate(report.timestamp) }}</small>
                  </td>
                  <td>
                    <button
                      class="btn btn-sm btn-primary"
                      @click="openDetails(report)"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>

    <!-- Details Modal -->
    <div v-if="showDetailsModal && selectedReport" class="modal-backdrop" @click="closeDetails">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h4>Report Details</h4>
          <button class="btn-close-custom" @click="closeDetails">×</button>
        </div>

        <div class="modal-body">
          <!-- Report Status -->
          <div class="detail-section">
            <label class="detail-label">Status</label>
            <span :class="getStatusBadgeClass(selectedReport.status)">
              {{ selectedReport.status }}
            </span>
          </div>

          <!-- Listing Information -->
          <div class="detail-section">
            <label class="detail-label">Reported Listing</label>
            <div class="listing-info">
              <strong>{{ selectedReport.listingName }}</strong>
              <small class="text-muted d-block">ID: {{ selectedReport.listingId }}</small>
              <div v-if="selectedReport.listingDetails" class="mt-2">
                <p class="mb-1"><strong>Category:</strong> {{ selectedReport.listingDetails.category }}</p>
                <p class="mb-1"><strong>Price:</strong> {{ selectedReport.listingDetails.price }}</p>
                <p class="mb-1"><strong>Report Count:</strong> {{ selectedReport.listingDetails.reportCount || 0 }}</p>
              </div>
              <div v-else class="text-danger mt-2">
                Listing no longer exists
              </div>
            </div>
          </div>

          <!-- Report Reason -->
          <div class="detail-section">
            <label class="detail-label">Reason</label>
            <p>{{ selectedReport.reason }}</p>
          </div>

          <!-- Explanation -->
          <div class="detail-section">
            <label class="detail-label">Explanation</label>
            <p class="explanation-text">{{ selectedReport.explanation }}</p>
          </div>

          <!-- Reporter Information -->
          <div class="detail-section">
            <label class="detail-label">Reporter</label>
            <div v-if="selectedReport.reporterDetails">
              <p class="mb-1"><strong>Username:</strong> {{ selectedReport.reporterDetails.username }}</p>
              <p class="mb-1"><strong>Email:</strong> {{ selectedReport.reporterEmail }}</p>
            </div>
            <div v-else>
              <p>{{ selectedReport.reporterEmail || 'Unknown' }}</p>
            </div>
          </div>

          <!-- Timestamp -->
          <div class="detail-section">
            <label class="detail-label">Reported At</label>
            <p>{{ formatDate(selectedReport.timestamp) }}</p>
          </div>
        </div>

        <div class="modal-footer">
          <button
            v-if="selectedReport.status === 'pending'"
            class="btn btn-secondary"
            @click="updateReportStatus(selectedReport.id, 'dismissed')"
            :disabled="processingAction"
          >
            Dismiss Report
          </button>
          <button
            v-if="selectedReport.status === 'pending'"
            class="btn btn-success"
            @click="updateReportStatus(selectedReport.id, 'resolved')"
            :disabled="processingAction"
          >
            Mark as Resolved
          </button>
          <button
            v-if="selectedReport.status === 'pending' && selectedReport.listingDetails"
            class="btn btn-danger"
            @click="deleteListing(selectedReport.listingId, selectedReport.id)"
            :disabled="processingAction"
          >
            <i class="fas fa-trash me-2"></i>Delete Listing
          </button>
          <button
            class="btn btn-outline-secondary"
            @click="closeDetails"
            :disabled="processingAction"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: var(--color-bg-main);
}

.admin-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1rem;
}

.admin-header {
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 1rem;
}

.admin-title {
  color: var(--color-text-primary);
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

/* Stats Cards */
.stat-card {
  background: var(--color-bg-white);
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border-left: 4px solid;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.stat-card.pending {
  border-left-color: #ffc107;
}

.stat-card.resolved {
  border-left-color: #28a745;
}

.stat-card.dismissed {
  border-left-color: #6c757d;
}

.stat-icon {
  font-size: 2.5rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-bg-purple-tint);
  color: var(--color-primary);
}

.stat-card.pending .stat-icon {
  background: rgba(255, 193, 7, 0.1);
  color: #ffc107;
}

.stat-card.resolved .stat-icon {
  background: rgba(40, 167, 69, 0.1);
  color: #28a745;
}

.stat-card.dismissed .stat-icon {
  background: rgba(108, 117, 125, 0.1);
  color: #6c757d;
}

.stat-content h3 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
}

.stat-content p {
  color: var(--color-text-secondary);
  margin: 0;
  font-size: 0.9rem;
}

/* Filter Tabs */
.filter-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-btn {
  padding: 0.625rem 1.25rem;
  border: 2px solid var(--color-border);
  background: var(--color-bg-white);
  color: var(--color-text-primary);
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.filter-btn.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Reports Table */
.reports-table-container {
  background: var(--color-bg-white);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
}

.reports-table thead {
  background: var(--color-bg-purple-tint);
}

.reports-table th {
  padding: 1rem;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-primary);
  border-bottom: 2px solid var(--color-border);
}

.reports-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.report-row:hover {
  background: var(--color-bg-purple-tint);
}

.listing-cell strong {
  color: var(--color-text-primary);
  display: block;
  margin-bottom: 0.25rem;
}

.reporter-cell {
  color: var(--color-text-primary);
}

/* Modal */
.modal-backdrop {
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

.modal-content {
  background: var(--color-bg-white);
  border-radius: 16px;
  width: 100%;
  max-width: 700px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h4 {
  color: var(--color-text-primary);
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
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

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.detail-section {
  margin-bottom: 1.5rem;
}

.detail-label {
  display: block;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
}

.listing-info {
  background: var(--color-bg-purple-tint);
  padding: 1rem;
  border-radius: 8px;
  color: var(--color-text-primary);
}

.explanation-text {
  background: var(--color-bg-purple-tint);
  padding: 1rem;
  border-radius: 8px;
  white-space: pre-wrap;
  color: var(--color-text-primary);
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.modal-footer .btn {
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
  transform: translateY(-1px);
}

.btn-success {
  background: #28a745;
  color: white;
  border: none;
}

.btn-success:hover:not(:disabled) {
  background: #218838;
  transform: translateY(-1px);
}

.btn-danger {
  background: #dc3545;
  color: white;
  border: none;
}

.btn-danger:hover:not(:disabled) {
  background: #c82333;
  transform: translateY(-1px);
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border: none;
}

.btn-secondary:hover:not(:disabled) {
  background: #5a6268;
  transform: translateY(-1px);
}

.btn-outline-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 2px solid var(--color-border);
}

.btn-outline-secondary:hover:not(:disabled) {
  background: var(--color-bg-purple-tint);
  border-color: var(--color-primary);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 767.98px) {
  .admin-title {
    font-size: 1.5rem;
  }

  .reports-table-container {
    overflow-x: auto;
  }

  .reports-table {
    min-width: 800px;
  }

  .modal-content {
    max-width: calc(100vw - 2rem);
  }

  .modal-footer {
    flex-direction: column;
  }

  .modal-footer .btn {
    width: 100%;
  }
}
</style>
