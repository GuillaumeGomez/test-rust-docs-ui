var http = require('http');
var util = require('util');
var spawnSync = require('child_process').spawnSync;
var config = require('./config.js');
var tester = require('browser-ui-test');
const execFileSync = require('child_process').execFileSync;
const execFile = require('child_process').execFile;
const utils = require('./utils.js');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
const mstatus = require('./status.js');
const m_url = require('url');
const add_log = utils.add_log;
const add_warning = utils.add_warning;
const add_error = utils.add_error;
const path = require('path');

var DOC_UI_RUNS = {};
var TESTS_RESULTS = [];
var RUNNING_TESTS = [];
var FAVICON_DATA = null;
var GITHUB_BOT_TOKEN = null;
var GITHUB_WEBHOOK_SECRET_PATH = null;
var GITHUB_CLIENT_ID = null;
var GITHUB_CLIENT_SECRET = null;
var COOKIE_KEYS = null;
var CARGO_BIN_PATH = null;
global.LOGS = [];
global.REPOSITORY_URL = "https://github.com/GuillaumeGomez/test-rust-docs-ui";

function make_link(url, text, blank, _class) {
    if (typeof _class !== "undefined") {
        _class = ` class="${_class}"`;
    } else {
        _class = '';
    }
    if (blank === true) {
        return `<a href="${url}" target="_blank"${_class}>${text}</a>`
    }
    return `<a href="${url}"${_class}>${text}</a>`;
}

