var os = require('os');

function getString(content) {
    if (content.length < 1) {
        return {"error": "No string received"};
    }
    var stop = content[0];

    if (stop !== '"' && stop !== "'") {
        return {"error": `Expected \`'\` or \`"\` character, found \`${content[0]}\``};
    }
    for (var i = 1; i < content.length; ++i) {
        if (content[i] === stop && content[i - 1] !== '\\') {
            return {"content": content.substring(1, i)};
        }
    }
    return {"error": "Missing termination character"};
}

// Possible incomes:
//
// * (X, Y)
// * CSS selector (for example: #elementID)
function parseClick(line) {
    if (line.startsWith('(')) {
        if (!line.endsWith(')')) {
            return {"error": "Invalid syntax: expected position to end with ')'..."};
        }
        if (line.match(/\([0-9]+,[ ]*[0-9]+\)/g) === null) {
            return {"error": "Invalid syntax: expected \"([number], [number])\"..."};
        }
        var [x, y] = line.match(/\d+/g).map(function(f) { return parseInt(f) });
        return {"instructions": [
            `page.mouse.click(${x},${y})`,
        ]};
    }
    if (line.match(/([#|\.]?)([\w|:|\s|\.]+)/g) === null) {
        return {"error": "Invalid CSS selector"};
    }
    return {"instructions": [
        `page.click("${line}")`,
    ]};
}

// Possible incomes:
//
// * Number of milliseconds
// * CSS selector (for example: #elementID)
function parseWaitFor(line) {
    if (line.match(/[0-9]+/) !== null) {
        return {"instructions": [
            `page.waitFor(${parseInt(line)})`,
        ]};
    } else if (line.match(/([#|\.]?)([\w|:|\s|\.]+)/g) !== null) {
        return {"instructions": [
            `page.waitFor("${line}")`,
        ]};
    }
    return {"error": "Expected a number or a CSS selector"};
}

// Possible income:
//
// * CSS selector (for example: #elementID)
function parseFocus(line) {
    if (line.match(/([#|\.]?)([\w|:|\s|\.]+)/g) !== null) {
        return {"instructions": [
            `page.focus("${line}")`,
        ]};
    }
    return {"error": "Expected a CSS selector"};
}

// Possible income (you have to put the double quotes!):
//
// * [CSS selector (for example: #elementID)] "text"
// * "text" (in here, it'll write into the current focused element)
function parseWrite(line) {
    if (line.startsWith("\"") || line.startsWith("'")) { // current focused element
        var x = getString(line);
        if (x.error !== undefined) {
            return x;
        }
        return {"instructions": [
            `page.keyboard.type("${x.content}")`,
        ]};
    } else if (line.indexOf("\"") === -1 && line.indexOf("'") === -1) {
        return {"error": "Missing string. Requires '\"'"};
    }
    var elem = line.split(' ')[0];
    var text = getString(line.substr(elem.length + 1).trim());
    if (text.error !== undefined) {
        return x;
    }
    return {"instructions": [
        `page.focus("${elem}")`,
        `page.keyboard.type("${text.content}")`,
    ]};
}

// Possible incomes:
//
// * (X, Y)
// * CSS selector (for example: #elementID)
function parseMoveCursorTo(line) {
    if (line.startsWith('(')) {
        if (!line.endsWith(')')) {
            return {"error": "Invalid syntax: expected position to end with ')'..."};
        }
        if (line.match(/\([0-9]+,[ ]*[0-9]+\)/g) === null) {
            return {"error": "Invalid syntax: expected \"([number], [number])\"..."};
        }
        var [x, y] = line.match(/\d+/g).map(function(f) { return parseInt(f) });
        return {"instructions": [
            `page.mouse.move(${x},${y})`,
        ]};
    } else if (line.match(/([#|\.]?)([\w|:|\s|\.]+)/g) !== null) {
        return {"instructions": [
            `page.hover("${line}")`,
        ]};
    }
    return {"error": "Invalid CSS selector"};
}

// Possible incomes:
//
// * relative path (example: ../struct.Path.html)
// * full URL (for example: https://doc.rust-lang.org/std/struct.Path.html)
function parseGoToUrl(line) {
    // We just check if it goes to an HTML file, not checking much though...
    if (line.startsWith("http") || line.startsWith("www.")) {
        return {"instructions": [
            `page.goto("${line}")`,
        ]};
    } else if (line.startsWith(".")) {
        return {"instructions": [
            `page.goto(page.url().split("/").slice(0, -1).join("/") + "/" + "${line}")`,
        ]};
    } else if (line.startsWith("/")) {
        return {"instructions": [
            `page.goto(page.url().split("/").slice(0, -1).join("/") + "${line}")`,
        ]};
    }
    return {"error": "A relative path or a full URL was expected"};
}

// Possible incomes:
//
// * (X, Y)
// * CSS selector (for example: #elementID)
function parseScrollTo(line) {
    return parseMoveCursorTo(line); // The page will scroll to the element
}

// Possible income:
//
// * (width, height)
function parseSize(line) {
    if (line.startsWith('(')) {
        if (!line.endsWith(')')) {
            return {"error": "Invalid syntax: expected size to end with ')'..."};
        }
        if (line.match(/\([0-9]+,[ ]*[0-9]+\)/g) === null) {
            return {"error": "Invalid syntax: expected \"([number], [number])\"..."};
        }
        var [width, height] = line.match(/\d+/g).map(function(f) { return parseInt(f) });
        return {"instructions": [
            `page.setViewport(${width},${height})`,
        ]};
    }
    return {"error": "Expected '(' character as start"};
}

function parseLocalStorage(line) {
    if (!line.startsWith('{')) {
        return {"error": `Expected json object (object wrapped inside "{}"), found "${line}"`};
    }
    try {
        var d = JSON.parse(line);
        var content = [];
        for (var key in d) {
            if (key.length > 0 && d.hasOwnProperty(key)) {
                content.push(`localStorage.setItem("${key.split('"').join('\\"')}", "${d[key].split('"').join('\\"')}");`);
            }
        }
        if (content.length === 0) {
            return {"instructions": []};
        }
        return {"instructions": [
            `page.evaluate(() => {
                ${content.join('\n')}
            })`
        ]};
    } catch(e) {
        return {"error": "Error when parsing JSON content: " + e};
    }
}

const ORDERS = {
    'click': parseClick,
    'focus': parseFocus,
    'gotourl': parseGoToUrl,
    'movecursorto': parseMoveCursorTo,
    'scrollto': parseScrollTo,
    'size': parseSize,
    'waitfor': parseWaitFor,
    'write': parseWrite,
    'localstorage': parseLocalStorage,
};

function parseContent(content) {
    var lines = content.split(os.EOL);
    var commands = {"instructions": []};
    var res;

    for (var i = 0; i < lines.length; ++i) {
        var line = lines[i].split('//')[0].trim();
        if (line.length === 0) {
            continue;
        }
        var order = line.split(':')[0].toLowerCase();
        if (ORDERS.hasOwnProperty(order)) {
            res = ORDERS[order](lines[i].substr(order.length + 1).trim());
            if (res.error !== undefined) {
                res.line = i + 1;
                return [res];
            }
            for (var y = 0; y < res["instructions"].length; ++y) {
                commands["instructions"].push(res["instructions"][y]);
            }
        } else {
            return {"error": `Unknown command "${order}"`, "line": i};
        }
    }
    return commands;
}

module.exports = {
    parseContent: parseContent,
};
