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

function readFile(filePath, encoding) {
    if (typeof encoding !== 'undefined') {
        return fs.readFileSync(filePath, encoding);
    }
    return fs.readFileSync(filePath, 'utf8');
}

function writeToFile(filePath, content) {
    fs.writeFileSync(filePath, content, 'utf8');
}

module.exports = {
    addSlash: addSlash,
    getCurrentDir: getCurrentDir,
    updateRepository: updateRepository,
    readFile: readFile,
    writeToFile: writeToFile,
};
