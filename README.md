# Web scrapping


## Important
Sur Raspberry Pi, pour faire fonctionner Puppeteer, lancez les commandes ci-dessous à la racine du projet:

```shell
$ which chromium

$ which chromium-browser
/usr/bin/chromium-browser <- ** Renseigner cette valeur dans la commande suivante **

$ export PUPPETEER_EXECUTABLE_PATH='/usr/bin/chromium-browser'

$ export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

```

## Pré-requis
Créer un fichier .env à la racine du projet

```.env
MONGODB_URI=mongodb+srv://*****-admin:******@cluster*.*****.mongodb.net/currencies

PORT=*****

SOURCE_URL=https://www.boursorama.com/bourse/devises/euro-convertisseurs-devises/

```

## Utilisation

```shell
$ yarn #pour installer les dépendances

$ yarn start #pour lancer le serveur
Server has started on port ***

```

### Mise à jour de la base de données
Méthode ```GET```
> /update

Lance le scrapping et la mise à jour de la BDD MongoDB

> Console

```shell
--> Initialisation de Puppeteer
..
--> Récupération des url
..
--> Début de la mise à jour des taux
..
1/158 (0.63%)
2/158 (1.27%)
3/158 (1.90%)
4/158 (2.53%)
[...]
158/158 (100%)
```
> Réponse serveur
```json
{
      message:
      "Update started. You can follow the progress by reloading page"
}
```

ou si une mise à jour est déjà en cours

```json

{
      message: "Already in progress",
      progress: "91/158 (57.59%)"
}
```

### Récupération des taux
Méthode ```GET```
> /rates

> Réponse serveur
```json
count: 154,
data: [
{
from: {
      currency: "EUR",
      description: "euro"
},
to: {
      currency: "AED",
      description: "dirham"
},
_id: "6125bf4d9481f64397af10c3",
link: "https://www.boursorama.com/bourse/devises/convertisseur-devises/euro-dirham",
rate: 10.54625,
updated: "2021-08-25T06:15:30.000Z",
created: "2021-08-25T03:55:57.000Z",
__v: 0
},

[...]
]
```