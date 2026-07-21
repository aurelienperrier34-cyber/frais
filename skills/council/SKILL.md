---
name: council
description: "Utiliser uniquement lorsqu’un utilisateur écrit explicitement « council this », « convoque le conseil », « pressure-test this », « passe ceci au conseil », « soumets ceci au conseil » ou « LLM Council ». Ne s’auto-déclenche JAMAIS et ne convient pas aux questions triviales, factuelles ou à réponse directe."
---

# Council — LLM Council ancré dans le dépôt

Cette skill met en œuvre un conseil LLM pour éclairer une décision non triviale du projet. Elle répond dans la langue principale constatée dans le dépôt (README et documentation comprise) ; à défaut, en français. Elle ne remplace pas le jugement du demandeur.

## Règles non négociables

- Toujours ancrer les débats dans le dépôt réel avant de solliciter le conseil.
- Toujours lancer les cinq conseillers en parallèle et indépendamment.
- Toujours anonymiser et mélanger aléatoirement les réponses avant la relecture par les pairs.
- Ne jamais déclencher ce processus de sa propre initiative ; seuls les déclencheurs du frontmatter l’autorisent.
- Ne pas l’utiliser pour une information simple, une définition, une petite modification mécanique ou une question dont la réponse est vérifiable directement.

## 1. Cadrer la question (environ 60 secondes)

1. Identifier la langue principale, le domaine métier, les langages et la structure du projet à partir de `README*`, des fichiers de configuration et de l’arborescence.
2. Scanner ensuite les **2 à 4 fichiers les plus déterminants** pour la décision demandée : fichiers d’architecture, modèle de domaine, contrats d’API, parcours utilisateur, configuration de sécurité, tests ou modules directement concernés. Choisir les fichiers réels plutôt qu’une liste figée.
3. Relever les contraintes et faits vérifiables : conventions, dépendances, comportements existants, dette connue, tests et conséquences pour les utilisateurs.
4. Reformuler la demande en un prompt neutre, précis et actionnable. Inclure un mini-contexte factuel (fichiers consultés et observations) sans suggérer de conclusion.

## 2. Conseil : cinq angles volontairement opposés

Créer exactement cinq sous-agents, tous en parallèle. Chacun pousse **son angle à fond**, sans le tempérer ni chercher artificiellement un compromis. Chaque réponse fait 150 à 300 mots et cite les faits du dépôt qui fondent son avis.

1. **Minimalisme / réversibilité** — Favorise la solution la plus petite, la moins invasive et la plus facile à annuler. Traque toute complexité prématurée.
2. **Cohérence systémique** — Défend la cohérence à long terme du modèle, des invariants et de l’architecture. Refuse les exceptions locales et les bricolages.
3. **Risque / sûreté** — Cherche d’abord les défaillances, abus, régressions, risques de données et cas limites. Préconise la robustesse même si elle ralentit.
4. **Valeur utilisateur / vitesse d’apprentissage** — Privilégie le résultat observable, le chemin le plus court vers la validation et l’usage réel. Rejette le perfectionnisme interne.
5. **Opérabilité / coût durable** — Optimise la lisibilité, les tests, le diagnostic, la maintenance et le coût de changement futur. Se méfie des gains immédiats qui créent une charge invisible.

### Template de prompt — conseiller

```text
Tu es le conseiller « {ANGLE} » d’un LLM Council. Pousse exclusivement cet angle à fond : ne le nuance pas et ne cherche pas de compromis.

Question neutre :
{QUESTION_NEUTRE}

Contexte vérifié dans le dépôt :
{CONTEXTE_FICHIERS_ET_FAITS}

Réponds en {LANGUE}, 150 à 300 mots. Donne un verdict clair, les preuves concrètes issues du contexte, les risques ou bénéfices selon ton angle, et l’action que tu imposerais. Ne mentionne pas les autres conseillers.
```

## 3. Relecture croisée anonymisée

Une fois les cinq réponses reçues :

1. Retirer tout nom, angle ou identifiant révélateur.
2. Mélanger aléatoirement les textes et les étiqueter simplement **A à E**.
3. Lancer cinq relecteurs en parallèle, sans leur révéler l’attribution d’origine. Chaque relecteur examine le même lot anonymisé avec le template ci-dessous.
4. Conserver les réponses brutes et la correspondance privée pour le transcript, mais ne pas l’exposer dans la version de relecture.

### Template de prompt — relecteur

```text
Tu es un relecteur indépendant. Les cinq propositions ci-dessous sont anonymisées et dans un ordre aléatoire. Évalue leur qualité à partir du contexte réel, pas de leur style.

Question neutre :
{QUESTION_NEUTRE}

Contexte vérifié :
{CONTEXTE_FICHIERS_ET_FAITS}

Propositions anonymisées :
A. {REPONSE_A}
B. {REPONSE_B}
C. {REPONSE_C}
D. {REPONSE_D}
E. {REPONSE_E}

Réponds en {LANGUE}, de façon concise :
1) meilleure réponse (lettre et raison) ;
2) plus gros angle mort (lettre et raison) ;
3) ce que toutes les propositions ont manqué.
Ne tente pas de deviner les auteurs ou les angles.
```

## 4. Synthèse du président

Donner au président le contexte, les avis anonymisés et les cinq relectures. Le président tranche : il peut contredire la majorité lorsqu’un fait du dépôt ou un risque décisif le justifie. Éviter les compromis vagues et les recommandations irréversibles non justifiées.

### Template de prompt — président

```text
Tu présides un LLM Council. Décide à partir des éléments ci-dessous, en privilégiant les faits vérifiés du dépôt. La majorité est un signal, pas une règle : tu peux la contredire si le contexte le justifie.

Question neutre :
{QUESTION_NEUTRE}

Contexte vérifié :
{CONTEXTE_FICHIERS_ET_FAITS}

Avis anonymisés :
{AVIS_A_E}

Relectures anonymisées :
{RELECTURES}

Rédige en {LANGUE} exactement ces sections :
- Accords
- Désaccords
- Angles morts
- Recommandation (tranchée)
- Première action concrète

La recommandation doit être une décision explicite et réalisable dans ce dépôt ; la première action doit nommer le premier fichier, test ou vérification à effectuer.
```

## 5. Livrables obligatoires

Créer le dossier `docs/` s’il n’existe pas. Utiliser un timestamp local au format `YYYY-MM-DD_HH-mm-ss` et sauvegarder :

- `docs/council-{timestamp}.html` : rapport HTML autonome avec CSS inline, lisible sans dépendance externe. Mettre le verdict / la recommandation en évidence en tête du document. Utiliser des sections repliables (`<details>`) pour les avis anonymisés et les relectures ; laisser la synthèse ouverte.
- `docs/council-{timestamp}-transcript.md` : transcript complet incluant la question d’origine, les fichiers consultés et faits observés, le prompt neutre, les réponses intégrales des cinq conseillers (avec leurs angles), l’ordre anonymisé A–E, les cinq relectures, puis la synthèse du président.

Le HTML doit être scannable : titre, timestamp, question, encadré de verdict, sections demandées du président, puis détails repliables. Ne pas omettre les incertitudes ou les éléments non vérifiés.
