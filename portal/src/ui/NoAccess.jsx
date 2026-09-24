/* No Access (parity spec 2.12, scr_NoAccess.pa.yaml). */

import React from "react";
import { Hero, Icon, useApp } from "./parts.jsx";

export function NoAccess() {
  const { go } = useApp();
  return <>
    <Hero eyebrow="RESTRICTED" title="No access" lede="This area is limited to compliance office staff." />
    <div className="wrap noaccess">
      <div className="card">
        <Icon n="shield" s={48} />
        <h2>Administrator access required</h2>
        <p>Risk and Reporting is limited to compliance office staff. If you need access, contact the Office of Compliance and Enterprise Risk Management.</p>
        <button className="btn primary" onClick={() => go("Home")}>Back to Home</button>
      </div>
    </div>
  </>;
}
