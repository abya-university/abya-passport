// src/abya-passport-frontend/src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Providers from "./providers/Provider";
import { BrowserRouter } from "react-router-dom";
import { InternetIdentityProvider } from "./contexts/InternetContext";
import { EthrProvider } from "./contexts/EthrContext";
import { ThirdwebProvider } from "thirdweb/react";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Providers>
        <ThirdwebProvider>
          <EthrProvider>
            <InternetIdentityProvider>
              <App />
            </InternetIdentityProvider>
          </EthrProvider>
        </ThirdwebProvider>
      </Providers>
    </BrowserRouter>
  </StrictMode>
);
