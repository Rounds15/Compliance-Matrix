/* ---------------------------------------------------------------------------
 * Runtime
 * -------------------------------------------------------------------------
 * Replaces every [data-cm-metric] element with a live count, then stops. The
 * markup ships with the approved figure already in it, so a failed or blocked
 * request leaves the page reading exactly as it did before - never a spinner,
 * never a zero, never a blank.
 *
 * Counting strategy, per backend:
 *
 *   dataverse    $count=true first, which is one request. Dataverse caps that
 *                count at 5000, so a result of exactly 5000 is treated as
 *                suspect and re-counted by paging. Distinct metrics always
 *                page, because neither the Power Pages Web API nor Dataverse
 *                OData supports $apply/aggregate.
 *   sharepoint   ItemCount for a whole list, which is one request and exact.
 *                Anything filtered or distinct pages through Id-sized rows.
 *   mock         Returns the fallback. Used by preview.html.
 *
 * Results are cached in sessionStorage for config.cacheMinutes so that moving
 * around the site does not re-run six queries per page view.
 * ------------------------------------------------------------------------ */
(function () {
  "use strict";

  var DEFAULTS = {
    backend: "dataverse",
    sharePointSite: "",
    cacheMinutes: 30,
    pageSize: 5000,
    updatedPrefix: "Figures current as of ",
    debug: false
  };

  var config = assign(assign({}, DEFAULTS), window.CM_CONFIG || {});
  config = assign(config, window.CM_CONFIG_OVERRIDE || {});

  var metrics = window.CM_METRICS || [];
  var CACHE_KEY = "cm-metrics:" + config.backend;

  function assign(target, source) {
    for (var k in source) {
      if (Object.prototype.hasOwnProperty.call(source, k)) target[k] = source[k];
    }
    return target;
  }

  function log() {
    if (config.debug && window.console) console.log.apply(console, arguments);
  }

  function warn(key, err) {
    if (window.console) {
      console.warn("[cm-metrics] " + key + " fell back to the static figure:", err);
    }
  }

  // -- rendering ------------------------------------------------------------

  function render(key, value, state) {
    var nodes = document.querySelectorAll('[data-cm-metric="' + key + '"]');
    for (var i = 0; i < nodes.length; i++) {
      if (state === "live") nodes[i].textContent = Number(value).toLocaleString();
      nodes[i].setAttribute("data-cm-state", state);
    }
  }

  function stamp() {
    var nodes = document.querySelectorAll("[data-cm-updated]");
    if (!nodes.length) return;
    var when = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric"
    });
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = config.updatedPrefix + when;
    }
  }

  // -- cache ----------------------------------------------------------------

  function readCache() {
    if (!config.cacheMinutes) return null;
    try {
      var raw = window.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (Date.now() - box.t > config.cacheMinutes * 60000) return null;
      return box.v;
    } catch (e) {
      return null;
    }
  }

  function writeCache(values) {
    if (!config.cacheMinutes) return;
    try {
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: values }));
    } catch (e) {
      /* private browsing, quota, disabled storage - the page works without it */
    }
  }

  // -- transport ------------------------------------------------------------

  function getJson(url, headers) {
    var init = {
      method: "GET",
      credentials: "same-origin",
      headers: assign({ Accept: "application/json" }, headers || {})
    };
    log("GET", url);
    return window.fetch(url, init).then(function (res) {
      if (!res.ok) throw new Error(res.status + " " + res.statusText + " for " + url);
      return res.json();
    });
  }

  // -- dataverse (Power Pages Web API) --------------------------------------

  function odataFilter(filter) {
    return filter ? "&$filter=" + encodeURIComponent(filter) : "";
  }

  function dataverseCount(m) {
    var d = m.dataverse;
    var base = "/_api/" + d.set;

    if (!d.distinct) {
      var url = base + "?$select=" + d.select + "&$top=1&$count=true" + odataFilter(d.filter);
      return getJson(url).then(function (data) {
        var n = data["@odata.count"];
        // Dataverse caps $count at 5000. Exactly 5000 means "at least 5000",
        // so count it properly instead of publishing a capped figure.
        if (typeof n === "number" && n !== 5000) return n;
        return dataversePage(base, d);
      }).catch(function (err) {
        log("$count unavailable, paging instead:", err);
        return dataversePage(base, d);
      });
    }
    return dataversePage(base, d);
  }

  function dataversePage(base, d) {
    var field = d.distinct ? d.field : d.select;
    var seen = d.distinct ? {} : null;
    var total = 0;

    function step(url) {
      return getJson(url, { Prefer: "odata.maxpagesize=" + config.pageSize })
        .then(function (data) {
          var rows = data.value || [];
          for (var i = 0; i < rows.length; i++) {
            if (d.distinct) {
              var v = rows[i][field];
              if (v !== null && v !== undefined && v !== "") seen[String(v)] = 1;
            } else {
              total++;
            }
          }
          var next = data["@odata.nextLink"];
          if (next) return step(next);
          return d.distinct ? Object.keys(seen).length : total;
        });
    }

    return step(base + "?$select=" + field + odataFilter(d.filter));
  }

  // -- sharepoint (REST) ----------------------------------------------------

  var SP_HEADERS = { Accept: "application/json;odata=nometadata" };

  function spListBase(title) {
    var site = String(config.sharePointSite || "").replace(/\/+$/, "");
    if (!site) throw new Error("config.sharePointSite is not set");
    return site + "/_api/web/lists/getbytitle('" + String(title).replace(/'/g, "''") + "')";
  }

  function sharepointCount(m) {
    var s = m.sharepoint;
    var base;
    try {
      base = spListBase(s.list);
    } catch (e) {
      return Promise.reject(e);
    }

    if (!s.distinct && !s.filter) {
      return getJson(base + "/ItemCount", SP_HEADERS).then(function (data) {
        if (typeof data.value === "number") return data.value;
        return spPage(base, s);
      });
    }
    return spPage(base, s);
  }

  function spPage(base, s) {
    var field = s.distinct ? s.field : "Id";
    var seen = s.distinct ? {} : null;
    var total = 0;
    var url = base + "/items?$select=" + field + "&$top=" + config.pageSize +
              (s.filter ? "&$filter=" + encodeURIComponent(s.filter) : "");

    function step(u) {
      return getJson(u, SP_HEADERS).then(function (data) {
        var rows = data.value || [];
        for (var i = 0; i < rows.length; i++) {
          if (s.distinct) {
            var v = rows[i][field];
            if (v !== null && v !== undefined && v !== "") seen[String(v)] = 1;
          } else {
            total++;
          }
        }
        var next = data["odata.nextLink"] || data["@odata.nextLink"];
        if (next) return step(next);
        return s.distinct ? Object.keys(seen).length : total;
      });
    }

    return step(url);
  }

  // -- orchestration --------------------------------------------------------

  function countOne(m) {
    if (config.backend === "mock") return Promise.resolve(m.fallback);
    if (config.backend === "sharepoint") {
      if (!m.sharepoint) return Promise.reject(new Error("no sharepoint mapping"));
      return sharepointCount(m);
    }
    if (!m.dataverse) return Promise.reject(new Error("no dataverse mapping"));
    return dataverseCount(m);
  }

  function run() {
    if (!metrics.length) return;

    if (!window.fetch || !window.Promise) {
      for (var i = 0; i < metrics.length; i++) render(metrics[i].key, null, "fallback");
      return;
    }

    var cached = readCache();
    if (cached) {
      log("served from sessionStorage");
      for (var j = 0; j < metrics.length; j++) {
        var key = metrics[j].key;
        if (typeof cached[key] === "number") render(key, cached[key], "live");
        else render(key, null, "fallback");
      }
      stamp();
      return;
    }

    var values = {};
    var pending = metrics.map(function (m) {
      return countOne(m).then(function (n) {
        if (typeof n !== "number" || isNaN(n)) throw new Error("non-numeric result: " + n);
        values[m.key] = n;
        render(m.key, n, "live");
      }).catch(function (err) {
        warn(m.key, err);
        render(m.key, null, "fallback");
      });
    });

    Promise.all(pending).then(function () {
      if (Object.keys(values).length) {
        writeCache(values);
        stamp();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