function make_link_from_url(url) {
    if (typeof url !== "string") {
        return "";
    }
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

async function run_test(response, request) {
    let cookies = utils.get_cookies(request, response, COOKIE_KEYS);
    let has_access = await check_rights(cookies.get('Login')).catch(() => {});

    if (has_access !== true) {
        response.end('Not enough rights to perform this action!');
        return;
    }
    buildDoc('', 'rustdoc', innerRunTests);
    response.end('Running tests... (come back a bit later to see the results)');
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
        let logs = [];
        for (let i = LOGS.length - 1; i >= 0; --i) {
            let log = LOGS[i];
            let level = '';
            if (log['level'] === config.LOG_ERROR) {
                level = ' error';
            } else if (log['level'] === config.LOG_WARNING) {
                level = ' warning';
            }
            let s_date = utils.format_date(log['time']);
            if (s_date.length > 0) {
                s_date += ': ';
            }
            logs.push(`<code class="logs${level}">${s_date}${utils.text_to_html(log['text'])}</code>`);
        }

        response.write(`<html>
<head>
    <title>rustdoc UI tests - admin</title>${FAVICON_DATA === null ? "" : '<link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico">'}
    <style type="text/css">${mstatus.get_status_css()}</style>
    <style type="text/css">${mstatus.get_admin_css()}</style>
</head>
<body>
    <header>
        ${make_link(REPOSITORY_URL, '<img src="/assets/github.png">', true, 'repository')}
        <div>rustdoc UI tests - Admin</div>
        ${make_link('/', 'Home', null, 'log-in button')}
    </header>
    <div class="content">
        <div class="title">Welcome to admin-land!</div>
        <div id="info"></div>
        <div class="button" onclick="ask_run_tests(this)">Run tests</div>
        <div class="button" onclick="ask_update(this)">Update server</div>
        <div class="button" onclick="ask_restart(this)">Restart server</div>
        <div class="title">List of logs</div>
        <div class="results">${logs.join('')}</div>
    </div>
    <script>${mstatus.get_admin_js()}</script>
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
        let s_date = utils.format_date(x['time']);
        let s = `<div class="line${x['errors'] > 0 ? ' error' : ''}" onclick="showHideLogs(this)">`;
        s += `<div class="label">${make_link_from_url(x['url'])}${s_date}</div>`;
        if (x['errors'] > 0) {
            s += `<span class="errors">${x['errors']}</span>`;
        }
        s += `<code class="logs" onclick="preventEv(event)">${utils.text_to_html(x['text'])}</code>`;
        s += '</div>';
        return s;
    });

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
        ${make_link(REPOSITORY_URL, '<img src="/assets/github.png">', true, 'repository')}
        ${make_link('/failures', 'Failures', null, 'failures button')}
        <div>rustdoc UI tests</div>${github_part}
    </header>
    <div class="content">${error}
        <div class="running">There is currently ${RUNNING_TESTS.length} ${RUNNING_TESTS.length > 1 ? 'tests running: (' + RUNNING_TESTS.map(make_link_from_url).join(', ') + ').' : 'test running.'}</div>
        <div class="title">List of last tests results</div>
        <div class="results">${lines.reverse().join('')}</div>
    </div>
</body>
</html>`);
    response.end();
}

function get_failures(response, request, server) {
    var content = "";

    fs.readdirSync(config.FAILURES_FOLDER).forEach(function(folder) {
        var fullPath = utils.addSlash(config.FAILURES_FOLDER) + folder;
        if (fs.lstatSync(fullPath).isDirectory()) {
            var currentDir = "";
            fs.readdirSync(fullPath).forEach(function(file) {
                if (file.endsWith('png')) {
                    currentDir += `<div class="container"><img src='/failures/${folder}/${file}'><img src='/ui-tests/${file.replace(`-${folder}`, '')}'></div>`;
                }
            });
            if (currentDir.length !== 0) {
                content += `<div class="failures"><h2>${folder}</h2><details>${currentDir}</details></div>`;
            }
        }
    });
    if (content.length === 0) {
        content = "No failures";
    }
    response.write(`<html>
<head>
    <title>rustdoc UI tests</title>${FAVICON_DATA === null ? "" : '<link rel="icon" type="image/png" sizes="32x32" href="/favicon.ico">'}
    <script>${mstatus.get_status_js()}</script>
    <style type="text/css">${mstatus.get_status_css()}</style>
</head>
<body>
    <header>
        ${make_link(REPOSITORY_URL, '<img src="/assets/github.png">', true, 'repository')}
        <div>Failures</div>
        ${make_link('/', 'Home', null, 'log-in button')}
    </header>
    <div class="content">
        ${content}
    </div>
</body>
</html>`);
    response.end();
}

function add_test_results(output, issue_url, errors) {
    if (TESTS_RESULTS.length >= config.MAX_TEST_RESULTS) {
        TESTS_RESULTS.shift();
    }
    TESTS_RESULTS.push({'url': issue_url, 'text': output, 'errors': errors,
                        'time': parseInt(Date.now())});
    try {
        utils.writeObjectToFile(config.TESTS_RESULTS_FILE, {'results': TESTS_RESULTS});
    } catch(err) {
        add_error(`Couldn't save to "${config.TESTS_RESULTS_FILE}": ` + err);
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
        add_error('Failed authentication attempt...');
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
        add_error(error);
        return redirection_error(response, cookies, error);
    }
    if (data['error_description'] !== undefined) {
        add_error('Failed authentication validation attempt...');
        return redirection_error(response, cookies, `Error from github: ${data['error_description']}`);
    }
    if (data['access_token'] === undefined) {
        add_error('Failed authentication validation attempt (missing "access_token" field?)...');
        return redirection_error(response, cookies, 'Error from github: missing "access_token" field...');
    }
    let access_token = data['access_token'];
    let login = await utils.get_username(access_token).catch(() => {});
    if (login === null || typeof login !== "string") {
        add_error('Cannot get username...');
        return redirection_error(response, cookies, 'Error from github: missing "access_token" field...');
    }

    add_log(`"${login}" logged in from "${request.connection.remoteAddress}"`)
    cookies.set('Login', login);
    cookies.set('Token', access_token);
    response.writeHead(302, {'Location': '/'});
    response.end();
}

function restart(response, request, server) {
    const text = 'shutting down server...';
    response.end(text);
    add_log(text);
    server.close();
    utils.updateRepository();
    process.exit(0);
}

function unknown_url(response, request) {
    if (request.url.pathname.startsWith('/failures/') || request.url.pathname.startsWith('/ui-tests/')) {
        content = utils.readFile(request.url.pathname.substr(1), null, (error, data) => {
            if (error) {
                add_error(`failed to get file: ${error}`);
                response.statusCode = 500;
                response.end();
            } else {
                response.statusCode = 200
                response.setHeader('Content-Type', 'image/png');
                response.write(data);
                response.end();
            }
        });
    } else {
        response.statusCode = 404;
        response.end('Unknown URL: ' + request.url);
    }
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
        add_error(err);
    }).on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        try {
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
        } catch(err) {
            response.write(`An error occurred:<br>${err}`);
            response.end();
        }
    });
}

