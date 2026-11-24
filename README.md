# ProjetSIN

Le serveur reçoit les données des appareils et affiche leurs dernières mesures dans un panneau HTML.

## Démarrage

Configurer MariaDB avec `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PSWD` et `DB_NAME`. `DATABASE_URL` doit pointer vers la même base pour Prisma.

```sh
npm install
npx prisma db push
npm run build
npm start
```

Ouvrir `http://localhost:3000` pour afficher le panneau. Le port est configurable via `PORT`. Les appareils doivent utiliser l'adresse IP ou le nom du serveur sur leur réseau, par exemple `http://192.168.1.10:3000`.

## Inscription au démarrage

Après la connexion réseau, le programme de l'appareil envoie un `POST /devices/register` avec `Content-Type: application/json` et un identifiant stable propre à l'appareil.

```json
{"name":"Capteur salle 1","identifier":"capteur-001","firmware":"TEMPERATURE"}
```

Les types acceptés sont `TEMPERATURE`, `CAMERA` et `RADAR`. Le champ `ipAddress` est facultatif.

- Au premier démarrage, le serveur renvoie `201` et le JSON contient `device.id` et `apiKey`. L'appareil doit enregistrer ces deux valeurs en mémoire persistante.
- Au redémarrage, l'appareil renvoie la même demande avec `Authorization: Bearer <apiKey>`. Le serveur renvoie `200` avec le même appareil et actualise le dernier contact.
- Un identifiant déjà inscrit sans présentation de la clé existante renvoie `409`. Une clé incorrecte renvoie `401`. Si l'appareil perd sa clé, sa réinscription nécessite une intervention de gestion.

## Envoi des données

Envoyer un `POST /sensor/:deviceid/send` avec `device.id` dans l'URL, `Content-Type: application/json` et `Authorization: Bearer <apiKey>`.

| Type | Corps JSON | Donnée |
| --- | --- | --- |
| `TEMPERATURE` | `{"value":23.5}` | Température en °C |
| `CAMERA` | `{"personCount":3}` | Nombre de personnes détectées par la caméra |
| `RADAR` | `{"distance":1.8}` | Distance en mètres |

Le serveur renvoie `201` à chaque mesure enregistrée et actualise le dernier contact. Le panneau se rafraîchit toutes les trois secondes et affiche un appareil hors ligne quand il ne donne plus de nouvelles pendant le délai configuré, 15 secondes par défaut.

## Gestion

`GET /devices` fournit la liste et les dernières données au panneau. `POST /devices` permet de créer un appareil manuellement et renvoie sa clé. `DELETE /devices/:id` le supprime. Le premier enregistrement et les routes de gestion sont accessibles sans authentification. L'inscription authentifiée et les mesures utilisent la clé de l'appareil.
