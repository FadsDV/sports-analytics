/**
 * Cloudflare Worker — Sofascore proxy
 *
 * Routes Sofascore API requests through Cloudflare's IP range,
 * bypassing Vercel's AWS IP blocks.
 *
 * Deploy steps:
 *  1. Go to https://workers.cloudflare.com and create a free account
 *  2. Create a new Worker (any name, e.g. "sofa-proxy")
 *  3. Paste this entire file into the editor and click Deploy
 *  4. Copy the worker URL (e.g. https://sofa-proxy.yourname.workers.dev)
 *  5. In Vercel project settings → Environment Variables, add:
 *       SOFASCORE_PROXY_BASE = https://sofa-proxy.yourname.workers.dev
 *  6. Redeploy on Vercel — Sofascore data will now load correctly
 *
 * Free tier: 100,000 requests/day — more than enough.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Rewrite the worker URL path to the Sofascore API
    const sofaUrl = "https://api.sofascore.com/api/v1" + url.pathname + url.search;

    const resp = await fetch(sofaUrl, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":          "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer":         "https://www.sofascore.com/",
        "Origin":          "https://www.sofascore.com",
      },
    });

    // Forward the response with CORS headers so the browser can also call it
    return new Response(resp.body, {
      status:  resp.status,
      headers: {
        "Content-Type":                "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};
