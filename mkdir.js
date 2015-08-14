var fs = require('fs');
var box_sdk = require('box-sdk');

var options = {}; // See parseArgs()

var gsms;
try {
    gsms = require('./gsms');
} catch (e) {
    console.log('Unable to locate gsms.json (did you run init.js?)');
    return false;
}

var exec = require('child_process').exec, child;

function parseArgs() {
    var args = process.argv;
    if (args.length < 3) {
        return false;
    }
    options.file    = args[2];
    options.webroot = args[3] || '/';
    return true;
}

function usage() {
    console.log('Usage: node mkdir.js folder [parent]');
    console.log('Examp: node mkdir.js folder /some/path');
}

function getByPath(name) {
    var node = gsms.fileTree["/"];
    for (var i = 0; i < name.length; i++) {
        if (name[i] !== '') node = node.children[name[i]];
    }
    return node;
}

function mkdir(name, path, connection, callback) {
    var webroot = getByPath(path.split('/'));
    if (!webroot) {
        return callback('Path does not exist');
    }
    connection.log.debug('createFolder '+name+' '+webroot.id);
    connection.createFolder(name, webroot.id, function (err, body) {
        body = eval(body);
        webroot.children[name] = {
            "parent": webroot.id,
            "id": body.id,
            "type": "folder",
            "children": {},
        };
        return callback(err);
    });
}

(function main() {
    if (!parseArgs()) {
        usage();
        return -1;
    }

    var box = box_sdk.Box({
        client_id:     gsms.client_id,
        client_secret: gsms.client_secret,
        host:          gsms.host,
        port:          gsms.port,
        timeout:       0,
    }, gsms.log);

    connection = box.getConnection(gsms.email);

    // Restore access_token and refresh_token if possible
    connection._setTokens({access_token: gsms.access_token, refresh_token: gsms.refresh_token, expires_in: 1});

    //Navigate user to the auth URL if neccessary
    if (!connection.isAuthenticated()) {
        console.log('Open '+connection.getAuthURL()+' in a browser');
    }

    connection.ready(function() {
        // Save gsms
        gsms.access_token = connection.access_token;
        gsms.refresh_token = connection.refresh_token;
        // Dummy call to refresh tokens if neccessary
        connection.getFolderInfo(0, function (body) {
            var wait = 0;
            if (!connection.isAuthenticated()) {
                console.log('The auth gods are angry! Exiting, please rerun init.js');
                box.stopServer();
                return false;
            }
            setTimeout(function() {
                gsms.access_token = connection.access_token;
                gsms.refresh_token = connection.refresh_token;
                    mkdir(options.file, options.webroot, connection,
                            function (err) {
                                fs.writeFile('gsms.json', JSON.stringify(gsms), function(err) {
                                    if (err) connection.log.info(err);
                                    box.stopServer(function(){});
                                });
                            });
            }, wait);
        });
    });
})();
