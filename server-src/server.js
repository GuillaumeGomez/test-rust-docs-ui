var http = require('http');
var util = require('util');
var spawnSync = require('child_process').spawnSync;
var config = require('./config.js');
var tester = require('./tester.js');
const execFileSync = require('child_process').execFileSync;
const utils = require('./utils.js');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
var Cookies = require('cookies');

var DOC_UI_RUNS = {};
var TESTS_RESULTS = [];
var RUNNING_TESTS = [];
var FAVICON_DATA = null;

var GITHUB_WEBHOOK_SECRET_PATH = null;
var GITHUB_CLIENT_ID = null;
var GITHUB_CLIENT_SECRET = null;

function make_link(url, text, blank) {
    if (blank === true) {
        return `<a href="${url}" target="_blank">${text}</a>`
    }
    return `<a href="${url}">${text}</a>`;
}

function make_link_from_url(url) {
    var x = url.split('/');
    x = x[x.length - 1];
    return make_link(url, x, true);
}

function get_cookies(req, res) {
    return new Cookies(req, res, { keys: config.COOKIE_KEYS });
}

function get_admin(response, cookies) {
    // check if you have rights to be there
    var is_authenticated = true;
    var has_access = is_authenticated && check_rights("test");

    if (has_access === true) {
        ;
    } else {
        response.statusCode = 404;
        response.write('<html><head><title>Page not found</title></head>');
        response.write(`<body>Page not found. ${make_link('/', 'Back to main page?')}</body></html>`);
    }
}

function get_status(response, cookies) {
    let lines = TESTS_RESULTS.map(x => {
        let s = `<div class="line${x['errors'] > 0 ? ' error' : ''}" onclick="showHideLogs(this)">`;
        s += `<div class="label">${make_link_from_url(x['url'])}</div>`;
        if (x['errors'] > 0) {
            s += `<span class="errors">${x['errors']}</span>`;
        }
        s += `<code class="logs" onclick="preventEv(event)">${x['text'].replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br>')}</code>`;
        s += '</div>';
        return s;
    }).join('');

    response.write(`<html>
<head>
    <title>rustdoc UI tests</title>${FAVICON_DATA === null ? "" : '<link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico">'}
    <script>
function showHideLogs(elem) {
    var e = elem.getElementsByClassName("logs")[0];
    if (e.style.display !== "block") {
        e.style.display = "block";
    } else {
        e.style.display = "none";
    }
}

function preventEv(ev) {
    ev.preventDefault();
    ev.stopPropagation();
}
    </script>
    <style type="text/css">
body {
    margin: 0;
    padding: 0;
}
header {
    background: #3c3c3c;
    width: 100%;
    height: 40px;
}
header > div {
    padding-top: 3px;
    text-align: center;
    font-size: 1.8rem;
    color: white;
}
header > div, .running, .results, .results > .line {
    display: block;
    width: 100%;
}
.content {
    padding: 5px;
}
.title {
    margin-top: 10px;
    margin-bottom: 3px;
    font-size: 1.4em;
    text-align: center;
    font-weight: bold;
}
.results {
    border: 1px solid #ccc;
    border-bottom: 0;
    border-radius: 2px;
}
.results > .line {
    border-bottom: 1px solid #ccc;
    position: relative;
    cursor: pointer;
    width: auto;
}
.line > .label:hover {
    background-color: #83c3fb;
}
.line > .label {
    padding: 4px;
}
.line > .label > a {
    text-decoration: none;
}
.line > .errors  {
    width: 15px;
    position: absolute;
    right: 2px;
    top: 2;
    border: 1px solid red;
    border-radius: 10px;
    color: red;
    background-color: #fff;
    text-align: center;
    padding: 1px;
}
.line > .logs {
    display: none;
    background-color: #eaeaea;
    padding: 5px;
}
    </style>
</head>
<body>
    <header><div>rustdoc UI tests</div></header>
    <div class="content">
        <div class="running">There is currently ${RUNNING_TESTS.length} ${RUNNING_TESTS.length > 1 ? 'tests running: (' + RUNNING_TESTS.map(make_link_from_url).join(', ') + ').' : 'test running.'}</div>
        <div class="title">List of last tests results</div>
        <div class="results">${lines}</div>
    </div>
</body>
</html>`);
    response.end();
}

