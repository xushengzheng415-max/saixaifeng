#!/bin/sh
set -eu
PUBLIC_KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICtPlo03fjyy1GS1l5FofDr4x6lYjoSueGt/gklGMu5f dot-wechat-drafts-2026-10-07'
if getent passwd wechat-drafts >/dev/null; then
  echo 'Account already exists; administrator inspection required' >&2
  exit 1
fi
test -f /tmp/sxf-restricted-access-20261007.py
install -o root -g root -m 755 /tmp/sxf-restricted-access-20261007.py /usr/local/sbin/sxf-wechat-drafts
/usr/bin/python3 -c "compile(open('/usr/local/sbin/sxf-wechat-drafts').read(), '/usr/local/sbin/sxf-wechat-drafts', 'exec')"
useradd --create-home --shell /bin/sh wechat-drafts
passwd -l wechat-drafts >/dev/null
install -d -o root -g ubuntu -m 750 /var/lib/sxf-wechat-drafts
chown root:root /home/wechat-drafts
chmod 755 /home/wechat-drafts
install -d -o root -g root -m 755 /home/wechat-drafts/.ssh
printf 'restrict,command="/usr/bin/sudo -n /usr/local/sbin/sxf-wechat-drafts \\"$SSH_ORIGINAL_COMMAND\\"" %s\n' "$PUBLIC_KEY" > /home/wechat-drafts/.ssh/authorized_keys
chown root:root /home/wechat-drafts/.ssh/authorized_keys
chmod 644 /home/wechat-drafts/.ssh/authorized_keys
printf 'wechat-drafts ALL=(root) NOPASSWD: /usr/local/sbin/sxf-wechat-drafts *\n' > /etc/sudoers.d/sxf-wechat-drafts
chmod 440 /etc/sudoers.d/sxf-wechat-drafts
visudo -cf /etc/sudoers.d/sxf-wechat-drafts
echo ACCOUNT_INSTALLED
