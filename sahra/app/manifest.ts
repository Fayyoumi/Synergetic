import type { MetadataRoute } from "next";
import ar from "@/messages/ar.json";

// Installable PWA. Arabic is the default language, so the manifest is Arabic.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ar.meta.title,
    short_name: ar.meta.title,
    description: ar.meta.description,
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FFF4DE",
    theme_color: "#FFF4DE",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
