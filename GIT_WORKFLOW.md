# Git Workflow Guide

## ✅ Safe Testing Workflow

### Option 1: Test Locally First (RECOMMENDED)
```bash
# 1. Test everything locally
npm run server  # Terminal 1
npm run dev     # Terminal 2

# 2. If it works, THEN push
git add .
git commit -m "Fix Stripe boost checkout with better error handling"
git push origin main
```

### Option 2: Push & Test (with undo plan)

**Step 1: Commit your changes**
```bash
git add .
git commit -m "Fix Stripe boost checkout with better error handling"
git push origin main
```

**Step 2: Test on Vercel**

**Step 3: If it doesn't work, undo the push:**

#### Method A: Revert (Safe, keeps history)
```bash
# Create a revert commit that undoes the last commit
git revert HEAD
git push origin main
```

#### Method B: Reset (Rewrites history - use carefully)
```bash
# WARNING: Only use if no one else has pulled your changes!

# Reset to the commit before your push
git reset --hard HEAD~1
git push origin main --force
```

### Option 3: Use a Feature Branch (RECOMMENDED)

```bash
# 1. Create a new branch
git checkout -b fix/stripe-checkout

# 2. Make your changes and commit
git add .
git commit -m "Fix Stripe boost checkout"

# 3. Push the branch
git push origin fix/stripe-checkout

# 4. Test on Vercel (if you have branch deployments)

# 5a. If it works, merge to main:
git checkout main
git merge fix/stripe-checkout
git push origin main

# 5b. If it doesn't work, just delete the branch:
git checkout main
git branch -D fix/stripe-checkout
git push origin --delete fix/stripe-checkout
```

## ⚠️ Important Notes

1. **NEVER commit `.env` file** - It's already in `.gitignore` ✓
2. **Check what you're committing:**
   ```bash
   git status
   git diff  # Preview changes
   ```
3. **For production testing**, make sure:
   - Backend is deployed (Render/Railway/etc.)
   - `VITE_API_URL` is set in Vercel environment variables
   - All Stripe keys are configured correctly

## Quick Undo Reference

**Undo last commit (keeps changes):**
```bash
git reset --soft HEAD~1
```

**Undo last commit (discards changes):**
```bash
git reset --hard HEAD~1
```

**Undo last push (safe revert):**
```bash
git revert HEAD
git push origin main
```

