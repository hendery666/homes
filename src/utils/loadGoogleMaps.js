// Single shared loader for the Google Maps JavaScript API.
// Every component goes through this, so the script is only ever added to the page once
// (loading it twice makes Google throw "You have included the Google Maps JavaScript API
// multiple times"). A failed load is not cached, so the next call can retry.

let loadingPromise = null;

export function loadGoogleMaps() {
  if (typeof window !== "undefined" && window.google?.maps) return Promise.resolve(window.google.maps);
  if (loadingPromise) return loadingPromise;

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("[Maps] Missing VITE_GOOGLE_MAPS_API_KEY"));

  loadingPromise = new Promise((resolve, reject) => {
    const waitForMaps = (attemptsLeft = 200) => {
      if (window.google?.maps) resolve(window.google.maps);
      else if (attemptsLeft <= 0) reject(new Error("[Maps] Google Maps did not initialise"));
      else setTimeout(() => waitForMaps(attemptsLeft - 1), 50);
    };

    // A script tag may already exist (e.g. added before this loader was used)
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      waitForMaps();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => waitForMaps();
    script.onerror = () => {
      script.remove();
      reject(new Error("[Maps] Failed to load Google Maps JS. Check your API key, billing and network connection."));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    loadingPromise = null; // allow a retry on the next call
    throw err;
  });

  return loadingPromise;
}
