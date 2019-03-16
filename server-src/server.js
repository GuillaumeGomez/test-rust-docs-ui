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
const mstatus = require('./status.js');
const m_url = require('url');

var DOC_UI_RUNS = {};
var TESTS_RESULTS = [];
var RUNNING_TESTS = [];
var FAVICON_DATA = null;

var GITHUB_WEBHOOK_SECRET_PATH = null;
var GITHUB_CLIENT_ID = null;
var GITHUB_CLIENT_SECRET = null;
var COOKIE_KEYS = null;

function make_link(url, text, blank, _class) {
    if (typeof _class !== "undefined") {
        _class = ` class="${_class}"`;
    }
    if (blank === true) {
        return `<a href="${url}" target="_blank"${_class}>${text}</a>`
    }
    return `<a href="${url}"${_class}>${text}</a>`;
}

function make_link_from_url(url) {
    var x = url.split('/');
    x = x[x.length - 1];
    return make_link(url, x, true);
}

async function check_restart(response, request) {
    let cookies = utils.get_cookies(request, response, COOKIE_KEYS);
    let has_access = await check_rights(cookies.get('Login')).catch(() => {});

    if (has_access !== true) {
        response.end('Not enough rights to perform this action!');
        return;
    }
    setTimeout(function() {
        process.exit(0);
    }, 3000);
    response.end('Server will restart in 3 seconds');
}

async function check_update(response, request) {
    let cookies = utils.get_cookies(request, response, COOKIE_KEYS);
    let has_access = await check_rights(cookies.get('Login')).catch(() => {});

    if (has_access !== true) {
        response.end('Not enough rights to perform this action!');
        return;
    }
    response.end(utils.updateRepository());
}

async function get_admin(response, request) {
    let cookies = utils.get_cookies(request, response, COOKIE_KEYS);
    let has_access = await check_rights(cookies.get('Login')).catch(() => {});

    if (has_access === true) {
        response.write(`<html>
<head>
    <title>rustdoc UI tests - admin</title>${FAVICON_DATA === null ? "" : '<link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico">'}
    <script>${mstatus.get_admin_js()}</script>
    <style type="text/css">${mstatus.get_status_css()}</style>
</head>
<body>
    <header>
        <div>rustdoc UI tests - Admin</div>
    </header>
    <div class="content">
        <div class="title">Welcome to admin-land!</div>
        <div id="info"></div>
        <div class="button" onclick="ask_update(this)">Update server</div>
        <div class="button" onclick="ask_restart(this)">Restart server</div>
    </div>
</body>
</html>`);
    } else {
        response.statusCode = 404;
        response.write('<html><head><title>Page not found</title></head>');
        response.write(`<body>Page not found. ${make_link('/', 'Back to main page?')}</body></html>`);
    }
    response.end();
}

async function get_status(response, request, server) {
    let cookies = utils.get_cookies(request, response, COOKIE_KEYS);

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

    let error = "";
    if (typeof cookies.get('Error') !== "undefined" && cookies.get('Error').length > 0) {
        error = `<div class="error">${cookies.get('Error')}</div>`;
        cookies.set('Error', undefined);
    }

    let is_authenticated = typeof cookies.get('Login') !== "undefined" && typeof cookies.get('Token') !== undefined;
    let github_part = '';
    if (is_authenticated) {
        let r = await check_rights(cookies.get('Login')).catch(() => {});
        if (r === true) {
            github_part = make_link('/admin', 'Admin part', null, 'log-in button');
        } else {
            github_part = `<div class="log-in button">Welcome ${cookies.get('Login')}!</div>`;
        }
    } else if (GITHUB_CLIENT_ID !== null) {
        github_part = make_link(`${config.GH_URL}/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}`,
                                'Authenticate yourself', null, 'log-in button');
    }

    response.write(`<html>
<head>
    <title>rustdoc UI tests</title>${FAVICON_DATA === null ? "" : '<link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico">'}
    <script>${mstatus.get_status_js()}</script>
    <style type="text/css">${mstatus.get_status_css()}</style>
</head>
<body>
    <header>
        <div>rustdoc UI tests</div>${github_part}
    </header>
    <div class="content">${error}
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
        utils.writeObjectToFile(config.TESTS_RESULTS_FILE, TESTS_RESULTS);
    } catch(err) {
        console.error(`Couldn't save to "${config.TESTS_RESULTS_FILE}": ` + err);
    }
}

function redirection_error(response, cookies, error) {
    cookies.set('Error', error);
    response.writeHead(302, {'Location': '/'});
    response.end();
}

