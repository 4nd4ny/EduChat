import React, { useState, useEffect, useCallback  } from 'react';
import ProtectedPage from "@/context/ProtectedPage";
import ChatSidebar from "@/chatSidebar/ChatSidebar";
import Head from "next/head";
import { useRouter } from 'next/router';
import styles from '@/utils/sidebar.module.css';
import { formatTokens } from '@/utils/formatTokens'; // Assurez-vous de créer ce fichier

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [totalTokens, setTotalTokens] = useState('');

  const { pathname } = useRouter();
  const isProtected = pathname !== '/rgpd' && pathname !== '/police'; // Exclure la page /rgpd de la protection

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

    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
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

  const getSidebarClasses = useCallback((isOpen: boolean) => `
    ${isMobile ? 'fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-in-out transform' : ''}
    ${isMobile && !isOpen ? '-translate-x-[calc(100%+4px)]' : 'translate-x-0'}
  `, [isMobile]);

  const getSidebarStyle = useCallback((isOpen: boolean) => ({
    boxShadow: isMobile && !isOpen ? '15px 0 15px rgba(0, 0, 0, 0.1)' : 'none',
  }), [isMobile]);

  return (
    <React.Fragment>
      <Head>
        <title>{`EduChat${totalTokens ? ` ${totalTokens}` : ''}`}</title>
        <meta name="description" content="ChatGPT for Education - Provided by Chamblandes" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {isProtected ? (
        <ProtectedPage>
          <div className="max-w-screen relative h-screen max-h-screen w-screen overflow-hidden">
            <div className="flex h-[calc(100vh)] max-h-[calc(100vh)]">
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
        </ProtectedPage>
      ) : (
        // Si non protégée (ex. rgpd), rendre seulement le contenu
        <div className="max-w-screen relative h-screen max-h-screen w-screen overflow-hidden">
          {children}
        </div>
      )}

    </React.Fragment>
  );
};

export default Layout;