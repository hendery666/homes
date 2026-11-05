import { ref, watch, onMounted } from 'vue'

const isDark = ref(false)

export function useDarkMode() {
  // Initialize from localStorage on mount
  onMounted(() => {
    const saved = localStorage.getItem('dark-mode')
    if (saved !== null) {
      isDark.value = saved === 'true'
    } else {
      // Check system preference
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    applyTheme()
  })

  // Watch for changes and apply theme
  watch(isDark, () => {
    applyTheme()
    localStorage.setItem('dark-mode', isDark.value.toString())
  })

  function applyTheme() {
    if (isDark.value) {
      document.documentElement.classList.add('dark-mode')
    } else {
      document.documentElement.classList.remove('dark-mode')
    }
  }

  function toggleDarkMode() {
    isDark.value = !isDark.value
  }

  return {
    isDark,
    toggleDarkMode
  }
}
