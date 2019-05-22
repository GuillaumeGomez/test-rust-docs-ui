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
const add_warn = utils.add_warning;
const config = require('./config.js');

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

function save_failure(folderIn, newImage, originalImage, runId) {
    if (fs.existsSync(config.FAILURES_FOLDER) === false) {
        // We cannot save the failures...
        return false;
    }
    if (fs.existsSync(config.FAILURES_FOLDER + runId) === false) {
        try {
            fs.mkdirSync(config.FAILURES_FOLDER + runId);
        } catch(err) {
            add_warn(`Error while trying to make folder "${config.FAILURES_FOLDER + runId}": ${err}`);
            // Failed to create folder to save failures...
            return false;
        }
    }
    try {
        fs.renameSync(folderIn + newImage, config.FAILURES_FOLDER + runId + '/' + newImage);
    } catch(err) {
        add_warn(`Error while trying to move files: "${err}"`);
        // failed to move files...
        return false;
    }
    return true;
}

function make_url(img, runId) {
    return config.SERVER_URL + config.FAILURES_FOLDER + runId + '/' + img;
}

function helper() {
    console.log("tester");
    console.log("  --rustdoc-path [PATH] : path of the rustdoc executable to be used");
    console.log("  --run-id [id]         : commit id to be used (used as output path if");
    console.log("                          `--output-path` option isn't provided)");
    console.log("  --output-path [PATH]  : path where doc will be generated");
    console.log("  --generate-images     : if provided, it'll generate test images and won't");
    console.log("                          run comparison tests");
    console.log("  --no-headless         : Disable headless mode");
    console.log("  --help | -h           : Show this text");
}

async function main(argv) {
    var logs = "";

    var rustdocPath = "";
    var runId = "";
    var outputPath = "";
    var headless = true;
    var generateImages = false;

    for (var it = 2; it < argv.length; ++it) {
        if (argv[it] === "--rustdoc-path") {
            if (it + 1 < argv.length) {
                rustdocPath = argv[it + 1];
                it += 1;
            } else {
                return ["Missing path after '--rustdoc-path' option", 1];
            }
        } else if (argv[it] === "--run-id") {
            if (it + 1 < argv.length) {
                runId = argv[it + 1];
                it += 1;
            } else {
                return ["Missing id after '--run-id' option", 1];
            }
        } else if (argv[it] === "--output-path") {
            if (it + 1 < argv.length) {
                outputPath = argv[it + 1];
                it += 1;
            } else {
                return ["Missing id after '--output-path' option", 1];
            }
        } else if (argv[it] === "--generate-images") {
            generateImages = true;
        } else if (argv[it] === "--no-headless") {
            headless = false;
        } else if (argv[it] === "--help" || argv[it] === "-h") {
            helper();
            return ["", 0];
        } else {
            return [`Unknown option '${argv[it]}'\n` +
                    "Use '--help' if you want the list of the available commands", 1];
        }
    }

    if (rustdocPath.length === 0) {
        return ["You need to provide '--rustdop-path' option!", 1];
    } else if (runId.length === 0 && outputPath.length === 0) {
        return ["You need to provide '--run-id' and/or '--output-path' options!", 1];
    }
    if (outputPath.length === 0) {
        outputPath = runId;
    }

    var currentDir = utils.getCurrentDir();

    const outPath = currentDir + utils.addSlash(outputPath);
    const docPath = outPath + "lib/";
    try {
        var args = [];
        if (runId.length !== 0) {
            args.push(`+${runId}`);
        }
        args.push("test-docs/src/lib.rs");
        args.push("-o");
        args.push(outPath);
        execFileSync(rustdocPath, args);
    } catch (err) {
        return ["=== STDERR ===\n" + err.stderr + "\n\n=== STDOUT ===\n" + err.stdout, 1];
    }

    // If no run id has been provided to the script, we create a little one so test files don't
    // have an ugly name.
    if (runId.length === 0) {
        runId = "test";
    }

    logs = "=> Starting doc-ui tests...";

    var loaded = [];
    var failures = 0;
    var ignored = 0;
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
    var options = {};
    if (headless === false) {
        options['headless'] = false;
    }
    const browser = await puppeteer.launch(options);
    for (var i = 0; i < loaded.length; ++i) {
        logs = appendLog(logs, loaded[i]["file"] + "... ");
        const page = await browser.newPage();
        try {
            await page.goto('file://' + docPath + "index.html");

            error_log = "";
            const commands = loaded[i]["commands"];
            for (var x = 0; x < commands.length; ++x) {
                await loadContent(commands[x])(page).catch(err => {
                    error_log = err.toString() + `: for command {${commands[x].join(';')}} `;
                });
                if (error_log.length > 0) {
                    failures += 1;
                    logs = appendLog(logs, error_log);
                    break;
                }
                // We wait a bit between each command to be sure the browser can follow.
                await page.waitFor(100);
            }
            if (error_log.length > 0) {
                logs = appendLog(logs, 'FAILED', true);
                logs = appendLog(logs, loaded[i]["file"] + " output:\n" + error_log + '\n');
                failures += 1;
                continue;
            }

            var newImage = `${TEST_FOLDER}${loaded[i]["file"]}-${runId}.png`;
            await page.screenshot({
                path: newImage,
                fullPage: true,
            });

            var originalImage = TEST_FOLDER + loaded[i]["file"] + ".png";
            console.log("check for " + originalImage);
            if (fs.existsSync(originalImage) === false) {
                if (generateImages === false) {
                    ignored += 1;
                    logs = appendLog(logs, 'ignored ("' + originalImage + '" not found)', true);
                } else {
                    fs.renameSync(newImage, originalImage);
                    logs = appendLog(logs, 'generated', true);
                }
                continue;
            }
            if (comparePixels(PNG.load(newImage).imgData,
                              PNG.load(originalImage).imgData) === false) {
                failures += 1;
                let saved = save_failure(TEST_FOLDER, loaded[i]["file"] + `-${runId}.png`,
                                         loaded[i]["file"] + ".png", runId);
                if (saved === true) {
                    logs = appendLog(logs,
                                     'FAILED (images "' +
                                     make_url(`${loaded[i]["file"]}-${runId}.png`, runId) +
                                     '" and "' + make_url(loaded[i]["file"] + '.png', runId) +
                                     '" are different)', true);
                } else {
                    logs = appendLog(logs,
                                     'FAILED (images "' + newImage + '" and "' +
                                     originalImage + '" are different)', true);
                }
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

    logs = appendLog(logs, "<= doc-ui tests done: " + (loaded.length - failures - ignored) +
                           " succeeded, " + ignored + " ignored, " + failures + " failed");

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
