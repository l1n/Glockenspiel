var fs = require('fs');
var box_sdk = require('box-sdk');
var async = require('async');

var options = {}; // See parseArgs()
var fileTree = {};

var gsms;
try {
    gsms = require('./gsms');
} catch (e) {
    gsms = {
        "client_id": "tul5x43dwghbz7dque6h0z04py06b4oc",
        "client_secret": "IWQeQ09keAHchQlGGllzOoAJlIXvtF4g",
    };
}
function parseArgs() {
    var args = process.argv;
    if (!gsms.email && args.length < 2)
        return false;
    gsms.email = args[2];
    gsms.host = args[3]?args[3]:gsms.host?gsms.host:'localhost';
    gsms.port = args[4]?args[4]:gsms.port?gsms.port:5000;
    if (!gsms.log)
        gsms.log    = 10;
    return true;
}

function usage() {
    console.log('Usage: node init.js email [host] [port]');
    console.log('Examp: node init.js someone@email.com');
}

function walkFileTree(id, connection, fileTree, cb) {
    connection.getFolderItems(id, {'fields': ['name', 'id'].join(',')}, function (error, body) {
        body=eval(body);
        async.each(body.entries, function (node, callback) {
            fileTree.children[node.name] = {"parent":fileTree.id,"children":{}, "id": parseInt(node.id), "name": node.name};
            if (node.type === 'folder') {
                fileTree.children[node.name].type = "folder";
                walkFileTree(fileTree.children[node.name].id, connection, fileTree.children[node.name], function (e, ft) {
                    fileTree.children[node.name] = ft;
                    callback(null, fileTree);
                });
            } else {
                fileTree.children[node.name].type = "file";
                connection.log.debug('getFileInfo '+node.id);
                connection.getFileInfo(parseInt(node.id), function(e, res) {
                    res = eval(res);
                    fileTree.children[node.name].etag = parseInt(res.etag);
                    delete fileTree.children[node.name].children;
                    callback(null, fileTree);
                });
            }
        }, function (err, result) {
            cb(null, fileTree);
        });
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
                console.log('Navigate to the auth URL in the next 60 seconds and try again.');
                wait = 60*1000;
            }
            setTimeout(function() {
                gsms.access_token = connection.access_token;
                gsms.refresh_token = connection.refresh_token;
                gsms.fileTree = {
                    "/": {
                        "type":     "folder",
                        "parent":   fileTree,
                        "children": {},
                        "id":       0
                    }};
                walkFileTree(0, connection, gsms.fileTree["/"], function (err, root) {
                    gsms.fileTree["/"] = root;
                    fs.writeFile('gsms.json', JSON.stringify(gsms), function(err) {
                        if (err) {
                            console.log('Error: '+err);
                            box.stopServer(function(){});
                            return false;
                        }
                        console.log('gsms.json initialized');
                        box.stopServer(function(){});
                        return true;
                    });
                });
            }, wait);
        });
    });
})();
