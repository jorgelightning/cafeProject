/* theme.js — the one script in <head>: it sets the chosen theme before the first paint, so a dark-mode visitor never
   sees a white flash. It was an inline <script>, the last one; it is a file so the Content Security Policy in
   index.html can allow scripts from this site and named hosts only, with no inline script at all. Not deferred, on
   purpose — it has to run before the body is drawn. */
try {
  var _t = localStorage.getItem("cafemap.theme");
  if (_t) document.documentElement.dataset.theme = _t;
} catch (e) {}
