// Copyright 2018 The Rust Project Developers. See the COPYRIGHT
// file at the top-level directory of this distribution and at
// http://rust-lang.org/COPYRIGHT.
//
// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

const puppeteer = require('puppeteer');
const fs = require('fs');
const execFileSync = require('child_process').execFileSync;
const PNG = require('png-js');
const parser = require('./parser.js');
const spawnSync = require('child_process').spawnSync;
const utils = require('./utils.js');

const TEST_FOLDER = 'ui-tests/';


function loadContent(content) {
    var Module = module.constructor;
    var m = new Module();
    m._compile(`async function f(page){ return ${content}; } module.exports.f = f;`, "tmp.js");
    return m.exports.f;
}

function comparePixels(img1, img2) {
    return img1.equals(img2);
}

function appendLog(logs, newLog, noBackline) {
    if (logs.length === 0 || noBackline === true) {
        return `${logs}${newLog}`;
    }
    return `${logs}\n${newLog}`;
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

async function main(argv) {
    var logs = "";

    if (argv.length < 4) {
        return ["tester [RUSTDOC PATH] [ID] [--generate-images (optional)]", 1];
    }

    const rustdocPath = argv[2];
    var currentDir = utils.getCurrentDir();

    const outPath = currentDir + utils.addSlash(argv[3]);
    const runId = argv[3];
    const docPath = outPath + "lib/";
    var generateImages = false;
    if (argv.length >= 5) {
        generateImages = argv[4] === "--generate-images"; // TODO improve arguments parsing
    }
    try {
        execFileSync(rustdocPath, [`+${runId}`, "test-docs/src/lib.rs", "-o", outPath]);
    } catch (err) {
        return ["=== STDERR ===\n" + err.stderr + "\n\n=== STDOUT ===\n" + err.stdout, 1];
    }

    logs = "=> Starting doc-ui tests...";

    var loaded = [];
    var failures = 0;
    fs.readdirSync(TEST_FOLDER).forEach(function(file) {
        var fullPath = TEST_FOLDER + file;
        if (file.endsWith(".gom") && fs.lstatSync(fullPath).isFile()) {
            var commands = parser.parseContent(utils.readFile(fullPath));
            if (commands.hasOwnProperty("error")) {
                logs = appendLog(logs, file.substr(0, file.length - 4) + "... FAILED");
                logs = appendLog(logs, `[line ${commands[i]["line"]}: ${commands[i]["error"]}`);
                return;
            }
            if (commands["instructions"].length === 0) {
                logs = appendLog(logs, file.substr(0, file.length - 4) + "... FAILED");
                logs = appendLog(logs, "No command to execute");
                return;
            }
            loaded.push({"file": file.substr(0, file.length - 4), "commands": commands["instructions"]});
        }
    });

    if (loaded.length === 0) {
        return [logs, failures];
    }

    var error_log;
    const browser = await puppeteer.launch();
    for (var i = 0; i < loaded.length; ++i) {
        logs = appendLog(logs, loaded[i]["file"] + "... ");
        const page = await browser.newPage();
        try {
            await page.goto('file://' + docPath + "index.html");

            error_log = "";
            const commands = loaded[i]["commands"];
            for (var x = 0; x < commands.length; ++x) {
                await loadContent(commands[x])(page).catch(err => {
                    error_log = err.toString();
                });
                if (error_log.length > 0) {
                    failures += 1;
                    logs = appendLog(logs, 'FAILED', true);
                    logs = appendLog(logs, error_log);
                    break;
                }
                // We wait a bit between each command to be sure the browser can follow.
                await page.waitFor(100);
            }
            if (error_log.length > 0) {
                continue;
            }

            var newImage = TEST_FOLDER + loaded[i]["file"] + `-${runId}.png`;
            await page.screenshot({
                path: newImage,
                fullPage: true,
            });

            var originalImage = TEST_FOLDER + loaded[i]["file"] + ".png";
            if (fs.existsSync(originalImage) === false) {
                if (generateImages === false) {
                    logs = appendLog(logs, 'ignored ("' + originalImage + '" not found)', true);
                } else {
                    fs.renameSync(newImage, originalImage);
                    logs = appendLog(logs, 'ignored', true);
                }
                continue;
            }
            if (comparePixels(PNG.load(newImage).imgData,
                              PNG.load(originalImage).imgData) === false) {
                failures += 1;
                logs = appendLog(logs, 'FAILED (images "' + newImage + '" and "' + originalImage +
                                       '" are different)', true);
                continue;
            }
            // If everything worked as expected, we can remove the generated image.
            fs.unlinkSync(newImage);
        } catch (err) {
            failures += 1;
            logs = appendLog(logs, 'FAILED', true);
            logs = appendLog(logs, loaded[i]["file"] + " output:\n" + err + '\n');
            continue;
        }
        await page.close();
        logs = appendLog(logs, 'ok', true);
    }
    await browser.close();

    const ret = removeFolder(outPath);
    if (ret.hasOwnProperty("error")) {
        logs = appendLog(logs, ret["error"]);
    }

    logs = appendLog(logs, "<= doc-ui tests done: " + (loaded.length - failures) + " succeeded, " +
                           failures + " failed");

    return [logs, failures];
}

if (require.main === module) {
    main(process.argv).then(x => {
        var [output, error_code] = x;
        console.log(output)
        process.exit(error_code);
    }).catch(err => {
        console.log(err);
        process.exit(1);
    });
} else {
    module.exports = {
        runTests: main,
    };
}
