const fs = require('fs');
const execFileSync = require('child_process').execFileSync;
const config = require('./config.js');
var Cookies = require('cookies');
const axios = require('axios');

String.prototype.replaceAll = function(search, replace_with) {
    return this.split(search).join(replace_with);
};

function addSlash(s) {
    if (!s.endsWith('/') && s.length > 0) {
        return s + '/';
    }
    return s;
}

function getCurrentDir() {
    var currentDir = addSlash(__dirname);
    if (currentDir.endsWith("server-src/")) {
        currentDir = addSlash(currentDir.substr(0, currentDir.length - "server-src/".length));
    }
    return currentDir;
}

function updateRepository() {
    var ret = "";
    try {
        ret = execFileSync("git", ["fetch", "origin"]);
        ret += '\n\n' + execFileSync("git", ["branch", "-Df", "origin/master"]);
        ret += '\n\n' + execFileSync("git", ["checkout", "origin/master"]);
        ret += '\n\n' + execFileSync("git", ["branch", "-D", "master"]);
        ret += '\n\n' + execFileSync("git", ["checkout", "-b", "master"]);
        return ret;
    } catch(err) {
        const log = ret + "\n\nCannot update server sources: '" + err + "'";
        add_error(log);
        return log;
    }
}

function readFile(filePath, encoding) {
    if (typeof encoding !== 'undefined') {
        return fs.readFileSync(filePath, encoding);
    }
    return fs.readFileSync(filePath, 'utf8');
}

function writeToFile(filePath, content) {
    fs.writeFileSync(filePath, content, 'utf8');
}

function writeObjectToFile(filePath, object) {
    return writeToFile(filePath, JSON.stringify(object));
}

function get_cookies(req, res, cookie_keys) {
    return new Cookies(req, res, { keys: cookie_keys });
}

function installRustdoc(id) {
    const crate_name = "rustup-toolchain-install-master";
    const exec_path = `${getCurrentDir()}${crate_name}/target/release/${crate_name}`;

    try {
        execFileSync(exec_path, [id]);
    } catch(err) {
        add_error(`Cannot install rustdoc from "${id}"`);
        return false;
    }
    return true;
}

function uninstallRustdoc(id) {
    try {
        execFileSync("rustup", ["uninstall", id]);
    } catch(err) {
        add_error(`Cannot uninstall rustdoc from "${id}"`);
    }
}

async function get_username(access_token) {
    let content;
    try {
        let res = await axios.get(`${config.GH_API_URL}/user`,
                                  {headers: {
                                   'User-agent': 'imperio',
                                   'Accept': 'application/vnd.github.v3+json',
                                   'Authorization': `token ${access_token}`}
                                  }).catch(() => {});
        await res.data;
        content = res.data;
    } catch (error) {
        add_error(`http error in get_username: ${error}`);
        return null;
    }
    try {
        if (content['login'] === undefined) {
            add_log(`No "login" provided in get_username for token ${access_token}...: ${content}`);
            return null;
        }
        return content['login'];
    } catch(err) {
        add_error(`An error occurred in get_username for token ${access_token}: ${err}`);
        return null;
    }
}

function add_error(output) {
    add_log(output, config.ERROR);
}

function add_warning(output) {
    add_log(output, config.LOG_WARNING);
}

function push_to_logs(output, level) {
    if (LOGS.length >= config.MAX_LOGS) {
        LOGS.shift();
    }
    LOGS.push({'text': output, 'level': level, 'time': parseInt(Date.now())});
}

function add_log(output, level) {
    let disp = console.log;
    if (level === config.LOG_ERROR) {
        disp = console.error;
    } else if (level === config.LOG_WARNING) {
        disp = console.warn;
    } else {
        level = config.LOG_NORMAL;
    }
    disp(output);

    push_to_logs(output, level);
    try {
        writeObjectToFile(config.LOGS_FILE, {'LOGS': LOGS});
    } catch(err) {
        push_to_logs(`Couldn't save to "${config.LOGS_FILE}": ${err}`, config.LOG_ERROR);
    }
}

function text_to_html(t) {
    return t.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>');
}

async function send_github_message(url, token, message) {
    if (token === null) {
        return;
    }
    await axios.post(url + '/comments',
                     {'body': message},
                     { headers: {
                        'User-agent': 'imperio',
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${token}`
                     }}).then(() => {
                         add_log(`Sent message to "${url}"!`);
                     }).catch(err => {
                         add_error(`Failed to post message on github: ${err}`);
                     });
}

function add_missing_zero(x) {
    if (typeof x !== 'undefined' && x < 10) {
        return `0${x}`;
    }
    return x;
}

function format_date(x) {
    if (typeof x !== 'undefined') {
        let d = new Date(x);
        const f = add_missing_zero;
        return ' ' + f(d.getHours()) + ':' + f(d.getMinutes()) + ':' + f(d.getSeconds()) + ' ' +
            f(d.getDate()) + '/' + f(d.getMonth() + 1) + '/' + f(d.getFullYear());
    }
    return '';
}

module.exports = {
    addSlash: addSlash,
    getCurrentDir: getCurrentDir,
    updateRepository: updateRepository,
    readFile: readFile,
    writeToFile: writeToFile,
    get_cookies: get_cookies,
    installRustdoc: installRustdoc,
    uninstallRustdoc: uninstallRustdoc,
    get_username: get_username,
    add_error: add_error,
    add_warning: add_warning,
    add_log: add_log,
    text_to_html: text_to_html,
    writeObjectToFile: writeObjectToFile,
    send_github_message: send_github_message,
    format_date: format_date,
};
