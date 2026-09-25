/* Site header behaviour (cm-site.js), for every Power Pages page that uses
   the CM Site Header template. Plain JavaScript, no framework: menus that
   open on click and close on Escape or an outside click, arrow keys inside
   them, the mobile menu, the shadow once the page scrolls, initials for the
   signed-in user, and Search (the button, Ctrl K, Cmd K or "/"), which finds
   any link in the header or searches the Compliance Matrix. */

(function () {
  "use strict";
  var root = document.getElementById("cmh");
  if (!root || root.getAttribute("data-ready")) return;
  root.setAttribute("data-ready", "1");
  var matrix = root.getAttribute("data-matrix") || "/compliance-matrix/";
  var bar = document.getElementById("cmh-bar");
  var nav = document.getElementById("cmh-nav");
  var hamb = document.getElementById("cmh-hamb");
  var find = document.getElementById("cmh-find");
  var input = document.getElementById("cmh-find-q");
  var list = document.getElementById("cmh-find-list");
  var toggles = Array.prototype.slice.call(root.querySelectorAll("[data-cmh-toggle]"));

  /* ---- menus ---- */
  function panelOf(t) { return document.getElementById(t.getAttribute("data-cmh-toggle")); }
  function close(except) {
    toggles.forEach(function (t) {
      if (t === except) return;
      t.setAttribute("aria-expanded", "false");
      var p = panelOf(t); if (p) p.hidden = true;
    });
  }
  function open(t, focusFirst) {
    close(t);
    t.setAttribute("aria-expanded", "true");
    var p = panelOf(t); if (!p) return;
    p.hidden = false;
    if (focusFirst) { var a = p.querySelector("a"); if (a) a.focus(); }
  }
  toggles.forEach(function (t) {
    t.addEventListener("click", function () {
      if (t.getAttribute("aria-expanded") === "true") close(); else open(t, false);
    });
    t.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); open(t, true); }
    });
    var p = panelOf(t);
    if (p) p.addEventListener("keydown", function (e) {
      var links = Array.prototype.slice.call(p.querySelectorAll("a"));
      var i = links.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); (links[i + 1] || links[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0) { close(); t.focus(); } else links[i - 1].focus(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); t.focus(); }
    });
  });
  document.addEventListener("mousedown", function (e) {
    if (!e.target.closest || !e.target.closest("[data-cmh-menu]")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !(find && !find.hidden)) { close(); setMobile(false); }
  });

  /* ---- mobile ---- */
  function setMobile(on) {
    if (!hamb || !nav) return;
    hamb.setAttribute("aria-expanded", on ? "true" : "false");
    nav.classList.toggle("is-open", on);
  }
  if (hamb) hamb.addEventListener("click", function () { setMobile(hamb.getAttribute("aria-expanded") !== "true"); });

  /* ---- scroll shadow ---- */
  function onScroll() { if (bar) bar.classList.toggle("is-scrolled", window.scrollY > 24); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- initials for the signed-in user ---- */
  var me = root.querySelector(".cmh-me");
  if (me) {
    var w = (me.getAttribute("data-name") || "").split(/\s+/).filter(Boolean);
    var i = me.querySelector("i");
    if (i && w.length) i.textContent = (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
  }

  /* ---- search ---- */
  if (!find || !input || !list) return;
  /* every destination in the header, once, by its visible title */
  var seen = {};
  var places = Array.prototype.slice.call(root.querySelectorAll("a[href]")).map(function (a) {
    var b = a.querySelector("b");
    var title = (b ? b.textContent : a.textContent).replace(/\s+/g, " ").trim();
    var span = a.querySelector("span:not(.cmh-logo)");
    return { title: title, desc: span && b ? span.textContent.trim() : "", href: a.getAttribute("href"), ext: a.target === "_blank" };
  }).filter(function (p) {
    if (!p.title || /^(Skip|Sign out|Syracuse University)/.test(p.title) || seen[p.title + p.href]) return false;
    seen[p.title + p.href] = true;
    return true;
  });
  var items = [];
  var sel = 0;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render() {
    var q = input.value.trim();
    var t = q.toLowerCase();
    var hits = places.filter(function (p) { return !t || (p.title + " " + p.desc).toLowerCase().indexOf(t) >= 0; });
    items = (q ? [{ title: "Search the Compliance Matrix for “" + q + "”", href: matrix + "#/functions?q=" + encodeURIComponent(q), head: "Compliance Matrix" }] : []).concat(
      hits.map(function (p, n) { return { title: p.title, desc: p.desc, href: p.href, ext: p.ext, head: n === 0 ? "Go to" : "" }; }));
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.map(function (it, n) {
      return (it.head ? '<li class="h" role="presentation">' + esc(it.head) + "</li>" : "") +
        '<li role="option" id="cmh-o-' + n + '" aria-selected="' + (n === sel) + '"' + (n === sel ? ' class="is-on"' : "") + ">" +
        '<a href="' + esc(it.href) + '"' + (it.ext ? ' target="_blank" rel="noopener"' : "") + ' tabindex="-1"><b>' + esc(it.title) + "</b>" +
        (it.desc ? "<span>" + esc(it.desc) + "</span>" : "") + "</a></li>";
    }).join("") || '<li class="h">Nothing matches</li>';
    input.setAttribute("aria-activedescendant", items.length ? "cmh-o-" + sel : "");
    var on = list.querySelector(".is-on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  function go(it) {
    if (!it) return;
    hideFind();
    if (it.ext) window.open(it.href, "_blank", "noopener");
    else window.location.href = it.href;
  }
  var lastFocus = null;
  function showFind() {
    lastFocus = document.activeElement;
    close(); setMobile(false);
    find.hidden = false; input.value = ""; sel = 0; render();
    document.documentElement.style.overflow = "hidden";
    input.focus();
  }
  function hideFind() {
    find.hidden = true;
    document.documentElement.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  Array.prototype.forEach.call(root.querySelectorAll("[data-cmh-find]"), function (b) { b.addEventListener("click", showFind); });
  find.addEventListener("mousedown", function (e) { if (e.target === find) hideFind(); });
  input.addEventListener("input", function () { sel = 0; render(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
    else if (e.key === "Enter") { e.preventDefault(); go(items[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); hideFind(); }
  });
  list.addEventListener("mousemove", function (e) {
    var li = e.target.closest && e.target.closest("li[role=option]");
    if (!li) return;
    var n = Number(li.id.replace("cmh-o-", ""));
    if (n !== sel) { sel = n; render(); }
  });
  list.addEventListener("click", function (e) {
    var li = e.target.closest && e.target.closest("li[role=option]");
    if (!li) return;
    e.preventDefault();
    go(items[Number(li.id.replace("cmh-o-", ""))]);
  });
  /* the matrix page has its own quick jump; this header is not on it */
  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable);
    if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (find.hidden) showFind(); else hideFind(); }
    else if (e.key === "/" && !typing && find.hidden) { e.preventDefault(); showFind(); }
  });
})();
