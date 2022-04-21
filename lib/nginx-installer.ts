import kleur from 'kleur';
import prompts from 'prompts';
import { $, cd } from '../utils/zx';
import { packageVersions } from './packageVersions';

type ErrorWithMessage = {
  message: string;
};

export async function nginxInstaller() {
  await $`clear`;
  let nginxVersionToInstall;
  const nginxPrompt = await prompts({
    type: 'select',
    name: 'option',
    message: 'Do you want to install Nginx stable or mainline?',
    choices: [
      {
        title: `1) Stable ${packageVersions.NGINX_STABLE_VER}`,
        value: packageVersions.NGINX_STABLE_VER,
      },
      {
        title: `2) Mainline ${packageVersions.NGINX_MAINLINE_VER}`,
        value: packageVersions.NGINX_MAINLINE_VER,
      },
    ],
  });

  nginxVersionToInstall = nginxPrompt.option;

  console.log(`Installing Nginx (${nginxVersionToInstall})`);

  // Modules to install
  const modSecurityModule = await prompts({
    type: 'toggle',
    name: 'install',
    message: 'Install ModSecurity Nginx Module?',
    initial: false,
    active: 'yes',
    inactive: 'no',
  });

  const brotliModule = await prompts({
    type: 'toggle',
    name: 'install',
    message: 'Install Brotli Nginx Module?',
    initial: false,
    active: 'yes',
    inactive: 'no',
  });

  const http3Module = await prompts({
    type: 'toggle',
    name: 'install',
    message: 'Install HTTP3',
    initial: false,
    active: 'yes',
    inactive: 'no',
  });

  const confirmInstall = await prompts({
    type: 'toggle',
    name: 'install',
    message: 'Please confirm to start the installation',
    initial: false,
    active: 'confirm',
    inactive: 'cancel',
  });

  // Exit the script if installation is not confirmed by the user.
  if (!confirmInstall.install) {
    console.log('Installation cancelled');
    return process.exit(1);
  }

  //  Cleanup
  //  The directory should be deleted at the end of the script, but in case it fails

  if ((await $`[[  -d /usr/local/src/nginx/ ]]`.exitCode) === 0) {
    await $`rm -r /usr/local/src/nginx/ >>/dev/null 2>&1`;
  }

  await $`mkdir -p /usr/local/src/nginx/modules`;

  // Dependencies

  await $`apt-get update`;
  await $`apt-get install -y build-essential ca-certificates wget curl libpcre3 libpcre3-dev autoconf unzip automake libtool tar git libssl-dev zlib1g-dev uuid-dev lsb-release libxml2-dev libxslt1-dev cmake`;

  // Modsecurity Installation
  if (modSecurityModule.install) {
    console.log('Starting ModSecurity Installation');
    await $`apt-get install -y apt-utils libcurl4-openssl-dev libgeoip-dev liblmdb-dev libpcre++-dev libyajl-dev pkgconf`;

    cd(`/usr/local/src/nginx/modules`);
    await $`pwd`;

    await $`git clone --depth 1 -b v3/master --single-branch https://github.com/SpiderLabs/ModSecurity`;

    cd(`ModSecurity`);
    await $`pwd`;

    await $`
      git submodule init
      git submodule update
      ./build.sh
      `.catch((err: ErrorWithMessage) => console.error(err.message));

    await $`
      ./configure ${['--with-maxmind=no']}
      `.catch((err: ErrorWithMessage) => console.error(err.message));

    await $`
      make -j "$(nproc)"
      make install
      mkdir -p /etc/nginx/modsec
      wget -P /etc/nginx/modsec/ https://raw.githubusercontent.com/SpiderLabs/ModSecurity/v3/master/modsecurity.conf-recommended
      mv /etc/nginx/modsec/modsecurity.conf-recommended /etc/nginx/modsec/modsecurity.conf
      `;

    await $`git clone --depth 1 --quiet https://github.com/SpiderLabs/ModSecurity-nginx.git /usr/local/src/nginx/modules/ModSecurity-nginx`;
  }

  // Brotli Installation
  if (brotliModule.install) {
    console.log('Starting Brotli Installation');
    await $`
    cd /usr/local/src/nginx/modules || exit 1
    git clone https://github.com/google/ngx_brotli
    cd ngx_brotli || exit 1
    git checkout v1.0.0rc
    git submodule update --init
      `;
  }

  // Headers More

  await $`
    cd /usr/local/src/nginx/modules || exit 1
    wget https://github.com/openresty/headers-more-nginx-module/archive/v${packageVersions.HEADERMOD_VER}.tar.gz
    tar xaf v${packageVersions.HEADERMOD_VER}.tar.gz
        `;

  // Cache Purge
  await $`
    cd /usr/local/src/nginx/modules || exit 1
    git clone --depth 1 https://github.com/FRiCKLE/ngx_cache_purge
    `;

  // OpenSSL
  await $`
    cd /usr/local/src/nginx/modules || exit 1
    wget https://www.openssl.org/source/openssl-${packageVersions.OPENSSL_VER}.tar.gz
    tar xaf openssl-${packageVersions.OPENSSL_VER}.tar.gz
    cd openssl-${packageVersions.OPENSSL_VER} || exit 1

    ./config
    `;

  // Download and extract of Nginx source code
  await $`
    cd /usr/local/src/nginx/ || exit 1
    wget -qO- http://nginx.org/download/nginx-${nginxVersionToInstall}.tar.gz | tar zxf -
    cd nginx-${nginxVersionToInstall} || exit 1
  `;

  //   # As the default nginx.conf does not work, we download a clean and working conf from my GitHub.
  // # We do it only if it does not already exist, so that it is not overriten if Nginx is being updated

  if ((await $`[[ ! -e /etc/nginx/nginx.conf ]]`.exitCode) === 0) {
    await $`
      mkdir -p /etc/nginx
      cd /etc/nginx || exit 1
      wget https://raw.githubusercontent.com/Angristan/nginx-autoinstall/master/conf/nginx.conf
      `;
  }

  cd(`/usr/local/src/nginx/nginx-${nginxVersionToInstall}`);

  let nginx_options_flags = [
    '--prefix=/etc/nginx',
    // Compiler Optimization
    `--with-cc-opt=-m64 -g -O3 -march=native -DTCP_FASTOPEN=23 -Wno-error=strict-aliasing -fuse-ld=gold -Wno-deprecated-declarations -Wno-ignored-qualifiers -gsplit-dwarf -flto -funsafe-math-optimizations -fstack-protector-strong --param=ssp-buffer-size=4 -Wformat -Werror=format-security -Wp,-D_FORTIFY_SOURCE=2 -fPIC -Wdate-time  -mtune=generic`,
    `--with-ld-opt=-Wl,-Bsymbolic-functions -Wl,-z,relro -Wl,-z,now -Wl,--as-needed -pie -fPIC`,
    // Nginx configs
    '--sbin-path=/usr/sbin/nginx',
    '--conf-path=/etc/nginx/nginx.conf',
    '--error-log-path=/var/log/nginx/error.log',
    '--http-log-path=/var/log/nginx/access.log',
    '--pid-path=/var/run/nginx.pid',
    '--lock-path=/var/run/nginx.lock',
    '--http-client-body-temp-path=/var/cache/nginx/client_temp',
    '--http-proxy-temp-path=/var/cache/nginx/proxy_temp',
    '--http-fastcgi-temp-path=/var/cache/nginx/fastcgi_temp',
    '--user=nginx',
    '--group=nginx',
    // Remove unused modules
    '--without-http_empty_gif_module',
    '--without-http_geo_module',
    '--without-http_split_clients_module',
    '--without-http_ssi_module',
    '--without-mail_imap_module',
    '--without-mail_pop3_module',
    '--without-mail_smtp_module',
  ];

  let nginx_modules_flags = [
    '--with-threads',
    '--with-file-aio',
    '--with-http_ssl_module',
    '--with-http_v2_module',
    '--with-http_mp4_module',
    '--with-http_auth_request_module',
    '--with-http_slice_module',
    '--with-http_stub_status_module',
    '--with-http_realip_module',
    '--with-http_sub_module',
    '--with-pcre-jit',
    '--with-ipv6',
    // Third party modules and patches
    '--with-http_v2_hpack_enc',
    `--add-module=/usr/local/src/nginx/modules/headers-more-nginx-module-${packageVersions.HEADERMOD_VER}`,
    `--with-openssl=/usr/local/src/nginx/modules/openssl-${packageVersions.OPENSSL_VER}`,
    `--add-module=/usr/local/src/nginx/modules/ngx_cache_purge`,
    ...(modSecurityModule.install
      ? ['--add-module=/usr/local/src/nginx/modules/ModSecurity-nginx']
      : []),
    ...(brotliModule.install
      ? ['--add-module=/usr/local/src/nginx/modules/ngx_brotli']
      : []),
  ];

  // Cloudflare's TLS Dynamic Record Resizing patch
  await $`
    sudo wget https://raw.githubusercontent.com/nginx-modules/ngx_http_tls_dyn_size/master/nginx__dynamic_tls_records_1.17.7%2B.patch -O tcp-tls.patch && sudo patch -p1 <tcp-tls.patch
    `;

  // # Working Patch from https://github.com/hakasenyang/openssl-patch/issues/2#issuecomment-413449809
  await $`sudo wget https://raw.githubusercontent.com/hakasenyang/openssl-patch/master/nginx_hpack_push_1.15.3.patch -O nginx_http2_hpack.patch && sudo patch -p1 <nginx_http2_hpack.patch
    `;

  // Compile and install nginx
  await $`./configure ${nginx_options_flags} ${nginx_modules_flags} && make -j "$(nproc)" && make install`;

  //  remove debugging symbols
  await $`strip -s /usr/sbin/nginx`;

  // Nginx installation from source does not add an init script for systemd and logrotate
  // Using the official systemd script and logrotate conf from nginx.org

  if ((await $`[[ ! -e /lib/systemd/system/nginx.service ]]`.exitCode) === 0) {
    await $`cd /lib/systemd/system/ || exit 1 && wget https://raw.githubusercontent.com/Angristan/nginx-autoinstall/master/conf/nginx.service`;

    await $`systemctl enable nginx`;
  }

  // Logrotate
  if ((await $`[[ ! -e /etc/logrotate.d/nginx ]]`.exitCode) === 0) {
    await $`cd /etc/logrotate.d/ || exit 1 && wget https://raw.githubusercontent.com/Angristan/nginx-autoinstall/master/conf/nginx-logrotate -O nginx`;
  }

  // Nginx's cache directory is not created by default
  if ((await $`[[ ! -d /var/cache/nginx ]]`.exitCode) === 0) {
    await $`mkdir -p /var/cache/nginx`;
  }

  // We add the sites-* folders as some use them.
  if ((await $`[[ ! -d /etc/nginx/sites-available ]]`.exitCode) === 0) {
    await $`mkdir -p /etc/nginx/sites-available`;
  }

  if ((await $`[[ ! -d /etc/nginx/sites-enabled ]]`.exitCode) === 0) {
    await $`mkdir -p /etc/nginx/sites-enabled`;
  }

  if ((await $`[[ ! -d /etc/nginx/conf.d ]]`.exitCode) === 0) {
    await $`mkdir -p /etc/nginx/conf.d`;
  }

  await $`nginx -t`;

  if ((await $`[[ -L "/sbin/init" ]]`.exitCode) === 0) {
    console.log(
      'Nginx cannot be started: System has not been booted with systemd as init system'
    );
  } else {
    await $`systemctl restart nginx`;
  }

  // Removing temporary Nginx and modules files

  await $`rm -rf /usr/local/src/nginx`;

  console.log(kleur.bgGreen().black('Nginx Installed Successfully'));
  process.exit(0);
  //
  //
  //
  //
  //
}
