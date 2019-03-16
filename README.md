# test-rust-docs-ui

## Installation process

```bash
> git clone https://github.com/GuillaumeGomez/test-rust-docs-ui
> sudo vim /etc/systemd/system/test-rust-docs-ui.service
```

Copy into the file:

```
[Unit]
Description=test-rust-docs-ui service
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=10
User=ubuntu
ExecStart=/usr/bin/node /home/ubuntu/test-rust-docs-ui/server-src/server.js /home/ubuntu/github-webhook-secret
WorkingDirectory=/home/ubuntu/test-rust-docs-ui/
Environment="PATH='/home/ubuntu/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin'"

[Install]
WantedBy=multi-user.target
```

Then let's continue:

```bash
> sudo apt install -y libssl-dev pkg-config nodejs npm
> npm install puppeteer png-js axios cookies
> curl https://sh.rustup.rs -sSf | sh # a nightly version might be better in here
> source $HOME/.cargo/env
```

Now you can try to start the server:

```bash
< cd test-rust-docs-ui && node server-src/server.js
```

Now time to setup the HTTPS part:

```bash
> cd # so we go back to the home folder, just in case
> sudo apt install -y nginx
> sudo systemctl stop nginx
> git clone https://github.com/letsencrypt/letsencrypt.git
> cd letsencrypt
> ./letsencrypt-auto certonly --email guillaume1.gomez@gmail.com -d puppeteer.infra.rust-lang.org
```

Select nginx, agree, say no and then you're good.

Time to setup nginx now. Open `/etc/nginx/sites-available/puppeteer` and write into it:

```text
upstream puppeteer {
	server localhost:8080;
}

server {
	listen 80;

	server_name puppeteer.infra.rust-lang.org "";

	location / {
		include proxy_params;
		proxy_pass http://puppeteer;
	}
}

server {
	listen 443 ssl;

	server_name puppeteer.infra.rust-lang.org "";

	ssl_certificate /etc/letsencrypt/live/puppeteer.infra.rust-lang.org/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/puppeteer.infra.rust-lang.org/privkey.pem;

	location / {
		include proxy_params;
		proxy_pass http://puppeteer;
		proxy_redirect off;
#		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Host $server_name;
		proxy_set_header X-Forwarded-Proto $scheme;
		proxy_read_timeout 300s;
	}
}
```

Then:

```bash
> sudo ln -s /etc/nginx/sites-available/puppeteer /etc/nginx/sites-enabled/
> sudo nginx -t # to check if the nginx file is fine
> sudo systemctl stop nginx
> sudo netstat -lnp # kill all programs running on the 80 port!
> sudo systemctl restart nginx
```