function check_signature(req, body) {
    if (GITHUB_WEBHOOK_SECRET_PATH === null) {
        add_warning('No signature check, this is unsafe!');
        return true;
    }
    let github_webhook_secret = utils.readFile(GITHUB_WEBHOOK_SECRET_PATH).replaceAll('\n', '');
    let hmac = crypto.createHmac('sha1', github_webhook_secret);
    hmac.update(JSON.stringify(body));
    let calculatedSignature = 'sha1=' + hmac.digest('hex');

    return req.headers['x-hub-signature'] === calculatedSignature;
}

function removeFolder(folderPath) {
    try {
        const upper = spawnSync('rm', ['-rf', folderPath]);
        let stdout = upper.stdout.toString().trim();
        let stderr = upper.stderr.toString().trim();
    } catch (e) {
        return {"error": e.toString()};
    }
    return {};
}

async function buildDoc(runId, rustdocPath, callback) {
    var currentDir = utils.getCurrentDir();

    const outputPath = runId;
    const outPath = currentDir + utils.addSlash(outputPath);
    const docPath = outPath + "lib/";

    var args = [];
    if (runId.length !== 0) {
        args.push(`+${runId}`);
    }
    args.push("test-docs/src/lib.rs");
    args.push("-o");
    args.push(outPath);
    add_log(`Building docs... [current dir: ${currentDir}] -> ${rustdocPath} [${args}]`);
    execFile(rustdocPath, args, (error, stdout, stderr) => {
        callback(error, stdout, stderr, runId);
    });
}

function innerRunTests(error, stdout, stderr, runId) {
    if (error) {
        const out = error.toString() + "\n=== STDERR ===\n" + stderr + "\n\n=== STDOUT ===\n" + stdout;
        add_log(`Doc build failed for ${url}: ${out}`);
        response.end("Failed to build doc:\n```text\n" + out + "\n```");

        // cleanup part
        DOC_UI_RUNS[url] = undefined;
        utils.uninstallRustdoc(CARGO_BIN_PATH, runId);

        // remove doc folder
        const ret = removeFolder(runId);
        if (ret.hasOwnProperty("error")) {
            add_error(ret["error"]);
        }
        return;
    }
    const options = new tester.Options();
    options.parseArguments(["--run-id", runId,
                            "--test-folder", "ui-tests/",
                            "--failure-folder", config.FAILURES_FOLDER,
                            "--show-text",
                            "--variable", "DOC_PATH", utils.addSlash(runId) + "lib/"]);
    tester.runTests(options).then(x => {
        let [output, errors] = x;
        response.statusCode = 200;
        if (errors > 0) {
            let failure = "failure";
            if (errors > 1) {
                failure = "failures";
            }
            add_log(`Tests failed for ${url}: ${output}`);
            response.end("Rustdoc-UI tests failed (" + errors + " " + failure + ")...");
            utils.send_github_message(msg_url, GITHUB_BOT_TOKEN,
                                      "Rustdoc-UI tests failed \"successfully\"!\n\n<details>" +
                                      "<summary><i>Click to expand the log.</i></summary>\n\n" +
                                      "```plain\n" + output + "\n```\n</details>");
        } else {
            add_log(`Tests ended successfully for ${url}`);
            response.end("Rustdoc-UI tests passed!");
            utils.send_github_message(msg_url, GITHUB_BOT_TOKEN,
                                      "Rustdoc-UI tests ended successfully (and I know that " +
                                      "through (not so dark) magic)!\n\n<details><summary><i>" +
                                      "Click to expand the log.</i></summary>\n\n```plain\n" +
                                      output + "\n```\n</details>");
        }
        add_test_results(output, url, errors);

        // cleanup part
        DOC_UI_RUNS[url] = undefined;
        utils.uninstallRustdoc(CARGO_BIN_PATH, runId);
    }).catch(err => {
        add_log(`Tests failed for ${url}: ${err}`);
        response.end("A test error occurred:\n```text\n" + err + "\n```");

        // cleanup part
        DOC_UI_RUNS[url] = undefined;
        utils.uninstallRustdoc(CARGO_BIN_PATH, runId);

        // remove doc folder
        const ret = removeFolder(runId);
        if (ret.hasOwnProperty("error")) {
            add_error(logs, ret["error"]);
        }
    });
}

