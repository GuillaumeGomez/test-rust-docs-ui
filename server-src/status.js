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
.line > .label > a {
    text-decoration: none;
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
.line > .logs {
    display: none;
    background-color: #eaeaea;
    padding: 5px;
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
}`;
}

function get_admin_js() {
    return `
function clean_text(t) {
    return t.replace('<', '&lt;').replace('>', '&gt;').replace('\\n', '<br>');
}
function ask_restart() {
    this.style.pointerEvents = "none";
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            this.style.pointerEvents = "";
            document.getElementById("info").style.display = "block";
            document.getElementById("info").innerHTML = clean_text(this.responseText);
        }
    };
    xhr.open('GET', '/restart', true);
    xhr.withCredentials = true;
    xhr.send(null);
}

function ask_update(elem) {
    this.style.pointerEvents = "none";
    document.getElementById("info").innerHTML = "";
    document.getElementById("info").style.display = "";
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            this.style.pointerEvents = "";
            document.getElementById("info").style.display = "block";
            document.getElementById("info").innerHTML = clean_text(this.responseText);
        }
    };
    xhr.open('GET', '/update', true);
    xhr.withCredentials = true;
    xhr.send(null);
}`;
}

module.exports = {
    get_status_css: get_status_css,
    get_status_js: get_status_js,
    get_admin_js: get_admin_js,
};
