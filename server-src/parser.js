var os = require('os');

function parseClick(line) {
    ;
}

function parseWait(line) {
    ;
}

function parseFocus(line) {
    ;
}

function parseWrite(line) {
    ;
}

function parseMoveCursorTo(line) {
    ;
}

const ORDERS = {
    'click': parseClick,
    'wait': parseWait,
    'focus': parseFocus,
    'write': parseWrite,
    'moveCursorTo': parseMoveCursorTo,
};

function parseContent(content) {
    var lines = content.split(os.EOL);

    for (var i = 0; i < lines.length; ++i) {
        var order = lines[i].splitn(':', 1)[0].toLowerCase();
        if (ORDERS.hasOwnProperty(order)) {
            ORDERS[order](lines[i].substr(order.length).trim());
        } else {
            console.error("Unknonwn command: \"" + order + "\"");
            return false;
        }
    }
    return true;
}

module.exports = {
    parseContent: parseContent,
};
