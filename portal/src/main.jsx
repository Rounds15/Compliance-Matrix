/* Entry point. Mounts the Compliance Matrix into <div id="cm-root"> - the
   element the Power Pages web template renders - using the configuration on
   that element's data- attributes (see config.js). */

import React, { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { readConfig } from "./config.js";
import { useStore } from "./data/store.js";
import { App } from "./ui/App.jsx";
import { setSiteTimeZone } from "./lib/dates.js";

function Root({ el }) {
  const cfg = useMemo(() => { const c = readConfig(el); setSiteTimeZone(c.timeZone); return c; }, [el]);
  const store = useStore(cfg);
  return <App store={store} />;
}

function mount() {
  const el = document.getElementById("cm-root");
  if (!el) return;
  el.classList.add("cm-app");
  createRoot(el).render(<Root el={el} />);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
else mount();
