#!/bin/bash

# Chemin du fichier de log d'Apache
LOG_FILE="/var/log/httpd/educh.at-access.log"

# Chemin du fichier de sortie à la racine du site web
OUTPUT_FILE="/var/www/html/ip-direct/educh-at.log"

# Effectuer un tail -100 et copier le résultat dans le fichier de sortie
tail -100 "$LOG_FILE" > "$OUTPUT_FILE"

# Rendre le fichier lisible par le serveur web
chown fedora:fedora "$OUTPUT_FILE"

