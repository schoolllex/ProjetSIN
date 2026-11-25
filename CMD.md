# Déployer ThermoVision en production sur Ubuntu

Pour une installation sur Ubuntu Server, avec une connexion Internet pendant l’installation. Depuis CMD sous Windows, connecte-toi au serveur avec `ssh utilisateur@adresse-du-serveur`, puis **colle le bloc entier dans le terminal Ubuntu connecté**. Tu peux utiliser ta session `root`, un compte ayant accès à `sudo` ou la console du serveur.

Le bloc installe la version publiée sur GitHub, crée la base MariaDB, applique les migrations et démarre ThermoVision automatiquement à chaque démarrage. Chart.js est servi depuis le serveur pour que l’interface fonctionne sur le réseau local sans Internet. Si UFW est actif, le bloc te demande le sous-réseau des appareils pour autoriser le port TCP 3000. Garde le serveur sur ton réseau local sans redirection de ce port sur le routeur.

```bash
(
  set -Eeuo pipefail
  trap 'echo "Déploiement interrompu à la ligne $LINENO." >&2' ERR

  app_dir=/opt/projetsin
  admin=()
  app_runner=()
  app_user="$(id -un)"
  if [[ "$(id -u)" == 0 ]]; then
    app_user=projetsin
    getent passwd "$app_user" >/dev/null ||
      useradd --system --user-group --home-dir "$app_dir" --no-create-home --shell /usr/sbin/nologin "$app_user"
    app_runner=(runuser -u "$app_user" --)
  else
    admin=(sudo)
    sudo -v
  fi

  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "Architecture non prise en charge." >&2; exit 1 ;;
  esac

  "${admin[@]}" apt-get update
  "${admin[@]}" apt-get install -y ca-certificates curl git libatomic1 xz-utils openssl mariadb-server ufw
  "${admin[@]}" systemctl enable --now mariadb

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf -- "$tmp_dir"' EXIT
  node_dist=https://nodejs.org/dist/latest-v24.x
  curl -fsSL "$node_dist/SHASUMS256.txt" -o "$tmp_dir/SHASUMS256.txt"
  checksum="$(awk -v arch="$arch" '$2 ~ ("^node-v24[.][0-9]+[.][0-9]+-linux-" arch "[.]tar[.]xz$") {print}' "$tmp_dir/SHASUMS256.txt")"
  archive="$(awk '{print $2}' <<< "$checksum")"
  [[ -n "$archive" ]]
  curl -fsSL "$node_dist/$archive" -o "$tmp_dir/$archive"
  (cd "$tmp_dir" && sha256sum -c <<< "$checksum")
  node_dir="/opt/${archive%.tar.xz}"
  "${admin[@]}" install -d "$node_dir"
  "${admin[@]}" tar -xJf "$tmp_dir/$archive" -C "$node_dir" --strip-components=1
  export PATH="$node_dir/bin:$PATH"

  if [[ ! -d "$app_dir" ]]; then
    "${admin[@]}" install -d -o "$app_user" -g "$(id -gn "$app_user")" "$app_dir"
  fi
  "${app_runner[@]}" test -w "$app_dir" || {
    echo "Le compte $app_user doit avoir accès en écriture à $app_dir." >&2
    exit 1
  }
  if [[ ! -f "$app_dir/package.json" ]]; then
    git clone --depth 1 https://github.com/schoolllex/ProjetSIN.git "$tmp_dir/source"
    git -C "$tmp_dir/source" archive HEAD | "${app_runner[@]}" tar -x -C "$app_dir" --exclude=.env
  fi
  cd "$app_dir"

  if [[ ! -e .env ]]; then
    db_password="$(openssl rand -hex 24)"
    "${app_runner[@]}" bash -c 'umask 077; cat > .env' <<ENV
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=projetsin
DB_USER=projetsin
DB_PSWD=${db_password}
DATABASE_URL=mysql://projetsin:${db_password}@127.0.0.1:3306/projetsin
ENV
  fi
  db_password="$(sed -n 's/^DB_PSWD=\([0-9a-f]\{48\}\)$/\1/p' .env)"
  if [[ ! "$db_password" =~ ^[0-9a-f]{48}$ ]]; then
    echo "Le fichier $app_dir/.env ne correspond pas à cette procédure d’installation." >&2
    exit 1
  fi
  "${admin[@]}" mariadb <<SQL
CREATE DATABASE IF NOT EXISTS projetsin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'projetsin'@'127.0.0.1' IDENTIFIED BY '${db_password}';
GRANT ALL PRIVILEGES ON projetsin.* TO 'projetsin'@'127.0.0.1';
SQL

  "${app_runner[@]}" env PATH="$PATH" npm ci --include=dev
  "${app_runner[@]}" env PATH="$PATH" npm run build
  "${app_runner[@]}" env PATH="$PATH" ./node_modules/.bin/prisma migrate deploy

  "${app_runner[@]}" mkdir -p public/vendor
  "${app_runner[@]}" curl -fsSL 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js' \
    -o public/vendor/chart.umd.min.js
  "${app_runner[@]}" sed -i 's|src="https://cdn.jsdelivr.net/npm/chart.js"|src="/vendor/chart.umd.min.js"|' public/index.html

  "${admin[@]}" tee /etc/systemd/system/projetsin.service >/dev/null <<UNIT
[Unit]
Description=ThermoVision
After=mariadb.service
Requires=mariadb.service

[Service]
User=$app_user
WorkingDirectory=$app_dir
Environment=NODE_ENV=production
ExecStart=$node_dir/bin/node $app_dir/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

  "${admin[@]}" systemctl daemon-reload
  "${admin[@]}" systemctl enable projetsin
  "${admin[@]}" systemctl restart projetsin

  base_url=http://127.0.0.1:3000
  for endpoint in / /devices /vendor/chart.umd.min.js; do
    if ! curl -fsS --retry 6 --retry-connrefused --max-time 5 "$base_url$endpoint" -o /dev/null; then
      "${admin[@]}" journalctl -u projetsin -n 30 --no-pager
      exit 1
    fi
  done

  ufw_status="$("${admin[@]}" env LC_ALL=C ufw status)"
  if [[ "$ufw_status" == 'Status: active'* ]]; then
    ip -4 route show scope link
    read -rp 'Sous-réseau IPv4 des appareils (exemple 192.168.1.0/24) : ' lan </dev/tty
    if [[ ! "$lan" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/([1-9]|[12][0-9]|3[0-2])$ ]]; then
      echo "Sous-réseau IPv4 invalide." >&2
      exit 1
    fi
    "${admin[@]}" ufw allow from "$lan" to any port 3000 proto tcp
  fi

  "${admin[@]}" systemctl is-active projetsin
  echo "Déploiement terminé. Ouvre l’adresse correspondant au réseau de tes appareils."
  ip -o -4 addr show scope global | awk '{split($4, addr, "/"); print "http://" addr[1] ":3000/"}'
)
```
