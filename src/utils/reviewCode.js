import QRCode from 'qrcode'

/**
 * Generate a unique review code for a listing
 * Format: REVIEW-{random-alphanumeric}
 */
export function generateReviewCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'REVIEW-'

  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return code
}

/**
 * Generate QR code as data URL
 * @param {string} listingId - The listing ID
 * @param {string} reviewCode - The review code
 * @returns {Promise<string>} - Data URL of QR code image
 */
export async function generateQRCode(listingId, reviewCode) {
  try {
    // For now, we'll use window.location.origin in components
    // This utility just handles the QR generation
    const url = `${window.location.origin}/review/${listingId}?code=${reviewCode}`

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })

    return qrDataUrl
  } catch (error) {
    console.error('Error generating QR code:', error)
    throw error
  }
}

/**
 * Download QR code as PNG file
 * @param {string} dataUrl - The QR code data URL
 * @param {string} filename - The filename for download
 */
export function downloadQRCode(dataUrl, filename = 'review-qr-code.png') {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

// Note: verifyReviewCode and markReviewCodeAsUsed functions removed
// Reviews are now handled directly in ReviewUnlock component
// Users can only review once per listing (checked via reviews subcollection)
