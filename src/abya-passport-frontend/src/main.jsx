// src/abya-passport-frontend/src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Providers from "./providers/Provider";
import { BrowserRouter } from "react-router-dom";
import { InternetIdentityProvider } from "./contexts/InternetContext";
import { EthrProvider } from "./contexts/EthrContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Providers>
        <EthrProvider>
          <InternetIdentityProvider>
            <App />
          </InternetIdentityProvider>
        </EthrProvider>
      </Providers>
    </BrowserRouter>
  </StrictMode>
);
