const fs = require('fs');
const execFileSync = require('child_process').execFileSync;
const config = require('./config.js');
var Cookies = require('cookies');
const axios = require('axios');

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
        console.error("Cannot update server sources: '" + err + "'");
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
    return writeToFile(JSON.stringify(object));
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

function get_username(access_token) {
    const data = async () => {
        try {
            return await axios.get(`${config.GH_API_URL}/user`,
                                   {headers: {
                                    'User-agent': 'imperio',
                                    'Accept': 'application/vnd.github.v3+json',
                                    'Authorization': `token ${access_token}`}
                                   });
        } catch (error) {
            console.error(`http error in get_username: ${error}`);
            return null;
        }
    };
    try {
        let content = JSON.parse(data);
        if (content['login'] === undefined) {
            console.log(`No "login" provided in get_username for token ${access_token}...: ${data}`);
            return null;
        }
        return content['login'];
    } catch(err) {
        console.error(`An error occurred in get_username for token ${access_token}: ${err}`);
        return null;
    }
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
};
