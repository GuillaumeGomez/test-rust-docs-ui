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
ExecStart=/usr/bin/node /home/ubuntu/test-rust-docs-ui/server-src/server.js
WorkingDirectory=/home/ubuntu/test-rust-docs-ui/

[Install]
WantedBy=multi-user.target
```

Then let's continue:

```bash
> sudo apt install -y libssl-dev pkg-config nodejs npm
> npm install puppeteer png-js
> curl https://sh.rustup.rs -sSf | sh # a nightly version might be better in here
> source $HOME/.cargo/env
```

Now you can try to start the server:

```bash
< cd test-rust-docs-ui && node server-src/server.js
```
