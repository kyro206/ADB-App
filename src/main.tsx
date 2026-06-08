import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { DeviceProvider } from "./context/DeviceContext";
import { I18nProvider } from "./locales";
import "./styles/global.css";
import "@fontsource/material-symbols-rounded";
import "@fontsource-variable/google-sans-flex";
import "@material/web/all.js";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <DeviceProvider>
          <App />
        </DeviceProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
