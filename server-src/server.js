var http = require('http');
var util = require('util');
var spawnSync = require('child_process').spawnSync;
var config = require('./config.js');
var tester = require('./tester.js');
const execFileSync = require('child_process').execFileSync;
const utils = require('./utils.js');

var DOC_UI_RUNS = {};

function get_status(response) {
    response.end('All good here!');
}

function restart(response, request, server) {
    const text = 'shutting down server...';
    response.end(text);
    console.log(text);
    server.close();
}

function unknown_url(response, request) {
    response.end('Unknown URL: ' + request.url);
}

function check_rights(login) {
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

// https://developer.github.com/v3/activity/events/types/#issuecommentevent
function github_event(response, request, server) {
    let body = [];

    request.on('error', (err) => {
        console.error(err);
    }).on('data', (chunk) => {
        body.push(chunk);
    }).on('end', () => {
        try {
            let content = JSON.parse(Buffer.concat(body).toString());

            if (content['action'] === 'deleted') {
                return;
            }

            // If we received the message that the rustdoc binary is ready, we can start tests!
            if (DOC_UI_RUNS[content['issue']['url']] === false) {
                var id = null;
                const lines = content['comment']['body'].split('\n');

                for (var x = 0; x < lines.length; ++x) {
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
                    var ret = installRustdoc(id);
                    if (ret !== true) {
                        response.statusCode = 200;
                        response.end("An error occurred:\n```text\n" + ret + "\n````");
                        return;
                    }
                    tester.runTests(["", "", "rustdoc", id]).then(x => {
                        var [output, error_code] = x;
                        response.statusCode = 200;
                        if (error_code > 0) {
                            var failure = "failure";
                            if (error_code > 1) {
                                failure = "failures";
                            }
                            response.end("Rustdoc-UI tests failed (" + error_code + " " + failure +
                                         ")...\n```text\n" + output + "\n```");
                        } else {
                            response.end("Rustdoc-UI tests passed!\n```text\n" + output + "\n```");
                        }

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
            for (let i = 0; i < msg.length; ++i) {
                if (line.trim().startsWith("@" + config.BOT_NAME) === false) {
                    continue;
                }
                let parts = line.split(" ").filter(w => w.length > 0).slice(1);
                for (var x = 0; x < parts.length; ++x) {
                    let cmd = parts[x].toLowerCase();
                    if (cmd === "run-doc-ui") {
                        run_doc_ui = true;
                    } else if (cmd === "restart") {
                        need_restart = true;
                    } else {
                        // we ignore the rest.
                    }
                }
            }
            if ((need_restart === true || run_doc_ui === true) &&
                    check_rights(content['comment']['user']['login']) === false) {
                console.log('github_event: missing rights for ' + content['comment']['user']['login']);
                return;
            }
            if (need_restart === true) {
                restart(response, request, server);
                response.end("ok");
                return;
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
    });
}

function readySubmodule(submodule_path) {
    console.log("Getting components ready...");
    try {
        execFileSync("git", ["submodule", "update", "--init"]);
    } catch(err) {
        console.error("'git submodule update --init' failed: " + err);
    }
    try {
        execFileSync("cargo", ["build", "--release"], { cwd: submodule_path });
    } catch(err) {
        console.error("'cargo build --release' failed: " + err);
    }
    console.log("Done!");
}

readySubmodule(utils.getCurrentDir() + "rustup-toolchain-install-master");

const URLS = {
    '/status': get_status,
    '/restart': restart,
    '/github': github_event,
};

var server = http.createServer((request, response) => {
    if (URLS.prototype.hasOwnProperty(request.url)) {
        URLS[request.url](response, request, server);
    } else {
        unknown_url(response, request);
    }
});
server.listen(config.PORT);
console.log("server started on 0.0.0.0:" + config.PORT);
