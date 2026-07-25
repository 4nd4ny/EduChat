import React, { useState, useEffect, useCallback  } from 'react';
import ProtectedPage from "@/context/ProtectedPage";
import ChatSidebar from "@/chatSidebar/ChatSidebar";
import Head from "next/head";
import { useRouter } from 'next/router';
import styles from '@/utils/sidebar.module.css';
import SiteHeader from '@/site/SiteHeader';
import { formatTokens } from '@/utils/formatTokens'; // Assurez-vous de créer ce fichier

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [totalTokens, setTotalTokens] = useState('');

  const { pathname } = useRouter();
  // Pivot v3 : le site est PUBLIC (catalogue, fiches, chat en clé personnelle).
  // Seul l'espace établissement /school passe par le déverrouillage enseignant.
  const isProtected = pathname.startsWith('/school');
  // La sidebar d'historique n'a de sens que sur les pages de conversation.
  const hasChatSidebar = pathname.startsWith('/chat') || pathname.startsWith('/school');

  useEffect(() => {
    
    // Fonction pour mettre à jour le titre
    const updateTitle = () => {
      const storedTokens = localStorage.getItem('totalTokens');
      if (storedTokens) {
        const formattedTokens = formatTokens(parseInt(storedTokens, 10));
        setTotalTokens(formattedTokens);
      }
    };

    // Mettre à jour le titre initialement
    updateTitle();
    window.addEventListener('storage', updateTitle);
    window.addEventListener('totalTokensUpdated', updateTitle);

    // L'historique se replie sous 1280 px (et non 768) : en dessous, la
    // colonne de 320 px mangeait la conversation.
    const checkIsMobile = () => setIsMobile(window.innerWidth < 1280);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => {
      window.removeEventListener('resize', checkIsMobile);
      window.removeEventListener('storage', updateTitle);
      window.removeEventListener('totalTokensUpdated', updateTitle);
    };
  }, []);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);

  // Sur mobile la sidebar coulisse par-dessus le contenu, mais JAMAIS par-dessus
  // la barre de navigation (60 px) : celle-ci reste toujours atteignable.
  //
  // ATTENTION : aucune classe de TRANSFORMATION en dehors du mobile. Une
  // transformation, même « translate-x-0 », crée un conteneur de référence
  // pour les descendants en position fixed : la barre latérale se calait
  // alors sous ce conteneur (déjà décalé de la hauteur de l'en-tête) et
  // débordait de 60 px par le bas — « Tout effacer » passait sous l'écran.
  const getSidebarClasses = useCallback((isOpen: boolean) => `
    ${isMobile ? 'fixed bottom-0 top-[60px] left-0 z-30 transform transition-transform duration-300 ease-in-out' : ''}
    ${isMobile ? (isOpen ? 'translate-x-0' : '-translate-x-[calc(100%+4px)]') : ''}
  `, [isMobile]);

  const getSidebarStyle = useCallback((isOpen: boolean) => ({
    boxShadow: isMobile && !isOpen ? '15px 0 15px rgba(0, 0, 0, 0.1)' : 'none',
  }), [isMobile]);

  return (
    <React.Fragment>
      <Head>
        <title>{`EduChat${totalTokens ? ` ${totalTokens}` : ''}`}</title>
        <meta name="description" content="EduChat — des tuteurs socratiques pour apprendre en réfléchissant." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Favicon « E » blanc sur fond orange (SVG, honoré par les navigateurs
            actuels) ; l'.ico historique reste en repli pour les très anciens. */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <meta name="theme-color" content="#DC6521" />
      </Head>

      {hasChatSidebar ? (
        (() => {
          const chatShell = (
            // Coquille de chat : la barre de navigation occupe 60 px en tête,
            // le reste de la hauteur revient à la conversation.
            <div className="max-w-screen relative flex h-screen max-h-screen w-screen flex-col overflow-hidden">
              <SiteHeader />
              <div className="flex h-[calc(100vh-60px)] max-h-[calc(100vh-60px)]">
                <>
                  {isMobile && (
                    <div>
                      <button
                        onMouseOver={openSidebar}
                        onClick={toggleSidebar}
                        className={`${styles.button} "fixed h-full rounded-md"`}
                      >
                      </button>
                      <div className={styles.tab} onClick={toggleSidebar}>
                        <span>{sidebarOpen ? 'Fermer' : 'Historique'}</span>
                      </div>
                    </div>
                  )}
                  <div className={getSidebarClasses(sidebarOpen)} style={getSidebarStyle(sidebarOpen)}>
                    <ChatSidebar />
                  </div>
                </>
                <div className="flex flex-grow overflow-hidden" onMouseOver={closeSidebar}>
                  {children}
                </div>
              </div>
            </div>
          );
          // /school : même coquille de chat, mais derrière le déverrouillage enseignant
          return isProtected ? <ProtectedPage>{chatShell}</ProtectedPage> : chatShell;
        })()
      ) : (
        // Pages publiques sans chat (catalogue, fiches prompt, rgpd...) :
        // barre de navigation puis contenu, défilement vertical naturel.
        <div className="max-w-screen relative min-h-screen w-screen overflow-x-hidden">
          <SiteHeader />
          {children}
        </div>
      )}

    </React.Fragment>
  );
};

export default Layout;