import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import Providers from "./providers/Provider";
import { BrowserRouter } from "react-router-dom";
import { InternetIdentityProvider } from "./contetxs/InternetContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Providers>
        <InternetIdentityProvider>
          <App />
        </InternetIdentityProvider>
      </Providers>
    </BrowserRouter>
  </StrictMode>
);
