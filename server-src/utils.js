const fs = require('fs');
const execFileSync = require('child_process').execFileSync;

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
        execFileSync("git", ["pull", "origin", "master"]);
    } catch(err) {
        console.error("Cannot update server sources: '" + err + "'");
    }
}

function readFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
    addSlash: addSlash,
    getCurrentDir: getCurrentDir,
    updateRepository: updateRepository,
    readFile: readFile,
};
