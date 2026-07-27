import React, { useState, useEffect, KeyboardEvent, ReactNode } from 'react';
import { useRouter } from 'next/router';
import SessionSetup from './SessionSetup';

interface ProtectedPageProps {
  children: ReactNode;
}

const ProtectedPage: React.FC<ProtectedPageProps> = ({ children }) => {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [clientIp, setClientIp] = useState<string>(''); // Ajouter l'état pour stocker l'IP
  // Réglages de session : proposés UNIQUEMENT à la personne qui vient de
  // déverrouiller par mot de passe (l'enseignant), pas aux visiteurs qui
  // arrivent site déjà ouvert ni aux postes en auto-login par IP.
  const [showSetup, setShowSetup] = useState(false);
  // const [isIpAllowed, setIsIpAllowed] = useState(false); // Pour stocker l'état de l'IP

  useEffect(() => {
    checkAuthorization();   
    fetchClientIp(); // Appeler la fonction pour récupérer l'IP
  }, []);

  const fetchClientIp = async () => {
    try {
      const response = await fetch('/api/ip'); // Appelle l'API Next.js
      const data = await response.json();
      setClientIp(data.ip); // Stocke l'IP du client
      console.log(data);
      // setIsIpAllowed(data.isIpAllowed); // Stocke le statut si l'IP est autorisée [DEBUG ONLY]
    } catch (error) {
      console.error('Erreur lors de la récupération de l\'IP :', error);
    }
  };

  const checkAuthorization = async () => {
    try {
      const response = await fetch('/api/auth', {method: 'GET',});
      const data = await response.json();
      setIsAuthorized(data.success);
      // « Réglages de session » demandés explicitement (/school?session=1,
      // raccourci Enseignant de l'accueil) : l'écran s'ouvre même si le site
      // est DÉJÀ déverrouillé — sans cela, une enseignante ne pouvait plus
      // redéployer un autre tuteur de toute la durée du verrou.
      if (data.success && new URLSearchParams(window.location.search).get('session') === '1') {
        setShowSetup(true);
      }
    } catch (error) {
      console.error('Error checking authorization:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Refermer les réglages nettoie le paramètre : un rafraîchissement ne les
  // rouvre pas indéfiniment.
  const closeSetup = () => {
    setShowSetup(false);
    if (typeof window !== 'undefined' && window.location.search.includes('session=1')) {
      void router.replace(window.location.pathname, undefined, { shallow: true });
    }
  };

  const handlePasswordSubmit = async () => {
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (data.success) {
        setIsAuthorized(true);
        setShowSetup(true);
      } else if (data?.error?.code === 'ERR_NO_ETABLISSEMENT') {
        // BON MOT DE PASSE, MAUVAIS RÉSEAU. Le verrou porte l'école du réseau
        // appelant : hors d'un réseau scolaire déclaré, il n'y a pas de salle à
        // ouvrir, et le mot de passe n'y peut rien. Dire « incorrect » ici
        // enverrait toute une classe le retaper.
        // (Cet écran hérité n'est pas encore traduit — d'où le français en dur,
        // comme les deux messages voisins.)
        alert("Cette adresse n'est rattachée à aucun établissement : l'accès ne peut être ouvert que depuis le réseau de l'école.");
      } else if (data?.error?.code === 'ERR_LOCK_WRITE') {
        // Le mot de passe était bon et le réseau aussi : c'est le serveur qui
        // n'a pas su enregistrer l'ouverture. Dire « incorrect » ferait retaper
        // indéfiniment un mot de passe qui n'y est pour rien.
        alert("L'ouverture n'a pas pu être enregistrée par le serveur. Réessayez dans un instant.");
      } else {
        alert('Mot de passe incorrect');
      }
    } catch (error) {
      console.error('Error submitting password:', error);
      alert('Une erreur est survenue. Veuillez réessayer.');
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handlePasswordSubmit();
    }
  };

  if (isLoading) {
    return <div>Chargement...</div>;
  }

  if (isAuthorized) {
    if (showSetup) return <SessionSetup onDone={closeSetup} />;
    return <>{children}</>;
  }

  /*
  const timeZone = process.env.SET_TIME_ZONE || 'Europe/Zurich'; // Défaut sur 'Europe/Zurich'
  const localTime = DateTime.now().setZone(timeZone);
  const currentHour = localTime.hour.toString().padStart(2, '0');
  const currentMinute = localTime.minute.toString().padStart(2, '0');
  */

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="password-layer bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-nightBlue-900">{clientIp}</h2>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Mot de passe"
          className="w-full px-3 py-2 mb-4 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-nightBlue-500"
        />
        <button 
          onClick={handlePasswordSubmit}
          className="w-full bg-nightBlue-700 text-white py-2 px-4 rounded-md hover:bg-nightBlue-800 focus:outline-none focus:ring-2 focus:ring-nightBlue-500 focus:ring-opacity-50"
        >
          Entrer
        </button>
      </div>
      <div className="text-layer text-xs p-8 rounded-lg">
        <h1><big><a href="/rgpd">Conformité RGPD - nLPD</a></big></h1>
      </div>
    </div>
  );
};

export default ProtectedPage;