import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App, { TrioLanding as Landing } from "./TrioApp";
import "./styles.css";
import { LanguageProvider } from "./i18n/Language";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <QueryClientProvider client={client}>
        {window.location.port !== "5174" &&
        window.location.pathname === "/login" ? (
          <Landing page="login" />
        ) : window.location.port !== "5174" &&
          window.location.pathname === "/" &&
          new URLSearchParams(window.location.search).get("view") !==
            "console" ? (
          <Landing />
        ) : (
          <App />
        )}
      </QueryClientProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
