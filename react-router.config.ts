import type { Config } from "@react-router/dev/config";

// SSR: loaders y actions corren en el mismo proceso Node que sirve la tienda.
// Para Vercel/Netlify se suma el preset de la plataforma (ver docs/deploy.md).
export default {
  ssr: true
} satisfies Config;
