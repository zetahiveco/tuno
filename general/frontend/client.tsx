import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "@/general/frontend/app-router";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <div className="sharp-ui">
        <AppRouter />
      </div>
    </BrowserRouter>
  </React.StrictMode>,
);