function run_tests(id, url, msg_url, response) {
    add_log(`Starting tests for ${url}`);
    let ret = utils.installRustdoc(id);
    if (ret !== true) {
        add_error(`Cannot start tests for ${url}: ${ret}`)
        response.end("An error occurred:\n```text\n" + ret + "\n````");
        utils.send_github_message(
            msg_url,
            GITHUB_BOT_TOKEN,
            "Failed to start test (maybe start a `@bors try` or give a commit hash?)"
        );
        return;
    }
    const rustdocPath = path.join(CARGO_BIN_PATH !== null ? CARGO_BIN_PATH : '', 'rustdoc');
    buildDoc(id, rustdocPath, innerRunTests);
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
        if (DOC_UI_RUNS[content['issue']['html_url']] === false) {
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
                utils.send_github_message(msg_url, GITHUB_BOT_TOKEN, "Rustdoc-UI starting test (thanks to @bors try!)...");
                run_tests(id, content['issue']['html_url'], content['issue']['url'], response);
                return;
            }
        }

        let msg = content['comment']['body'].split("\n");
        let run_doc_ui = false;
        let need_restart = false;
        let need_update = false;
        let specific_commit = null;
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
                    if (x + 1 < parts.length &&
                        {"restart": 0, "update": 0, "run-doc-ui": 0}[parts[x + 1]] === undefined) {
                        // we have a commit!
                        x += 1;
                        specific_commit = parts[x];
                    }
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
                add_log(`github_event: missing rights for ${content['comment']['user']['login']} on ${content['issue']['html_url']}`);
                response.end();
                return;
            }
        }
        if (need_update === true) {
            add_log(`Received "update" command from ${content['issue']['html_url']}`);
            utils.updateRepository();
        }
        if (need_restart === true) {
            add_log(`Received "restart" command from ${content['issue']['html_url']}`);
            restart(response, request, server);
            return;
        }
        if (run_doc_ui === true) {
            add_log(`Received "run-doc-ui" command from ${content['issue']['html_url']}`);
            const pr_url = content['issue']['html_url'];
            const msg_url = content['issue']['url'];
            // We wait for the rustdoc build to end before trying to get it.
            DOC_UI_RUNS[pr_url] = false;
            if (specific_commit === null) {
                utils.send_github_message(msg_url, GITHUB_BOT_TOKEN,
                                          "Waiting for `@bors try` to run or please add a commit hash");
            }
            if (specific_commit !== null) {
                utils.send_github_message(msg_url, GITHUB_BOT_TOKEN, "Rustdoc-UI starting test...");
                run_tests(specific_commit, pr_url, msg_url, response);
                return;
            }
        }

        response.end();
    } catch (err) {
        add_error(`github_event error: ${err}`);
        response.end("Invalid github data");
    }
}

