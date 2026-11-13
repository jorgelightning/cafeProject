/* sw.js — offline app shell.

   The data layer already survived being offline: loadCloud() falls back to localStorage and
   the cloud fetch aborts after 8s. But index.html, the twelve scripts and the stylesheet were
   fetched from the network on every launch, so with no connection there was no shell to fall
   back into and none of that careful handling ever got to run. That matters more here than in
   most apps, because the thing this is for is logging drinks in another country.

   Two rules:
   - index.html, cafes.json and backup.json are network-first, so the update bar in boot.js keeps
     spotting new versions and published data stays fresh. They fall back to cache only when the
     network fails.
   - everything else in the shell is cache-first, keyed by the same ?v= string the script tags
     already carry.

   BUMP CACHE_V WHENEVER YOU BUMP ?v= IN index.html — they are the same version, and a stale
   CACHE_V would keep serving the old scripts. Anything cross-origin (Maps, Firebase, the FX
   endpoint) is deliberately not intercepted; those must fail normally so their own fallbacks
   run. */
const CACHE_V = "cafemap-v141";
const ASSET_V = "?v=141";

const SHELL = [
  "./", "./index.html", "./manifest.json", "./cafes.json",
  "./styles.css" + ASSET_V,
  "./js/theme.js" + ASSET_V, "./js/lib/text.js" + ASSET_V, "./js/lib/elo.js" + ASSET_V, "./js/lib/order.js" + ASSET_V, "./js/lib/scan.js" + ASSET_V, "./js/lib/crop.js" + ASSET_V,
  "./js/config.js" + ASSET_V, "./js/core.js" + ASSET_V, "./js/storage.js" + ASSET_V,
  "./js/sync.js" + ASSET_V, "./js/nav.js" + ASSET_V, "./js/map.js" + ASSET_V, "./js/photos.js" + ASSET_V,
  "./js/list.js" + ASSET_V, "./js/stats.js" + ASSET_V, "./js/rank.js" + ASSET_V,
  "./js/detail.js" + ASSET_V, "./js/form.js" + ASSET_V, "./js/tips.js" + ASSET_V, "./js/scan.js" + ASSET_V, "./js/boot.js" + ASSET_V,
  "./vendor/markerclusterer-2.5.3.min.js",
  "./js/lib/text.js", /* js/lib/scan.js imports it by this name, without the ?v= */
  "./icon-180.png", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", function(e){
  /* One missing file must not fail the whole install, or a single 404 leaves no shell at all. */
  e.waitUntil(caches.open(CACHE_V).then(function(c){
    return Promise.all(SHELL.map(function(u){ return c.add(u).catch(function(){}); }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    /* and not the readings kept for testing (scan.js, v140): they are the owner's until he clears them */
    return Promise.all(keys.filter(function(k){ return k !== CACHE_V && k !== SHARE_CACHE && k !== KEPT_CACHE; })
                           .map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* A receipt shared to the app from the phone's share sheet (manifest.json share_target, v133). The text or photo is put
   in a cache of its own and the app is opened on ./?do=scan, where scan.js reads it and deletes it. It is answered
   here, so what was shared never leaves the phone, and nothing of it is in the address. */
const SHARE_CACHE = "cafemap-share";
const KEPT_CACHE = "cafemap-kept";
function takeShare(req){
  return req.formData().then(function(form){
    const text = form.get("text") || form.get("title") || form.get("url") || "";
    const photo = form.get("photo");
    return caches.open(SHARE_CACHE).then(function(c){
      return Promise.all([
        c.put("__share/text", new Response(String(text), { headers: { "Content-Type": "text/plain;charset=utf-8" } })),
        photo && photo.size ? c.put("__share/photo", new Response(photo, { headers: { "Content-Type": photo.type || "image/jpeg" } }))
                            : c.delete("__share/photo")
      ]);
    });
  }).catch(function(){}).then(function(){
    return Response.redirect(new URL("./?do=scan", self.registration.scope).href, 303);
  });
}

function keep(req, res){
  if(res && res.ok){
    const copy = res.clone();
    caches.open(CACHE_V).then(function(c){ c.put(req, copy); }).catch(function(){});
  }
  return res;
}

self.addEventListener("fetch", function(e){
  const req = e.request;
  if(req.method === "POST" && /\/share$/.test(new URL(req.url).pathname)){
    e.respondWith(takeShare(req));
    return;
  }
  if(req.method !== "GET") return;

  let url;
  try{ url = new URL(req.url); }catch(_){ return; }
  if(url.origin !== self.location.origin) return;   /* Maps, Firebase, FX: leave them alone */

  /* boot.js polls the page itself to detect a new version. It must always hit the network,
     and its cache-busting query must never become a cache entry. */
  if(url.searchParams.has("_chk")) return;

  /* /c/<id> is a share page that forwards to the app (scripts/share-pages.js). Left to the network: offline, the
     app shell answering under /c/ would load with every relative path one folder off. */
  if(/\/c\/[^/]*$/.test(url.pathname)) return;

  const isDoc  = req.mode === "navigate" || /(^|\/)(index\.html)?$/.test(url.pathname);
  /* backup.json (when cafes.json was backed up) too: it has to be as fresh as the data it dates */
  const isData = /(^|\/)(cafes|backup)\.json$/.test(url.pathname);

  if(isDoc || isData){
    /* the data arrives with a ?t= buster; store it under its bare path so the offline
       lookup can actually find it again, and so each visit does not leave another entry. */
    const key = isData ? new Request(url.origin + url.pathname) : req;
    e.respondWith(
      fetch(req).then(function(r){ return keep(key, r); })
                .catch(function(){ return caches.match(key).then(function(hit){
                  return hit || (isData ? Response.error() : caches.match("./index.html")); }); })
    );
    return;
  }

  /* The text reader's files are several megabytes and named for their version, so once fetched they stay put: refreshing
     them on every scan would spend a phone's data for nothing. Not precached, since only the owner ever scans. */
  if(/\/vendor\/tesseract-/.test(url.pathname)){
    e.respondWith(caches.match(req).then(function(hit){ return hit || fetch(req).then(function(r){ return keep(req, r); }); }));
    return;
  }

  /* Stale-while-revalidate, not cache-first. Cache-first meant that if CACHE_V and the ?v=
     on the script tags were ever forgotten together, the worker served that build forever and
     no amount of reloading could dislodge it — which is exactly what happened. Now the cached
     copy still answers instantly and still works offline, but every load quietly refreshes it,
     so a missed bump costs one reload instead of being permanent. */
  const net = fetch(req).then(function(r){ return keep(req, r); });
  e.waitUntil(net.catch(function(){}));
  e.respondWith(caches.match(req).then(function(hit){ return hit || net; }));
});
