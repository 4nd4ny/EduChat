/** @type {import('next').NextConfig} */
const nextConfig = {
  // Génère un serveur Node autonome dans .next/standalone : l'image Docker
  // finale n'embarque que les dépendances réellement utilisées (~10× plus légère).
  output: 'standalone',

  // L'internationalisation (fr/en/it/de) sera activée ici à l'étape 10 du planning :
  // i18n: { locales: ['fr', 'en', 'it', 'de'], defaultLocale: 'fr' },
};

module.exports = nextConfig;
