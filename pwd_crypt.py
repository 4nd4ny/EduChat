import bcrypt

def hash_password(plain_password: str, salt_rounds: int = 10) -> str:
    """
    Hache un mot de passe en utilisant bcrypt.

    :param plain_password: Le mot de passe en clair à hacher.
    :param salt_rounds: Le nombre de tours de salage (par défaut 10).
    :return: Le mot de passe haché sous forme de chaîne de caractères.
    """
    try:
        # Générer le sel avec le nombre de rounds spécifié
        salt = bcrypt.gensalt(rounds=salt_rounds)
        
        # Hacher le mot de passe avec le sel généré
        hashed = bcrypt.hashpw(plain_password.encode('utf-8'), salt)
        
        # Décoder le hash en chaîne de caractères pour l'affichage ou le stockage
        return hashed.decode('utf-8')
    except Exception as e:
        # Gérer les exceptions et les erreurs
        raise Exception(f"Erreur lors du hachage du mot de passe: {e}")

if __name__ == "__main__":
    # Exemple de mot de passe en clair
    plain_password = 'YOUR_PASSWORD_IN_CLEAR'
    
    # Nombre de rounds de salage (doit correspondre à celui utilisé côté serveur)
    salt_rounds = 10
    
    try:
        # Hacher le mot de passe
        hashed_password = hash_password(plain_password, salt_rounds)
        
        # Afficher le hash généré
        print(hashed_password)
        
        # (Optionnel) Stocker le hash dans un fichier .env
        # Vous pouvez ouvrir le fichier .env en mode append et ajouter la ligne suivante :
        # AUTH_PASSWORD_HASH=hashed_password
        with open('.env', 'a') as env_file:
            env_file.write(f"AUTH_PASSWORD_HASH={hashed_password}\n")
        
        print("Le mot de passe haché a été stocké dans le fichier .env.")
    except Exception as err:
        print(err)
