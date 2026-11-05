// Global toast instance
let toastInstance = null

export function setToastInstance(instance) {
  toastInstance = instance
}

export function useToast() {
  function showToast(message, type = 'info', title = '', duration = 4000) {
    if (!toastInstance) {
      console.error('Toast instance not initialized')
      // Fallback to alert if toast not available
      alert(message)
      return
    }

    return toastInstance.addToast({
      message,
      type,
      title,
      duration
    })
  }

  function success(message, title = '') {
    return showToast(message, 'success', title)
  }

  function error(message, title = '') {
    return showToast(message, 'error', title)
  }

  function warning(message, title = '') {
    return showToast(message, 'warning', title)
  }

  function info(message, title = '') {
    return showToast(message, 'info', title)
  }

  return {
    showToast,
    success,
    error,
    warning,
    info
  }
}
