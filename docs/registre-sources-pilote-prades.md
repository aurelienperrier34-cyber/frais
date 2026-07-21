# Registre de sources — pilote Prades-le-Lez

Ce registre doit être complété avant de calculer une recommandation réelle. Aucune source ne doit être interprétée comme une garantie de sécurité, d’ombre ou d’eau potable.

| Besoin | Source initiale | Usage | Limite / contrôle terrain |
|---|---|---|
| Rues et cheminements | OpenStreetMap | Réseau piéton et fond de carte | Vérifier trottoirs, traversées, travaux et accessibilité sur place. |
| Bâtiments | OpenStreetMap, puis données IGN si nécessaires | Empreinte, orientation ; hauteur seulement lorsqu’elle est présente ou validée | La hauteur est souvent absente ou incomplète : ne pas l’inventer. |
| Arbres / végétation | Relevés terrain, puis jeu communal ou métropolitain vérifié | Source d’ombre, type et présence | Hauteur, densité et entretien évoluent : dater chaque observation. |
| Position du soleil | Calcul local à partir de la date, l’heure et la position | Azimut et élévation pour les ombres | Le modèle ne remplace pas la vérification terrain. |
| Points d’eau | OpenStreetMap et vérification terrain | POI à afficher près du parcours | Statut « signalé », date de vérification et bouton d’indisponibilité ; ne jamais présumer potable. |

## Attribution et gouvernance

Les données OpenStreetMap sont sous licence ODbL : l’application devra afficher l’attribution aux contributeurs et respecter les obligations de la licence. Chaque import doit conserver sa date, sa source, sa couverture et son niveau de confiance.

## Ordre de mise en œuvre

1. Créer les 5 à 6 observations terrain dans l’application.
2. Exporter le fichier `observations-frais-prades.json` après chaque test.
3. Recouper les observations avec les rues, bâtiments et points d’eau cartographiés.
4. Définir la méthode de score d’ombre par segment et créneau horaire.
5. Ne rendre visible un itinéraire « plus frais » que lorsque le score est validé.
