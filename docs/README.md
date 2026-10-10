# Complete GitHub Collaboration Guide

## Running the certificate workflow

The certificate module includes staff sign-in, SQLite storage, nurse drafts, doctor approval and revision requests, notifications, and A4 printing. It requires Node.js 24 or newer. See [Certificate setup and workflow](docs/CERTIFICATES.md) for account creation, server startup, configuration, and tests.

The other clinic pages retain their existing prototype behavior.


## Group Member Workflow (Share This With Them)

**Rule #1: Never work directly on the `main` branch.**

### Step 1: Clone the Repo (One-Time Setup)
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME
```

### Step 2: Create a New Branch for Your Task
Always create a new branch for every feature or fix.
```bash
git checkout -b feature/your-feature-name
```
*Example: `git checkout -b feature/add-login-page`*

### Step 3: Make Changes & Commit
```bash
git add .
git commit -m "Add: brief description of what you did"
```

### Step 4: Push Your Branch to GitHub
```bash
git push origin feature/your-feature-name
```

### Step 5: Create a Pull Request (PR)
1. Go to the repository page on GitHub.
2. You will see a yellow banner: **"Compare & pull request"**. Click it.
3. Ensure the **base** branch is `main` and the **compare** branch is your feature branch.
4. Add a title and description explaining your changes.
5. Click **Create pull request**.

---

## Owner Review & Merge

1. When a member creates a PR, you'll get a notification. Go to the **Pull requests** tab.
2. Click the PR to review.
3. Click the **Files changed** tab to see the exact code changes.
4. To approve:
   - Click **Review changes** (green button, top right).
   - Select **Approve**.
   - Click **Submit review**.
5. Once approved, click the green **Merge pull request** button.
6. Click **Confirm merge**.
7. Click **Delete branch** to clean up.

---

## Update Local Main Branch (For Everyone)

After a PR is merged, everyone must update their local `main` branch.

```bash
git checkout main
git pull origin main
```

If you are working on a branch that was just merged, you can delete it locally:
```bash
git branch -d feature/your-feature-name
```

---

## 🚨 What Happens If They Try to Push Directly to Main?

They will get this error:
```
! [remote rejected] main -> main (protected branch hook declined)
error: failed to push some refs to '...'
```

This is **correct behavior**. Tell them to follow Steps 2-5 in Part 2 instead.

---

## 💡 Pro Tips for Your Team

1. **Pull before you branch:** Always run `git checkout main && git pull` before creating a new branch.
2. **Small, frequent PRs:** Don't wait until you've written 1,000 lines of code. Small PRs are easier to review and merge faster.
3. **Clear commit messages:** Use prefixes like `Add:`, `Fix:`, `Update:`, `Remove:`.
4. **Resolve conflicts locally:** If GitHub says there's a conflict, pull the latest `main` into your branch, fix it, commit, and push.
5. **Never force push to main:** `git push --force` on `main` will be rejected by branch protection. That's a good thing.

---

## Quick Reference Cheat Sheet

| Task | Command |
|---|---|
| Clone repo | `git clone <url>` |
| Create branch | `git checkout -b feature/name` |
| Check status | `git status` |
| Stage all changes | `git add .` |
| Commit | `git commit -m "message"` |
| Push branch | `git push origin feature/name` |
| Switch to main | `git checkout main` |
| Update main | `git pull origin main` |
| Delete local branch | `git branch -d feature/name` |
