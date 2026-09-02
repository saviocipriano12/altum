#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

hostnamectl set-hostname evolution-altum

if ! id altumops >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash altumops
fi
usermod --append --groups sudo,docker altumops 2>/dev/null || usermod --append --groups sudo altumops
install -d -m 700 -o altumops -g altumops /home/altumops/.ssh
install -m 600 -o altumops -g altumops /root/.ssh/authorized_keys /home/altumops/.ssh/authorized_keys
printf 'altumops ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/90-altumops
chmod 440 /etc/sudoers.d/90-altumops
visudo -cf /etc/sudoers.d/90-altumops

apt-get update
apt-get -y upgrade
apt-get install -y \
  ca-certificates \
  curl \
  docker.io \
  docker-compose-v2 \
  fail2ban \
  jq \
  unattended-upgrades \
  ufw

systemctl enable --now docker
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades
usermod --append --groups docker altumops

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [ ! -e /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

install -d -m 755 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/90-altum-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
EOF
sshd -t
systemctl reload ssh

mkdir -p /opt/altum-evolution /var/backups/altum-evolution
chown -R altumops:altumops /opt/altum-evolution /var/backups/altum-evolution

echo BOOTSTRAP_OK