function readySubmodule(submodule_path) {
    add_log("=> Getting components ready...");
    try {
        execFileSync("git", ["submodule", "update", "--init"]);
    } catch(err) {
        add_error(`'git submodule update --init' failed: ${err}`);
    }
    try {
        var x = '/' + __dirname.split('/').filter(x => x.length > 0).slice(0, 2).join('/');
        x += '/.cargo/bin/cargo';
        execFileSync(x, ["build", "--release"], { cwd: submodule_path });
    } catch(err) {
        add_error(`'cargo build --release' failed: ${err}`);
    }
    add_log("<= Done!");
}

function load_github_appli_credentials() {
    add_log('=> Getting github app credentials...');
    let content;
    try {
        content = utils.readFile(config.GITHUB_APP_CREDENTIALS_FILE);
    } catch(err) {
        add_error(`Couldn't read "${config.GITHUB_APP_CREDENTIALS_FILE}": ${err}`);
        return false;
    }
    try {
        content = JSON.parse(content);
    } catch(err) {
        add_error(`Invalid JSON format in "${config.GITHUB_APP_CREDENTIALS_FILE}": ${err}`);
        return false;
    }
    if (content['GITHUB_CLIENT_ID'] !== undefined) {
        GITHUB_CLIENT_ID = content['GITHUB_CLIENT_ID'];
    }
    if (content['GITHUB_CLIENT_SECRET'] !== undefined) {
        GITHUB_CLIENT_SECRET = content['GITHUB_CLIENT_SECRET'];
    }
    if (GITHUB_CLIENT_SECRET === null || GITHUB_CLIENT_ID === null) {
        add_error(`"${config.GITHUB_APP_CREDENTIALS_FILE}" needs "GITHUB_CLIENT_ID" and "GITHUB_CLIENT_SECRET" keys`);
        return false;
    }
    return true;
}

function load_favicon_data() {
    add_log('=> Loading favicon file...');
    let content;
    try {
        content = utils.readFile(config.FAVICON_FILE, null);
    } catch(err) {
        add_error(`Couldn't read "${config.FAVICON_FILE}": ${err}`);
        add_log("<= no favicon loaded...");
    }
    FAVICON_DATA = content;
    add_log("<= favicon loaded!");
}

function load_cookie_keys() {
    add_log('=> Loading cookie keys...');
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
    add_log('<= Cookie keys loaded!')
}

function load_logs() {
    console.log('=> Loading previous logs...');
    let content;
    try {
        content = utils.readFile(config.LOGS_FILE, null);
    } catch(err) {
        add_error(`Couldn't read "${config.LOGS_FILE}": ${err}`);
        return false;
    }
    try {
        content = JSON.parse(content);
    } catch(err) {
        add_error(`"${config.LOGS_FILE}" file isn't valid JSON: ${err}`);
        return false;
    }
    if (content['LOGS'] === undefined) {
        add_error(`Missing "LOGS" in "${config.LOGS_FILE}"...`);
        return false;
    }
    if (Array.isArray(content['LOGS']) === false) {
        add_error(`"LOGS" value must be an array!`);
        return false;
    }
    LOGS = content['LOGS'];
    return true;
}

function load_test_results() {
    add_log("=> Loading test results...");
    try {
        TESTS_RESULTS = JSON.parse(utils.readFile(config.TESTS_RESULTS_FILE))['results'];
        if (Array.isArray(TESTS_RESULTS) !== true) {
            add_warning(`"${config.TESTS_RESULTS_FILE}" file doesn't have the expected format...`);
            TESTS_RESULTS = [];
        }
    } catch(err) {
        add_warning(`<= Couldn't parse/read "${config.TESTS_RESULTS_FILE}", ignoring it...`);
        return;
    }
    add_log("<= Test results loaded!");
}