async function github_authentication(response, request, server) {
    let cookies = utils.get_cookies(request, response, COOKIE_KEYS);
    let code = request.url.searchParams.get('code');

    if (code === null || code.length < 1) {
        console.error('Failed authentication attempt...');
        return redirection_error(response, cookies, 'No token provided by github...');
    }
    let data;
    try {
        let res = await axios.post(`${config.GH_URL}/login/oauth/access_token`,
                                   {'client_id': GITHUB_CLIENT_ID,
                                    'client_secret': GITHUB_CLIENT_SECRET,
                                    'code': code},
                                   {headers: {
                                     'Content-type': 'application/json',
                                     'Accept': 'application/json'}
                                   }).catch(() => {});
        await res.data;
        data = res.data;
    } catch (err) {
        let error = `Failed to get access token: ${err}`;
        console.error(error);
        return redirection_error(response, cookies, error);
    }
    if (data['error_description'] !== undefined) {
        console.error('Failed authentication validation attempt...');
        return redirection_error(response, cookies, `Error from github: ${data['error_description']}`);
    }
    if (data['access_token'] === undefined) {
        console.error('Failed authentication validation attempt (missing "access_token" field?)...');
        return redirection_error(response, cookies, 'Error from github: missing "access_token" field...');
    }
    let access_token = data['access_token'];
    let login = await utils.get_username(access_token).catch(() => {});
    if (login === null || typeof login !== "string") {
        console.error('Cannot get username...');
        return redirection_error(response, cookies, 'Error from github: missing "access_token" field...');
    }

    cookies.set('Login', login);
    cookies.set('Token', access_token);
    response.writeHead(302, {'Location': '/'});
    response.end();
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

async function check_rights(login) {
    if (typeof login === "undefined" || login === null || login.length < 1) {
        return false;
    }
    const teams = await axios.get(config.TEAMS_URL).catch(() => {});
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
    login = login.toLowerCase();
    for (let i = 0; i < config.PEOPLE.length; ++i) {
        if (login === config.PEOPLE[i].toLowerCase()) {
            return true;
        }
    }
    return false;
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
                return get_status(response, request, server);
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
async function github_event(response, request, server, body) {
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
                let ret = utils.installRustdoc(id);
                if (ret !== true) {
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
                    utils.uninstallRustdoc(id);
                }).catch(err => {
                    response.end("A test error occurred:\n```text\n" + err + "\n```");

                    // cleanup part
                    DOC_UI_RUNS[content['issue']['url']] = undefined;
                    utils.uninstallRustdoc(id);
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
        if (need_restart === true || run_doc_ui === true || need_update === true) {
            let r = await check_rights(content['comment']['user']['login']).catch(() => {});
            if (r !== true) {
                console.log('github_event: missing rights for ' + content['comment']['user']['login']);
                response.end();
                return;
            }
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

function load_cookie_keys() {
    console.log('=> Loading cookie keys...');
    let content;
    try {
        content = utils.readFile(config.COOKIE_KEYS_FILE, null);
    } catch(err) {
        console.error(`Couldn't read "${config.COOKIE_KEYS_FILE}": ${err}`);
        process.exit(1);
    }
    try {
        content = JSON.parse(content);
    } catch(err) {
        console.error(`"${config.COOKIE_KEYS_FILE}" file isn't valid JSON: ${err}`);
        process.exit(1);
    }
    if (content['COOKIE_KEYS'] === undefined) {
        console.error(`Missing "COOKIE_KEYS" in "${config.COOKIE_KEYS_FILE}"...`);
        process.exit(1);
    }
    if (Array.isArray(content['COOKIE_KEYS']) === false) {
        console.error(`"COOKIE_KEYS" value must be an array of string!`);
        process.exit(1);
    }
    for (let i = 0; i < content['COOKIE_KEYS'].length; ++i) {
        if (typeof content['COOKIE_KEYS'][i] !== "string") {
            console.error(`"COOKIE_KEYS" value must be an array of string! Error at indice ${i}.`);
            process.exit(1);
        }
    }
    COOKIE_KEYS = content['COOKIE_KEYS'];
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

    load_cookie_keys();

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
        '/admin': get_admin,
        '/restart': check_restart,
        '/update': check_update,
        '/favicon.ico': get_favicon,
        '/': parseData,
        '': parseData,
    };

    var server = http.createServer((request, response) => {
        request.url = new m_url.URL('http://a.a' + request.url);
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
