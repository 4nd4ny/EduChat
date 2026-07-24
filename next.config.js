/** @type {import('next').NextConfig} */
const nextConfig = {
  // Génère un serveur Node autonome dans .next/standalone : l'image Docker
  // finale n'embarque que les dépendances réellement utilisées (~10× plus légère).
  output: 'standalone',

  // Routage i18n natif du pages-router (étape 10) : /en, /it, /de préfixent
  // les URL ; le français reste la locale par défaut, sans préfixe.
  i18n: { locales: ['fr', 'en', 'it', 'de'], defaultLocale: 'fr' },

  // ESLint hors du build : la passe de lint reste des heures bloquée sur le
  // poste de développement (dossier Dropbox) sans jamais aboutir. La validité
  // des types est garantie par le type-check du build ; « yarn lint » reste
  // disponible à la demande.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
