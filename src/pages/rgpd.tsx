import React from "react";
import { NextPage } from "next";
import { TbHome } from "react-icons/tb";

const rgpd: NextPage = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
          <div className="text-layer text-xs p-8 rounded-lg overflow-auto max-h-screen">
            <h1><big>Politique de Confidentialité</big></h1>
            <br/>
            <p><strong>Respect du RGPD et de la nLPD</strong><br/>
            Je me suis engagé à respecter le <a href="https://www.cnil.fr/fr/reglement-europeen-protection-donnees" target="_blank" rel="noopener noreferrer" className="text-blue-500">Règlement Général sur la Protection des Données (RGPD)</a> et la <a href="https://www.kmu.admin.ch/kmu/fr/home/faits-et-tendances/digitalisation/protection-des-donnees/nouvelle-loi-sur-la-protection-des-donnees-nlpd.html" target="_blank" rel="noopener noreferrer" className="text-blue-500">nouvelle Loi pour la Protection des Données (nLPD)</a>. Pour cela, j'ai pris des mesures pour garantir l'anonymat de vos visites sur ce site. Voici les actions que j'ai mises en place.</p>
            <br/>
            <p><strong>1. Pas d'historique de vos conversations</strong><br/>
            Je ne conserve aucune trace de vos interactions. Vos conversations avec ChatGPT ne sont pas enregistrées sur le serveur. Elles ne sont conservées que dans la mémoire du navigateur que vous avez utilisé pour vous connecter sur le site. Pensez à les exporter avant de fermer votre navigateur. Une mise à jour de votre poste de travail pourrait les supprimer.</p>
            <br/>
            <p><strong>2. Pas de collecte d'adresses IP</strong><br/>
            Votre adresse IP (un identifiant unique de votre connexion à Internet) est nécessaire pour que chaque page web que vous consultez sur Internet soit acheminée jusqu'à votre navigateur. Par défaut, tous les serveurs web enregistrent votre adresse IP lorsque vous consultez une ressource en ligne. J'ai désactivé cette fonctionnalité sur le serveur. Cela signifie que je ne stocke pas votre adresse IP dans les journaux de navigation rendant ainsi vos visites anonymes.<br/>
            <br/>  
            Voici <a href="http://167.114.159.114/httpd.conf" target="_blank" rel="noopener noreferrer" className="text-blue-500">le fichier de configuration du serveur</a> (cherchez 'anonymized') et <a href="http://167.114.159.114/educh-at.log" target="_blank" rel="noopener noreferrer" className="text-blue-500">un extrait dynamique des logs générés</a> grâce à cette configuration. Cet ajustement permet de protéger la confidentialité de votre adresse IP qui est la même pour tous les postes-écoles. Le seul contrôle qui est réalisé est donc de vérifier que vous vous connectez bien depuis l'école. Vous pouvez vérifier auprès des <a href="https://github.com/4nd4ny/EduChat/" target="_blank" rel="noopener noreferrer" className="text-blue-500">sources de ce projet </a>. La seule adresse IP collectée, que je conserve pendant un temps limité à des fins de sécurité, est la mienne lorsque je saisis le mot de passe pour déverrouiller le site. Or, comme c'est moi qui aie développé le site, il est fort probable que je sois en accord avec les conditions d'usage que suis présentement en train de rédiger.</p>
            <br/>
            <p><strong>3. Pas de cookies d'authentification et donc pas d'accès protégé possible en dehors de l'école</strong><br/>
            Pour garantir votre anonymat et respecter pleinement les exigences du RGPD, je n’utilise aucun cookie sur ce site. Les cookies sont de petits fichiers qui vous évitent de saisir un mot de passe à chaque changement de page web sur un même site. Sans cookies, il m'est impossible de vous donner accès à ce site en dehors de l'école, même si vous vous connectez avec le wifi depuis l'école avant de rentrer chez vous. En tant qu'enseignant bénévole vous offrant ce service gratuitement financé sur mes fonds propres, je n'ai en effet pas les moyens de pouvoir assurer le respect du RGPD si j'utilisais un cookie d'authentification, chose qui est obligatoire si je décidais de vous donner accès à Claude Anthropic en dehors de l'école.<br/>
            <br/>
            Il faudrait en effet que je puisse alors garantir de pouvoir vous donner accès à toutes les données privées anonymes que le serveur aurait pu collecter pour que vous puissiez l'utiliser (c'est-à-dire l'équivalent d'un nombre aléatoire qui n'est pas associé à votre nom), ce qui représente trop de travail puisque je n'ai aucun moyen de savoir quel nombre aléatoire vous aurez été attribué et qu'il faudrait que j'enquête au près des gens qui s'occupent du réseau de l'état pour recouper les informations de nos différents logs. Ce travail, disproportionné en temps par rapport au service offert et à mes moyens financiers limités pour un service gratuit, rend donc impossible votre usage de ce site en dehors de l'école.<br/>
            <br/> 
            Ces restrictions sont mises en place pour assurer que vos données de navigation restent entièrement protégées et anonymes lorsque vous utilisez ce site depuis un poste-école, ou avec votre téléphone portable depuis le wifi de l'école. Du fait de la RGPD, vous ne pouvez pas utiliser gratuitement les meilleurs modèles d'intelligence artificielle des sociétés Anthropic et OpenAI chez vous. Vous devez prendre des abonnements à vos frais non remboursés par l'école. Faites attention cependant, contrairement à EduChat, les données que vous soumettez à Anthropic et OpenAI via leur interface web ne sont pas anonymes et peuvent être conservées pour entrainer les générations futures d'IA.</p>
            <div className="flex p-8 justify-center items-center">
                <p><a href="/"><TbHome size={48} /></a></p>
            </div>
          </div>
        </div>
    );
};
    
export default rgpd;