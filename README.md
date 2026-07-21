# Frais — marcher au frais, même en canicule

**Frais** est une application web mobile de navigation piétonne pour comparer des itinéraires rapides, ombragés et thermiquement plus confortables. Le pilote a commencé à Prades-le-Lez et s'étend vers Montpellier.

**Démo publique :** https://frais-1036239116658.europe-west1.run.app

## Ce que fait Frais

- Affiche une vraie carte OpenStreetMap et des itinéraires piétons.
- Compare le trajet le plus rapide, l'alternative la plus ombragée et l'option la plus fraîche.
- Indique durée, distance et part estimée du trajet à l'ombre.
- Prend en compte l'heure de départ, la position du soleil, la météo et les données de hauteur LiDAR lorsqu'elles sont disponibles.
- Signale les points d'eau et propose un guidage piéton étape par étape avec géolocalisation.
- Fonctionne en application installable sur mobile (PWA).

## Données et méthode

Frais associe le réseau piéton OpenStreetMap, le calcul solaire, les informations météo, les données de bâti/végétation et un pilote LiDAR IGN. Le score de fraîcheur reste une **estimation explicable** : il ne prétend pas mesurer une température exacte à chaque mètre.

Les fichiers LiDAR volumineux ne sont pas présents dans ce dépôt. En production, ils sont lus depuis un stockage privé Google Cloud Storage.

## Lancer localement

```bash
npm start
```

Puis ouvrir `http://localhost:8000`. Le fichier `demarrer-frais.cmd` permet aussi un démarrage simplifié sous Windows.

## Architecture

- `index.html`, `app.js`, `styles.css` : interface et choix d'itinéraires.
- `live-map.js`, `live-map.css`, `map-v2.css` : carte, tracé, navigation et guidage piéton.
- `lidar-pilot-server-v2.mjs` : serveur local / Cloud Run et accès aux données LiDAR.
- `service-worker.js`, `manifest.webmanifest` : installation PWA et cache.
- `Dockerfile` : déploiement Google Cloud Run.

## Codex et GPT-5.6

Frais a été conçu et construit en collaboration avec **Codex propulsé par GPT-5.6**. Ils ont été utilisés pour :

- transformer l'idée en parcours produit et en interface mobile ;
- écrire et itérer sur le HTML, CSS et JavaScript ;
- intégrer la carte, le routage piéton, le guidage et la PWA ;
- préparer l'accès aux données LiDAR, le serveur Node.js et le déploiement Cloud Run ;
- diagnostiquer les problèmes d'affichage sur mobile et améliorer l'expérience à partir de retours de tests ;
- générer les contenus de démonstration et la documentation du projet.

Les choix produit, les tests réels à Prades-le-Lez et la validation de l'expérience utilisateur ont été faits avec le porteur du projet.

## Limites actuelles et suite

Le pilote LiDAR est prêt pour Prades-le-Lez. La couverture complète de la métropole nécessite de préparer davantage de tuiles de hauteur. Les prochaines étapes sont l'industrialisation du calcul d'ombre, une meilleure couverture végétale et l'évaluation terrain à grande échelle.
