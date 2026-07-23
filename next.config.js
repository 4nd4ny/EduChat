/** @type {import('next').NextConfig} */
const nextConfig = {
  // Génère un serveur Node autonome dans .next/standalone : l'image Docker
  // finale n'embarque que les dépendances réellement utilisées (~10× plus légère).
  output: 'standalone',

  // Routage i18n natif du pages-router (étape 10) : /en, /it, /de préfixent
  // les URL ; le français reste la locale par défaut, sans préfixe.
  i18n: { locales: ['fr', 'en', 'it', 'de'], defaultLocale: 'fr' },
};

module.exports = nextConfig;