function add_test_results(output, issue_url, errors) {
    if (TESTS_RESULTS.length >= config.MAX_TEST_RESULTS) {
        TESTS_RESULTS.shift();
    }
    TESTS_RESULTS.push({'url': issue_url, 'text': output, 'errors': errors});
    try {
        utils.writeToFile(config.TESTS_RESULTS_FILE, JSON.stringify(TESTS_RESULTS));
    } catch(err) {
        console.error(`Couldn't save to "${config.TESTS_RESULTS_FILE}": ` + err);
    }
}

function github_authentication(response, request, server) {
}

function restart(response, request, server) {
    const text = 'shutting down server...';
    response.end(text);
    console.log(text);
    server.close();
    utils.updateRepository();
    process.exit(0);
}

function unknown_url(response, request) {
    response.statusCode = 404;
    response.end('Unknown URL: ' + request.url);
}

function get_favicon(response, request) {
    if (FAVICON_DATA === null) {
        // we couldn't load the favicon so we just send back 404...
        return unknown_url(response, request);
    }
    response.statusCode = 200
    response.setHeader('Content-Type', 'image/png');
    response.write(FAVICON_DATA);
    response.end();
}

function check_rights(login) {
    const teams = async () => {
        try {
            return await axios.get(config.TEAMS_URL);
        } catch (error) {
            console.error(error);
            return null;
        }
    };
    if (teams !== null && teams.constructor == Object && Object.keys(teams).length > 0) {
        const teams_to_check = ['infra', 'rustdoc'];
        for (let i = 0; i < teams_to_check.length; ++i) {
            let team = teams_to_check[i];
            if (teams[team] === undefined ||
                    teams[team]['members'] === undefined ||
                    Array.isArray(teams[team]['members']) !== true) {
                continue;
            }
            for (let x = 0; x < teams[team]['members'].length; ++x) {
                let name = teams[team]['members'][x]['github'];
                if (name === login) {
                    return true;
                }
            }
        }
    }

    // Backup part in case we couldn't get the teams list.
    let login = login.toLowerCase();
    for (let i = 0; i < config.PEOPLE.length; ++i) {
        if (login === config.PEOPLE[i].toLowerCase()) {
            return true;
        }
    }
    return false;
}

function installRustdoc(id) {
    const crate_name = "rustup-toolchain-install-master";
    const exec_path = `${utils.getCurrentDir()}${crate_name}/target/release/${crate_name}`;

    try {
        execFileSync(exec_path, [id]);
    } catch(err) {
        return "Cannot install rustdoc from '" + id + "'";
    }
    return true;
}

function uninstallRustdoc(id) {
    try {
        execFileSync("rustup", ["uninstall", id]);
    } catch(err) {
        return "Cannot uninstall rustdoc from '" + id + "'";
    }
}

function parseData(response, request, server, func) {
    let body = [];

    request.on('error', (err) => {
        console.error(err);
    }).on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        if (typeof func === 'undefined') {
            let contentType = request.headers['content-type'];

            if (contentType === "application/json") {
                return github_event(response, request, server, body);
            } else {
                return get_status(response, get_cookies(request, response));
            }
        } else {
            return func(response, request, server, body);
        }
    });
}

function check_signature(req, body) {
    if (GITHUB_WEBHOOK_SECRET_PATH === null) {
        console.warn('No signature check, this is unsafe!');
        return true;
    }
    let github_webhook_secret = utils.readFile(GITHUB_WEBHOOK_SECRET_PATH).replace('\n', '');
    let hmac = crypto.createHmac('sha1', github_webhook_secret);
    hmac.update(JSON.stringify(body));
    let calculatedSignature = 'sha1=' + hmac.digest('hex');

    return req.headers['x-hub-signature'] === calculatedSignature;
}

