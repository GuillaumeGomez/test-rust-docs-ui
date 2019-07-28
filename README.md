# test-rust-docs-ui

## How to add tests

You'll need to add two files for a test: a `.gom` and a `.rs` (which represents a file that'll be documented with rustdoc).

The `.gom` contains the instructions that the browser will execute. It's basically a "key: value" file. All commands are case insensitive. Here are the available commands:

#### click

**click** command clicks on an element. It expects a CSS selector (a class name or an id) or a position. Examples:

```
click: .element
click: #element
click: (10, 12)
```

#### waitfor

**waitfor** command waits a duration or an element to be created. It expects a CSS selector (a class name or an id) or a duration in milliseconds. Examples:

```
waitfor: .element
waitfor: #element
waitfor: 1000
```

#### focus

**focus** command focuses (who would have guessed?) on a given element. It expects a CSS selector (a class name or an id). Examples:

```
focus: .element
focus: #element
```

#### write

**write** command sends keyboard inputs on given element. If no element is provided, it'll write into the currently focused element. It expects a string and/or a CSS selector (a class name or an id). The string has to be surrounded by quotes (either `'` or `"`). Examples:

```
write: .element "text"
write: #element "text"
write: "text"
```

#### movecursorto

**movecursorto** command moves the mouse cursor to the given position or element. It expects a tuple of integers (`(x, y)`) or a CSS selector (a class name or an id). Examples:

```
movecursorto: #element
movecursorto: .element
movecursorto: (10, 12)
```

#### goto

**goto** command changes the current page to the given path/url. It expects a path (starting with `.` or `/`) or a URL. Examples:

```
goto: https://test.com
goto: http://test.com
goto: /test
goto: ../test
goto: file://some-location/index.html
```

/!\\ If you want to use `goto` with `file://`, please remember that you must pass a full path to the web browser (from the root). You can access this information direction with `{current-dir}`:

```
goto: file://{current-dir}/my-folder/index.html
```

If you don't want to rewrite your doc path everytime, you can run the test with the `doc-path` argument and then use it as follow:

```
goto: file://{doc-path}/file.html
```

You can of course use `{doc-path}` and `{current-dir}` at the same time:

```
goto: file://{current-dir}/{doc-path}/file.html
```

#### scrollto

**scrollto** command scrolls to the given position or element. It expects a tuple of integers (`(x, y)`) or a CSS selector (a class name or an id). Examples:

```
scrollto: #element
scrollto: .element
scrollto: (10, 12)
```

#### size

**size** command changes the window's size. It expects a type of integers (`(width, height)`). Example:

```
size: (700, 1000)
```

#### localstorage

**localstorage** command sets local storage's values. It expect a JSON object. Example:

```
localstorage: {"key": "value", "another key": "another value"}
```

## Installation process

If you want to run it directly, here are the installation instructions:

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
ExecStart=/usr/bin/node /home/ubuntu/test-rust-docs-ui/server-src/server.js /home/ubuntu/github-webhook-secret /home/ubuntu/github-highfive-personal-access-token /home/ubuntu/.cargo/bin/
WorkingDirectory=/home/ubuntu/test-rust-docs-ui/
Environment="PATH='/home/ubuntu/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin'"

[Install]
WantedBy=multi-user.target
```

Then let's continue:

```bash
> sudo apt install -y libssl-dev pkg-config nodejs npm gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
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

## Usage

If you want to run tests locally, you first need to build `test_docs` doc with rustdoc:

```bash
> cd test_docs && cargo doc
```

Then you can launch tests by running:

```bash
> node server-src/tester.js --test-folder ui-tests --generate-images --failure-folder failures/ --doc-path test-docs/target/doc/test_docs/
```

If you added new tests and you want to generate images for it:

```bash
> node server-src/tester.js --test-folder ui-tests --generate-images --failure-folder failures/ --doc-path test-docs/target/doc/test_docs/ --generate-images
```

If you want the list of the available commands, just run:

```bash
> node server-src/tester.js --help
```
