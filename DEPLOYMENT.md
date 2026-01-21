# Deployment Guide - Cloudflare Pages

This site is configured for deployment on Cloudflare Pages with global CDN and automatic cache busting.

## Initial Setup

### 1. Sign up for Cloudflare Pages
- Go to [pages.cloudflare.com](https://pages.cloudflare.com)
- Create a free account (no credit card required)

### 2. Connect Your Repository
1. Click "Create a project"
2. Connect to GitHub (authorize Cloudflare)
3. Select this repository: `omagh-harriers-site`
4. Configure build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` (leave empty)
   - **Framework preset:** Astro (should auto-detect)

### 3. Deploy
- Click "Save and Deploy"
- First build takes ~2-3 minutes
- You'll get a URL like `omagh-harriers-site.pages.dev`

## Adding a Custom Domain

### After You Purchase Your Domain

1. In Cloudflare Pages dashboard, go to your project
2. Click "Custom domains" tab
3. Click "Set up a custom domain"
4. Enter your domain (e.g., `omaghharriers.com`)
5. Follow DNS configuration instructions:
   - **If domain is registered elsewhere:** Add CNAME record pointing to your `.pages.dev` URL
   - **If using Cloudflare Registrar:** DNS configures automatically

SSL certificate generates automatically (takes ~10 minutes).

## Cache Busting

Cache busting is **automatic**:
- Astro hashes all CSS/JS files (`_astro/[hash].css`)
- `public/_headers` sets long cache times (1 year) for hashed assets
- HTML files cache for 5 minutes only
- When you rebuild, new hashes = instant cache invalidation

**Manual cache clear:** In Cloudflare dashboard → Caching → Purge Everything (rarely needed)

## Continuous Deployment

Once connected, **every push to `main` branch automatically deploys**:
1. Push changes to GitHub
2. Cloudflare detects push
3. Builds and deploys automatically (~1-2 minutes)
4. Live on CDN globally

### Preview Deployments
- Every PR gets a preview URL
- Test changes before merging
- Preview URLs look like `abc123.omagh-harriers-site.pages.dev`

## Build Optimization

Current configuration:
- Node.js version: Auto-detected
- Build cache: Enabled by default
- Assets optimized: Images served as-is (consider WebP conversion for further optimization)

## Troubleshooting

**Build fails?**
- Check build logs in Cloudflare dashboard
- Verify `npm run build` works locally
- Ensure all dependencies in `package.json`

**Site not updating?**
- Check deployment status in dashboard
- Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
- Purge cache if needed (rarely required)

**DNS not working?**
- DNS propagation takes 1-48 hours
- Verify CNAME record points to correct URL
- Check SSL certificate status

## Cost

**Free tier includes:**
- Unlimited bandwidth
- Unlimited requests
- 500 builds/month
- Global CDN (300+ locations)

More than sufficient for this site.