// https://developer.github.com/v3/activity/events/types/#issuecommentevent
function github_event(response, request, server, body) {
    if (typeof body === 'undefined') {
        // It means this function was called directly by the server, needs to get the data!
        return parseData(response, request, server, github_event);
    }
    try {
        let content = JSON.parse(Buffer.concat(body).toString());

        if (check_signature(request, content) !== true) {
            response.statusCode = 403;
            response.end("github-webhook-secret didn't match");
            return;
        }

        if (content['action'] === 'deleted') {
            response.end();
            return;
        }

        response.setHeader('Content-Type', 'application/json');

        // If we received the message that the rustdoc binary is ready, we can start tests!
        if (DOC_UI_RUNS[content['issue']['url']] === false) {
            let id = null;
            const lines = content['comment']['body'].split('\n');

            for (let x = 0; x < lines.length; ++x) {
                if (lines[x].indexOf(" Try build successful - ") !== -1 &&
                        x + 1 < lines.length &&
                        lines[x + 1].startsWith("Build commit: ")) {
                    id = lines[x + 1].split(' '); // Less chances to update this in case the
                                                  // message is updated.
                    id = id[id.length - 1];
                    break;
                }
            }
            if (id !== null) {
                let ret = installRustdoc(id);
                if (ret !== true) {
                    response.statusCode = 200;
                    response.end("An error occurred:\n```text\n" + ret + "\n````");
                    return;
                }
                ;
                tester.runTests(["", "", "rustdoc", id]).then(x => {
                    let [output, errors] = x;
                    response.statusCode = 200;
                    if (errors > 0) {
                        let failure = "failure";
                        if (errors > 1) {
                            failure = "failures";
                        }
                        response.end("Rustdoc-UI tests failed (" + errors + " " + failure +
                                     ")...\n```text\n" + output + "\n```");
                    } else {
                        response.end("Rustdoc-UI tests passed!\n```text\n" + output + "\n```");
                    }
                    add_test_results(output, content['issue']['url'], errors);

                    // cleanup part
                    DOC_UI_RUNS[content['issue']['url']] = undefined;
                    uninstallRustdoc(id);
                }).catch(err => {
                    response.statusCode = 200;
                    response.end("A test error occurred:\n```text\n" + err + "\n```");

                    // cleanup part
                    DOC_UI_RUNS[content['issue']['url']] = undefined;
                    uninstallRustdoc(id);
                });
                return;
            }
        }

        let msg = content['comment']['body'].split("\n");
        let run_doc_ui = false;
        let need_restart = false;
        let need_update = false;
        for (let i = 0; i < msg.length; ++i) {
            let line = msg[i];
            if (line.trim().startsWith("@" + config.BOT_NAME) === false) {
                continue;
            }
            let parts = line.split(" ").filter(w => w.length > 0);
            for (var x = 1; x < parts.length; ++x) {
                let cmd = parts[x].toLowerCase();
                if (cmd === "run-doc-ui") {
                    run_doc_ui = true;
                } else if (cmd === "restart") {
                    need_restart = true;
                } else if (cmd === "update") {
                    need_update = true;
                } else {
                    // we ignore the rest.
                }
            }
        }
        if ((need_restart === true || run_doc_ui === true || need_update === true) &&
                check_rights(content['comment']['user']['login']) === false) {
            console.log('github_event: missing rights for ' + content['comment']['user']['login']);
            return;
        }
        if (need_update === true) {
            utils.updateRepository();
        }
        if (need_restart === true) {
            restart(response, request, server);
        }
        if (run_doc_ui === true) {
            // We wait for the rustdoc build to end before trying to get it.
            DOC_UI_RUNS[content['issue']['url']] = false;
        }

        response.statusCode = 200;
        response.end();
    } catch (e) {
        console.error('github_event: ', e);
        response.end("Invalid github data");
    }
}

