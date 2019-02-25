var http = require('http');
var util = require('util');
var spawnSync = require('child_process').spawnSync;
var config = require('./config.js');

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

function update_repository() {
    console.log('Updating current repository...');
    try {
        const upper = spawnSync('git', ['pull', 'origin', 'master']);
        let stdout = upper.stdout.toString().trim();
        let stderr = upper.stderr.toString().trim();
        if (stdout.length > 0) {
            console.log('[STDOUT] ' + stdout);
        }
        if (stderr.length > 0) {
            console.log('[STDERR] ' + stderr);
        }
        return true;
    } catch (e) {
        console.error('update_repository error: ', e);
        return false;
    }
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

function github_event(response, request, server) {
    // const { headers, method, url } = request;
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
                if (update_repository() === false) {
                    response.end("Couldn't update repository...")
                } else {
                    restart(response, request, server);
                    response.end("ok");
                }
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
