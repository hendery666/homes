<template>
    <div class="bg-page min-vh-100">
      <div class="container py-4">
        <div v-if="loading" class="text-center py-5">
          <div class="spinner-border"></div>
        </div>
  
        <div v-else>
          <div v-if="listing" class="row g-4">
            <!-- LEFT: Preview listing card -->
            <div class="col-12 col-lg-4">
              <ListingCard
                :listing="listing"
                :liked="false"
                :likesCount="0"
                :reveal="true"
                :showAll="true"
                :sellerNameOverride="seller.displayName"
                :sellerAvatarOverride="seller.photoURL"
              />
            </div>
  
            <!-- RIGHT: Boost panel -->
            <div class="col-12 col-lg-8">
              <div class="boost-card shadow-soft rounded-4 p-4">
                <h4 class="mb-3 d-flex justify-content-between align-items-center">
                  🚀 Boost Listing
                  <small class="text-muted">Stripe secure checkout 🔒</small>
                </h4>
                <p class="text-muted small mb-4">
                  Increase visibility on Explore & Trending. Choose a boost duration below.
                </p>
  
                <!-- Plan options -->
                <div class="d-flex flex-column gap-3">
                  <label
                    v-for="p in plans"
                    :key="p.id"
                    class="plan-option border rounded-3 p-3 d-flex align-items-center justify-content-between"
                    :class="{ selected: p.id === selectedPlanId }"
                    @click="selectedPlanId = p.id"
                  >
                    <div class="d-flex align-items-center gap-3">
                      <input
                        class="form-check-input"
                        type="radio"
                        :checked="p.id === selectedPlanId"
                        @change="selectedPlanId = p.id"
                      />
                      <div>
                        <div class="fw-semibold d-flex align-items-center gap-2">
                          <span>{{ p.name }}</span>
                          <span v-if="p.badge" class="badge bg-primary-subtle text-primary small">{{ p.badge }}</span>
                        </div>
                        <div class="text-muted small">{{ p.subtitle }}</div>
                      </div>
                    </div>
                    <div class="fw-semibold">{{ formatPrice(p.price) }}</div>
                  </label>
                </div>
  
                <!-- Summary -->
                <div class="d-flex align-items-center justify-content-between mt-4">
                  <div class="text-muted">Selected</div>
                  <div class="fw-semibold">{{ selectedPlan.name }}</div>
                </div>
                <div class="d-flex align-items-center justify-content-between mb-3">
                  <div class="text-muted">Total</div>
                  <div class="fs-5 fw-bold">{{ formatPrice(selectedPlan.price) }}</div>
                </div>
  
                <!-- CTA -->
                <button
                  class="btn btn-primary w-100 py-2"
                  :disabled="checkingOut"
                  @click="startCheckout"
                >
                  <span v-if="!checkingOut">Boost with Stripe</span>
                  <span v-else class="spinner-border spinner-border-sm"></span>
                </button>
  
                <!-- Help -->
                <div class="mt-4 p-3 bg-light rounded-3 small text-muted">
                  <div class="fw-semibold mb-1">What happens after payment?</div>
                  After successful payment, we’ll set a <code>boostedUntil</code> timestamp on your listing and
                  redirect you to your <strong>Profile → My Listings</strong> page.
                </div>
              </div>
            </div>
          </div>
  
          <div v-else class="alert alert-warning text-center mt-4">
            No listing found. Please go back to your
            <router-link to="/profile#my" class="fw-semibold">My Listings</router-link>.
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import ListingCard from "@/components/ListingCard.vue";
  import { getFirestore, doc, getDoc, updateDoc, Timestamp, increment } from "firebase/firestore";
  import { useToast } from "@/composables/useToast";

  const db = getFirestore();
  const toast = useToast();
  const route = useRoute();
  const router = useRouter();
  
  const loading = ref(true);
  const listing = ref(null);
  const seller = ref({ displayName: "", photoURL: "" });
  const checkingOut = ref(false);
  
  // ✅ Boost Plans
  const plans = [
    { id: "1day", name: "1 Day Boost", price: 500, subtitle: "Quick bump to the top for 24h", badge: "Popular" },
    { id: "7days", name: "7 Days Boost", price: 2000, subtitle: "Great visibility for a whole week", badge: "Best value" },
    { id: "1month", name: "1 Month Boost", price: 5000, subtitle: "Dominant placement all month", badge: "Max exposure" },
  ];
  
  const selectedPlanId = ref("7days");
  const selectedPlan = computed(() => plans.find(p => p.id === selectedPlanId.value) || plans[0]);
  
  function formatPrice(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  
  /* ---------------- Load listing ---------------- */
  onMounted(async () => {
    const listingId = route.query.listing || route.query.listingId;
    const status = route.query.status;
    const plan = route.query.plan;
  
    // ✅ Handle success redirect from Stripe
    if (status === "success" && listingId && plan) {
      await applyBoost(listingId, plan);

      // Show success toast
      const planNames = { "1day": "1 Day", "7days": "7 Days", "1month": "1 Month" };
      const planName = planNames[plan] || plan;
      toast.success(`Success! Your listing has been boosted for ${planName}. It will receive increased visibility on Explore & Trending pages!`);

      router.replace("/profile#my");
      return;
    }
  
    if (!listingId) {
      loading.value = false;
      return;
    }
  
    try {
      const snap = await getDoc(doc(db, "allListings", listingId));
      if (snap.exists()) {
        listing.value = { id: snap.id, ...snap.data() };
        await loadSeller(listing.value.userId);
      }
    } catch (e) {
      console.error("Failed to load listing:", e);
    } finally {
      loading.value = false;
    }
  });
  
  async function loadSeller(uid) {
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const d = snap.data();
        seller.value = {
          displayName: d.username || d.displayName || "",
          photoURL: d.photoURL || d.avatarUrl || d.profilePhoto || "",
        };
      }
    } catch (e) {
      console.warn("Failed to load seller:", e);
    }
  }
  
  /* ---------------- Stripe Checkout ---------------- */
  async function startCheckout() {
    if (!listing.value) return;
    checkingOut.value = true;
    try {
      // Use VITE_API_URL if set, otherwise use localhost for dev
      // For production/Vercel, set VITE_API_URL in Vercel environment variables
      const apiUrl = import.meta.env.VITE_API_URL || 
        (import.meta.env.DEV ? 'http://localhost:4242' : '');
      
      if (!apiUrl) {
        throw new Error('VITE_API_URL is not configured. Please set it in your environment variables.');
      }
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const res = await fetch(`${apiUrl}/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.value.id,
          planId: selectedPlanId.value,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
        throw new Error(errorData.error || "Failed to create checkout session");
      }
  
      const data = await res.json();
      
      if (!data.url) {
        throw new Error("No checkout URL received from server");
      }
  
      window.location.href = data.url; // Redirect to Stripe
    } catch (err) {
      console.error("Stripe checkout error:", err);
      
      let errorMessage = "Failed to start checkout. Please try again.";
      
      if (err.name === 'AbortError') {
        errorMessage = `The server at ${import.meta.env.VITE_API_URL || 'http://localhost:4242'} is not responding. Please make sure the backend server is running.`;
      } else if (err.message.includes('Failed to fetch') || err.message.includes('network')) {
        errorMessage = `Cannot connect to the payment server. Please make sure the backend server is running at ${import.meta.env.VITE_API_URL || 'http://localhost:4242'}.`;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast.error(errorMessage);
      checkingOut.value = false; // Reset button state on error
    }
    // Note: We don't reset checkingOut.value in finally anymore since we do it on error
    // and on success we redirect, so it doesn't matter
  }
  
  /* ---------------- Apply Boost (STACK TIME) ---------------- */
  async function applyBoost(listingId, planId) {
    let msToAdd = 0;
    if (planId === "1day") msToAdd = 1 * 24 * 60 * 60 * 1000;
    if (planId === "7days") msToAdd = 7 * 24 * 60 * 60 * 1000;
    if (planId === "1month") msToAdd = 30 * 24 * 60 * 60 * 1000;
  
    try {
      const ref = doc(db, "allListings", listingId);
      const snap = await getDoc(ref);
  
      let baseTime = Date.now();
      let sellerId = null;
      if (snap.exists()) {
        const data = snap.data();
        sellerId = data.userId;
        const currentBoostedUntil = data.boostedUntil;
  
        // If there's already a boost in the future, stack onto it
        if (currentBoostedUntil && currentBoostedUntil.toMillis() > Date.now()) {
          baseTime = currentBoostedUntil.toMillis();
        }
      }
  
      const newBoostedUntil = Timestamp.fromMillis(baseTime + msToAdd);
  
      await updateDoc(ref, {
        boostedUntil: newBoostedUntil,
      });
  
      console.log(`✅ Boost applied to ${listingId} until ${newBoostedUntil.toDate()}`);
      
      // Update seller badge progress: increment boosts
      if (sellerId) {
        try {
          const sellerRef = doc(db, "users", sellerId);
          const sellerDoc = await getDoc(sellerRef);

          if (sellerDoc.exists()) {
            const currentStats = sellerDoc.data().stats || {};
            await updateDoc(sellerRef, {
              stats: {
                ...currentStats,
                boosts: (currentStats.boosts || 0) + 1
              }
            });
          }
        } catch (statsError) {
          console.warn('Could not update seller boost stats:', statsError);
        }
      }
  
      // Success is already handled in onMounted when status === "success"
      // This function is called from there, so we don't show alert here
      // to avoid double alerts
    } catch (e) {
      console.error("❌ Failed to update boostedUntil:", e);
      toast.error("Boost payment succeeded, but failed to update listing. Please contact support or refresh the page.");
    }
  }
  </script>
  
  <style scoped>
  .bg-page {
    background: var(--page-bg, rgb(245,239,239));
  }
  .shadow-soft { box-shadow: 0 8px 28px rgba(0,0,0,.06); }

  .boost-card {
    background: var(--color-bg-white, white);
    color: var(--color-text-primary);
  }

  .plan-option {
    transition: border-color .15s ease, background-color .15s ease, box-shadow .15s ease;
    cursor: pointer;
    background: var(--color-bg-white, #fff);
    color: var(--color-text-primary);
  }
  .plan-option:hover {
    border-color: #cfc3ff;
    box-shadow: 0 8px 22px rgba(122, 90, 248, 0.06);
  }
  .plan-option.selected {
    border-color: #7a5af8;
    background: var(--color-bg-purple-tint, #f7f4ff);
  }

  /* Dark mode styles */
  :root.dark-mode .bg-page {
    background: var(--color-bg-secondary);
  }

  :root.dark-mode .boost-card {
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
  }

  :root.dark-mode .plan-option {
    background: var(--color-bg-secondary);
    border-color: #2a2a3e;
    color: var(--color-text-primary);
  }

  :root.dark-mode .plan-option:hover {
    border-color: var(--color-primary);
    box-shadow: 0 8px 22px rgba(102, 126, 234, 0.1);
  }

  :root.dark-mode .plan-option.selected {
    border-color: var(--color-primary);
    background: rgba(102, 126, 234, 0.1);
  }

  :root.dark-mode .text-muted {
    color: var(--color-text-secondary) !important;
  }

  :root.dark-mode .bg-light {
    background: #2a2a3e !important;
  }

  :root.dark-mode .bg-primary-subtle {
    background: rgba(102, 126, 234, 0.2) !important;
  }

  :root.dark-mode .text-primary {
    color: var(--color-primary) !important;
  }

  :root.dark-mode small,
  :root.dark-mode .small {
    color: var(--color-text-secondary);
  }

  :root.dark-mode h4,
  :root.dark-mode .fw-semibold,
  :root.dark-mode .fw-bold,
  :root.dark-mode .fs-5 {
    color: var(--color-text-primary);
  }

  :root.dark-mode code {
    background: rgba(102, 126, 234, 0.1);
    color: var(--color-primary);
  }
  </style>
  