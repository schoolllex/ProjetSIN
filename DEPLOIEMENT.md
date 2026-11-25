# Déployer ThermoVision sur Ubuntu Server

Toutes les commandes sont à lancer sur Ubuntu, dans Bash, avec un compte ayant accès à `sudo`. Internet est nécessaire pendant l’installation. Ensuite, le serveur et les appareils communiquent par le réseau local sur le port TCP 3000. MariaDB tourne sur le même serveur.

## 1. Installer les outils pendant que le serveur a Internet

```bash
sudo apt update
sudo apt install -y ca-certificates curl git libatomic1 xz-utils openssl mariadb-server ufw
sudo systemctl enable --now mariadb
```

Installe Node.js 24 pour l’architecture du serveur. La commande vérifie la somme SHA-256 avant d’extraire l’archive. [Téléchargements Node.js 24](https://nodejs.org/en/download/archive/v24) · [Prérequis Prisma](https://docs.prisma.io/docs/orm/reference/system-requirements)

```bash
(
  set -e
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Architecture à sélectionner sur le site de Node.js"; exit 1 ;;
  esac
  version=v24.22.3
  archive="node-${version}-linux-${arch}.tar.xz"
  cd "$(mktemp -d)"
  curl -fSLO "https://nodejs.org/dist/${version}/${archive}"
  curl -fSLO "https://nodejs.org/dist/${version}/SHASUMS256.txt"
  awk -v file="$archive" '$2 == file' SHASUMS256.txt | sha256sum -c -
  sudo tar -xJf "$archive" -C /usr/local --strip-components=1
)
node --version
npm --version
```

## 2. Copier le projet sur Ubuntu

```bash
sudo install -d -o "$(id -u)" -g "$(id -g)" /opt/projetsin
git clone https://github.com/schoolllex/ProjetSIN.git /opt/projetsin
cd /opt/projetsin
```

Si ta version contient des modifications encore présentes uniquement sur ton PC, crée le dossier avec la première commande puis copie le projet à la place de `git clone`. Si SSH est activé sur Ubuntu, lance cette commande dans PowerShell à la racine du projet et adapte le compte et l’adresse. Les étapes suivantes génèrent les dépendances, le build et le `.env` sur Ubuntu.

```powershell
scp -r src public prisma package.json package-lock.json tsconfig.json prisma.config.ts utilisateur@192.168.1.50:/opt/projetsin/
```

## 3. Créer la base et configurer le projet

Lance ce bloc une seule fois pour une installation neuve. Le mot de passe est généré automatiquement et enregistré dans le fichier `.env`, lisible uniquement par ton compte.

```bash
(
  set -e
  cd /opt/projetsin
  test ! -e .env || { echo "Le fichier .env existe déjà"; exit 1; }
  db_password="$(openssl rand -hex 24)"

  sudo mariadb <<SQL
CREATE DATABASE projetsin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'projetsin'@'127.0.0.1' IDENTIFIED BY '${db_password}';
GRANT ALL PRIVILEGES ON projetsin.* TO 'projetsin'@'127.0.0.1';
SQL

  umask 077
  cat > .env <<ENV
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=projetsin
DB_USER=projetsin
DB_PSWD=${db_password}
DATABASE_URL=mysql://projetsin:${db_password}@127.0.0.1:3306/projetsin
ENV
)
```

## 4. Compiler, migrer et préparer l’interface hors ligne

Le dépôt charge Chart.js depuis un CDN. Les commandes ci-dessous téléchargent la bibliothèque pendant l’installation et changent l’URL de la copie déployée pour la servir par Express. [Intégration Chart.js par balise script](https://www.chartjs.org/docs/latest/getting-started/integration) · [Déploiement des migrations Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/deploy-migrations-from-a-local-environment)

```bash
(
  set -e
  cd /opt/projetsin
  npm install --include=dev
  npm run build
  ./node_modules/.bin/prisma migrate deploy

  mkdir -p public/vendor
  curl -fsSL 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js' \
    -o public/vendor/chart.umd.min.js
  sed -i 's|src="https://cdn.jsdelivr.net/npm/chart.js"|src="/vendor/chart.umd.min.js"|' public/index.html
)
```

## 5. Démarrer le serveur automatiquement

Depuis le compte qui a créé le `.env`, enregistre le service systemd. Le serveur démarrera aussi après un redémarrage d’Ubuntu.

```bash
sudo tee /etc/systemd/system/projetsin.service >/dev/null <<UNIT
[Unit]
Description=ThermoVision
After=mariadb.service
Requires=mariadb.service

[Service]
User=$(id -un)
WorkingDirectory=/opt/projetsin
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node /opt/projetsin/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now projetsin
sudo systemctl status projetsin --no-pager
```

## 6. Accéder au projet depuis le réseau local

```bash
ip -br -4 addr
ip -4 route show scope link
```

Repère l’IPv4 de l’interface reliée au réseau des appareils et son sous-réseau. Remplace `192.168.1.0/24` par le sous-réseau affiché. Si tu administres Ubuntu en SSH, ajoute d’abord la règle SSH pour préserver ton accès. Adapte le port 22 si nécessaire. [Pare-feu Ubuntu](https://ubuntu.com/server/docs/how-to/security/firewalls/)

```bash
LAN='192.168.1.0/24'
# À exécuter si tu utilises SSH depuis ce réseau
# sudo ufw allow from "$LAN" to any port 22 proto tcp
sudo ufw allow from "$LAN" to any port 3000 proto tcp
sudo ufw enable
sudo ufw status verbose
```

Garde le serveur et les appareils connectés au même réseau local, par exemple à un routeur dont la liaison Internet est débranchée. Laisse le port 3000 sans redirection sur le routeur. Tu peux réserver l’adresse du serveur dans le DHCP du routeur pour garder la même URL.

Sur Ubuntu, teste la page, l’API qui interroge MariaDB et le fichier Chart.js local.

```bash
curl -fsS http://127.0.0.1:3000/ -o /dev/null
curl -fsS http://127.0.0.1:3000/devices
curl -fsSI http://127.0.0.1:3000/vendor/chart.umd.min.js
```

Depuis un autre appareil du réseau, ouvre `http://192.168.1.50:3000/` avec l’adresse IPv4 réelle du serveur. Coupe uniquement la liaison Internet du réseau, puis recharge la page depuis cet appareil et vérifie que le graphique s’affiche.

```bash
# Consulter les journaux si un test échoue
sudo journalctl -u projetsin -n 50 --no-pager

# Redémarrer l’application après une modification
sudo systemctl restart projetsin
```
