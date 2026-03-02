# GenLayer Dispute Resolver — Deployment Guide

**Platform Support:** Netlify | Vercel | GitHub Pages | Traditional Web Server

---

## Quick Start

### **Netlify** (Recommended - Auto-deploy on push) 🚀

#### Step 1: Create Netlify Account
1. Go to [netlify.com](https://netlify.com)
2. Sign up with GitHub / Email
3. Click **"New site from Git"**

#### Step 2: Connect Repository
1. Choose **GitHub** as provider
2. Authenticate & select your repo
3. Leave build settings default (static site)
4. Click **Deploy**

#### Step 3: Custom Domain (Optional)
1. Go to **Site Settings → Domain Management**
2. Add custom domain (e.g., `disputes.example.com`)
3. Follow DNS configuration

### **Vercel** (Fast static hosting with Git auto-deploy)

#### Step 1: Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub / GitLab / Bitbucket
3. Click **Add New... -> Project**

#### Step 2: Import Repository
1. Select your repository
2. Set **Root Directory** to `Frontend`
3. Keep framework as **Other** (no build step)
4. Click **Deploy**

#### Step 3: Custom Domain (Optional)
1. Open your project in Vercel
2. Go to **Settings -> Domains**
3. Add your domain and follow DNS instructions

### **GitHub Pages** (Free, no build step needed)

#### Step 1: Enable Pages
1. Go to your GitHub repo
2. **Settings → Pages**
3. Select **Deploy from branch**
4. Choose **main** branch, **Frontend** folder
5. Click **Save**

#### Step 2: Access Your Site
- Published at: `https://USERNAME.github.io/REPO-NAME/Frontend/`
- Example: `https://alice.github.io/genlayer-disputes/Frontend/`

#### Step 3: Custom Domain (Optional)
1. In **Settings → Pages**
2. Add custom domain under **Custom domain**
3. Update DNS `CNAME` records
4. Wait for verification (2-5 minutes)

### **Traditional Web Server** (VPS, Shared Hosting)

#### Step 1: Upload Files
```bash
# Via SFTP or FTP client:
# Upload Frontend/* to your /public_html or /www directory
```

#### Step 2: Configure Routing
- Ensure `index.html` is set as start/index page
- CSS/JS files must be accessible via same domain
- CORS headers may be needed for local development

#### Step 3: SSL Certificate
- Use Let's Encrypt (free) or paid SSL
- Redirect `http://` → `https://`
- Update MetaMask connection (requires HTTPS)

---

## File Structure (Required)

```
Frontend/
├── index.html         ✓ Main page
├── app.js             ✓ Application logic
├── style.css          ✓ Stylesheet
├── test.js            ✓ Browser tests (optional)
├── test-standalone.js ✓ Node.js tests (optional)
└── DEPLOY.md          ✓ This file
```

**Deploy only the above 3 files minimum** (`index.html`, `app.js`, `style.css`)

---

## Environment Setup

### Demo Mode (No Backend Needed)
- Uses **SimulatedGLClient** automatically
- Comes with 3 pre-loaded sample disputes
- Perfect for testing UI & UX

### Real Contract Mode (Requires GenLayer SDK)

#### Step 1: Obtain GenLayer SDK
1. Contact GenLayer team
2. Request SDK file: `genlayer-sdk.js` or similar
3. Receive GenLayer contract address

#### Step 2: Add SDK to HTML
Edit `index.html`, add before `</head>`:
```html
<script src="https://your-cdn.com/genlayer-sdk.js"></script>
```

Or load from local (place in Frontend folder):
```html
<script src="genlayer-sdk.js"></script>
```

#### Step 3: Set Contract Address (if needed)
In `app.js`, line 183:
```javascript
// Optional: set expected chain ID
const EXPECTED_CHAIN = '0x13881'; // Mumbai testnet
// or '0x1' for Ethereum mainnet
// or null to disable check
```

#### Step 4: Verify Integration
1. Open browser console (F12)
2. Should see:
   ```
   🔗 GenLayer Contract Client
   Created: RealGLClient (using window.GenLayerContract)
   ✅ GL client exposed globally as window.glClient
   ```

---

## Deployment Checklist

### Pre-Deployment
- [ ] All files compressed (CSS/JS minified recommended)
- [ ] No console errors in DevTools
- [ ] Test suite passes: `node test-standalone.js`
- [ ] MetaMask connection works
- [ ] Responsive design tested on mobile

### Netlify-Specific
- [ ] `netlify.toml` optional (included for advanced config)
- [ ] Redirects configured (if using client-side routing)
- [ ] Prerendering disabled (not needed for SPA)
- [ ] Purge cache after deploy

### GitHub Pages-Specific
- [ ] Repo is public (private needs GitHub Pro)
- [ ] Branch is set to `main` (or `gh-pages`)
- [ ] Path is set to `/Frontend` folder
- [ ] Commit includes all three files

### Vercel-Specific
- [ ] Root Directory set to `Frontend`
- [ ] Build Command left empty
- [ ] Output Directory left empty (static files)
- [ ] SPA rewrite to `/index.html` configured (if needed)

### Security
- [ ] HTTPS enforced (required for MetaMask)
- [ ] CSP headers set (if proxy used)
- [ ] No sensitive keys in client-side code
- [ ] Rate limiting configured (if backend proxy)

---

## Testing Before Deploy

### Local Testing
```bash
# 1. Test with demo data
# Open: file:///path/to/Frontend/index.html
# Should see 3 sample disputes

# 2. Run automated tests
node test-standalone.js

# 3. Check MetaMask (with testnet selected)
# Set address manually, create dispute
```

### Staging Environment
```bash
# 1. Deploy to staging URL
# (Netlify: auto preview, GitHub: separate branch)

# 2. Test on multiple devices
# Desktop: Chrome, Firefox, Safari
# Mobile: iPhone Safari, Android Chrome

# 3. Test all features
# Create dispute, stake juror, vote, resolve
```

### Production Checklist
- [ ] DNS TTL set to 300 seconds (faster updates)
- [ ] SSL certificate valid and renewed annually
- [ ] Backup of code in version control
- [ ] CDN configured (CloudFlare, BunnyCDN)
- [ ] Analytics tracking set up (Google Analytics)
- [ ] Error logging enabled (Sentry, LogRocket)

---

## Configuration Files

### Netlify (`netlify.toml`)
```toml
[build]
  command = "# Static site, no build needed"
  publish = "Frontend"

[context.production]
  environment = { NODE_ENV = "production" }

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### GitHub Actions (Auto-deploy)
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        run: |
          mkdir -p deploy
          cp Frontend/* deploy/
          git config user.email "bot@genlayer.com"
          git config user.password "${{ secrets.GITHUB_TOKEN }}"
```

### Vercel (`vercel.json`)
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## Domain & DNS Configuration

### For Custom Domain

#### Netlify
1. Buy domain (GoDaddy, Namecheap, Route53)
2. Update DNS or use Netlify's nameservers
3. Add domain in Netlify: **Site Settings → Domain Management**
4. SSL auto-issued (Let's Encrypt)

#### GitHub Pages
1. Add DNS `CNAME` record:
   ```
   Host: @
   Value: USERNAME.github.io
   TTL: 300
   ```
2. Or use A records:
   ```
   185.199.108.153
   185.199.109.153
   185.199.110.153
   185.199.111.153
   ```

#### Vercel
1. Add domain in Vercel: **Project Settings -> Domains**
2. Add DNS records provided by Vercel (A/CNAME)
3. Wait for SSL auto-provisioning

#### Traditional Hosting
1. Point domain DNS to hosting IP
2. Upload files to public directory
3. Configure SSL certificate
4. Update `.htaccess` for redirects

---

## Performance Optimization

### File Size Reductions
```bash
# Minify CSS (optional)
npx csso style.css --output style.min.css

# Minify JS (optional)
npx terser app.js --output app.min.js

# Compress images (optional)
npx imagemin images/* --out-dir=images-compressed
```

### CDN Configuration
```html
<!-- Load fonts from CDN -->
<link href="https://cdn.jsdelivr.net/npm/Space+Mono@..." rel="stylesheet">

<!-- Load SDK from CDN -->
<script src="https://cdn.genlayer.io/sdk.js"></script>
```

### Caching Headers
```
Cache-Control: public, max-age=31536000  (for style.css, app.js)
Cache-Control: no-cache, must-revalidate (for index.html)
```

---

## Troubleshooting

### **Page shows blank / white screen**
- [ ] Check browser console (F12 → Console)
- [ ] Verify CSS file loaded (F12 → Network → style.css)
- [ ] Check app.js for errors
- [ ] Ensure all three files in same directory

### **MetaMask not connecting**
- [ ] Ensure page served over HTTPS
- [ ] Check browser console for permission errors
- [ ] Verify app.js loads correctly
- [ ] Try different MetaMask account

### **GenLayer SDK not found**
- [ ] Verify `genlayer-sdk.js` path correct
- [ ] Check browser console for 404 errors
- [ ] Confirm SDK from GenLayer team
- [ ] Falls back to SimulatedGLClient if missing

### **Styles look broken**
- [ ] Verify `style.css` in same directory
- [ ] Check CSS file size (should be ~30KB)
- [ ] Clear browser cache (Ctrl+Shift+Del)
- [ ] Check CSS media queries on mobile

### **Deployment site blank on GitHub Pages**
- [ ] Verify folder path is correct (`/Frontend`)
- [ ] Check repo is public (private needs Pro)
- [ ] Force refresh with Ctrl+Shift+R
- [ ] Wait 2-5 minutes for GitHub to build

### **Deployment site blank on Vercel**
- [ ] Verify project Root Directory is `Frontend`
- [ ] Ensure `index.html` exists in `Frontend/`
- [ ] Add `vercel.json` rewrite for SPA routing
- [ ] Redeploy from latest commit

---

## Post-Deployment Monitoring

### Analytics
```html
<!-- Add to index.html before </head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=UA-XXXXXXXXX-X"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'UA-XXXXXXXXX-X');
</script>
```

### Error Tracking
```html
<!-- Add to index.html before </head> -->
<script src="https://cdn.ravenjs.com/3.26.4/raven.min.js"></script>
<script>
  Raven.config('YOUR_SENTRY_DSN').install();
</script>
```

### Uptime Monitoring
- [ ] Set up UptimeRobot (free tier)
- [ ] Monitor: `https://your-domain.com`
- [ ] Alert threshold: 5 minutes
- [ ] Email notifications on downtime

---

## Scaling for Production

### High Traffic (1000+ users/day)
1. **CDN:** Use CloudFlare / BunnyCDN
2. **Compression:** Enable gzip/brotli
3. **Caching:** Aggressive browser cache (1 year for assets)
4. **Proxy:** Add backend proxy for API calls

### Real Contract Integration
1. **Rate Limiting:** Implement on backend proxy
2. **Transaction Queuing:** Queue disputes for processing
3. **Retry Logic:** Auto-retry failed transactions
4. **Event Indexing:** Index blockchain events with The Graph

### Monitoring
1. **Sentry** for error tracking
2. **DataDog** for performance metrics
3. **New Relic** for uptime monitoring
4. **LogRocket** for session replay

---

## Support & Issues

- **GenLayer Docs:** [docs.genlayer.io](https://docs.genlayer.io)
- **GitHub Issues:** Report bugs on repo issues tab
- **Discord:** Join GenLayer community
- **Email:** support@genlayer.io

---

## Summary

| Platform | Cost | Setup Time | SSL | Auto-Deploy |
|----------|------|-----------|-----|------------|
| **Netlify** | Free/Paid | 2 min | Auto | ✅ |
| **GitHub Pages** | Free | 1 min | Auto | ✅ |
| **VPS** | $5-50/mo | 15 min | Manual | ❌ |

**Recommended for quick start:** Netlify (easiest) or GitHub Pages (free)

**Recommended for production:** Netlify with custom domain + CDN

---

**Last Updated:** February 24, 2026  
**Version:** 1.0  
**Status:** Production Ready ✅

## Deploy And Use This Contract (GenLayer Studio + Frontend)

### 1. Deploy the contract in GenLayer Studio
1. Open `Contracts/dispute_contract.py`.
2. Select **Execution Mode: Normal (Full Consensus)**.
3. Click **Deploy new instance**.
4. Wait until Deploy transaction is **FINALIZED** (green).
5. Copy the deployed contract address.

### 2. Configure the frontend to point to the deployed address
1. Open `Frontend/genlayer-bridge.js`.
2. Set `CONTRACT_ADDRESS` to your deployed address.
3. Keep script order in `Frontend/index.html`:
   - `genlayer-sdk.js`
   - `genlayer-bridge.js`
   - `app.js`
4. Reload the frontend page.

### 3. Required method call order (write methods)
Always wait for each write transaction to become **FINALIZED** before sending the next one.

1. `initialize()`
2. `deposit(amount)` with amount > 0 (example `500`)
3. `create_dispute(description, stake)` with `stake >= 100`
4. Use the returned `dispute_id` from `create_dispute` (do not assume `dispute_1`)
5. `cast_vote(dispute_id, vote)` where vote is one of:
   - `for`
   - `against`
   - `abstain`
   - `A`
   - `B`

### 4. Read methods for verification
1. `get_dispute(dispute_id)` to verify one dispute.
2. `get_all_disputes()` to verify list and status changes.

### 5. Common errors and fixes
- `Invalid dispute`: wrong `dispute_id` or wrong deployed instance.
- `Not voting stage`: dispute already resolved/appeal, not in `voting`.
- `Already voted`: same wallet already cast a vote for that dispute.
- `Stake too small`: use stake >= `100`.
- `Insufficient balance`: call `deposit` first, then retry write call.