function build_failures_dir() {
    add_log('=> Creating build failures folder...');
    if (fs.existsSync(config.FAILURES_FOLDER) === false) {
        try {
            fs.mkdirSync(config.FAILURES_FOLDER);
        } catch(err) {
            add_error('<= Failed to create build failures folder...');
            return;
        }
    }
    add_log('<= Done!');
}

function try_to_get_image(response, request) {
    let filepath = request.url.pathname;
    while (filepath.startsWith('/')) {
        filepath = filepath.slice(1);
    }
    if (fs.lstatSync(filepath) === false) {
        return unknown_url(response, request);
    }
    if (filepath.endsWith('.png')) {
        response.setHeader('Content-Type', 'image/png');
    } else {
        response.setHeader('Content-Type', 'image/jpeg');
    }
    fs.readFile(filepath, null, (err, data) => {
        if (err) {
            response.statusCode = 404;
        } else {
            response.write(data);
        }
        response.end();
    });
}

function start_server(argv) {
    if (argv.length < 5) {
        console.error('node server.rs [github secret webhook path|--ignore-webhook-secret] ' +
                      '[github bot token|--ignore-bot-token] [cargo bin path]');
        process.exit(1);
    }

    if (load_logs() !== true) {
        add_log("<= previous logs couldn't been loaded...");
    } else {
        add_log("<= previous logs loaded!");
    }

    if (argv[2] === '--ignore-webhook-secret') {
        add_warning('=> Disabling github webhook signature check. This is unsafe!');
    } else {
        GITHUB_WEBHOOK_SECRET_PATH = argv[2];

        if (fs.existsSync(GITHUB_WEBHOOK_SECRET_PATH) === false) {
            console.error('Invalid path received: "' + GITHUB_WEBHOOK_SECRET_PATH + '"');
            process.exit(2);
        }
        add_log('=> Found github-webhook-secret file!');
    }
    if (argv[3] === '--ignore-bot-token') {
        add_warning('=> Disabling github send message...');
    } else {
        if (fs.existsSync(argv[3]) === false) {
            console.log(`Invalid bot token path received: "${argv[3]}"`);
            process.exit(3);
        }
        GITHUB_BOT_TOKEN = utils.readFile(argv[3]).replaceAll('\n', '');
        add_log('=> Found github bot token!');
    }
    CARGO_BIN_PATH = utils.addSlash(argv[4]);
    if (fs.existsSync(CARGO_BIN_PATH) === false) {
        console.log(`Invalid cargo bin path received: "${CARGO_BIN_PATH}"`);
        process.exit(4);
    }

    load_cookie_keys();

    readySubmodule(utils.getCurrentDir() + "rustup-toolchain-install-master");

    load_test_results();

    if (load_github_appli_credentials() !== true) {
        add_log('<= github authentication is deactivated...');
    } else {
        add_log('<= github authentication is activated!');
    }
    load_favicon_data();
    build_failures_dir();

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
        '/failures': get_failures,
        '/run-test': run_test,
        '/': parseData,
        '': parseData,
    };

    var server = http.createServer((request, response) => {
        try {
            request.url = new m_url.URL('http://a.a' + request.url);
            if (URLS.hasOwnProperty(request.url.pathname)) {
                URLS[request.url.pathname](response, request, server);
            } else if (request.url.pathname.endsWith('.png') ||
                       request.url.pathname.endsWith('.jpg')) {
                try_to_get_image(response, request);
            } else {
                unknown_url(response, request);
            }
        } catch(err) {
            add_error(`An error occurred: ${err}`);
            response.statusCode = 500;
            response.end();
        }
    });
    server.listen(config.PORT);
    add_log("server started on 0.0.0.0:" + config.PORT);
}

if (require.main === module) {
    start_server(process.argv);
}
