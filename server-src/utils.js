const fs = require('fs');
const execFileSync = require('child_process').execFileSync;
const config = require('./config.js');
var Cookies = require('cookies');
const axios = require('axios');

String.prototype.replaceAll = function(search, replace_with) {
    return this.split(search).join(replace_with);
};

function addSlash(s) {
    if (!s.endsWith('/')) {
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
    try {
        return execFileSync("git", ["pull", "origin", "master"]);
    } catch(err) {
        add_error("Cannot update server sources: '" + err + "'");
        return "";
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
    LOGS.push({'text': output, 'level': level});
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
};
