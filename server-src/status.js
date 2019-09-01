function get_status_js() {
    return `
function showHideLogs(elem) {
    var e = elem.getElementsByClassName("logs")[0];
    if (e.style.display !== "block") {
        e.style.display = "block";
    } else {
        e.style.display = "none";
    }
}

function preventEv(ev) {
    ev.preventDefault();
    ev.stopPropagation();
}`;
}

function get_status_css() {
    return `
body {
    margin: 0;
    padding: 0;
}
header {
    background: #3c3c3c;
    width: 100%;
    height: 40px;
}
header > div {
    padding-top: 3px;
    text-align: center;
    font-size: 1.8rem;
    color: white;
}
header > div, .running, .results, .results > .line {
    display: block;
    width: 100%;
}
header > .repository {
    position: absolute;
    left: 5px;
    top: 0;
    height: 40px;
    background: #fff;
    border-radius: 50%;
}
.error {
    color: red;
    border: 1px solid red;
    border-radius: 3px;
    background-color: #f99;
    padding: 2px;
}
#info {
    color: blue;
    border: 1px solid blue;
    border-radius: 3px;
    background-color: #99f;
    padding: 2px;
    display: none;
}
.content {
    padding: 5px;
}
.title {
    margin-top: 10px;
    margin-bottom: 3px;
    font-size: 1.4em;
    text-align: center;
    font-weight: bold;
}
.results {
    border: 1px solid #ccc;
    border-bottom: 0;
    border-radius: 2px;
}
.results > .line {
    border-bottom: 1px solid #ccc;
    position: relative;
    cursor: pointer;
    width: auto;
}
.line > .label:hover {
    background-color: #83c3fb;
}
.line > .label {
    padding: 4px;
}
.line > .errors  {
    width: 15px;
    position: absolute;
    right: 2px;
    top: 2;
    border: 1px solid red;
    border-radius: 10px;
    color: red;
    background-color: #fff;
    text-align: center;
    padding: 1px;
}
.logs {
    display: none;
    background-color: #eaeaea;
    padding: 5px;
    position: relative;
}
.button {
    text-align: center;
    font-size: 20px;
    border: 1px solid #fff;
    border-radius: 6px;
    padding: 3px;
    cursor: pointer;
    text-decoration: none;
    display: block;
    background-color: #5d44a7;
    color: #fff;
}
.log-in {
    position: absolute;
    right: 5px;
    top: 5px;
}

header > .failures {
    position: absolute;
    left: 50px;
    top: 4px;
}

.content > .failures > details > .container {
    position: relative;
    width: 100%;
    padding: 10px;
}

.content > .failures > details > .container > img {
    width: calc(50% - 6px);
    margin: 0 auto;
}`;
}

function get_admin_js() {
    return `
String.prototype.replaceAll = function(search, replace_with) {
    return this.split(search).join(replace_with);
};
function clean_text(t) {
    return t.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\\n', '<br>');
}
function ask_restart(elem) {
    elem.style.pointerEvents = "none";
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            elem.style.pointerEvents = "";
            document.getElementById("info").style.display = "block";
            document.getElementById("info").innerHTML = clean_text(this.responseText);
        }
    };
    xhr.open('GET', '/restart', true);
    xhr.withCredentials = true;
    xhr.send(null);
}
function ask_update(elem) {
    elem.style.pointerEvents = "none";
    document.getElementById("info").innerHTML = "";
    document.getElementById("info").style.display = "";
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            elem.style.pointerEvents = "";
            document.getElementById("info").style.display = "block";
            document.getElementById("info").innerHTML = clean_text(this.responseText);
        }
    };
    xhr.open('GET', '/update', true);
    xhr.withCredentials = true;
    xhr.send(null);
}
function ask_run_tests(elem) {
    elem.style.pointerEvents = "none";
    document.getElementById("info").innerHTML = "";
    document.getElementById("info").style.display = "";
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            elem.style.pointerEvents = "";
            document.getElementById("info").style.display = "block";
            document.getElementById("info").innerHTML = clean_text(this.responseText);
        }
    };
    xhr.open('GET', '/run-test', true);
    xhr.withCredentials = true;
    xhr.send(null);
}
function show_more() {
    if (this.innerText === "See more") {
        this.parentElement.style.maxHeight = "initial";
        this.innerText = "See less";
    } else {
        this.parentElement.style.maxHeight = "";
        this.innerText = "See more";
    }
}

var x = Array.prototype.slice.call(document.getElementsByClassName("logs"));
var but;
for (var i = 0; i < x.length; ++i) {
    if (x[i].offsetHeight < x[i].scrollHeight || x[i].offsetWidth < x[i].scrollWidth) {
        but = document.createElement("div");
        but.className = "see-more";
        but.innerText = "See more";
        but.onclick = show_more;
        x[i].appendChild(but);
    }
}`;
}

function get_admin_css() {
    return `
.results > .logs {
    display: block;
    max-height: 100px;
    overflow: hidden;
    border: 1px solid #3559c5;
    color: #3559c5;
    border-radius: 3px;
}
.results > .warning {
    color: #de8605;
    border-color: #de8605;
    background-color: #e6e6e6;
}
.results > .error {
    color: red;
    border-color: red;
}
.see-more {
    position: absolute;
    width: 64px;
    text-align: center;
    right: calc(50vw - 30px);
    bottom: 3px;
    padding: 2px;
    border: 1px solid #000;
    border-radius: 3px;
    color: #000;
    background-color: #fff;
    cursor: pointer;
}
`;
}

module.exports = {
    get_status_css: get_status_css,
    get_status_js: get_status_js,
    get_admin_js: get_admin_js,
    get_admin_css: get_admin_css,
};
