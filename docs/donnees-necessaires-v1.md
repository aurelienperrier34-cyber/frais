# Données nécessaires pour Frais

## Déjà collectées dans l’application

- Itinéraire piéton de référence ;
- géométrie du réseau et traversées cartographiées ;
- bâtiments, arbres et points d’eau OpenStreetMap autour du parcours ;
- météo locale : température, température ressentie, humidité, vent, nébulosité et rayonnement.

## À compléter avant un calcul d’ombre fiable

- hauteur et emprise des bâtiments ;
- hauteur, couronne et densité des arbres ;
- position solaire pour la date et l’heure ;
- relief et murs/auvents ;
- précision des cheminements piétons, travaux et accessibilité.

## À compléter pour « le plus frais »

- ombre calculée par segment ;
- rayonnement direct et diffus ;
- température et humidité ;
- vent ;
- matériaux de sol et proximité de végétation/eau ;
- données de qualité de l’air lorsque pertinentes.

## Sources prévues

- OpenStreetMap pour le réseau, les POI et les attributs disponibles ;
- LiDAR HD de l’IGN pour compléter les hauteurs et le modèle numérique de hauteur ; la couche MNH est désormais activable dans l’application via le bouton « 3D » ;
- Open-Meteo pour les variables météorologiques locales.

Chaque source doit conserver sa date, sa couverture, sa licence et son niveau de confiance.
