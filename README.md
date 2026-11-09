# EDT MMI

Une application web pour consulter l'emploi du temps MMI sur téléphone et sur ordinateur. Elle lit les fichiers .ics publiés sur [frederic-mora/edt-ics](https://github.com/frederic-mora/edt-ics), qui sont mis à jour toutes les deux heures.

Le code est en HTML, CSS et JavaScript natif (modules ES, organisation MVC). Il n'y a ni dépendance ni étape de build.

## Ce que fait l'app

- Trois vues : jour, semaine et mois. Le choix est mémorisé.
- En vue jour, une bande en haut affiche les jours de la semaine avec le nombre de cours. Sur ordinateur, la frise horaire est accompagnée de la liste détaillée des cours.
- En vue mois, chaque case montre jusqu'à trois cours (des points de couleur sur mobile). Un clic sur un jour ouvre la vue jour.
- Deux thèmes, Ardoise (clair) et Ardoise nuit (sombre), plus un mode automatique qui suit le réglage de l'appareil.
- Carte « En cours / Prochain cours » en haut de l'écran.
- Une couleur par matière. Les cours annulés sont en rouge, hachurés et barrés, avec un badge « Annulé ».
- Fiche détaillée au clic : salle, enseignant, durée, groupes, intitulé de la SAÉ.
- Navigation avec les flèches, un glissement horizontal sur mobile, les touches ← et → et la touche T pour revenir à aujourd'hui.
- Le planning se met à jour à l'ouverture, au retour sur l'app après 10 minutes et toutes les 30 minutes quand l'app reste ouverte.
- L'app marche hors ligne avec la dernière copie téléchargée.
- Installable comme une app (PWA) sur Android, iPhone, Windows et macOS.

Le navigateur lit directement `raw.githubusercontent.com`, qui autorise les requêtes d'autres sites (CORS). Aucun serveur intermédiaire n'est nécessaire.

## Tester en local

```bash
cd edt-app
python3 -m http.server 8000
```

Ouvre ensuite http://localhost:8000. Le fichier ne marche pas en double-cliquant sur index.html, parce que les modules ES demandent un serveur.

## Mettre en ligne avec GitHub Pages

1. Crée un dépôt vide sur GitHub, par exemple `edt`.
2. Dans le dossier `edt-app` :

```bash
git init
git add .
git commit -m "EDT MMI : première version"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/edt.git
git push -u origin main
```

3. Sur GitHub, va dans Settings > Pages, choisis « Deploy from a branch », la branche `main` et le dossier `/ (root)`.
4. Au bout d'une minute environ, l'app est disponible à l'adresse `https://TON-PSEUDO.github.io/edt/`.

## Installer l'app

- Android (Chrome) : menu ⋮ puis « Ajouter à l'écran d'accueil » ou « Installer l'application ».
- iPhone (Safari) : bouton Partager puis « Sur l'écran d'accueil ».
- Windows et macOS (Chrome ou Edge) : icône d'installation à droite de la barre d'adresse.

## Mettre à jour le code

Après une modification, augmente la valeur de `VERSION` dans `sw.js` (par exemple `edt-v3`), puis :

```bash
git add .
git commit -m "Description de la modification"
git push
```

## Organisation du code

```
index.html                  structure de la page
css/style.css               styles, mode clair et sombre
js/main.js                  point d'entrée
js/models/ScheduleModel.js  état, navigation, jours visibles, prochain cours
js/views/ScheduleView.js    rendu du calendrier et de la fiche
js/controllers/ScheduleController.js
js/services/IcsService.js   téléchargement et cache du .ics
js/services/StorageService.js
js/utils/icsParser.js       lecture du format iCalendar et du titre des cours
js/utils/dates.js           calculs en heure de Paris
js/utils/layout.js          cours qui se chevauchent, couleurs des matières
sw.js                       cache hors ligne de l'interface
manifest.webmanifest        installation PWA
```

Pour ajouter ou retirer un groupe, modifie la liste `GROUPS` dans `ScheduleModel.js`. L'identifiant correspond au nom du fichier dans le dossier `ics` du dépôt source.