function readySubmodule(submodule_path) {
    console.log("=> Getting components ready...");
    try {
        execFileSync("git", ["submodule", "update", "--init"]);
    } catch(err) {
        console.error("'git submodule update --init' failed: " + err);
    }
    try {
        var x = '/' + __dirname.split('/').filter(x => x.length > 0).slice(0, 2).join('/');
        x += '/.cargo/bin/cargo';
        execFileSync(x, ["build", "--release"], { cwd: submodule_path });
    } catch(err) {
        console.error("'cargo build --release' failed: " + err);
    }
    console.log("<= Done!");
}

function load_github_appli_credentials() {
    console.log('=> Getting github app credentials...');
    let content;
    try {
        content = utils.readFile(config.GITHUB_APP_CREDENTIALS_FILE);
    } catch(err) {
        console.warn(`Couldn't read "${config.GITHUB_APP_CREDENTIALS_FILE}": ${err}`);
        return false;
    }
    try {
        content = JSON.parse(content);
    } catch(err) {
        console.warn(`Invalid JSON format in "${config.GITHUB_APP_CREDENTIALS_FILE}": ${err}`);
        return false;
    }
    if (content['GITHUB_CLIENT_ID'] !== undefined) {
        GITHUB_CLIENT_ID = content['GITHUB_CLIENT_ID'];
    }
    if (content['GITHUB_CLIENT_SECRET'] !== undefined) {
        GITHUB_CLIENT_SECRET = content['GITHUB_CLIENT_SECRET'];
    }
    if (GITHUB_CLIENT_SECRET === null || GITHUB_CLIENT_ID === null) {
        console.warn(`"${config.GITHUB_APP_CREDENTIALS_FILE}" needs "GITHUB_CLIENT_ID" and "GITHUB_CLIENT_SECRET" keys`);
        return false;
    }
    return true;
}

function load_favicon_data() {
    console.log('=> Loading favicon file...');
    let content;
    try {
        content = utils.readFile(config.FAVICON_FILE, null);
    } catch(err) {
        console.warn(`Couldn't read "${config.FAVICON_FILE}": ${err}`);
        console.log("<= no favicon loaded...");
    }
    FAVICON_DATA = content;
    console.log("<= favicon loaded!");
}

function start_server(argv) {
    if (argv.length < 3) {
        console.error('node server.rs [github secret webhook path|--ignore-webhook-secret]!');
        process.exit(1);
    }
    if (argv[2] === '--ignore-webhook-secret') {
        console.warn('=> Disabling github webhook signature check. This is unsafe!');
    } else {
        GITHUB_WEBHOOK_SECRET_PATH = argv[2];

        if (fs.existsSync(GITHUB_WEBHOOK_SECRET_PATH) === false) {
            console.error('Invalid path received: "' + GITHUB_WEBHOOK_SECRET_PATH + '"');
            process.exit(2);
        }
        console.log('=> Found github-webhook-secret file');
    }

    readySubmodule(utils.getCurrentDir() + "rustup-toolchain-install-master");

    try {
        TESTS_RESULTS = JSON.parse(utils.readFile(config.TESTS_RESULTS_FILE));
        if (Array.isArray(TESTS_RESULTS) !== true) {
            console.error(`"${config.TESTS_RESULTS_FILE}" file doesn't have the expected format...`);
            TESTS_RESULTS = [];
        }
    } catch(err) {
        console.warn(`Couldn't parse/read "${config.TESTS_RESULTS_FILE}", ignoring it...`);
    }

    if (load_github_appli_credentials() !== true) {
        console.log('<= github authentication is deactivated...');
    } else {
        console.log('<= github authentication is activated!')
    }
    load_favicon_data();

    //
    // SERVER PART
    //
    const URLS = {
        '/status': get_status,
        '/github': github_event,
        '/authenticate': github_authentication,
        '/favicon.ico': get_favicon,
        '/': parseData,
        '': parseData,
    };

    var server = http.createServer((request, response) => {
        request.url = new URL('http://a.a' + request.url);
        if (URLS.hasOwnProperty(request.url.pathname)) {
            URLS[request.url.pathname](response, request, server);
        } else {
            unknown_url(response, request);
        }
    });
    server.listen(config.PORT);
    console.log("server started on 0.0.0.0:" + config.PORT);
}

if (require.main === module) {
    start_server(process.argv);
}
