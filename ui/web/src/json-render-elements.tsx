import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import JsonRenderElementsPage from "@/pages/JsonRenderElementsPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <JsonRenderElementsPage />
  </StrictMode>
);
