"use client";

import { Toaster } from "react-hot-toast";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3600,
        style: {
          background: "#0B1849",
          color: "#FFFFFF",
          borderRadius: "10px",
          padding: "12px 16px",
          fontSize: "14px",
        },
      }}
    />
  );
}
