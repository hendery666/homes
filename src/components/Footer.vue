<template>
  <footer class="app-footer">
    <div class="container py-4">
      <div class="row g-4">
        <!-- About Section -->
        <div class="col-md-6">
          <h5 class="footer-title mb-3">Homes</h5>
          <p class="footer-text mb-3">
            Discover and list home-based businesses in your area. Connect with local entrepreneurs and support your
            community.
          </p>
          <p class="footer-tagline">
            Supporting Local Home-Based Businesses
          </p>
        </div>

        <!-- Contact & Links -->
        <div class="col-md-6">
          <h5 class="footer-title mb-3">Quick Links</h5>
          <div class="footer-links-list">
            <p class="footer-text mb-3">
              <Icon icon="mdi:form" class="me-2" />
              <a href="#" @click.prevent="showFeedback = true"
                style="text-decoration: none; color: inherit; cursor: pointer;">
                Give Feedback
              </a>
            </p>
            <p class="footer-text mb-3">
              <Icon icon="mdi:home" class="me-2" />
              <router-link to="/home" style="text-decoration: none; color: inherit;">
                Browse Businesses
              </router-link>
            </p>
            <p class="footer-text mb-0">
              <Icon icon="mdi:plus-circle" class="me-2" />
              <router-link to="/newBusiness" style="text-decoration: none; color: inherit;">
                List Your Business
              </router-link>
            </p>
          </div>
        </div>
      </div>

      <hr class="footer-divider my-4" />

      <!-- Copyright -->
      <div class="row">
        <div class="col-12 text-center">
          <p class="footer-copyright mb-0">
            &copy; {{ currentYear }} Homes. All rights reserved.
          </p>
        </div>
      </div>
      <div v-if="showFeedback" class="modal-backdrop" @click="closeModalOnBackdropClick">
      <div class="modal-content p-4 rounded shadow bg-white" @click.stop>
        <!-- Close button at top-right -->
        <button 
          class="btn-close position-absolute top-0 end-0 m-3" 
          @click="showFeedback = false">
        </button>
          <Feedback />
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { Icon } from '@iconify/vue'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import Feedback from './Feedback.vue';

const currentYear = computed(() => new Date().getFullYear())
const showFeedback = ref(false);

// Close modal on Escape key press
const closeModalOnEscape = (event) => {
  if (event.key === 'Escape') {
    showFeedback.value = false;
  }
};

// Close modal when clicking outside the modal content (on backdrop)
const closeModalOnBackdropClick = () => {
  showFeedback.value = false;
};

onMounted(() => {
  // Add event listener for Escape key press when modal is open
  window.addEventListener('keydown', closeModalOnEscape);
});

onBeforeUnmount(() => {
  // Remove event listener when the component is destroyed
  window.removeEventListener('keydown', closeModalOnEscape);
});
</script>

<style scoped>
.app-footer {
  background: #f8f9fa;
  color: #333;
  margin-top: auto;
  border-top: 1px solid #e0e0e0;
}

:root.dark-mode .app-footer {
  background: var(--color-bg-secondary, #1a1a2e);
  color: var(--color-text-primary, #e0e0e0);
  border-top: 1px solid #2a2a3e;
}

.footer-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-primary, #5A43C5);
  margin-bottom: 1rem;
}

:root.dark-mode .footer-title {
  color: var(--color-primary, #8B7DE8);
}

.footer-text {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #666;
  margin-bottom: 0.5rem;
}

:root.dark-mode .footer-text {
  color: #aaa;
}

.footer-tagline {
  font-size: 0.85rem;
  color: var(--color-primary);
  font-weight: 500;
  display: flex;
  align-items: center;
}

:root.dark-mode .footer-tagline {
  color: var(--color-primary-lighter);
}

.footer-links-list a:hover,
.footer-links-list router-link:hover {
  text-decoration: underline !important;
  color: var(--color-primary) !important;
}

.footer-links {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footer-links li {
  margin-bottom: 0.5rem;
}

.footer-links a {
  color: #666;
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s ease;
}

.footer-links a:hover {
  color: var(--color-primary, #5A43C5);
}

:root.dark-mode .footer-links a {
  color: #aaa;
}

:root.dark-mode .footer-links a:hover {
  color: var(--color-primary, #8B7DE8);
}

.footer-divider {
  border-color: #e0e0e0;
  opacity: 0.5;
}

:root.dark-mode .footer-divider {
  border-color: #2a2a3e;
}
.footer-copyright {
  font-size: 0.85rem;
  color: #999;
}

:root.dark-mode .footer-copyright {
  color: #777;
}

@media (max-width: 767.98px) {
  .app-footer {
    text-align: center;
  }

  .footer-links {
    display: inline-block;
    text-align: left;
  }
}

/* Backdrop (semi-transparent overlay) */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);  /* Semi-transparent black */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1050;
}

/* Modal content container */
.modal-content {
  max-width: 90%;
  width: 600px;  /* Default width */
  position: relative;
  padding: 2rem;
  border-radius: 1rem;
  background: white;  /* White background */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);  /* Light shadow */
}

/* Close button styling */
.btn-close {
  position: absolute;  /* Positioned inside modal-content */
  top: 1rem;  /* Space from the top */
  right: 1rem;  /* Space from the right */
  color: black;
  border: none;
  font-size: 1.5rem;  /* Font size for close button */
  cursor: pointer;
  z-index: 1060;  /* Ensure it's on top of modal content */
}

.btn-close:focus {
  outline: none;
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .modal-content {
    width: 90%;    /* Use 90% of the screen width on tablets */
    padding: 1.5rem; /* Less padding on smaller screens */
  }

  .btn-close {
    font-size: 1.2rem; /* Slightly smaller button on smaller screens */
  }
}

@media (max-width: 480px) {
  .modal-content {
    width: 95%;    /* Further reduce modal width on small screens */
    padding: 1rem;  /* Less padding */
  }

  .btn-close {
    font-size: 1rem; /* Even smaller button on very small screens */
  }
}
</style>