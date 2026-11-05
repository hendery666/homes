# Stripe Test Cards

When using **TEST mode** (your current setup with `sk_test_...` keys), use these test card numbers:

## ✅ Successful Payment Cards

### Visa (Most Common)
- **Card Number:** `4242 4242 4242 4242`
- **Expiry:** Any future date (e.g., `12/34`)
- **CVC:** Any 3 digits (e.g., `123`)
- **ZIP:** Any 5 digits (e.g., `12345`)

### Other Successful Cards
- **Mastercard:** `5555 5555 5555 4444`
- **American Express:** `3782 822463 10005`
- **Discover:** `6011 1111 1111 1117`

## ❌ Declined Cards (For Testing Error Handling)

- **Card Declined:** `4000 0000 0000 0002`
- **Insufficient Funds:** `4000 0000 0000 9995`
- **Lost Card:** `4000 0000 0000 9987`
- **Stolen Card:** `4000 0000 0000 9979`

## ⚠️ Special Test Scenarios

- **3D Secure Required:** `4000 0025 0000 3155`
  - Will require authentication during checkout
- **Requires Authentication:** `4000 0027 6000 3184`

## Usage Notes

- Use any future expiry date
- Use any CVC (3-4 digits depending on card type)
- Use any ZIP code (5 digits for US)
- Email can be any valid email format

## Important

**Only works with TEST keys!** If you switch to live keys (`sk_live_...`), these test cards will NOT work and you'll need real payment methods.

