/* No Access (scr_NoAccess), in the design's panel. An administrator
   previewing another view is told how to get back. */

import React from "react";
import { Icon, useApp } from "./parts.jsx";

export function NoAccess() {
  const { go, realAdmin, setViewAs } = useApp();
  return <div className="page wrap"><div className="cm-panel" style={{ padding: "48px 24px", textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
    <Icon n="shield" s={38} style={{ color: "#ADB3B8" }} />
    <div className="eyebrow" style={{ marginTop: 12 }}>Restricted</div>
    <h2 style={{ fontFamily: "var(--font-display)", color: "#000E54", margin: "6px 0 8px" }}>Administrator access required</h2>
    <p className="sub" style={{ maxWidth: "52ch", margin: "0 auto" }}>{realAdmin
      ? "You are previewing the matrix as someone without administrator rights. Switch Viewing as back to Admin view to see this screen."
      : "Risk and Reporting is limited to compliance office staff. If you need access, contact the Office of Compliance and Enterprise Risk Management."}</p>
    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
      {realAdmin && <button className="button button-primary" onClick={() => setViewAs({ mode: "Admin" })}>Switch to Admin view</button>}
      <button className="button button-secondary-outline" onClick={() => go("Home")}>Back to Home</button>
    </div>
  </div></div>;
}
