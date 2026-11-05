import { createRouter, createWebHistory } from 'vue-router'
import Profile from '../components/Profile.vue';
// import LoginSignup from '../components/LoginSignup.vue';
import AboutPage from '../components/AboutPage.vue';
import HomePage from '@/components/HomePage.vue';
import NewBusinessPage from '../components/NewBusiness.vue'
import Login from "@/components/Login.vue";
import Signup from "@/components/Signup.vue";
import ChatPage from '../components/ChatPage.vue';
import ForgotPassword from '../components/ForgotPassword.vue';
import NewBusiness from '../components/NewBusiness.vue';
import Boosting from '../components/Boosting.vue'
import UserProfile from '../components/UserProfile.vue'
import EmailVerified from '../components/EmailVerified.vue'
import AdminDashboard from '../components/AdminDashboard.vue'
import Feedback from '@/components/Feedback.vue';
import ManageReport from '@/components/ManageReports.vue';
import ReviewUnlock from '@/components/ReviewUnlock.vue';
import NotFound from '@/components/NotFound.vue';

import { auth, db } from "@/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";


const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/newbusiness',
      name: 'newbusiness',
      component: NewBusinessPage, meta: {requiresAuth: true}
    },
    {
      path: '/',
      name: 'home',
      component: HomePage, meta: {requiresAuth: true}
    },
    // Redirect /home to / for backward compatibility
    {
      path: '/home',
      redirect: '/'
    },
    {
      path: '/about',
      name: 'about',
      component: AboutPage, meta: {guestOnly: true}
    },
    {
      path: '/Profile',
      name: 'profile',
      component: Profile, meta: {requiresAuth: true}
    },
    // { path: '/signup', 
    //   name: 'loginsignup',
    //   component: LoginSignup, meta: {guestOnly: true}
    // },
    { path: "/login", 
      name: 'login',
      component: Login
    },
    { path: "/signup", 
      name: 'signup',
      component: Signup 
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatPage,
      meta: { requiresAuth: true }
    },
    {
      path:'/forgotpassword',
      name: 'forgotpassword',
      component: ForgotPassword
    },
    {
      path:'/createService',
      name: 'createservice',
      component: NewBusiness
    },
    {
      path: '/boosting',
      name: 'Boosting',
      component: Boosting
    },
    {
      path: '/user/:userId',
      name: 'UserProfile',
      component: UserProfile,
      meta: { requiresAuth: true }
    },
    {
      path: '/email-verified',
      name: 'emailVerified',
      component: EmailVerified
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminDashboard,
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/feedback',
      name: 'feedback',
      component: Feedback
    },
    {
      path: '/manageReport',
      name: 'ManageReport',
      component: ManageReport,
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/review/:listingId',
      name: 'reviewUnlock',
      component: ReviewUnlock
    },
    // Catch-all route for 404 Not Found
    {
      path: '/:pathMatch(.*)*',
      name: 'notFound',
      component: NotFound
    }
  ],
})


// --- Auth guard with initialization state ---
let currentUser = null;
let cachedUserData = null;
let lastFetchTime = 0;
let authInitialized = false;
const CACHE_DURATION = 300000; // Cache for 5 minutes (increased from 5 seconds)

// Initialize auth state listener ONCE when the router loads
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  authInitialized = true;

  // Clear user data cache when user changes
  if (!user) {
    cachedUserData = null;
    lastFetchTime = 0;
  }
});

async function getUserData(uid) {
  const now = Date.now();

  // Return cached data if still valid
  if (cachedUserData && cachedUserData.uid === uid && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedUserData.data;
  }

  // Fetch fresh data
  const userDocRef = doc(db, "users", uid);
  const userDoc = await getDoc(userDocRef);

  // Update cache
  cachedUserData = {
    uid: uid,
    data: userDoc.exists() ? userDoc.data() : null
  };
  lastFetchTime = now;

  return cachedUserData.data;
}

router.beforeEach(async (to, _from, next) => {
  // Wait for auth to initialize only on first navigation
  if (!authInitialized) {
    await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, () => {
        unsubscribe();
        resolve();
      });
    });
  }

  const user = currentUser;

  // Special handling for root path - redirect to about if not logged in
  if (to.path === '/' && !user) {
    return next({ name: "about" });
  }

  if (to.meta.requiresAuth && !user) {
    // Redirect to login (not signup) when not authenticated
    return next({ name: "login", query: { redirect: to.fullPath } });
  }

  if (to.meta.guestOnly && user) {
    return next({ name: "home" });
  }

  // Check if authenticated user has completed profile
  if (user && to.meta.requiresAuth && to.name !== 'signup') {
    const userData = await getUserData(user.uid);

    if (!userData || !userData.profileComplete) {
      return next({ name: "signup" });
    }

    // Check if route requires admin privileges
    if (to.meta.requiresAdmin && !userData.isAdmin) {
      return next({ name: "home" });
    }
  }

  next();
});

// Function to clear router cache (used on logout)
export function clearCache() {
  currentUser = null;
  cachedUserData = null;
  lastFetchTime = 0;
  authInitialized = false;
}

export default router
